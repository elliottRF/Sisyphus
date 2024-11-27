import { View, Text, ScrollView, StyleSheet, Button, TouchableOpacity, FlatList, TextInput } from 'react-native'
import React, { useState, useEffect, useRef  } from 'react';

import { SafeAreaView } from 'react-native-safe-area-context';
import Body from "react-native-body-highlighter";

import AsyncStorage from '@react-native-async-storage/async-storage';
import AntDesign from '@expo/vector-icons/AntDesign';

import ActionSheet from "react-native-actions-sheet";

import * as NavigationBar from 'expo-navigation-bar';

import { fetchExercises, fetchLatestWorkoutSession, getLatestWorkoutSession, insertWorkoutHistory, calculateIfPR } from '../components/db';


import ExerciseEditable from '../components/exerciseEditable'

import FilteredExerciseList from '../components/FilteredExerciseList';


const backgroundColour = "#07080a";


const Current = () => {

    const [exercises, setExercises] = useState([]);


    NavigationBar.setBackgroundColorAsync("black");

    const startWorkout = async () => {

        fetchExercises()
        .then(data => setExercises(data))
        .catch(err => console.error(err));

        actionSheetRef.current?.show();

    };


//add 1rm, calcuate every workout before current exercise in history tab? or calculate if 1rm on end of workout, then edit would be incorrect.
//add PR true false to each set, fill in on workout end, then also when workout viewed in history
//title and date glow turqoise for PR, set glow also on click
//calculate by checking every set before the current date

//dont show 1RM? show goal weight and reps, based on user input rep target



//SHOW MUSCLES WORKED WITH EXERCISE HISTORY ON EXERCISE
//swipe looks weird if dtag too high can disable stretch but looks bad

//ADD TIMER TO WORKOUT
//gesureEnabled stops scroll down, dont use
//WHY EXERCSIE HISTORY ACTION SHEET NOT ROUDNED CORNERS ANYMORE?

    const calculateOneRepMax = (weight, reps) => {
        const oneRepMax = weight * (1 + reps / 30);
        return Math.round(oneRepMax * 100) / 100; // Truncates to 2 decimal places
    };
    


    const endWorkout = async () => {
        try {
            const latestSessionQuery = await getLatestWorkoutSession();
            const nextSessionNumber = latestSessionQuery + 1;
            
            if (!currentWorkout || !currentWorkout.length) {
                console.log("No workout data to save");
                return;
            }
    
            // Filter out sets with null weight or reps
            const filteredWorkout = currentWorkout.map(exerciseGroup => ({
                ...exerciseGroup,
                exercises: exerciseGroup.exercises.map(exercise => ({
                    ...exercise,
                    sets: exercise.sets.filter(set => 
                        set.weight !== null && set.reps !== null
                    )
                }))
            }));
    
            // Prepare workout entries for database insertion
            const workoutEntries = [];
            let globalExerciseNum = 1;
    
            for (const exerciseGroup of filteredWorkout) {
                for (const exercise of exerciseGroup.exercises) {
                    let setNum = 1;
                    
                    for (const set of exercise.sets) {
                        // Calculate One Rep Max
                        const calculatedOneRM = calculateOneRepMax(
                            parseFloat(set.weight), 
                            parseInt(set.reps)
                        );
    
                        // Check if it's a PR
                        const isPR = await calculateIfPR(exercise.exerciseID, calculatedOneRM);
    
                        // Prepare entry for database
                        workoutEntries.push({
                            workoutSession: nextSessionNumber,
                            exerciseNum: globalExerciseNum,
                            setNum: setNum,
                            exerciseID: exercise.exerciseID,
                            weight: set.weight,
                            reps: set.reps,
                            oneRM: calculatedOneRM,
                            time: new Date().toISOString(), // Current timestamp
                            name: workoutTitle,
                            pr: isPR
                        });
    
                        setNum++;
                    }
                    
                    globalExerciseNum++;
                }
            }
            console.log(JSON.stringify(workoutEntries));
            // Insert workout history
            await insertWorkoutHistory(workoutEntries, workoutTitle);
            
            // Clear AsyncStorage and state
            await AsyncStorage.removeItem('@currentWorkout');
            console.log('Workout cleared from AsyncStorage');
            setCurrentWorkout([]);


            console.log("Workout saved successfully");
        }
        catch (error) {
            console.error("Error saving workout:", error);
        }
    };





    const plusButtonShowExerciseList = () => {


        fetchExercises()
        .then(data => setExercises(data))
        .catch(err => console.error(err));

        actionSheetRef.current?.show();
      };
    

    const actionSheetRef = useRef(null);

    const[currentWorkout, setCurrentWorkout] = useState([]);
    const[workoutTitle, setWorkoutTitle] = useState("New Workout");



    const saveWorkoutToAsyncStorage = async (workout) => {

        const dataToSave = {
            workout,
            workoutTitle,
        };

        try {
            await AsyncStorage.setItem('@currentWorkout', JSON.stringify(dataToSave));
        } catch (error) {
            console.error('Error saving workout to AsyncStorage:', error);
        }
    };

    useEffect(() => {
        const loadWorkout = async () => {
            fetchExercises()
            .then(data => setExercises(data))
            .catch(err => console.error(err));



            try {
                const storedWorkout = await AsyncStorage.getItem('@currentWorkout');
                if (storedWorkout) {

                    const { workout, title } = JSON.parse(storedWorkout);
                    setCurrentWorkout(workout);
                    if(title) setWorkoutTitle(title);

                }
            } catch (error) {
                console.error('Error loading workout from AsyncStorage:', error);
            }
        };

        loadWorkout();
    }, []);

    useEffect(() => {
        if (currentWorkout.length > 0) {
            saveWorkoutToAsyncStorage(currentWorkout);
        }
    }, [currentWorkout]); 



    const inputExercise = (item) => {
        actionSheetRef.current?.hide();
    
        setCurrentWorkout((prevWorkouts) => [
            ...prevWorkouts,
            {
                exercises: [
                    {
                        exerciseID: item.exerciseID,
                        sets: [
                            {
                                weight: null,
                                reps: null
                            }
                        ]
                    }
                ]
            }
        ]);
    };



    const renderItem = ({ item }) => (
        
        <TouchableOpacity 
            style={styles.exerciseButton} 
            onPress={() => inputExercise(item)}  
        >
            <Text style={styles.exerciseButtonText}>{item.name} </Text>
            
        </TouchableOpacity>


      );

      const [searchQuery, setSearchQuery] = useState('');

      const filteredExercises = exercises.filter(exercise =>
          exercise.name.toLowerCase().includes(searchQuery.toLowerCase())
      );


      const [time, setTime] = useState("55m");


    return (
        <SafeAreaView style={styles.container}>
        {currentWorkout.length === 0 && (
            <View style={styles.startContainer}>
                <TouchableOpacity style={styles.startButton} onPress={startWorkout}>
                    <Text style={styles.buttonText}>Start Workout</Text>
                </TouchableOpacity>
            </View>
        )}

        {currentWorkout.length > 0 && (
            <ScrollView 
                showsVerticalScrollIndicator={false} 
                showsHorizontalScrollIndicator={false}
                    
            >        
            <TextInput
                        style={styles.input}
                        onChangeText={setWorkoutTitle}
                        value={workoutTitle}
                        placeholder="Enter Workout Name"
                        keyboardType="text"
                        />
            <Text>{time}</Text>

                
            {currentWorkout.map((workout, workoutIndex) => (
                <View key={workoutIndex} style={styles.exerciseContainer}>
                    {workout.exercises.map((exercise, exerciseIndex) => {
                        const exerciseDetails = exercises.find(
                            (e) => e.exerciseID === exercise.exerciseID
                        );

                        return (
                            <ExerciseEditable
                                exerciseID={exercise.exerciseID}
                                key={exerciseIndex}
                                exercise={exercise}
                                exerciseName={exerciseDetails ? exerciseDetails.name : 'Unknown Exercise'}
                                updateCurrentWorkout={setCurrentWorkout}
                            />
                        );
                    })}
                </View>
            ))}





                <TouchableOpacity
                    key={"addWorkout"}
                    style={styles.button}
                    onPress={plusButtonShowExerciseList}
                >
                    <AntDesign name="plus" size={24} color="#fff" />
                </TouchableOpacity>

                
                <TouchableOpacity style={[styles.button, styles.finishButton]} onPress={endWorkout}>
                    <Text style={styles.buttonText}>Finish Workout</Text>
                </TouchableOpacity>
            </ScrollView>
        )}
            <FilteredExerciseList 
                exercises={exercises}
                actionSheetRef={actionSheetRef}
                setCurrentWorkout={setCurrentWorkout}
            />
    </SafeAreaView>
    );
};

