import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Expandable from './Expandable';

// A keyed list whose rows grow in when added and collapse out when removed.
//
// The parent keeps owning the data. All this does is hold a removed row on
// screen long enough for it to collapse, and mount a new one at zero height so
// it can grow -- both through REAL layout height, so everything below moves
// with it. See components/Expandable for why height and not a layout
// transition, and DESIGN.md for the rule.
//
// Two things the caller has to get right:
//
//  - `keyOf` must be STABLE for the life of a row. An index is not: removing
//    the middle of a list renumbers everything under it, so every row below
//    would collapse out and grow back in. Key by whatever identifies the row
//    (a plate's weight, an id), which is also why `renderItem` is given no
//    index to lean on.
//
//  - Keys must be unique. Two rows sharing one would share an animation
//    handle, and only one of them would ever collapse.
//
// Rows present at first paint appear instantly -- a screen animating its
// existing contents in, row by row, is the thing DESIGN.md rules out. Only
// what the user adds afterwards grows, which is decided per row when the row
// is created rather than by a flag read at render time.
const AnimatedList = ({ items, keyOf, renderItem, duration }) => {
    // What is mounted: the live rows, plus any still collapsing, each held at
    // the index it had when it left.
    const [rows, setRows] = useState(() => items.map((item) => ({
        key: String(keyOf(item)),
        gen: 0,
        grow: false,
        item,
        leaving: false,
    })));
    // Mirrors `rows`. Written only from effects and callbacks, never read
    // during render, so the reconcile below can see what is on screen without
    // a state updater that is anything but pure.
    const shown = useRef(rows);
    const handles = useRef(new Map());

    const commit = useCallback((next) => {
        shown.current = next;
        setRows(next);
    }, []);

    const drop = useCallback((key) => {
        // Already gone, or added back mid-collapse -- in which case the row on
        // screen belongs to the new one and must not be torn off.
        if (!shown.current.some((r) => r.key === key && r.leaving)) return;
        handles.current.delete(key);
        commit(shown.current.filter((r) => r.key !== key));
    }, [commit]);

    useEffect(() => {
        const live = items.map((item) => ({ key: String(keyOf(item)), item }));
        const liveKeys = new Set(live.map((r) => r.key));
        const was = new Map(shown.current.map((r) => [r.key, r]));

        const next = live.map((r) => {
            const before = was.get(r.key);
            // Added back while it was still collapsing. Expandable's grow mode
            // runs once per instance, so this needs a fresh one -- and a fresh
            // handle, or `drop` would be talking to the dead animation.
            const reborn = !!before && before.leaving;
            if (reborn) handles.current.delete(r.key);
            return {
                key: r.key,
                item: r.item,
                leaving: false,
                gen: (before ? before.gen : 0) + (reborn ? 1 : 0),
                grow: before && !reborn ? before.grow : true,
            };
        });

        // Put anything that has left the data back where it was, and start it
        // collapsing if this is the first render that dropped it.
        const starting = [];
        shown.current.forEach((row, idx) => {
            if (liveKeys.has(row.key)) return;
            if (!row.leaving) starting.push(row.key);
            next.splice(Math.min(idx, next.length), 0, { ...row, leaving: true });
        });

        // The first run sees the list it was built from, and a parent that
        // re-renders without touching the data sees no change either. Skip
        // those rather than churn a new array through state.
        const same = next.length === shown.current.length
            && next.every((r, i) => {
                const before = shown.current[i];
                return before.key === r.key && before.gen === r.gen
                    && before.leaving === r.leaving && before.item === r.item;
            });
        if (!same) commit(next);

        starting.forEach((key) => {
            const api = handles.current.get(key);
            if (!api || !api.collapse) {
                drop(key);
                return;
            }
            api.collapse(() => drop(key));
        });
        // `keyOf` and `renderItem` are typically inline arrows and would make
        // this run every render; `items` is what actually decides the list.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items]);

    return rows.map((row) => (
        <Expandable
            key={`${row.key}#${row.gen}`}
            ref={(api) => {
                if (api) handles.current.set(row.key, api);
            }}
            animateOnMount={row.grow}
            duration={duration}
        >
            {/* A row on its way out must not still take taps: its callbacks
                refer to data the parent has already dropped. */}
            <View pointerEvents={row.leaving ? 'none' : 'auto'}>
                {renderItem(row.item)}
            </View>
        </Expandable>
    ));
};

export default AnimatedList;
