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
// The two halves do NOT overlap. An earlier version started the incoming
// content rising while the outgoing was still at half opacity, which sounds
// like a soft cross-fade and looks like a double exposure: two sets of labels
// legible on top of each other, in the same place, for 80ms. Out first, then
// in, and the height animation running underneath for the whole 260ms is what
// stops it reading as two separate events.
const FADE_OUT = 120;
const FADE_IN = 140;

const Swap = ({ token, children, duration = DURATION, style }) => {
    // The token this render is showing, and the outgoing element tree held on
    // screen for the length of the fade. One object, because they change
    // together and they change DURING RENDER -- see the block below.
    // `starting` is true for exactly the first commit of a swap. During that
    // commit the two opacities are forced by PLAIN styles rather than animated
    // ones -- see the block below for why that is not belt and braces.
    const [phase, setPhase] = useState({ token, ghost: null, starting: false });
    const ghost = phase.ghost;
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
        setPhase((p) => (p.ghost == null ? p : { ...p, ghost: null }));
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

    // ── The swap starts DURING RENDER, and it has to ────────────────────────
    //
    // Both of the obvious places to start it are too late. A useEffect runs
    // after the frame has been painted; a useLayoutEffect is not reliably
    // before it either, because React Native commits the tree to the native
    // side and the paint does not wait on JS effects. Measured on a release
    // build: the first frame after a tap showed the INCOMING section at full
    // brightness -- old content already unmounted, no ghost over it, nothing
    // faded -- because the children had changed while the opacity was still
    // whatever the last swap left it at, which is 1.
    //
    // Updating state during render is React's own answer to this. It
    // re-renders the component immediately, before committing, so the ghost
    // and the zeroed incoming content are in the SAME output as the new
    // children. There is no frame in between for anything to show through.
    //
    // Getting the ghost into the right commit is only half of it, and the half
    // that did not show. Writing a Reanimated shared value from JS does not
    // change the view in that commit: it SCHEDULES an update for the UI thread,
    // which lands a frame later. So the first frame still painted the new
    // children at the opacity the last swap left behind. On device that read as
    // BAR (KG) -> Use my gym's rack -> BAR (KG) -> fade: the incoming content
    // for one frame, then the ghost catching up over it, then the real fade.
    //
    // So for the first commit of a swap the opacities are PLAIN styles, which
    // are part of that same commit and cannot arrive late. The shared values
    // are still set here so the animations start from the right place, and the
    // effect stands the plain styles down once they are running.
    if (token !== phase.token) {
        hold();
        swappingRef.current = true;
        target.current = -1;
        ghostOpacity.value = 1;
        liveOpacity.value = 0;
        setPhase({
            token,
            ghost: arrived.current ? previous.current : null,
            starting: arrived.current,
        });
    }

    useEffect(() => {
        if (!arrived.current) {
            arrived.current = true;
            return undefined;
        }
        const mine = ++run.current;

        ghostOpacity.value = withTiming(0, { duration: FADE_OUT });
        liveOpacity.value = withDelay(FADE_OUT, withTiming(1, { duration: FADE_IN }));
        // The animations are running now, so the shared values are known-good
        // and the plain styles can stand down.
        setPhase((p) => (p.starting ? { ...p, starting: false } : p));

        return () => {
            // Unmounted mid-swap: make sure a pending completion cannot fire
            // against a later run.
            if (run.current === mine) run.current += 1;
        };
        // Only the token starts a swap. Children changing is an ordinary
        // re-render and must leave the animation alone.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase.token]);

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
                <Animated.View
                    style={[styles.outOfFlow, ghostStyle, phase.starting && styles.opaque]}
                    pointerEvents="none"
                >
                    {ghost}
                </Animated.View>
            )}
            {/* Out of flow once the height is driven, so it reports the height
                it WANTS rather than the one the container is capped at.
                Toggling the style does not remount it. */}
            <Animated.View
                style={[driven && styles.outOfFlow, liveStyle, phase.starting && styles.invisible]}
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
    // Only ever applied on the first commit of a swap. A plain style is part
    // of the same commit as the children; a shared value written next to it is
    // not, which is the whole problem these two exist to solve.
    opaque: { opacity: 1 },
    invisible: { opacity: 0 },
});

export default Swap;
