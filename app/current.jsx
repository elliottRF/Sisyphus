import { View, Text, ScrollView, StyleSheet, Button, TouchableOpacity, FlatList } from 'react-native'
import React, { useState, useEffect, useRef  } from 'react';

import { SafeAreaView } from 'react-native-safe-area-context';
import Body from "react-native-body-highlighter";

import AsyncStorage from '@react-native-async-storage/async-storage';
import AntDesign from '@expo/vector-icons/AntDesign';

import ActionSheet from "react-native-actions-sheet";

import * as NavigationBar from 'expo-navigation-bar';

import { fetchExercises, fetchCurrentWorkout } from '../components/db';




const backgroundColour = "#07080a";


const Current = () => {



    const [exercises, setExercises] = useState([]);

    useEffect(() => {
      fetchExercises()
        .then(data => setExercises(data))
        .catch(err => console.error(err));
    }, []);




    NavigationBar.setBackgroundColorAsync("black");

    const [workoutInProgress, setWorkoutInProgress] = useState(false);

    // Load workout status from AsyncStorage on component mount
    useEffect(() => {
        const loadWorkoutStatus = async () => {
            try {
                const value = await AsyncStorage.getItem('@WorkoutStatus');
                if (value === 'inProgress') {
                    setWorkoutInProgress(true);
                }
            } catch (error) {
                console.error("Error loading workout status:", error);
            }
        };
        loadWorkoutStatus();
    }, []);

    const startWorkout = async () => {
        try {
            await AsyncStorage.setItem('@WorkoutStatus', 'inProgress');
            setWorkoutInProgress(true);
            console.log("Workout started!");
        } catch (error) {
            console.error("Error starting workout:", error);
        }
    };

    const endWorkout = async () => {
        try {
            await AsyncStorage.removeItem('@WorkoutStatus');
            setWorkoutInProgress(false);
            console.log("Workout ended!");
        } catch (error) {
            console.error("Error ending workout:", error);
        }
    };

    const addExercise = () => {
        actionSheetRef.current?.show();
      };
    


    const actionSheetRef = useRef(null);



    const inputExercise = (item) => {
        actionSheetRef.current?.hide();
        console.log(item.exerciseID);
      };





    const renderItem = ({ item }) => (
        
        <TouchableOpacity 
            style={styles.exerciseButton} 
            onPress={() => inputExercise(item)}  // Pass a function reference
        >
            <Text style={styles.exerciseButtonText}>{item.name} </Text>
            
        </TouchableOpacity>


      );




    return (
        <SafeAreaView style={styles.container}>
            <ScrollView 
                showsVerticalScrollIndicator={false} 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.buttonContainer}
            >
                {!workoutInProgress && (
                    <TouchableOpacity style={styles.button} onPress={startWorkout}>
                        <Text style={styles.buttonText}>Start Workout</Text>
                    </TouchableOpacity>
                )}

                {workoutInProgress && (

                    








                    <>
                        <TouchableOpacity
                            key={"addWorkout"}
                            style={styles.button}
                            onPress={addExercise}
                        >
                            <AntDesign name="plus" size={24} color="#737373" />

                        </TouchableOpacity>

                        <ActionSheet ref={actionSheetRef} overlayColor="transparent" containerStyle={{ backgroundColor: 'black' }}>
                            
                        <Text style={styles.header}>Exercises</Text>
                            <FlatList
                                data={exercises}
                                keyExtractor={(item) => item.exerciseID.toString()} // Use exerciseID as a unique key
                                renderItem={renderItem}
                            />

                        </ActionSheet>
                        
                        <TouchableOpacity style={styles.button} onPress={endWorkout}>
                            <Text style={styles.buttonText}>Finish Workout</Text>
                        </TouchableOpacity>
                        
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
};

const primaryColor = '#0891b2';
const greyColor = '#737373';

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: backgroundColour,
        alignItems: "center",
        justifyContent: "center",
        paddingBottom: 70, 
    },
    buttonContainer: {
        width: '80%',
        justifyContent: "center",
        alignItems: "center",
    },
    button: {

        paddingVertical: 20,
        paddingHorizontal: 40,
        borderRadius: 10,
        alignItems: "center",
    },
    buttonText: {
        color: greyColor,
        fontSize: 24,
        fontWeight: "bold",
    },
    exerciseButton: {
        alignItems:'center',
        backgroundColor:'#1c1d1f',
        marginBottom: 10,
        borderRadius: 25,
        marginHorizontal: 10,
        paddingVertical: 10,
        borderRadius: 25,
        
      },
      exerciseButtonText: {
        color: "#737373",
        fontSize: 20,
        fontWeight: "bold",
      },
});
export default Current;