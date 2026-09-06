import React, { useCallback } from 'react';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withDelay,
    Easing,
} from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';

// Replays a soft fade on every focus of the screen it sits in, so a tab switch
// reveals the new tab's content section by section instead of cutting to it.
// Give each top-level block an `index` in reading order; block N starts N
// steps after block 0, capped so a whole screen settles in about 300ms.
//
// Deliberately low-key: opacity only by default (pass `rise` for a lift), and
// a block never restarts from invisible. On focus it continues from wherever
// it already is, so switching tabs quickly -- before the previous tab has had
// time to drop out -- shows the tab exactly as it was, with no re-animation.
// The earlier version reset to zero and rose 14px on every focus, which read
// as jitter under fast switching.
//
// Driven by a shared value on the UI thread, not by remounting: the wrapped
// content keeps its state, its Skia canvases and its list positions. Mount
// animations (`entering`) would only run once per lazily mounted tab.
//
// Experiment (2026-09-06). One switch to turn the whole thing off.
export const TAB_REVEAL = true;

// >1 slows everything down by that factor for inspection. Ship at 1.
const SPEED = 1;

const STEP = 30;
const DURATION = 200;
const RISE = 0;
const MAX_STEP = 4;
// A tab switch hides the outgoing screen instantly, but a stack push keeps it
// on screen for the transition. The drop to invisible waits that out, so the
// screen underneath doesn't blank mid-flip. A refocus inside the window just
// replaces the pending drop.
const HOLD_BEFORE_HIDE = 450;

const Reveal = ({ index = 0, rise = RISE, style, children, ...rest }) => {
    const progress = useSharedValue(TAB_REVEAL ? 0 : 1);

    useFocusEffect(
        useCallback(() => {
            if (!TAB_REVEAL) return undefined;
            // Already (partly) visible: finish the fade with no stagger delay,
            // so an interrupted block doesn't pause mid-way. Only a block that
            // has actually dropped out waits its turn.
            const stagger = progress.value === 0 ? Math.min(index, MAX_STEP) * STEP * SPEED : 0;
            progress.value = withDelay(
                stagger,
                withTiming(1, { duration: DURATION * SPEED, easing: Easing.out(Easing.cubic) })
            );
            return () => {
                progress.value = withDelay(HOLD_BEFORE_HIDE, withTiming(0, { duration: 0 }));
            };
        }, [index, progress])
    );

    const animatedStyle = useAnimatedStyle(() => (
        rise
            ? { opacity: progress.value, transform: [{ translateY: (1 - progress.value) * rise }] }
            : { opacity: progress.value }
    ));

    return (
        <Animated.View {...rest} style={[style, animatedStyle]}>
            {children}
        </Animated.View>
    );
};

export default Reveal;
