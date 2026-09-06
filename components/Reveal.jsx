import React, { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withDelay,
    Easing,
} from 'react-native-reanimated';
import { useFocusEffect, useNavigationContainerRef } from 'expo-router';

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

// The tab screens, by route name (their file names under app/(tabs)). If the
// deepest focused route at blur time is one of these, another tab took over;
// anything else means a screen was pushed over the tabs. Add here when a tab
// is added.
const TAB_ROUTES = new Set(['index', 'current', 'history', 'profile']);

// >1 slows everything down by that factor for inspection. Ship at 1.
const SPEED = 1;

const STEP = 30;
const DURATION = 200;
const RISE = 0;
const MAX_STEP = 4;

const Reveal = ({ index = 0, rise = RISE, style, children, ...rest }) => {
    const progress = useSharedValue(TAB_REVEAL ? 0 : 1);
    const rootNavigation = useNavigationContainerRef();
    const focusedRef = useRef(false);

    // Reanimated drops an animation that is pending or in flight when the app
    // goes to background, and the view comes back at whatever opacity it had.
    // For a block still waiting out its stagger that is 0: a blank tab until
    // the next switch. Reproduced by tapping a tab and pressing home within
    // ~100ms, which is what "open Train, switch to the music app" is. Any
    // app-state change snaps a focused block to fully visible; a blurred one
    // is left alone so the tab-switch bookkeeping still holds.
    useEffect(() => {
        const sub = AppState.addEventListener('change', () => {
            if (focusedRef.current) progress.value = 1;
        });
        return () => sub.remove();
    }, [progress]);

    useFocusEffect(
        useCallback(() => {
            focusedRef.current = true;
            if (!TAB_REVEAL) return undefined;
            // A block still visible (back from a pushed screen) is a no-op
            // here; one that dropped out fades in after its stagger.
            const stagger = progress.value === 0 ? Math.min(index, MAX_STEP) * STEP * SPEED : 0;
            progress.value = withDelay(
                stagger,
                withTiming(1, { duration: DURATION * SPEED, easing: Easing.out(Easing.cubic) })
            );
            return () => {
                focusedRef.current = false;
                // Another tab took over: this one is hidden instantly, so drop
                // out now and the next visit restarts the fade. Otherwise a
                // stack screen was pushed on top: stay visible beneath its
                // transition, and resume at full opacity when it pops.
                //
                // Asked of the navigation container rather than inferred from
                // the tab bar: a template's Start, the post-workout summary
                // and the Android back key all switch tabs without touching
                // the bar, and a stamp from the bar left those tabs at full
                // opacity with nothing to fade on their next visit. Note it is
                // getCurrentRoute(), the deepest focused route: expo-router's
                // root state is a single '__root' route whatever is on screen,
                // so the root stack's top is no use here.
                const now = rootNavigation?.getCurrentRoute?.()?.name;
                if (now === undefined || TAB_ROUTES.has(now)) progress.value = 0;
            };
        }, [index, progress, rootNavigation])
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
