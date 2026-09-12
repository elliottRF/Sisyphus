import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, PixelRatio } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withDelay,
    runOnJS,
    cancelAnimation,
} from 'react-native-reanimated';

import { EASING_GENTLE } from './Expandable';

// Replaces one block of content with another: the outgoing fades out where it
// stands, the incoming fades in behind it, and the container animates its REAL
// layout height between the two so everything below moves in lockstep. See
// components/Expandable for why height and not a layout transition, and
// DESIGN.md for the rule.
//
//     <Swap token={type}>
//         {sectionFor(type)}
//     </Swap>
//
// `token` is what identifies the content. It changes -> a swap runs. Anything
// else re-rendering inside does NOT, which is the whole reason it is a separate
// prop rather than a diff of the children: the equipment editor re-renders this
// subtree on every keystroke, and only a change of equipment TYPE is a swap.
//
// The outgoing content is the element tree from the previous render, held and
// drawn out of flow. That matters for correctness, not just convenience -- by
// the time a swap starts the props have already moved on, so re-rendering the
// old type against the new config would draw a barbell section with a
// dumbbell's fields in it, blank, for the length of the fade.
//
// ── Why the height style goes on once and never comes off ───────────────────
//
// The obvious build is to drive the height only while a swap is running and
// leave the container to ordinary layout the rest of the time. That is wrong,
// and wrong in a way that survives the animation and stays on screen:
// DETACHING AN ANIMATED STYLE DOES NOT HAND THE PROPERTY BACK TO LAYOUT. The
// native view keeps the last value Reanimated wrote, so the container froze at
// whatever height the swap ended on. Anything that grew afterwards -- the
// preview line, which appears as soon as a config can produce weights -- spilled
// out of the bottom and drew on top of the next section of the form. It looked
// like a stray absolutely-positioned box; it was a container that never got its
// `height: auto` back.
//
// So the style is attached at the first measure and stays. The cost is that
// content resizing ITSELF from the inside (the plate inventory opening, a chip
// row wrapping) is tracked a frame behind rather than driving layout directly.
// That is the same trade components/Expandable makes in its grow mode, for the
// same reason, and it is much the smaller of the two.
const snap = (h) => PixelRatio.roundToNearestPixel(h);

// Layout heights wobble by a physical pixel between passes -- see NOISE_DP in
// components/Expandable, where treating that as a real change killed the
// animation outright. Here it would restart the timing mid-swap instead, which
// is less violent and still wrong.
const NOISE_DP = 1;

const DURATION = 260;
// Short enough that the two halves overlap into one movement rather than
// reading as "out, then in".
const FADE = 150;

const Swap = ({ token, children, duration = DURATION, style }) => {
    // The outgoing element tree, held on screen for the length of the fade.
    const [ghost, setGhost] = useState(null);
    // False until the first measure lands. Until then the content sits in
    // normal flow and the container sizes itself, so the first paint is the
    // finished article rather than a frame of nothing. Goes true once, and
    // never back -- see the note above about what detaching costs.
    const [driven, setDriven] = useState(false);

    const height = useSharedValue(0);
    const liveOpacity = useSharedValue(1);
    const ghostOpacity = useSharedValue(0);

    // Natural height of whatever is live, from the measure below.
    const natural = useRef(0);
    // What the height is set or heading to, so a repeat layout reporting the
    // same number does nothing. Android re-runs layout on the out-of-flow
    // child several times while the parent's height animates.
    const target = useRef(-1);
    const swappingRef = useRef(false);
    // Each swap takes a number; a later one invalidates the completion of an
    // earlier, so hammering the picker cannot leave the container stranded.
    const run = useRef(0);
    // Previous render's children. Read by the swap effect below BEFORE the
    // effect that overwrites it -- declaration order is what makes that safe.
    const previous = useRef(children);
    // Content present at first paint appears instantly. Growing a screen's
    // existing contents in on arrival is the thing DESIGN.md rules out, and
    // there is nothing to swap FROM on a mount anyway.
    const arrived = useRef(false);

    const finish = useCallback((mine) => {
        if (run.current !== mine) return;
        swappingRef.current = false;
        setGhost(null);
    }, []);

    // Hold at the height being left. Interrupting a swap has to stop the
    // animation WHERE IT IS rather than set a height -- the live child is out
    // of flow by then and `natural` is already the incoming content's full
    // size, so assigning it would jump to the destination and leave the
    // animation nothing to travel.
    const hold = useCallback(() => {
        if (swappingRef.current) cancelAnimation(height);
        else height.value = natural.current || 0;
    }, []);

    const onMeasure = useCallback((e) => {
        const h = snap(e.nativeEvent.layout.height);
        if (h <= 0 || Math.abs(h - target.current) < NOISE_DP) return;
        natural.current = h;
        target.current = h;
        if (!swappingRef.current) {
            // Not a swap: either the first measure, or the content resized
            // itself. Track it exactly. Animating toward it would re-target on
            // every frame of whatever is moving inside and arrive late.
            height.value = h;
            setDriven(true);
            return;
        }
        const mine = run.current;
        height.value = withTiming(h, { duration, easing: EASING_GENTLE }, (done) => {
            if (done) runOnJS(finish)(mine);
        });
    }, [duration, finish]);

    useEffect(() => {
        if (!arrived.current) {
            arrived.current = true;
            return undefined;
        }
        const mine = ++run.current;
        hold();
        target.current = -1;
        swappingRef.current = true;

        setGhost(previous.current);

        ghostOpacity.value = 1;
        ghostOpacity.value = withTiming(0, { duration: FADE });
        liveOpacity.value = 0;
        liveOpacity.value = withDelay(FADE * 0.45, withTiming(1, { duration: FADE }));

        return () => {
            // Unmounted mid-swap: make sure a pending completion cannot fire
            // against a later run.
            if (run.current === mine) run.current += 1;
        };
        // Only the token starts a swap. Children changing is an ordinary
        // re-render and must leave the animation alone.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    // Declared AFTER the swap effect on purpose: that one needs the previous
    // render's children, and this is what retires them.
    useEffect(() => {
        previous.current = children;
    });

    const heightStyle = useAnimatedStyle(() => ({ height: height.value }));
    const liveStyle = useAnimatedStyle(() => ({ opacity: liveOpacity.value }));
    const ghostStyle = useAnimatedStyle(() => ({ opacity: ghostOpacity.value }));

    return (
        <Animated.View style={[style, driven && styles.clip, driven && heightStyle]}>
            {ghost != null && (
                <Animated.View style={[styles.outOfFlow, ghostStyle]} pointerEvents="none">
                    {ghost}
                </Animated.View>
            )}
            {/* Out of flow once the height is driven, so it reports the height
                it WANTS rather than the one the container is capped at.
                Toggling the style does not remount it. */}
            <Animated.View
                style={[driven && styles.outOfFlow, liveStyle]}
                onLayout={onMeasure}
            >
                {children}
            </Animated.View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    clip: { overflow: 'hidden' },
    outOfFlow: { position: 'absolute', left: 0, right: 0, top: 0 },
});

export default Swap;
