// Shared engine for turning the live workout shape (groups → exercises → sets)
// into workoutHistory rows with per-set PR flags. Used by both finish-workout
// (current.jsx) and edit-workout (EditWorkout.jsx) so the set-filtering and
// PR-flag rules can never drift apart again.
import { toStorageKg } from './units';
import { estimateOneRMForStorage } from './oneRM';

const has = (v) => v !== null && v !== undefined && v !== '';

// A completed strength set counts with EITHER weight or reps entered — the
// other blank field stores as 0 (e.g. bodyweight reps, or a weighted hold).
// Cardio needs both distance + time.
/**
 * Whether a set will actually be written to history: ticked, AND carrying
 * something worth writing.
 *
 * Exported because the live set counter and the finish dialog have to
 * promise exactly what this delivers. They used to count every ticked set,
 * so a set ticked while still empty -- a mis-tap, easily done one-handed --
 * was counted as completed, announced as completed in "N of M sets
 * completed", and then quietly dropped here.
 */
export const setWillBeSaved = (set) => {
    if (!set || !set.completed) return false;
    return has(set.weight) || has(set.reps) || (has(set.distance) && has(set.minutes));
};

export const filterCompletedSets = (workout) => (workout || []).map(exerciseGroup => ({
    ...exerciseGroup,
    exercises: exerciseGroup.exercises.map(exercise => ({
        ...exercise,
        sets: exercise.sets.filter(setWillBeSaved)
    }))
}));

/**
 * Builds workoutHistory rows from an already-filtered workout.
 *
 * PR flags: at most one set per exercise BLOCK gets each of is1rmPR /
 * isVolumePR / isWeightPR, and only when that block's best beats the best to
 * beat. An exercise can appear more than once in a workout, and each block is
 * judged in turn against a best that the blocks before it may already have
 * raised -- the same rule recalculateExercisePRs applies when it rewrites the
 * flags after an edit, so the two agree.
 * Assisted exercises invert the weight logic (lower weight is better) and
 * never get 1RM/volume PRs. `pr` is the legacy 1RM flag.
 *
 * @param {Array}    workout          live workout shape, pre-filtered (see filterCompletedSets)
 * @param {Array}    exercises        exercise definitions — drives the isAssisted lookups
 * @param {boolean}  useImperial      set.weight values are in lb → converted to storage kg
 * @param {number}   sessionNumber    workoutSession stamped on every row
 * @param {string}   time             ISO timestamp stamped on every row
 * @param {string}   workoutTitle     stored on every row
 * @param {Function} getHistoricalPRs async (exerciseID) => past PRs to compare against —
 *                                    finishing passes all history; editing excludes the
 *                                    session being rewritten
 */
