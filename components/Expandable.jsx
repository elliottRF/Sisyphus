import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { View, StyleSheet, PixelRatio } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    runOnJS,
    Easing,
} from 'react-native-reanimated';

// Animates REAL layout height: grows from nothing on mount (optional) and
// collapses to nothing on request, a frame at a time on the UI thread. Because
// the height itself changes, everything below -- the rest of the card, the
// cards under it, the page footer with Add Exercise / Finish Workout -- moves
// with it through ordinary layout, needing no layout animation of its own.
//
// That is the point. A Reanimated layout transition animates a view's frame
// AFTER a layout change has landed, so a footer with one lagged a frame behind
// the card that had already resized, and a footer without one simply jumped.
// Real height moves everything in lockstep.
//
// `ref.current.collapse(onDone)` shrinks it and calls back once it has gone;
// remove it from state there.
//
// Two modes, fixed for an instance's life:
//
//  - Collapse-only (the default, used by the exercise card). Children sit in
//    normal flow and the view sizes itself; an inert maxHeight sits in the
//    animated style until a collapse drives it to 0.
//
//  - Grow (`animateOnMount`, used by set rows and the note). Children are
//    measured OUT OF FLOW and the view's height is driven explicitly. This is
//    not decoration: a wrapper capped at 0 also caps the space its content is
//    measured in, and content that consults available height -- a multiline
//    TextInput, and set rows on some passes -- measures 0 inside it, so it
//    could never grow to a height it was never able to report. Measuring an
//    absolutely-positioned child sidesteps the cap entirely.
//
// One rule holds in both: useAnimatedStyle must return a STABLE SET OF KEYS.
// Dropping a key (handing `height` back to auto layout once grown) makes
// Reanimated restore that property's pre-animation value, which was 0 -- the
// row grew in and then silently collapsed again.

// Measured heights are floats, and a container left on a fractional height
// puts everything inside it half a pixel off the grid. Where two rows with
// translucent backgrounds meet, that overlap paints the tint TWICE and
// leaves a lighter hairline -- visible on a 420dpi phone, invisible at 480.
// Snapping to whole device pixels costs nothing and removes the class.
const snap = (h) => PixelRatio.roundToNearestPixel(h);

const DURATION = 220;
// Ease-out is right for the short travels this was built for -- a set row, a
// note, a warm-up group -- where landing quickly and settling reads as snappy.
//
// It is wrong for a big one. Over 400dp it puts HALF the movement in the first
// 68ms and then crawls the last tenth for another 134ms: measured, not guessed.
// That is the "opens up hugely with a pop" on the colour wheel, and anything
// following the height -- the scroll that keeps the block in view -- inherits
// the same lopsided curve and jolts with it.
//
// So the curve is a prop. Nothing that was tuned against ease-out changes; a
// caller moving a panel rather than a row asks for GENTLE instead.
const EASING = Easing.out(Easing.cubic);
export const EASING_GENTLE = Easing.inOut(Easing.cubic);
// Any cap above the content's height leaves the view free to size itself.
const UNCAPPED = 100000;

// Measured heights are not stable between layout passes. On a 420dpi screen
// (a Pixel 9a, scale 2.625) the same unchanged content reports 424.3809524,
// then 424.7619048, then 424.3809524 again -- a wobble of 0.381dp, which is
// exactly ONE physical pixel, arriving 150ms into an animation.
//
// That matters because the difference between "the content resized itself"
// and "the same content measured again" is what decides whether the height
// is animated or hard-set. An exact-equality check calls a one-pixel wobble a
// resize, hard-sets the height, and the opening animation dies mid-flight --
// the "opens up hugely with a pop". It reproduces on a 420dpi screen and not
// on a 480dpi one, which is why it survived being tested on an emulator.
//
// So a change smaller than this is noise, not content. 1dp is at least two
// physical pixels at any density this runs on, and far below anything real:
// the smallest thing that genuinely opens here is a set row at 44dp.
const NOISE_DP = 1;

