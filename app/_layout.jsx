import { View, Text} from 'react-native'
import React, { useState, useEffect } from 'react';
import { Tabs } from 'expo-router'
import TabBar from '../components/TabBar'

import { GestureHandlerRootView } from 'react-native-gesture-handler'; // Import the GestureHandlerRootView

import { setupDatabase } from '../components/db';



const _layout = () => {


    useEffect(() => {
      setupDatabase();
    }, []);



    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <Tabs
                tabBar={props => <TabBar {...props} />}
            >
                <Tabs.Screen
                    name="index"
                    options={{
                        title: "Home",
                        headerShown: false 
                    }}
                />
                <Tabs.Screen
                    name="current"
                    options={{
                        title: "Current",
                        headerShown: false 
                    }}
                />
                <Tabs.Screen
                    name="history"
                    options={{
                        title: "History",
                        headerShown: false 
                    }}
                />
                <Tabs.Screen
                    name="profile"
                    options={{
                        title: "Exercises",
                        headerShown: false 
                    }}
                />
            </Tabs>
        </GestureHandlerRootView>
    )
}

export default _layout

