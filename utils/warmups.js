// How a collapsible warm-up group is split up, shared by the two screens that
// show one: the session view and the finished-workout overview. They render
// the same rows from the same data, and a copy in each would drift.

/** A set that set any record. Warm-ups that did are never hidden. */
export const isPRSet = (set) =>
    set.is1rmPR === 1 || set.isVolumePR === 1 || set.isWeightPR === 1;

/**
 * Warm-ups, split into the runs that can be hidden and the record-setting rows
 * that cannot. [W1, W2(PR), W3] becomes run[W1], pr W2, run[W3] -- so W2
 * renders between the two collapsing blocks and keeps its real position
 * instead of jumping to the top when the rest go away.
 *
 * Each run is meant to be ONE collapsing block rather than a block per row: a
 * row each means several heights animating side by side, and because each
 * starts when its own child reports a size, they can begin a frame apart --
 * the group then arrives in steps and reads as a stutter.
 */
export const warmupRunsOf = (warmups) => {
    const runs = [];
    let open = null;
    warmups.forEach((set) => {
        if (isPRSet(set)) {
            runs.push({ pr: set });
            open = null;
            return;
        }
        if (!open) {
            open = { sets: [] };
            runs.push(open);
        }
        open.sets.push(set);
    });
    return runs;
};
