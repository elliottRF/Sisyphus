import { View, Platform, ActivityIndicator, Text, Animated, StyleSheet } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Redirect, Stack, usePathname, useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setupDatabase, fetchWorkoutHistory, fetchExercises } from '../components/db';
import * as SplashScreen from 'expo-splash-screen';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { SETTINGS_KEYS } from '../constants/preferences';
import { AppEvents, on, off } from '../utils/events';
import { primeExerciseSnapshots } from '../utils/exerciseSnapshots';
import CustomAlert from '../components/CustomAlert';
import ErrorBoundary from '../components/ErrorBoundary';
import { Settings } from 'react-native-fbsdk-next';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';

// Loaded on first use rather than at boot. Expo's Metro config does not inline
// requires, so a plain top-level import would evaluate lottie-react-native and
// parse its 115KB animation on every cold start, for an overlay that every
// current emitter suppresses with showCelebration:false. React.lazy defers the
// module's evaluation until it first renders; the code is still in the bundle.
const WinOverlay = React.lazy(() => import('../components/WinOverlay'));

SplashScreen.preventAutoHideAsync();
// Boot timing marker, read from logcat with `adb logcat -v epoch | grep '\[boot\]'`.
console.log('[boot] js-start', Date.now());

const _layout = () => {
    const [dbReady, setDbReady] = useState(false);
    // The four Inter weights are embedded natively through the expo-font config
    // plugin (see app.json), under the same family names the app already uses,
    // so they are available the instant the process starts. This used to be a
    // useFonts() runtime load, which read four files off disk before the splash
    // was allowed to hide -- one of four gates on first paint.
    const fontsLoaded = true;

    useEffect(() => {
        const initDb = async () => {
            try {
                await setupDatabase();
                console.log('[boot] db-setup', Date.now());
                await primeExerciseSnapshots();
                console.log('[boot] snapshots', Date.now());
                // fetchExercises stays on the blocking path: it's a small table
                // and it's read synchronously (getCachedExercises) during the
                // first paint of several screens.
                await fetchExercises().catch(() => {});
                console.log('[boot] exercises', Date.now());
                // The history warm is deliberately NOT awaited. It reads every
                // row of workoutHistory — ~12k for a long-running user, measured
                // at ~220ms of SQL before the bridge marshals the rows into JS —
                // and the only consumer of that cache is the History tab, which
                // already falls back to its own fetch and a spinner when the
                // cache is cold. Awaiting it made every cold start pay for a tab
                // the user may never open. Started here and left to settle, it
                // still lands long before History can be navigated to, so the
                // instant cold-mount it was protecting is preserved in practice.
                fetchWorkoutHistory().catch(() => {});
            } catch (e) {
                console.error("DB Setup Failed:", e);
            } finally {
                setDbReady(true);
            }
        };
        initDb();
    }, []);

    useEffect(() => {
        const initFacebookSdk = async () => {
            try {
                Settings.initializeSDK();
                if (Platform.OS === 'ios') {
                    const { status } = await requestTrackingPermissionsAsync();
                    if (status === 'granted') {
                        await Settings.setAdvertiserTrackingEnabled(true);
                    } else {
                        await Settings.setAdvertiserTrackingEnabled(false);
                    }
                } else {
                    await Settings.setAdvertiserTrackingEnabled(true);
                }
            } catch (error) {
                console.error('Failed to initialize Facebook SDK:', error);
            }
        };
        initFacebookSdk();
    }, []);

    // Splash screen is now handled inside ThemeConsumer to wait for theme loading
    const onLayoutRootView = useCallback(async () => {
    }, []);


    // The provider tree mounts immediately rather than behind dbReady: the
    // theme/settings read and the onboarding-flag read are AsyncStorage work
    // that has nothing to do with the database, and gating them behind it
    // serialised the two. The native splash stays up until ThemeConsumer has
    // everything (dbReady included), so nothing below is visible early.
    return (
        <ErrorBoundary>
            <SafeAreaProvider>
                <ThemeProvider>
                    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
                        <ThemeConsumer fontsLoaded={fontsLoaded} dbReady={dbReady} />
                    </GestureHandlerRootView>
                </ThemeProvider>
            </SafeAreaProvider>
        </ErrorBoundary>
    )
}

