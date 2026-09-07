import { Tabs } from 'expo-router';
import TabBar from '../../components/TabBar';
import React from 'react';
import { useTheme } from '../../context/ThemeContext';

const TabsLayout = () => {
    const { theme } = useTheme();
    return (
        <Tabs
            backBehavior="history"
            tabBar={props => <TabBar {...props} />}
            screenOptions={{
                headerShown: false,
                // Tabs mount on first visit (the default). lazy:false mounted all
                // four before first paint: Home's two body SVGs and three Skia
                // canvases, History's SectionList over every session, Current
                // and Exercises -- all before the user saw anything. Each tab
                // seeds its first paint from an in-memory cache, so the first
                // visit still lands instantly; the boot just no longer pays for
                // tabs that may never be opened.
                // The tab navigator paints no background behind a scene, so a
                // scene shows whatever is under it until the screen itself
                // paints -- and the window under everything is the splash
                // colour, pure black. The root Stack already sets contentStyle
                // for the same reason; this is the tab navigator's equivalent.
                // NOTE: added against a reported black flash on the first visit
                // to a tab after launch, which could not be reproduced under
                // instrumentation (see the commit message). It is correct
                // regardless, but if the flash persists this was not the cause.
                sceneStyle: { backgroundColor: theme.background },
                tabBarStyle: {
                    position: 'absolute',
                    backgroundColor: 'transparent',
                    borderTopWidth: 0,
                    elevation: 0,
                }
            }}
        >
            <Tabs.Screen name="index" options={{ title: "Home" }} />
            <Tabs.Screen name="current" options={{ title: "Current" }} />
            <Tabs.Screen name="history" options={{ title: "History" }} />
            <Tabs.Screen name="profile" options={{ title: "Exercises" }} />
        </Tabs>
    );
};

export default TabsLayout;
