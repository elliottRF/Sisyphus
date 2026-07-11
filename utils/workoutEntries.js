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
export const filterCompletedSets = (workout) => (workout || []).map(exerciseGroup => ({
    ...exerciseGroup,
    exercises: exerciseGroup.exercises.map(exercise => ({
        ...exercise,
        sets: exercise.sets.filter(set => {
            if (!set.completed) return false;
            return has(set.weight) || has(set.reps) || (has(set.distance) && has(set.minutes));
        })
    }))
}));

/**
 * Builds workoutHistory rows from an already-filtered workout.
 *
 * PR flags: at most one set per exercise gets each of is1rmPR / isVolumePR /
 * isWeightPR, and only when this workout's best beats the historical best.
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
    const maxOneRmsInWorkout = new Map();
    const maxVolumesInWorkout = new Map();
    const maxWeightsInWorkout = new Map();

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
            maxOneRmsInWorkout.set(exercise.exerciseID, maxOneRM);
            maxVolumesInWorkout.set(exercise.exerciseID, maxVolume);
            maxWeightsInWorkout.set(exercise.exerciseID, { weight: isAssisted ? minWeight : maxWeight, reps: maxRepsAtMaxWeight });
        }
    }

    for (const exerciseGroup of workout) {
        for (const exercise of exerciseGroup.exercises) {
            let setNum = 1;

            const exerciseDetails = exercises.find(e => e.exerciseID === exercise.exerciseID);
            const isAssisted = !!exerciseDetails?.isAssisted;

            const maxOneRMForExercise = maxOneRmsInWorkout.get(exercise.exerciseID);
            const maxVolumeForExercise = maxVolumesInWorkout.get(exercise.exerciseID);
            const maxWeightInfo = maxWeightsInWorkout.get(exercise.exerciseID);

            const historicalPRs = await getHistoricalPRs(exercise.exerciseID);

            const isOverall1rmPR = isAssisted ? false : (maxOneRMForExercise > historicalPRs.maxOneRM);
            const isOverallVolumePR = isAssisted ? false : (maxVolumeForExercise > historicalPRs.maxVolume);

            const isOverallWeightPR = isAssisted
                ? (maxWeightInfo.weight < historicalPRs.maxWeight ||
                    (maxWeightInfo.weight === historicalPRs.maxWeight && maxWeightInfo.reps > historicalPRs.maxRepsAtMaxWeight))
                : (maxWeightInfo.weight > historicalPRs.maxWeight ||
                    (maxWeightInfo.weight === historicalPRs.maxWeight && maxWeightInfo.reps > historicalPRs.maxRepsAtMaxWeight));

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

                let is1rmPR = 0;
                if (!pr1rmAssigned && !isAssisted && calculatedOneRM === maxOneRMForExercise && isOverall1rmPR) {
                    is1rmPR = 1;
                    pr1rmAssigned = true;
                }

                let isVolumePR = 0;
                if (!prVolumeAssigned && !isAssisted && volume === maxVolumeForExercise && isOverallVolumePR) {
                    isVolumePR = 1;
                    prVolumeAssigned = true;
                }

                let isWeightPR = 0;
                if (!prWeightAssigned && reps > 0 && weight === maxWeightInfo.weight && reps === maxWeightInfo.reps && isOverallWeightPR) {
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
                    seconds: set.minutes ? Math.round(parseFloat(set.minutes) * 60) : null
                });

                setNum++;
            }

            globalExerciseNum++;
        }
    }

    return workoutEntries;
};
