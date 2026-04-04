import { View, Text, Platform } from 'react-native'
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import React, { useState, useEffect, useCallback } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router'
import { setupDatabase } from '../components/db';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { COLORS } from '../constants/theme';
import { ThemeProvider, useTheme } from '../context/ThemeContext';

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
        <ThemeProvider>
            <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
                <ThemeConsumer />
            </GestureHandlerRootView>
        </ThemeProvider>
    )
}

// Separate component to consume theme and render content with dynamic styles
const ThemeConsumer = () => {
    const { theme, themeID } = useTheme(); // Now we can use the hook

    useEffect(() => {
        if (Platform.OS === 'android') {
            NavigationBar.setButtonStyleAsync(theme.statusBar);
        }
    }, [theme]);

    // We need to pass the theme down to the Stack or use it here for the background
    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            {/* backgroundColor locks status bar colour to the app theme, preventing the system's
                own light/dark preference from painting a conflicting background behind the icons */}
            <StatusBar style={theme.statusBar} backgroundColor={theme.background} />
            <Stack screenOptions={{ headerShown: false, animation: 'flip' }}>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="workout/[session]" options={{ headerShown: false }} />
                <Stack.Screen name="workout/EditWorkout" options={{ headerShown: false }} />
                <Stack.Screen name="template/[id]" options={{ headerShown: false }} />
                <Stack.Screen name="settings" options={{ headerShown: false }} />
                <Stack.Screen name="exercise/[id]" options={{ headerShown: false }} />
                <Stack.Screen name="exercise/new" options={{ headerShown: false }} />
            </Stack>
        </View>
    );
};

export default _layout

