import React, { useEffect, useRef, useState } from 'react';
import Expandable from './Expandable';

// Shows or hides a block, animating its REAL layout height in BOTH directions,
// so whatever sits below it moves in lockstep. See components/Expandable for
// why height rather than a layout transition, and DESIGN.md for the rule.
//
// Drive it with a boolean and forget the rest:
//
//     <Collapsible open={showPlates}>
//         <PlateInventoryEditor ... />
//     </Collapsible>
//
// What it is really for is the closing half. `{open && <Thing/>}` unmounts on
// the state change, so a block that grew in politely vanishes on the way out --
// the one direction people notice. The content here outlives `open` by exactly
// the length of the collapse.
//
// A block that is already open at first paint appears instantly. Growing a
// screen's existing contents in on arrival is a separate thing and DESIGN.md
// rules it out.
// `onClosed` fires once the block has finished collapsing and left the tree --
// for anything that has to wait for the content to actually be gone, such as a
// separator that would otherwise blink back mid-animation.
const Collapsible = ({ open, children, duration, style, onClosed }) => {
    // Mounted outlives `open` by the length of the closing animation.
    const [mounted, setMounted] = useState(open);
    // Expandable's grow mode runs once per instance and ignores a second
    // collapse, so reopening mid-close needs a fresh instance -- otherwise the
    // in-flight collapse finishes and unmounts what was just reopened.
    const [instance, setInstance] = useState(0);
    const instanceRef = useRef(0);
    const contentRef = useRef(null);
    const closingRef = useRef(false);
    const [primed, setPrimed] = useState(false);
    // Held in a ref so a caller's inline arrow does not re-run the effect and
    // restart a collapse that is already in flight.
    const closedRef = useRef(onClosed);

    useEffect(() => setPrimed(true), []);
    useEffect(() => { closedRef.current = onClosed; }, [onClosed]);

    useEffect(() => {
        if (open) {
            if (closingRef.current) {
                closingRef.current = false;
                instanceRef.current += 1;
                setInstance(instanceRef.current);
            }
            setMounted(true);
            return;
        }
        if (!mounted || closingRef.current) return;
        const collapse = contentRef.current && contentRef.current.collapse;
        if (!collapse) {
            setMounted(false);
            closedRef.current && closedRef.current();
            return;
        }
        const token = instanceRef.current;
        closingRef.current = true;
        collapse(() => {
            // Reopened while this was closing; that open owns the block now.
            if (instanceRef.current !== token) return;
            closingRef.current = false;
            setMounted(false);
            closedRef.current && closedRef.current();
        });
    }, [open, mounted]);

    if (!mounted) return null;

    return (
        <Expandable
            key={instance}
            ref={contentRef}
            animateOnMount={primed}
            duration={duration}
            style={style}
        >
            {children}
        </Expandable>
    );
};

export default Collapsible;
