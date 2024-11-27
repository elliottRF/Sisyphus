import React, { useRef } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { AntDesign } from '@expo/vector-icons';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import EvilIcons from '@expo/vector-icons/EvilIcons';
import ActionSheet from "react-native-actions-sheet";

import ExerciseHistory from './exerciseHistory';


import Feather from '@expo/vector-icons/Feather';


const ExerciseEditable = ({ 
    exerciseID,
    exercise, 
    exerciseName, 
    updateCurrentWorkout 
}) => {

    function unflattenExercises(flattenedExercises) {
        return flattenedExercises.reduce((acc, exercise) => {
          const { workoutIndex, ...exerciseData } = exercise;
      
          // Initialize the workout if it doesn't exist
          if (!acc[workoutIndex]) {
            acc[workoutIndex] = { exercises: [] };
          }
      
          // Add the exercise data to the corresponding workout
          acc[workoutIndex].exercises.push(exerciseData);
      
          return acc;
        }, []);
      }



      const flattenWorkout = (workouts) => {
        return workouts.reduce((acc, workout, workoutIndex) => {
          return acc.concat(
            workout.exercises.map((exercise, exerciseIndex) => ({
              ...exercise,
              workoutIndex,
              exerciseIndex,
              key: `workout-${workoutIndex}-exercise-${exerciseIndex}`
            }))
          );
        }, []);
      };

      const updateWorkout = (newWorkout) => {
        updateCurrentWorkout(newWorkout); // Update the nested structure
        setFlattenedExercises(flattenWorkout(newWorkout)); // Re-flatten after updating
      };

    const handleWeightChange = (text, setIndex) => {
        
        updateCurrentWorkout(prevWorkout => {
            // First, unflatten the workout
            const nestedWorkout = unflattenExercises(prevWorkout);

            // Update the nested structure
            return flattenWorkout(nestedWorkout.map(workout =>
                workout.exercises.includes(exercise)
                    ? {
                        ...workout,
                        exercises: workout.exercises.map(ex => 
                            ex === exercise
                                ? {
                                    ...ex,
                                    sets: ex.sets.map((set, index) =>
                                        index === setIndex
                                            ? { ...set, weight: text }
                                            : set
                                    )
                                }
                                : ex
                        )
                    }
                    : workout
            ));
        });
    };




    
    const handleRepsChange = (text, setIndex) => {
        updateCurrentWorkout(prevWorkout => 
            prevWorkout.map(workout => 
                workout.exercises.includes(exercise)
                    ? {
                        ...workout,
                        exercises: workout.exercises.map(ex => 
                            ex === exercise 
                                ? {
                                    ...ex,
                                    sets: ex.sets.map((set, index) => 
                                        index === setIndex 
                                            ? { ...set, reps: text } 
                                            : set
                                    )
                                }
                                : ex
                        )
                    }
                    : workout
            )
        );
    };

    const addNewSet = () => {
        updateCurrentWorkout(prevWorkout => 
            prevWorkout.map(workout => 
                workout.exercises.includes(exercise)
                    ? {
                        ...workout,
                        exercises: workout.exercises.map(ex => 
                            ex === exercise 
                                ? {
                                    ...ex,
                                    sets: [
                                        ...ex.sets,
                                        {
                                            weight: null,
                                            reps: null
                                        }
                                    ]
                                }
                                : ex
                        )
                    }
                    : workout
            )
        );
    };
    const swipeableRefs = useRef({});
    const deleteSet = (setIndex) => {
        // Close the swipeable
        if (swipeableRefs.current[setIndex]) {
            swipeableRefs.current[setIndex].close();
        }
    
        // Perform deletion
        updateCurrentWorkout(prevWorkout => 
            prevWorkout.map(workout => 
                workout.exercises.includes(exercise)
                    ? {
                        ...workout,
                        exercises: workout.exercises.map(ex => 
                            ex === exercise 
                                ? {
                                    ...ex,
                                    sets: ex.sets.filter((_, index) => index !== setIndex)
                                }
                                : ex
                        )
                    }
                    : workout
            )
        );
    };

    const handleExerciseDelete = () => {
        console.log("HERE")
        // Perform deletion of the entire exercise
        updateCurrentWorkout(prevWorkout => 
            prevWorkout.map(workout => ({
                ...workout,
                exercises: workout.exercises.filter(ex => ex !== exercise)
            }))
        );
    };


    const renderRightActions = (setIndex) => {
        return (
            <View style={styles.deleteButtonContainer}>
            <TouchableOpacity 
                style={styles.deleteButton} 
                onPress={() => deleteSet(setIndex)}
            >
                <EvilIcons name="trash" size={24} color="white" />
            </TouchableOpacity>
        </View>
        );
    };


    const showHistory = () => {
        actionSheetRef.current?.show();
        console.log(exerciseID);

    }


    

    const actionSheetRef = useRef(null);
    
    return (
        <GestureHandlerRootView style={styles.rootContainer}>
            <View style={styles.exerciseContainer}>

            <View style={styles.exerciseNameContainer}>
                    <TouchableOpacity onPress={showHistory} style={styles.exerciseNameWrapper}>
                        <Text style={styles.exerciseName}>{exerciseName}</Text>
                    </TouchableOpacity>


                    <TouchableOpacity onPress={handleExerciseDelete} style={styles.deleteExercise}>
                    <Feather name="x" size={24} color="#fff" />
                    </TouchableOpacity>
                </View>


                {exercise.sets.map((set, setIndex) => (
                <Swipeable 
                key={setIndex} 
                ref={ref => swipeableRefs.current[setIndex] = ref}
                renderRightActions={() => renderRightActions(setIndex)}
            >
                        <View style={styles.setContainer}>
                            <Text style={styles.setNumberText}>{setIndex + 1}</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Weight"
                                placeholderTextColor="#737373"
                                keyboardType="numeric"
                                value={set.weight ? set.weight.toString() : ''}
                                onChangeText={(text) => handleWeightChange(text, setIndex)}
                            />
                            <TextInput
                                style={styles.input}
                                placeholder="Reps"
                                placeholderTextColor="#737373"
                                keyboardType="numeric"
                                value={set.reps ? set.reps.toString() : ''}
                                onChangeText={(text) => handleRepsChange(text, setIndex)}
                            />
                        </View>
                    </Swipeable>
                ))}
                <TouchableOpacity 
                    style={styles.addSetButton} 
                    onPress={addNewSet}
                >
                    <Text style={styles.setNumberText}>Add Set</Text>
                </TouchableOpacity>

                <ActionSheet 
                    ref={actionSheetRef} 
                    containerStyle={{ 
                        backgroundColor: '#121212', 
                        height: '80%', // or any specific value
                        borderTopLeftRadius: 20, // optional for rounded corners
                        borderTopRightRadius: 20 
                    }}
>                    

                    <ExerciseHistory exerciseID = {exerciseID}/>

                </ActionSheet>


            </View>
        </GestureHandlerRootView>
    );
};

