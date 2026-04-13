import { View, Text, Platform } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context';
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
    const { theme, themeID } = useTheme(); // Now we can use the hook

    useEffect(() => {
        if (Platform.OS === 'android') {
            NavigationBar.setButtonStyleAsync(theme.statusBar);
            // setBackgroundColorAsync only accepts strings, so we check for PlatformColor
            if (typeof theme.background === 'string') {
                NavigationBar.setBackgroundColorAsync(theme.background);
            }
        }
    }, [theme]);

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            {/* backgroundColor locks status bar colour to THEME, preventing system override.
                translucent={true} is the modern "premium" standard for Android apps, 
                letting the background color of this View flow behind the icons. */}
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
                <Stack.Screen name="exercise/[id]" options={{ headerShown: false }} />
                <Stack.Screen name="exercise/new" options={{ headerShown: false }} />
            </Stack>
        </View>
    );
};

export default _layout

