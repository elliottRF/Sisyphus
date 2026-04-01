import { Tabs } from 'expo-router';
import TabBar from '../../components/TabBar';
import React from 'react';

const TabsLayout = () => {
    return (
        <Tabs
            backBehavior="history"
            tabBar={props => <TabBar {...props} />}
            screenOptions={{
                headerShown: false,
                lazy: false,
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
