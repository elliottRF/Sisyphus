import { useState, useEffect } from 'react';
import {
    fetchLastWorkoutSets,
    fetchLifetimePRs,
    fetchRecentPRSession,
    fetchMostRecentSession,
    fetchRecentSets,
    fetchBestSessionMatchingOccurrence
} from './db';

export const DAYS_TO_CHECK = 60;

/**
 * Predictable progressive overload (unchanged).
 */
// Weights are stored in kg; rounding/increments are done in the user's display
// unit so they land on real plates (2.5 kg / 5 lb) and convert back cleanly.
const KG_PER_LB = 0.45359237;
const roundTo = (v, step) => Math.round(v / step) * step;

const roundWeight = (kg, useImperial) =>
    useImperial ? roundTo(kg / KG_PER_LB, 5) * KG_PER_LB : roundTo(kg, 2.5);

// Step the weight by ~2.5%, floored at one plate, in the user's unit.
// dir = +1 to go up (harder), -1 to go down (used for assisted machines).
const bumpWeight = (kg, useImperial, dir = 1) => {
    const step = useImperial ? 5 : 2.5;
    const display = useImperial ? kg / KG_PER_LB : kg;
    const inc = Math.max(step, roundTo(display * 0.025, step));
    const next = roundTo(display + dir * inc, step);
    return useImperial ? next * KG_PER_LB : next;
};

export const computeNextSet = (baseSet, repRangeMin, repRangeMax, isAssisted = false, useImperial = false) => {
    if (!baseSet || !baseSet.reps || baseSet.reps === 0) return null;

    const weight = baseSet.weight || 0;
    const currentReps = baseSet.reps;

    // Below the range — too heavy to reach the minimum reps.
    if (currentReps < repRangeMin) {
        if (isAssisted) {
            // More assistance (easier) so the minimum reps become achievable.
            return { weight: Math.max(0, bumpWeight(weight, useImperial, +1)), reps: repRangeMin, isWeightIncrease: false };
        }
        // Drop to a weight that should allow the minimum reps (same est-1RM).
        const oneRM = weight * (1 + currentReps / 30);
        const raw = oneRM / (1 + repRangeMin / 30);
        return { weight: roundWeight(raw, useImperial), reps: repRangeMin, isWeightIncrease: false };
    }

    // Within the range — add a rep at the same weight.
    const targetReps = currentReps + 1;
    if (targetReps <= repRangeMax) {
        return { weight, reps: targetReps, isWeightIncrease: false };
    }

    // At/above the top — bump the weight a small, scaled amount and reset to the
    // bottom of the range. Shown as "min+" (do at least the min, push for more),
    // so resetting to a low rep count on a wide range isn't misleading.
    if (isAssisted) {
        // Less assistance (harder).
        return { weight: Math.max(0, bumpWeight(weight, useImperial, -1)), reps: repRangeMin, isWeightIncrease: true };
    }
    return { weight: bumpWeight(weight, useImperial, +1), reps: repRangeMin, isWeightIncrease: true };
};

/**
 * Finds the single best working set (highest weight, tie-break highest reps).
 * Used ONLY for the first-muscle-occurrence case.
 */
const findBestSet = (sets) => {
    if (!sets || sets.length === 0) return null;

    return sets.reduce((best, curr) => {
        if (!best) return curr;
        if (curr.weight > best.weight) return curr;
        if (curr.weight === best.weight && curr.reps > best.reps) return curr;
        return best;
    }, null);
};



/**
 * If the given suggestion has already been matched or beaten in recent history
 * (weight ≥ suggestion.weight AND reps ≥ repRangeMin), progress from the best
 * such actual performance instead of returning the stale anchor-derived value.
 *
 * This prevents infinite loops like: 90×5 → suggests 87.5×6 → user hits it →
 * 90×5 still wins on weight → suggests 87.5×6 again forever.
 */
const resolveAgainstRecentHistory = (
    suggestion,
    recentWorkingSets,
    repRangeMin,
    repRangeMax,
    isAssisted,
    useImperial
) => {
    if (!suggestion) return null;

    const alreadyAchieved = recentWorkingSets.filter(
        (s) => s.weight >= suggestion.weight && s.reps >= repRangeMin
    );

    if (alreadyAchieved.length === 0) return suggestion;

    const bestAchieved = findBestSet(alreadyAchieved);
    return computeNextSet(bestAchieved, repRangeMin, repRangeMax, isAssisted, useImperial);
};

// Session cache keyed by exerciseID. The reorderable list force-remounts
// cells after a drag, resetting hook state; this lets a remounted card render
// its last computed suggestions immediately (then refresh/dissolve to new
// values if the inputs actually changed) instead of flashing "-".
const suggestionsCache = new Map();

