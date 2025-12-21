
const currentWorkout = [
    {
        id: "block1",
        exercises: [
            {
                id: "ex1",
                exerciseID: "bench_press",
                sets: [{ id: "set1", weight: 100, reps: 10 }, { id: "set2", weight: 100, reps: 10 }]
            }
        ]
    },
    {
        id: "block2",
        exercises: [
            {
                id: "ex2",
                exerciseID: "bench_press",
                sets: [{ id: "set3", weight: 100, reps: 10 }, { id: "set4", weight: 100, reps: 10 }]
            }
        ]
    }
];

function deleteSet(workoutID, exerciseInstanceID, setIndex, prevState) {
    return prevState.map(w => w.id === workoutID ? {
        ...w,
        exercises: w.exercises.map(e => e.id === exerciseInstanceID ? {
            ...e,
            sets: e.sets.filter((_, i) => i !== setIndex)
        } : e)
    } : w);
}

// Case 1: Delete set 0 from block 1. unique IDs.
const newState1 = deleteSet("block1", "ex1", 0, currentWorkout);
console.log("Case 1 - Block 1 sets:", newState1[0].exercises[0].sets.length); // Should be 1
console.log("Case 1 - Block 2 sets:", newState1[1].exercises[0].sets.length); // Should be 2

// Case 2: ID Collision on Workout Block ID
const duplicateBlockIDState = [
    {
        id: "blockA",
        exercises: [{ id: "exA", exerciseID: "bench", sets: [{}, {}] }]
    },
    {
        id: "blockA", // Collision!
        exercises: [{ id: "exB", exerciseID: "bench", sets: [{}, {}] }]
    }
];

const newState2 = deleteSet("blockA", "exA", 0, duplicateBlockIDState);
console.log("Case 2 - Block 1 sets:", newState2[0].exercises[0].sets.length); // Should be 1
console.log("Case 2 - Block 2 sets:", newState2[1].exercises[0].sets.length); // Should be 2 (unless exID matches)

// Note: In Case 2, Block 2 has "exB". So even if block ID matches, exercise ID won't match.
// So Block 2 should effectively check exB against exA. No match. Sets unchanged.
// BUT since we map, we clone the object.

// Case 3: Full Collision (Block ID AND Exercise ID)
const fullCollisionState = [
    {
        id: "blockA",
        exercises: [{ id: "exA", exerciseID: "bench", sets: [{}, {}] }]
    },
    {
        id: "blockA",
        exercises: [{ id: "exA", exerciseID: "bench", sets: [{}, {}] }]
    }
];

const newState3 = deleteSet("blockA", "exA", 0, fullCollisionState);
console.log("Case 3 - Block 1 sets:", newState3[0].exercises[0].sets.length); // Should be 1
console.log("Case 3 - Block 2 sets:", newState3[1].exercises[0].sets.length); // Should be 1 (Affected!)
