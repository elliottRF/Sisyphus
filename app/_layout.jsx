import { View, Text, Platform } from 'react-native'
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import React, { useState, useEffect, useCallback } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Tabs } from 'expo-router'
import TabBar from '../components/TabBar'
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
            NavigationBar.setButtonStyleAsync(themeID === 'CHERRY_BLOSSOM' ? 'dark' : 'light');
        }
    }, [themeID]);

    // We need to pass the theme down to the Tabs or use it here for the background
    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <StatusBar style={themeID === 'CHERRY_BLOSSOM' ? 'dark' : 'light'} />
            <Tabs
                backBehavior="history"
                tabBar={props => <TabBar {...props} />}
                screenOptions={{
                    headerShown: false,
                    tabBarStyle: {
                        position: 'absolute',
                        backgroundColor: 'transparent',
                        borderTopWidth: 0,
                        elevation: 0,
                    }
                }}
            >
                <Tabs.Screen
                    name="index"
                    options={{
                        title: "Home",
                    }}
                />
                <Tabs.Screen
                    name="current"
                    options={{
                        title: "Current",
                    }}
                />
                <Tabs.Screen
                    name="history"
                    options={{
                        title: "History",
                    }}
                />
                <Tabs.Screen
                    name="profile"
                    options={{
                        title: "Exercises",
                    }}
                />
                <Tabs.Screen
                    name="workout/[session]"
                    options={{
                        href: null,
                        tabBarStyle: {
                            display: 'none',
                        },
                    }}
                />
                <Tabs.Screen
                    name="workout/EditWorkout"
                    options={{
                        href: null,
                        tabBarStyle: {
                            display: 'none',
                        },
                    }}
                />
                <Tabs.Screen
                    name="settings"
                    options={{
                        title: "Settings",
                    }}
                />
            </Tabs>
        </View>
    );
};

export default _layout

