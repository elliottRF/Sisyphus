import { View, Text} from 'react-native'
import React, { useState, useEffect } from 'react';
import { Tabs } from 'expo-router'
import TabBar from '../components/TabBar'


import { setupDatabase } from '../components/db';



const _layout = () => {


    useEffect(() => {
      setupDatabase(); // Setup the database and populate it
    }, []);



    return (
        <Tabs
            tabBar={props=> <TabBar {...props}/>}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title:"Home",
                    headerShown: false // Hides the top header

                }}
            />
            <Tabs.Screen
                name="current"
                options={{
                    title:"Current",
                    headerShown: false // Hides the top header
                }}
            />
            <Tabs.Screen
                name="history"
                options={{
                    title:"History",
                    headerShown: false // Hides the top header
                }}
            />
            <Tabs.Screen
                name="profile"
                options={{
                    title:"Exercises",
                    headerShown: false // Hides the top header
                }}
            />

        </Tabs>
    )
}

export default _layout

