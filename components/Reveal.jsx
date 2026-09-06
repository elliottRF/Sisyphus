import React, { useCallback } from 'react';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withDelay,
    Easing,
} from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';

// Replays a fade-and-rise on every focus of the screen it sits in, so a tab
// switch reveals the new tab's content section by section instead of cutting
// to it. Give each top-level block an `index` in reading order; block N starts
// N steps after block 0, capped so long screens settle in under half a second.
//
// Driven by a shared value on the UI thread, not by remounting: the wrapped
// content keeps its state, its Skia canvases and its list positions. Mount
// animations (`entering`) would only run once per lazily mounted tab.
//
// Experiment (2026-09-06). One switch to turn the whole thing off.
export const TAB_REVEAL = true;

// >1 slows everything down by that factor for inspection. Ship at 1.
const SPEED = 1;

const STEP = 45;
const DURATION = 280;
const RISE = 14;
const MAX_STEP = 6;
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
            progress.value = 0;
            progress.value = withDelay(
                Math.min(index, MAX_STEP) * STEP * SPEED,
                withTiming(1, { duration: DURATION * SPEED, easing: Easing.out(Easing.cubic) })
            );
            return () => {
                progress.value = withDelay(HOLD_BEFORE_HIDE, withTiming(0, { duration: 0 }));
            };
        }, [index, progress])
    );

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: progress.value,
        transform: [{ translateY: (1 - progress.value) * rise }],
    }));

    return (
        <Animated.View {...rest} style={[style, animatedStyle]}>
            {children}
        </Animated.View>
    );
};

export default Reveal;
