import { useMemo, useRef, useState } from 'react';

// Which section to draw pinned above a SectionList, doing by hand what
// `stickySectionHeadersEnabled` used to do.
//
// It is done by hand because the list's own sticky headers corrupt its cell
// metrics: a STUCK header reports its stuck position as its layout offset, and
// VirtualizedList caches that as the cell's offset in the content. Measured on
// both screens that use this — every stuck month header recorded at offset 0
// instead of its real offset — the leading spacer is sized from those offsets,
// so the content height comes out wrong, and where the scroll is clamped to the
// content (the bottom) the position follows the wrong height, which moves the
// render window, which changes the height again. See the long note in
// app/(tabs)/history.jsx for the numbers.
//
//   const { pinned, viewabilityConfigCallbackPairs } = usePinnedSection(sections);
//   ...
//   {pinned && <View style={styles.pinnedHeader}>{pinned.title}…</View>}
//   <SectionList sections={sections}
//                viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs} … />
//
// `pinned` is null when nothing should be drawn, which covers the top of the
// list as well: at rest the first month's header is fully on screen, so there
// is nothing to stand in for.
//
// ── Why two viewability thresholds ──────────────────────────────────────────
//
// The naive version — pin the topmost visible row's month whenever the list is
// scrolled — draws the label twice wherever the list cannot scroll a header out
// from under it. At the clamped bottom of the body-weight log that is permanent:
// FEBRUARY 2024 sat pinned at the top with its own header thirty dp below it.
//
// So the pin stands down whenever the real header is on screen IN FULL, and
// takes over the moment it starts to clip. That is the exact frame where the
// label would otherwise begin to be cut off, so the handover is invisible: the
// header is never seen partly drawn, and it is never seen twice.
//
// Deciding that needs two questions answered about the same scroll position —
// which cell is topmost (anything visible at all), and which cells are drawn in
// full — and one viewability config can only answer one of them. Hence a pair.
//
// ── Why the index map ───────────────────────────────────────────────────────
//
// SectionList hands `onViewableItemsChanged` to VirtualizedSectionList, which
// converts each token to carry the `section` it came from.
// `viewabilityConfigCallbackPairs` is NOT converted — it is passed straight
// through, so the tokens arrive raw, `token.section` is undefined and a hook
// reading it silently never pins anything. What raw tokens DO carry is the flat
// cell index, and the flat layout is fixed: each section contributes a header,
// then its rows, then a footer. So the sections are walked once into an index
// map, and that is what the callbacks read.
const ANY_PIXEL = { itemVisiblePercentThreshold: 1 };
const IN_FULL = { itemVisiblePercentThreshold: 99 };

const usePinnedSection = (sections) => {
    const [pinned, setPinned] = useState(null);

    // Flat cell index -> which section it belongs to and whether it is that
    // section's header. Same walk VirtualizedSectionList does internally.
    const cells = useMemo(() => {
        const out = [];
        for (const section of sections) {
            out.push({ section, isHeader: true });
            for (let i = 0; i < section.data.length; i++) out.push({ section, isHeader: false });
            out.push({ section, isHeader: false }); // section footer, renders nothing
        }
        return out;
    }, [sections]);
    const cellsRef = useRef(cells);
    cellsRef.current = cells;

    // Topmost cell with any pixel on screen, and the flat indices of the cells
    // drawn in full. Two callbacks, so each writes its own and then asks for the
    // answer to be recomputed from both.
    const topmost = useRef(null);
    const inFull = useRef(new Set());

    const settle = useRef(() => {
        const index = topmost.current;
        const cell = index == null ? null : cellsRef.current[index];
        if (!cell) return setPinned(null);
        // The real header is there and whole: let it do the job.
        if (cell.isHeader && inFull.current.has(index)) return setPinned(null);
        const { title, data } = cell.section;
        // Written only when it actually changes — this runs off the scroll.
        setPinned((p) => (p && p.title === title ? p : { title, count: data.length }));
    }).current;

    // Identity has to be stable: VirtualizedList refuses a new
    // viewabilityConfigCallbackPairs after mount.
    const viewabilityConfigCallbackPairs = useRef([
        {
            viewabilityConfig: ANY_PIXEL,
            onViewableItemsChanged: ({ viewableItems }) => {
                topmost.current = viewableItems.length ? viewableItems[0].index : null;
                settle();
            },
        },
        {
            viewabilityConfig: IN_FULL,
            onViewableItemsChanged: ({ viewableItems }) => {
                inFull.current = new Set(viewableItems.map((v) => v.index));
                settle();
            },
        },
    ]).current;

    return { pinned, viewabilityConfigCallbackPairs };
};

export default usePinnedSection;
