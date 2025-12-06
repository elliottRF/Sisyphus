import { View, Text } from 'react-native'
import React, { useState, useEffect, useCallback } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Tabs } from 'expo-router'
import TabBar from '../components/TabBar'
import { setupDatabase } from '../components/db';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { COLORS } from '../constants/theme';

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
        <GestureHandlerRootView style={{ flex: 1 }}>
            <View style={{ flex: 1, backgroundColor: COLORS.background }} onLayout={onLayoutRootView}>
                <Tabs
                    backBehavior="history"
                    tabBar={props => <TabBar {...props} />}
                    screenOptions={{
                        headerShown: false,
                        tabBarStyle: {
                            backgroundColor: COLORS.background,
                            borderTopWidth: 0,
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
                </Tabs>
            </View>
        </GestureHandlerRootView>
    )
}

export default _layout

