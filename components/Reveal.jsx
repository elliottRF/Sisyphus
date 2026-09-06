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
// Deliberately low-key: opacity only by default (pass `rise` for a lift).
// Every tab switch restarts the fade from invisible. A blur caused by a stack
// screen being pushed on top is different: the tab stays visible underneath
// the push transition and comes back exactly as it was when that screen pops,
// because returning to a page you never left is not a page change.
//
// Driven by a shared value on the UI thread, not by remounting: the wrapped
// content keeps its state, its Skia canvases and its list positions. Mount
// animations (`entering`) would only run once per lazily mounted tab.
//
// Experiment (2026-09-06). One switch to turn the whole thing off.
export const TAB_REVEAL = true;

// The tab bar stamps this just before it navigates, so a blur that follows
// within the window is known to be a tab switch. Reading navigator state on
// blur was tried first and could not tell the two apart: the state visible
// from inside a tab screen is the stack's, which changes on a push, not on a
// tab change.
let lastTabSwitchAt = 0;
const TAB_SWITCH_WINDOW = 500;
export const markTabSwitch = () => { lastTabSwitchAt = Date.now(); };

// >1 slows everything down by that factor for inspection. Ship at 1.
const SPEED = 1;

const STEP = 30;
const DURATION = 200;
const RISE = 0;
const MAX_STEP = 4;

const Reveal = ({ index = 0, rise = RISE, style, children, ...rest }) => {
    const progress = useSharedValue(TAB_REVEAL ? 0 : 1);

    useFocusEffect(
        useCallback(() => {
            if (!TAB_REVEAL) return undefined;
            // A block still visible (back from a pushed screen) is a no-op
            // here; one that dropped out fades in after its stagger.
            const stagger = progress.value === 0 ? Math.min(index, MAX_STEP) * STEP * SPEED : 0;
            progress.value = withDelay(
                stagger,
                withTiming(1, { duration: DURATION * SPEED, easing: Easing.out(Easing.cubic) })
            );
            return () => {
                // Another tab took over: this one is hidden instantly, so drop
                // out now and the next visit restarts the fade. Otherwise a
                // stack screen was pushed on top: stay visible beneath its
                // transition, and resume at full opacity when it pops.
                if (Date.now() - lastTabSwitchAt < TAB_SWITCH_WINDOW) progress.value = 0;
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
