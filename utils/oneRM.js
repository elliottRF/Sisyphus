// Single source of truth for the estimated-1RM (Epley) calculation. The same
// conventions apply everywhere a 1RM is estimated or compared:
//  - no reps → no estimate (0), so blank/zero-rep sets never produce a 1RM
//  - a single counts as exactly the weight, so repeating a past single never
//    reads as a fractionally different estimate
export const estimateOneRM = (weight, reps) => {
    const w = parseFloat(weight) || 0;
    const r = parseInt(reps, 10) || 0;
    if (r <= 0) return 0;
    if (r === 1) return w;
    return w * (1 + r / 30);
};

// The inverse: the weight that would produce this estimated 1RM at `reps`
// reps. Same conventions, so weightForReps(estimateOneRM(w, r), r) gives back
// w for every r -- including r = 1, where both sides are just the weight.
export const weightForReps = (oneRM, reps) => {
    const o = parseFloat(oneRM) || 0;
    const r = parseInt(reps, 10) || 0;
    if (r <= 0) return 0;
    if (r === 1) return o;
    return o / (1 + r / 30);
};

// Variant rounded to 2 dp — the precision stored in workoutHistory.oneRM.
export const estimateOneRMForStorage = (weight, reps) =>
    parseFloat(estimateOneRM(weight, reps).toFixed(2));