// Separate component to consume theme and render content with dynamic styles
const ThemeConsumer = ({ fontsLoaded, dbReady }) => {
    const { theme, settingsLoaded } = useTheme(); // Now we can use the hook
    const pathname = usePathname();
    const router = useRouter();
    const [shouldShowOnboarding, setShouldShowOnboarding] = useState(null);
    const [isWorkoutFinishing, setIsWorkoutFinishing] = useState(false);
    const [isSettingUp, setIsSettingUp] = useState(false);
    const overlayOpacity = useRef(new Animated.Value(1)).current;
    const [isOverlayVisible, setIsOverlayVisible] = useState(true);

    useEffect(() => {
        if (settingsLoaded && fontsLoaded && dbReady && shouldShowOnboarding !== null && !isSettingUp) {
            // Initial boot fade out. Home is already painted underneath this
            // overlay by the time the splash hides, so every millisecond here
            // is perceived boot time: measured on a release build, content was
            // landing ~400ms after the splash hid, entirely because of this
            // fade. 200ms still reads as a cross-fade rather than a cut.
            Animated.timing(overlayOpacity, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true
            }).start(() => setIsOverlayVisible(false));

            SplashScreen.hideAsync();
            console.log('[boot] splash-hidden', Date.now());
        }
    }, [settingsLoaded, fontsLoaded, dbReady, shouldShowOnboarding, isSettingUp]);

    useEffect(() => {
        if (Platform.OS === 'android') {
            // SDK 55+ enforces edge-to-edge: the nav bar is transparent and the
            // old setButtonStyleAsync/setBackgroundColorAsync setters no longer
            // exist. setStyle controls button contrast; background comes from
            // the app's own UI behind the transparent bar.
            NavigationBar.setStyle(theme.statusBar);
        }
    }, [theme]);

    useEffect(() => {
        const handleWorkoutCompleted = (data) => {
            // Only show the trophy if showCelebration is not explicitly false
            if (data?.showCelebration === false) return;

            setIsWorkoutFinishing(true);
            setTimeout(() => {
                setIsWorkoutFinishing(false);
            }, 2500);
        };

        on(AppEvents.WORKOUT_COMPLETED, handleWorkoutCompleted, 'root-layout');
        return () => off(AppEvents.WORKOUT_COMPLETED, handleWorkoutCompleted);
    }, []);

    const [alertConfig, setAlertConfig] = useState({
        visible: false,
        title: '',
        description: '',
        buttons: [],
        iconType: 'default',
        id: null
    });

    useEffect(() => {
        const handleShowAlert = (data) => {
            setAlertConfig({
                ...data,
                id: Date.now(),
                visible: true,
            });
        };

        on(AppEvents.SHOW_CUSTOM_ALERT, handleShowAlert);
        return () => off(AppEvents.SHOW_CUSTOM_ALERT, handleShowAlert);
    }, []);

    useEffect(() => {
        if (shouldShowOnboarding === null) return;

        if (shouldShowOnboarding && pathname !== '/onboarding') {
            router.replace('/onboarding');
        } else if (!shouldShowOnboarding && pathname === '/onboarding') {
            router.replace('/(tabs)');
        }
    }, [shouldShowOnboarding, pathname]);

    // DEV ONLY: force the onboarding flow to show on every app open while we
    // iterate on it. Set to false (or remove) before shipping. Only the FIRST
    // (launch) check is forced — the re-check after finishing still reads the
    // real flag, so "Continue" proceeds into the app normally.
    const FORCE_ONBOARDING = false;
    const didForceOnboardingRef = useRef(false);

    const loadOnboardingState = async () => {
        try {
            if (FORCE_ONBOARDING && !didForceOnboardingRef.current) {
                didForceOnboardingRef.current = true;
                setShouldShowOnboarding(true);
                return;
            }
            const onboardingSeen = await AsyncStorage.getItem(SETTINGS_KEYS.onboardingSeen);
            setShouldShowOnboarding(onboardingSeen !== 'true');
        } catch (error) {
            console.error('Failed to determine onboarding state:', error);
            setShouldShowOnboarding(false);
        }
    };

    useEffect(() => {
        loadOnboardingState();
    }, []);

    useEffect(() => {
        const handleOnboardingCompleted = () => {
            setIsOverlayVisible(true);
            overlayOpacity.setValue(1);
            setIsSettingUp(true);
            loadOnboardingState(); // Re-check onboarding status
            setTimeout(() => {
                Animated.timing(overlayOpacity, {
                    toValue: 0,
                    duration: 600,
                    useNativeDriver: true
                }).start(() => {
                    setIsSettingUp(false);
                    setIsOverlayVisible(false);
                });
            }, 2000);
        };

        on(AppEvents.ONBOARDING_COMPLETED, handleOnboardingCompleted);
        return () => off(AppEvents.ONBOARDING_COMPLETED, handleOnboardingCompleted);
    }, []);


    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <StatusBar
                style={theme.statusBar}
                backgroundColor="transparent"
                translucent={true}
            />

            {/* Main Content - only once the DB is open and the onboarding state is known */}
            {dbReady && shouldShowOnboarding !== null && (
                <Stack screenOptions={{
                    headerShown: false,
                    animation: 'flip',
                    contentStyle: { backgroundColor: theme.background },
                    // Long browsing chains (history → session → exercise →
                    // session…) stack many heavy screens (charts, body SVGs);
                    // freezing blurred ones stops them re-rendering and keeps
                    // the back gesture responsive late in an app session.
                    freezeOnBlur: true,
                }}>
                    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                    <Stack.Screen name="workout/[session]" options={{ headerShown: false }} />
                    <Stack.Screen name="workout/EditWorkout" options={{ headerShown: false }} />
                    <Stack.Screen name="template/[id]" options={{ headerShown: false }} />
                    <Stack.Screen name="settings" options={{ headerShown: false }} />
                    <Stack.Screen name="onboarding" options={{ headerShown: false }} />
                    <Stack.Screen name="exercise/[id]" options={{ headerShown: false }} />
                    <Stack.Screen name="exercise/new" options={{ headerShown: false }} />
                    <Stack.Screen name="bodyweight/history" options={{ headerShown: false }} />
                </Stack>
            )}

            {/* Setup Overlay - Masks transitions and initial theme loading */}
            {isOverlayVisible && (
                <Animated.View style={[StyleSheet.absoluteFill, {
                    backgroundColor: theme.background,
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 999,
                    opacity: overlayOpacity
                }]}>
                    {isSettingUp && (
                        <>
                            <ActivityIndicator size="large" color={theme.primary} />
                            <Text style={{ marginTop: 12, color: theme.text, fontFamily: 'Inter_600SemiBold' }}>
                                Setting up your dashboard...
                            </Text>
                        </>
                    )}
                </Animated.View>
            )}

            {isWorkoutFinishing && (
                <Suspense fallback={null}>
                    <WinOverlay theme={theme} />
                </Suspense>
            )}

            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                description={alertConfig.description}
                buttons={alertConfig.buttons}
                iconType={alertConfig.iconType}
                id={alertConfig.id}
                onClose={(id) => {
                    if (alertConfig.onDismiss) {
                        alertConfig.onDismiss();
                    }
                    setAlertConfig(prev => {
                        if (id && prev.id !== id) return prev;
                        return { ...prev, visible: false };
                    });
                }}
            />
        </View>
    );
};

export default _layout

