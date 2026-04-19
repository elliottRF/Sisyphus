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
export const computeNextSet = (baseSet, repRangeMin, repRangeMax, isAssisted = false) => {
    if (!baseSet || !baseSet.reps || baseSet.reps === 0) return null;

    const weight = baseSet.weight || 0;
    const currentReps = baseSet.reps;

    if (currentReps < repRangeMin) {
        if (isAssisted) {
            const newWeight = Math.round((weight + 2.5) / 2.5) * 2.5;
            return { weight: newWeight, reps: repRangeMin, isWeightIncrease: false };
        }

        const oneRM = weight * (1 + currentReps / 30);
        const rawNewWeight = oneRM / (1 + repRangeMin / 30);
        const roundedWeight = Math.round(rawNewWeight / 2.5) * 2.5;

        return { weight: roundedWeight, reps: repRangeMin, isWeightIncrease: false };
    }

    const targetReps = currentReps + 1;

    if (targetReps <= repRangeMax) {
        return { weight, reps: targetReps, isWeightIncrease: false };
    }

    if (isAssisted) {
        const newWeight = Math.max(0, Math.round((weight - 2.5) / 2.5) * 2.5);
        return { weight: newWeight, reps: repRangeMin, isWeightIncrease: true };
    }

    const oneRM = weight * (1 + currentReps / 30);
    const rawNewWeight = oneRM / (1 + repRangeMin / 30);
    const roundedWeight = Math.round(rawNewWeight / 2.5) * 2.5;

    return { weight: roundedWeight, reps: repRangeMin, isWeightIncrease: true };
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
    isAssisted
) => {
    if (!suggestion) return null;

    const alreadyAchieved = recentWorkingSets.filter(
        (s) => s.weight >= suggestion.weight && s.reps >= repRangeMin
    );

    if (alreadyAchieved.length === 0) return suggestion;

    const bestAchieved = findBestSet(alreadyAchieved);
    return computeNextSet(bestAchieved, repRangeMin, repRangeMax, isAssisted);
};

export const useWorkoutSuggestions = ({
    showSuggestion,
    exerciseID,
    repRangeMin,
    repRangeMax,
    isAssisted,
    muscleOccurrenceIndex,
}) => {
    const [suggestions, setSuggestions] = useState([]);

    useEffect(() => {
        if (!showSuggestion || !exerciseID) {
            setSuggestions([]);
            return;
        }

        console.log(`useWorkoutSuggestions called for exerciseID=${exerciseID}, muscleOccurrenceIndex=${muscleOccurrenceIndex}`);

        let cancelled = false;

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
                if (!cancelled) setSuggestions([]);
                return;
            }

            // 3. Strip warm-ups
            baseSets = baseSets.filter(
                (set) => !set.setType || set.setType !== 'W'
            );

            if (baseSets.length === 0) {
                if (!cancelled) setSuggestions([]);
                return;
            }

            // 4. Identify the top set INSIDE this workout (only used for first-muscle case)
            const workoutTopSet = muscleOccurrenceIndex === 1
                ? findBestSet(baseSets)
                : null;

            // 5. Compute suggestions
            const computedSuggestions = baseSets.map((baseSet) => {
                const initial = computeNextSet(baseSet, repRangeMin, repRangeMax, isAssisted);
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

                const anchorSuggestion = computeNextSet(globalAnchorSet, repRangeMin, repRangeMax, isAssisted);
                return resolveAgainstRecentHistory(
                    anchorSuggestion, recentWorkingSets, repRangeMin, repRangeMax, isAssisted
                );
            });

            if (!cancelled) {
                setSuggestions(computedSuggestions);
            }
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
    const sug1RM = sugWeight * (1 + sugReps / 30);
    const sugVol = sugWeight * sugReps;

    if (sug1RM > lifetimePRs.max1RM) return '1RM';

    if (
        sugWeight > lifetimePRs.maxWeight ||
        (sugWeight === lifetimePRs.maxWeight && sugReps > lifetimePRs.maxRepsAtMaxWeight)
    ) return 'Weight';

    if (sugVol > lifetimePRs.maxVolume) return 'Volume';

    return null;
};