const primaryColor = '#0891b2';
const greyColor = '#737373';

const styles = StyleSheet.create({
    input: {
        height: 40,
        margin: 12,
        padding: 0,
        color: 'white', // Sets text color to white
        fontWeight: 'bold', // Makes the text bold
        borderWidth: 0, // Removes the border
        backgroundColor: '#121212', // Optional: Set a background color for contrast
        fontSize: 24,
    },
    startContainer: {
        flex: 1, // Make the container take the full height of the screen
        justifyContent: 'center', // Center vertically
        alignItems: 'center', // Optional: Center horizontally
        marginBottom: 50,
      },
      startButton: {
        alignItems: 'center',
        backgroundColor: '#1c1d1f',
        paddingVertical: 10, // Adjust the vertical padding for more space
        paddingHorizontal: 20, // Add horizontal padding for text space
        marginBottom: 10,
        borderRadius: 25,
        marginHorizontal: 10,
        paddingVertical: 10,
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
        color: '#fff',
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
        color: "#fff",
        fontSize: 20,
        fontWeight: "bold",
      },
      exerciseTitle: {
        color: "#fff",
        fontSize: 2,
        fontWeight: "bold",
      },
      container: {
        flex: 1,
        backgroundColor: '#121212',
    },
    buttonContainer: {
        padding: 15,
    },
    exerciseContainer: {
        marginBottom: 15,
        color: "#fff",

        borderRadius: 8,
    },

    setListContainer: {
        marginTop: 8,
    },
    finishButton: {
        marginBottom: 100, // Add some space above the finish button
    }
});
export default Current;