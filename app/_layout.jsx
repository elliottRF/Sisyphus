import { View, Platform } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import React, { useState, useEffect, useCallback } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Redirect, Stack, usePathname } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setupDatabase } from '../components/db';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { SETTINGS_KEYS } from '../constants/preferences';
import { AppEvents, on, off } from '../utils/events';
import { primeExerciseSnapshots } from '../utils/exerciseSnapshots';
import LottieView from 'lottie-react-native';
import { StyleSheet, Modal } from 'react-native';
import CustomAlert from '../components/CustomAlert';

SplashScreen.preventAutoHideAsync();

const _layout = () => {
    const [dbReady, setDbReady] = useState(false);
    const [fontsLoaded] = useFonts({
        Inter_400Regular,
        Inter_500Medium,
        Inter_600SemiBold,
        Inter_700Bold,
    });

    useEffect(() => {
        const initDb = async () => {
            try {
                await setupDatabase();
                await primeExerciseSnapshots();
            } catch (e) {
                console.error("DB Setup Failed:", e);
            } finally {
                setDbReady(true);
            }
        };
        initDb();
    }, []);

    const onLayoutRootView = useCallback(async () => {
        if (fontsLoaded && dbReady) {
            await SplashScreen.hideAsync();
        }
    }, [fontsLoaded, dbReady]);

    if (!fontsLoaded || !dbReady) {
        return null;
    }

    return (
        <SafeAreaProvider>
            <ThemeProvider>
                <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
                    <ThemeConsumer />
                </GestureHandlerRootView>
            </ThemeProvider>
        </SafeAreaProvider>
    )
}

// Separate component to consume theme and render content with dynamic styles
const ThemeConsumer = () => {
    const { theme } = useTheme(); // Now we can use the hook
    const pathname = usePathname();
    const [shouldShowOnboarding, setShouldShowOnboarding] = useState(null);

    useEffect(() => {
        if (Platform.OS === 'android') {
            NavigationBar.setButtonStyleAsync(theme.statusBar);
            // setBackgroundColorAsync only accepts strings, so we check for PlatformColor
            if (typeof theme.background === 'string') {
                NavigationBar.setBackgroundColorAsync(theme.background);
            }
        }
    }, [theme]);

    const [isWorkoutFinishing, setIsWorkoutFinishing] = useState(false);

    useEffect(() => {
        const handleWorkoutCompleted = (data) => {
            // Only show the trophy if showCelebration is not explicitly false
            if (data?.showCelebration === false) return;

            setIsWorkoutFinishing(true);
            setTimeout(() => {
                setIsWorkoutFinishing(false);
            }, 2500);
        };

        on(AppEvents.WORKOUT_COMPLETED, handleWorkoutCompleted);
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
        const loadOnboardingState = async () => {
            try {
                const onboardingSeen = await AsyncStorage.getItem(SETTINGS_KEYS.onboardingSeen);
                setShouldShowOnboarding(onboardingSeen !== 'true');
            } catch (error) {
                console.error('Failed to determine onboarding state:', error);
                setShouldShowOnboarding(false);
            }
        };

        loadOnboardingState();
    }, [pathname]);

    if (shouldShowOnboarding === null) {
        return null;
    }

    if (shouldShowOnboarding && pathname !== '/onboarding') {
        return <Redirect href="/onboarding" />;
    }

    if (!shouldShowOnboarding && pathname === '/onboarding') {
        return <Redirect href="/(tabs)" />;
    }

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <StatusBar
                style={theme.statusBar}
                backgroundColor="transparent"
                translucent={true}
            />
            <Stack screenOptions={{
                headerShown: false,
                animation: 'flip',
                contentStyle: { backgroundColor: theme.background }
            }}>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="workout/[session]" options={{ headerShown: false }} />
                <Stack.Screen name="workout/EditWorkout" options={{ headerShown: false }} />
                <Stack.Screen name="template/[id]" options={{ headerShown: false }} />
                <Stack.Screen name="settings" options={{ headerShown: false }} />
                <Stack.Screen name="onboarding" options={{ headerShown: false }} />
                <Stack.Screen name="exercise/[id]" options={{ headerShown: false }} />
                <Stack.Screen name="exercise/new" options={{ headerShown: false }} />
            </Stack>

            <Modal transparent visible={isWorkoutFinishing} animationType="fade">
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center' }]}>
                    <LottieView
                        source={require('../assets/notifications/win.json')}
                        autoPlay
                        loop={false}
                        style={{ width: 350, height: 350 }}
                        colorFilters={[
                            // Main Cup and Stem (identifying 'Stand' as the stem/neck)
                            ...['Cup', 'Stand', 'Trophy', 'Group 1', 'Pre-comp 3'].map(keypath => ({
                                keypath,
                                color: theme.primary
                            })),
                            // Handles and Depth (Making them noticeably darker for premium definition)
                            ...['Cup 2', 'Cup 3', 'Shape Layer 1', 'Shape Layer 2', 'Shape Layer 3', 'Shape Layer 4', 'Shape Layer 5', 'Shape Layer 6', 'Shape Layer 7'].map(keypath => ({
                                keypath,
                                color: theme.primaryDark || theme.primary
                            })),
                            // Stars (Bright White for premium shine)
                            ...['Star', 'Star 2', 'Star 3', 'Star 4', 'Star 4 :M'].map(keypath => ({
                                keypath,
                                color: '#FFFFFF'
                            })),
                            // The Base (Surface/Grounded)
                            ...['Black Stand', 'Black Stand 2', 'White Stand', 'White Stand 2', 'White Stand 3', 'White Stand 4', 'White Stand 4 :M'].map(keypath => ({
                                keypath,
                                color: theme.surface
                            })),
                            // Accents / Secondary parts (Sparkles/Highlights)
                            ...['Shape Layer 9', 'Shape Layer 10', 'Shape Layer 11', 'Shape Layer 12', 'Shape Layer 13', 'Shape Layer 14'].map(keypath => ({
                                keypath,
                                color: theme.secondary
                            })),
                        ]}
                    />
                </View>
            </Modal>

            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                description={alertConfig.description}
                buttons={alertConfig.buttons}
                iconType={alertConfig.iconType}
                id={alertConfig.id}
                onClose={(id) => {
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

