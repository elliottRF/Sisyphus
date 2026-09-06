import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
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
const DURATION = 220;
const EASING = Easing.out(Easing.cubic);
// Any cap above the content's height leaves the view free to size itself.
const UNCAPPED = 100000;

const CollapseOnly = forwardRef(({ children, style, duration }, ref) => {
    const cap = useSharedValue(UNCAPPED);
    const natural = useRef(0);
    const collapsing = useRef(false);
    // Clipping is only needed while the cap is actually cutting content off.
    // Kept out of the animated style and off by default on purpose: `overflow`
    // is not animatable, and a permanent `hidden` would clip the card's
    // light-theme shadow, which Android draws outside the view's bounds.
    const [clipping, setClipping] = useState(false);

    const onLayout = useCallback((e) => {
        natural.current = e.nativeEvent.layout.height;
    }, []);

    useImperativeHandle(ref, () => ({
        collapse: (onDone) => {
            if (collapsing.current) return;
            collapsing.current = true;
            setClipping(true);
            cap.value = natural.current || 0;
            cap.value = withTiming(0, { duration, easing: EASING }, (finished) => {
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

const Grow = forwardRef(({ children, style, duration }, ref) => {
    const height = useSharedValue(0);
    const measured = useRef(0);
    const collapsing = useRef(false);

    const onMeasure = useCallback((e) => {
        const h = e.nativeEvent.layout.height;
        if (h <= 0 || collapsing.current) return;
        const first = measured.current === 0;
        measured.current = h;
        if (first) {
            height.value = withTiming(h, { duration, easing: EASING });
        } else {
            // Content changed size on its own (a set added to a card, a note
            // growing a line). Track it exactly rather than animating toward
            // it: an animation would re-target on every frame of whatever is
            // moving inside, and arrive late.
            height.value = h;
        }
    }, [height, duration]);

    useImperativeHandle(ref, () => ({
        collapse: (onDone) => {
            if (collapsing.current) return;
            collapsing.current = true;
            height.value = withTiming(0, { duration, easing: EASING }, (finished) => {
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

const Expandable = forwardRef(({ children, style, animateOnMount = false, duration = DURATION }, ref) => {
    // Frozen at mount. Callers pass a mount guard that flips to true once the
    // screen has settled, and swapping component type mid-life would remount
    // the subtree -- losing what is typed into a set's weight and reps.
    const modeRef = useRef(animateOnMount);
    const Impl = modeRef.current ? Grow : CollapseOnly;
    return (
        <Impl ref={ref} style={style} duration={duration}>
            {children}
        </Impl>
    );
});

export default Expandable;