export const buildWorkoutEntries = async ({
    workout,
    exercises,
    useImperial,
    sessionNumber,
    time,
    workoutTitle,
    getHistoricalPRs,
}) => {
    const workoutEntries = [];
    let globalExerciseNum = 1;
    // One entry per exercise block, in the order the blocks appear. Keying
    // these by exerciseID instead lost PRs whenever a workout repeated an
    // exercise: the second block overwrote the first block's maxima, so a
    // second block that was lighter -- or that had no completed sets at all,
    // which zeroed them -- left the first block's best matching nothing and
    // beating nothing, and the whole exercise came out of the workout with no
    // trophy despite setting a record.
    const blockBests = [];

    for (const exerciseGroup of workout) {
        for (const exercise of exerciseGroup.exercises) {
            let maxOneRM = 0;
            let maxVolume = 0;
            let maxWeight = 0;
            let minWeight = Infinity;
            let maxRepsAtMaxWeight = 0;

            const exerciseDetails = exercises.find(e => e.exerciseID === exercise.exerciseID);
            const isAssisted = !!exerciseDetails?.isAssisted;

            for (const set of exercise.sets) {
                // Warm-ups are excluded from PRs, the same rule the stats
                // queries and recalculateExercisePRs follow.
                if (set.setType === 'W') continue;
                const weightKg = toStorageKg(set.weight, useImperial);
                const calculatedOneRM = estimateOneRMForStorage(
                    weightKg,
                    parseInt(set.reps) || 0
                );
                if (calculatedOneRM > maxOneRM) maxOneRM = calculatedOneRM;

                const volume = weightKg * (parseInt(set.reps) || 0);
                if (volume > maxVolume) maxVolume = volume;

                const weight = weightKg;
                const reps = parseInt(set.reps) || 0;
                if (reps > 0) {
                    if (isAssisted) {
                        if (weight < minWeight) {
                            minWeight = weight;
                            maxRepsAtMaxWeight = reps;
                        } else if (weight === minWeight && reps > maxRepsAtMaxWeight) {
                            maxRepsAtMaxWeight = reps;
                        }
                    } else {
                        if (weight > maxWeight) {
                            maxWeight = weight;
                            maxRepsAtMaxWeight = reps;
                        } else if (weight === maxWeight && reps > maxRepsAtMaxWeight) {
                            maxRepsAtMaxWeight = reps;
                        }
                    }
                }
            }
            blockBests.push({
                maxOneRM,
                maxVolume,
                weight: isAssisted ? minWeight : maxWeight,
                reps: maxRepsAtMaxWeight,
            });
        }
    }

    // What each exercise's blocks have to beat. Seeded from history the first
    // time an exercise is reached, then raised by any block that takes a PR, so
    // a later block of the same exercise is measured against the earlier one.
    const bestsToBeat = new Map();
    let blockIndex = 0;

    for (const exerciseGroup of workout) {
        for (const exercise of exerciseGroup.exercises) {
            let setNum = 1;

            const exerciseDetails = exercises.find(e => e.exerciseID === exercise.exerciseID);
            const isAssisted = !!exerciseDetails?.isAssisted;

            const block = blockBests[blockIndex++];
            const maxOneRMForExercise = block.maxOneRM;
            const maxVolumeForExercise = block.maxVolume;
            const maxWeightInfo = { weight: block.weight, reps: block.reps };

            let toBeat = bestsToBeat.get(exercise.exerciseID);
            if (!toBeat) {
                const historicalPRs = await getHistoricalPRs(exercise.exerciseID);
                toBeat = {
                    maxOneRM: historicalPRs.maxOneRM,
                    maxVolume: historicalPRs.maxVolume,
                    maxWeight: historicalPRs.maxWeight,
                    maxRepsAtMaxWeight: historicalPRs.maxRepsAtMaxWeight,
                };
                bestsToBeat.set(exercise.exerciseID, toBeat);
            }

            const isOverall1rmPR = isAssisted ? false : (maxOneRMForExercise > toBeat.maxOneRM);
            const isOverallVolumePR = isAssisted ? false : (maxVolumeForExercise > toBeat.maxVolume);

            const isOverallWeightPR = isAssisted
                ? (maxWeightInfo.weight < toBeat.maxWeight ||
                    (maxWeightInfo.weight === toBeat.maxWeight && maxWeightInfo.reps > toBeat.maxRepsAtMaxWeight))
                : (maxWeightInfo.weight > toBeat.maxWeight ||
                    (maxWeightInfo.weight === toBeat.maxWeight && maxWeightInfo.reps > toBeat.maxRepsAtMaxWeight));

            if (isOverall1rmPR) toBeat.maxOneRM = maxOneRMForExercise;
            if (isOverallVolumePR) toBeat.maxVolume = maxVolumeForExercise;
            if (isOverallWeightPR) {
                toBeat.maxWeight = maxWeightInfo.weight;
                toBeat.maxRepsAtMaxWeight = maxWeightInfo.reps;
            }

            let pr1rmAssigned = false;
            let prVolumeAssigned = false;
            let prWeightAssigned = false;

            for (const set of exercise.sets) {
                const weightKg = toStorageKg(set.weight, useImperial);
                const calculatedOneRM = estimateOneRMForStorage(
                    weightKg,
                    parseInt(set.reps) || 0
                );
                const volume = weightKg * (parseInt(set.reps) || 0);
                const weight = weightKg;
                const reps = parseInt(set.reps) || 0;

                // A warm-up can coincidentally equal the session's best --
                // same weight and reps as a working set -- so it has to be
                // barred from being ASSIGNED the flag too, not just from
                // setting the maximum above.
                const isWarmup = set.setType === 'W';

                let is1rmPR = 0;
                if (!isWarmup && !pr1rmAssigned && !isAssisted && calculatedOneRM === maxOneRMForExercise && isOverall1rmPR) {
                    is1rmPR = 1;
                    pr1rmAssigned = true;
                }

                let isVolumePR = 0;
                if (!isWarmup && !prVolumeAssigned && !isAssisted && volume === maxVolumeForExercise && isOverallVolumePR) {
                    isVolumePR = 1;
                    prVolumeAssigned = true;
                }

                let isWeightPR = 0;
                if (!isWarmup && !prWeightAssigned && reps > 0 && weight === maxWeightInfo.weight && reps === maxWeightInfo.reps && isOverallWeightPR) {
                    isWeightPR = 1;
                    prWeightAssigned = true;
                }

                workoutEntries.push({
                    workoutSession: sessionNumber,
                    exerciseNum: globalExerciseNum,
                    setNum: setNum,
                    exerciseID: exercise.exerciseID,
                    weight: weightKg,
                    reps: parseInt(set.reps, 10) || 0,
                    oneRM: calculatedOneRM,
                    time: time,
                    name: workoutTitle,
                    pr: is1rmPR, // legacy 1RM flag
                    setType: set.setType || 'N',
                    notes: exercise.notes || '',
                    is1rmPR: is1rmPR,
                    isVolumePR: isVolumePR,
                    isWeightPR: isWeightPR,
                    distance: set.distance || null,
                    seconds: set.minutes ? Math.round(parseFloat(set.minutes) * 60) : null,
                    // Optional: null whenever the lifter did not record one.
                    rpe: Number.isFinite(set.rpe) ? set.rpe : null
                });

                setNum++;
            }

            globalExerciseNum++;
        }
    }

    return workoutEntries;
};
