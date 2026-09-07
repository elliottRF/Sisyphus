import React, { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withDelay,
    Easing,
} from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';

// A soft, staggered fade-in for a screen's top-level blocks. Give each block
// an `index` in reading order; block N starts N steps after block 0.
//
// It does NOT run on tab switches. It used to, and that was reverted: leaving
// a tab set its blocks to invisible so the next visit could fade them in, and
// any interruption in between -- most reliably backgrounding the app for a
// while and coming back -- left a tab showing nothing but its chrome until it
// was switched away from and back. An animation is not worth a screen that can
// get stuck empty, so blocks now START VISIBLE and are never hidden by this
// component on its own. The only way one fades is an explicit armTabReveal()
// immediately before navigating, which is a one-shot: nothing can leave a
// block at zero opacity and walk away.
//
// Driven by a shared value on the UI thread, not by remounting: wrapped
// content keeps its state, its Skia canvases and its list positions.
export const TAB_REVEAL = true;

// Arm a single reveal for the screen that focuses next. Call it right before
// navigating (see the workout-in-progress banner on Home). Blocks compare the
// token so every block of one screen animates once, and it expires quickly so
// a navigation that never happens can't fire a stray fade later.
let revealToken = 0;
let revealArmedAt = 0;
const ARM_WINDOW = 1000;
export const armTabReveal = () => {
    revealToken += 1;
    revealArmedAt = Date.now();
};

// >1 slows everything down by that factor for inspection. Ship at 1.
const SPEED = 1;

const STEP = 30;
const DURATION = 200;
const RISE = 0;
const MAX_STEP = 4;

const Reveal = ({ index = 0, rise = RISE, style, children, ...rest }) => {
    // Visible unless something deliberately animates it in.
    const progress = useSharedValue(1);
    const focusedRef = useRef(false);
    // -1, never the live token: the Current tab may not be mounted when the
    // banner arms a reveal (tabs mount on first visit), and seeding this with
    // the token that was just incremented would consume the arming before the
    // screen ever rendered. The time window is what stops a stray fade.
    const consumedToken = useRef(-1);

    // Reanimated drops an animation that is pending or in flight when the app
    // goes to background, and the view comes back at whatever opacity it had.
    // Nothing should be able to strand a block at 0 now, but this is the
    // backstop that made the difference when one could.
    useEffect(() => {
        const sub = AppState.addEventListener('change', () => {
            if (focusedRef.current) progress.value = 1;
        });
        return () => sub.remove();
    }, [progress]);

    useFocusEffect(
        useCallback(() => {
            focusedRef.current = true;
            const armed = revealToken !== consumedToken.current
                && Date.now() - revealArmedAt < ARM_WINDOW;
            consumedToken.current = revealToken;
            if (TAB_REVEAL && armed) {
                progress.value = 0;
                progress.value = withDelay(
                    Math.min(index, MAX_STEP) * STEP * SPEED,
                    withTiming(1, { duration: DURATION * SPEED, easing: Easing.out(Easing.cubic) })
                );
            }
            // Nothing here hides anything: a blurred block stays visible.
            return () => { focusedRef.current = false; };
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