export const useWorkoutSuggestions = ({
    showSuggestion,
    exerciseID,
    repRangeMin,
    repRangeMax,
    isAssisted,
    muscleOccurrenceIndex,
    useImperial = false,
}) => {
    const [suggestions, setSuggestions] = useState(
        () => suggestionsCache.get(exerciseID)?.suggestions ?? []
    );

    useEffect(() => {
        if (!showSuggestion || !exerciseID) {
            setSuggestions([]);
            return;
        }


        let cancelled = false;

        const cacheKey = `${exerciseID}|${muscleOccurrenceIndex}|${repRangeMin}|${repRangeMax}|${isAssisted ? 1 : 0}|${useImperial ? 1 : 0}`;

        // Serve the cached result synchronously so toggling suggestions on
        // goes straight from the previous value to the suggestion instead of
        // flashing "-" while recomputing; the recompute below then dissolves
        // in fresher values only if they actually differ.
        const cached = suggestionsCache.get(exerciseID);
        if (cached && cached.key === cacheKey) {
            setSuggestions(cached.suggestions);
        }

        const publish = (computed) => {
            suggestionsCache.set(exerciseID, { key: cacheKey, suggestions: computed });
            if (!cancelled) setSuggestions(computed);
        };

        const loadAndCompute = async () => {
            // 1. All working sets in the last 60 days — ONLY needed for first-muscle case
            const recentSetsRaw = await fetchRecentSets(exerciseID, DAYS_TO_CHECK);
            const recentWorkingSets = (recentSetsRaw || []).filter(
                (set) => !set.setType || set.setType !== 'W'
            );

            const globalAnchorSet = muscleOccurrenceIndex === 1
                ? findBestSet(recentWorkingSets)
                : null;

            // 2. Decide which workout to base suggestions on
            let baseSets = [];
            if (muscleOccurrenceIndex === 1) {
                baseSets = await fetchRecentPRSession(exerciseID);
            } else if (muscleOccurrenceIndex >= 2) {
                baseSets = await fetchBestSessionMatchingOccurrence(exerciseID, muscleOccurrenceIndex);
            }
            if (!baseSets || baseSets.length === 0) {
                baseSets = await fetchMostRecentSession(exerciseID);
            }

            if (!baseSets || baseSets.length === 0) {
                publish([]);
                return;
            }

            // 3. Strip warm-ups
            baseSets = baseSets.filter(
                (set) => !set.setType || set.setType !== 'W'
            );

            if (baseSets.length === 0) {
                publish([]);
                return;
            }

            // 4. Identify the top set INSIDE this workout (only used for first-muscle case)
            const workoutTopSet = muscleOccurrenceIndex === 1
                ? findBestSet(baseSets)
                : null;

            // 5. Compute suggestions
            const computedSuggestions = baseSets.map((baseSet) => {
                const initial = computeNextSet(baseSet, repRangeMin, repRangeMax, isAssisted, useImperial);
                if (!initial) return null;

                // 🔥 NEW RULE (exactly what you asked for):
                // When the muscle has already been trained before → NO fighting the last 60 days.
                // Every set just does normal +1 rep / weight-adjust progression from its own last performance.
                if (muscleOccurrenceIndex !== 1) {
                    return initial;  // ← back to original, no history check
                }
                // Only for FIRST time training this muscle:
                // The top set of that best workout fights the full 60-day history.
                // All other sets in the same workout just do normal progression.
                const isTheTopSetInWorkout =
                    workoutTopSet &&
                    baseSet.weight === workoutTopSet.weight &&
                    baseSet.reps === workoutTopSet.reps;

                if (!globalAnchorSet || !isTheTopSetInWorkout) {
                    return initial;  // ← back to original, no history check
                }

                const anchorSuggestion = computeNextSet(globalAnchorSet, repRangeMin, repRangeMax, isAssisted, useImperial);
                return resolveAgainstRecentHistory(
                    anchorSuggestion, recentWorkingSets, repRangeMin, repRangeMax, isAssisted, useImperial
                );
            });

            publish(computedSuggestions);
        };

        loadAndCompute();

        return () => {
            cancelled = true;
        };
    }, [
        showSuggestion,
        exerciseID,
        repRangeMin,
        repRangeMax,
        isAssisted,
        muscleOccurrenceIndex,
        useImperial,
    ]);

    return suggestions;
};


/**
 * Classify whether a suggestion would be a new lifetime PR, and which kind.
 *
 * Returns one of: '1RM' | 'Weight' | 'Volume' | null
 */
export const getPRType = (suggestion, lifetimePRs, isCardio) => {
    if (!suggestion || isCardio || !lifetimePRs) return null;

    const sugWeight = suggestion.weight || 0;
    const sugReps = suggestion.reps || 0;
    // Match the stored 1RM formula (a single is just the weight) so an exact
    // repeat of a past set doesn't read as a fractionally-higher estimated 1RM.
    const sug1RM = sugReps <= 1 ? sugWeight : sugWeight * (1 + sugReps / 30);
    const sugVol = sugWeight * sugReps;

    // Small tolerances so a tie — or float drift from kg↔lb rounding — with a
    // performance you've already hit (e.g. one from over 2 months ago) doesn't
    // get flagged as a new PR. A real PR clears these comfortably.
    const EPS = 0.01;
    const VOL_EPS = 0.5;
    const max1RM = lifetimePRs.max1RM || 0;
    const maxWeight = lifetimePRs.maxWeight || 0;
    const maxVolume = lifetimePRs.maxVolume || 0;
    const maxRepsAtMaxWeight = lifetimePRs.maxRepsAtMaxWeight || 0;

    if (sug1RM > max1RM + EPS) return '1RM';

    if (
        sugWeight > maxWeight + EPS ||
        (Math.abs(sugWeight - maxWeight) <= EPS && sugReps > maxRepsAtMaxWeight)
    ) return 'Weight';

    if (sugVol > maxVolume + VOL_EPS) return 'Volume';

    return null;
};