const CollapseOnly = forwardRef(({ children, style, duration, easing = EASING }, ref) => {
    const cap = useSharedValue(UNCAPPED);
    const natural = useRef(0);
    const collapsing = useRef(false);
    // Clipping is only needed while the cap is actually cutting content off.
    // Kept out of the animated style and off by default on purpose: `overflow`
    // is not animatable, and a permanent `hidden` would clip the card's
    // light-theme shadow, which Android draws outside the view's bounds.
    const [clipping, setClipping] = useState(false);

    const onLayout = useCallback((e) => {
        natural.current = snap(e.nativeEvent.layout.height);
    }, []);

    useImperativeHandle(ref, () => ({
        collapse: (onDone) => {
            if (collapsing.current) return;
            collapsing.current = true;
            setClipping(true);
            cap.value = natural.current || 0;
            cap.value = withTiming(0, { duration, easing }, (finished) => {
                if (finished && onDone) runOnJS(onDone)();
            });
        },
    }), [cap, duration]);

    const animatedStyle = useAnimatedStyle(() => ({ maxHeight: cap.value }));

    return (
        <Animated.View style={[style, clipping && styles.clip, animatedStyle]} onLayout={onLayout}>
            {children}
        </Animated.View>
    );
});

const Grow = forwardRef(({ children, style, duration, easing = EASING }, ref) => {
    const height = useSharedValue(0);
    const measured = useRef(0);
    const collapsing = useRef(false);
    // True from the first measure until the opening animation lands. While it
    // is set, a size change re-targets the animation; afterwards it is tracked
    // exactly. The two need telling apart -- see onMeasure.
    const growing = useRef(false);
    const settle = useCallback(() => { growing.current = false; }, []);

    const onMeasure = useCallback((e) => {
        const h = snap(e.nativeEvent.layout.height);
        if (h <= 0 || collapsing.current) return;
        // A RE-MEASURE of the height we already have is not the content
        // resizing. Android re-runs layout on the absolutely-positioned
        // measuring child while the parent's height animates, so onLayout
        // fires several times during a normal open -- reporting the same
        // number, or one a physical pixel off it. See NOISE_DP: treating that
        // as a resize is what killed the animation mid-open.
        if (Math.abs(h - measured.current) < NOISE_DP) return;
        const first = measured.current === 0;
        measured.current = h;
        if (first || growing.current) {
            // Still opening. A genuine size change mid-open re-targets the
            // animation rather than jumping to the new height, so the block
            // keeps moving instead of snapping part-way.
            growing.current = true;
            height.value = withTiming(h, { duration, easing }, (done) => {
                if (done) runOnJS(settle)();
            });
        } else {
            // Content genuinely changed size on its own, after it had settled
            // (a set added to a card, a note growing a line). Track it exactly
            // rather than animating toward it: an animation would re-target on
            // every frame of whatever is moving inside, and arrive late.
            height.value = h;
        }
    }, [height, duration]);

    useImperativeHandle(ref, () => ({
        collapse: (onDone) => {
            if (collapsing.current) return;
            collapsing.current = true;
            height.value = withTiming(0, { duration, easing }, (finished) => {
                if (finished && onDone) runOnJS(onDone)();
            });
        },
    }), [height, duration]);

    const animatedStyle = useAnimatedStyle(() => ({ height: height.value }));

    return (
        <Animated.View style={[style, styles.clip, animatedStyle]}>
            <View style={styles.measure} onLayout={onMeasure}>
                {children}
            </View>
        </Animated.View>
    );
});

const styles = StyleSheet.create({
    clip: { overflow: 'hidden' },
    // Out of flow, so its height is its content's and never limited by the
    // animated height of the view around it.
    measure: { position: 'absolute', left: 0, right: 0, top: 0 },
});

const Expandable = forwardRef(({ children, style, animateOnMount = false, duration = DURATION, easing = EASING }, ref) => {
    // Frozen at mount. Callers pass a mount guard that flips to true once the
    // screen has settled, and swapping component type mid-life would remount
    // the subtree -- losing what is typed into a set's weight and reps.
    const modeRef = useRef(animateOnMount);
    const Impl = modeRef.current ? Grow : CollapseOnly;
    return (
        <Impl ref={ref} style={style} duration={duration} easing={easing}>
            {children}
        </Impl>
    );
});

export default Expandable;