const styles = StyleSheet.create({
    rootContainer: {
        flex: 1
    },
    exerciseContainer: {
        marginBottom: 10,
        marginHorizontal: 16,
        marginVertical: 8,

        borderRadius: 8
    },
    deleteExercise: { 
        position: 'absolute', 
        right: '0%'

    },
    exerciseNameContainer:{
        flexDirection: 'row', alignItems: 'center'
    },
    exerciseName: {
        fontSize: 24,
        fontWeight: 'bold',
        padding:'2%',
        textAlign: 'center',
        color:'#fff',
    },
    setContainer: {
        backgroundColor: '#1E1E1E',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 5,
        padding: 8,
        borderRadius: 10
    },
    setNumberText: {
        fontSize: 16,
        fontWeight: 'bold',
        padding:'2%',
        textAlign: 'center',
        color:'#fff'
    },
    input: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 5,
        padding: 5,
        width: 80,
        textAlign: 'center',
        color:'#fff',
        fontWeight: 'bold',
        backgroundColor: '#1c1c1c',

    },
    addSetButton: {
        alignItems: 'center',
        marginTop: 5
    },
    deleteButtonContainer: {
        flexDirection: 'row', // Keeps the content horizontally aligned
        justifyContent: 'center', // Centers the button horizontally
        alignItems: 'center', // Centers the button vertically
        marginBottom: 10,
        paddingLeft: 8,
    },
    
    deleteButton: {
        alignItems: 'center', // Centers content horizontally inside button
        justifyContent: 'center', // Centers content vertically inside button
        backgroundColor: '#1c1d1f',
        borderRadius: 25,
        paddingVertical: 10,
        paddingHorizontal: 12, // Increased horizontal padding to make the button wider
        margin: 0, // Remove horizontal margin to ensure even centering
    },
    
    deleteButtonText: {
        color: '#fff',
        fontWeight: 'bold',
        textAlign: 'center',
        width: '100%',
    },
});

export default ExerciseEditable;