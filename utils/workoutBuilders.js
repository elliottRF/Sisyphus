// Builders for turning stored workoutHistory rows back into the live
// workout/template shape ({ id, exercises: [{ id, exerciseID, sets, notes }] })
// used by the Current tab and templates.

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 9);

export const buildWorkoutDataFromSession = (rows) => {
    const order = [];
    const groups = {};
    (rows || []).forEach(set => {
        if (!groups[set.exerciseID]) {
            groups[set.exerciseID] = [];
            order.push(set.exerciseID);
        }
        groups[set.exerciseID].push(set);
    });

    return order.map(exerciseID => ({
        id: generateId(),
        exercises: [{
            id: generateId(),
            exerciseID,
            notes: '',
            sets: groups[exerciseID].map(set => ({
                id: generateId(),
                weight: set.weight != null ? String(set.weight) : null,
                reps: set.reps != null ? String(set.reps) : null,
                distance: set.distance != null ? String(set.distance) : null,
                minutes: set.seconds ? String(Math.round(set.seconds / 60)) : null,
                setType: set.setType || 'N',
                completed: false,
            })),
        }],
    }));
};
