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
        </View>
    );
};

export default _layout

