import { View, Text, ScrollView, StyleSheet, TextInput, Button, FlatList, TouchableOpacity } from 'react-native'
import React, { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator } from 'react-native';
import { fetchWorkoutHistory, fetchWorkoutHistoryBySession, calculateSessionVolume, fetchExercises, fetchExerciseHistory } from './db';
import { useFocusEffect } from 'expo-router';

import Body from "react-native-body-highlighter";



const exerciseHistory = props => {
    const [workoutHistory, setWorkoutHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exercisesList, setExercises] = useState([]);
    const [formattedTargets, setFormattedTargets] = useState([]);


    useEffect(() => {
        if (exercisesList)
        {
            
            const { targetMuscles, accessoryMuscles } = getExerciseMuscles(props.exerciseID, exercisesList);
            handleMuscleStrings(targetMuscles, accessoryMuscles)
        }
    }, [exercisesList]);



    const getExerciseMuscles = (exerciseID, exerciseLog) => {
        // Find the exercise with the matching exerciseID
        const exercise = exerciseLog.find(ex => ex.exerciseID === exerciseID);
    
        // If exercise not found, return empty arrays
        if (!exercise) return { targetMuscles: [], accessoryMuscles: [] };
    
        // Split the muscles strings into arrays, handling potential empty strings
        const targetMuscles = exercise.targetMuscle ? exercise.targetMuscle.split(',') : [];
        const accessoryMuscles = exercise.accessoryMuscles ? exercise.accessoryMuscles.split(',') : [];
    
        // Return an object with two arrays of muscles
        return { targetMuscles, accessoryMuscles };
    };



    const handleMuscleStrings = (targetSelected, accessorySelected) => {


        // Process target muscles (intensity 1)
        const sluggedTargets = targetSelected.map(target => {
            const name = typeof target === 'object' && target !== null 
                ? target.name 
                : target;
            
            const slug = typeof name === 'string' 
                ? name.toLowerCase()
                : '';
            
            return {
                slug,
                intensity: 1
            };
        });
    
        // Process accessory muscles (intensity 2)
        const sluggedAccessories = accessorySelected.map(accessory => {
            const name = typeof accessory === 'object' && accessory !== null 
                ? accessory.name 
                : accessory;
            
            const slug = typeof name === 'string' 
                ? name.toLowerCase()
                : '';
            
            return {
                slug,
                intensity: 2
            };
        });
    
        // Combine both arrays
        const combinedTargets = [...sluggedTargets, ...sluggedAccessories];
    
        setFormattedTargets(combinedTargets);
    };








    useEffect(() => {
        fetchExercises()
        .then(data => setExercises(data))
        .catch(err => console.error(err));
    }, []);

    useFocusEffect(
        React.useCallback(() => {
            loadWorkoutHistory();
        }, [])
    );

    const loadWorkoutHistory = async () => {
        try {
            const history = await fetchExerciseHistory(props.exerciseID);
            const groupedHistory = groupBySession(history);
            setWorkoutHistory(groupedHistory);
        } catch (error) {
            console.error("Error loading workout history:", error);
        } finally {
            setLoading(false);
        }
    };

    const groupBySession = (history) => {
        const grouped = {};
        history.forEach(entry => {
            if (!grouped[entry.workoutSession]) {
                grouped[entry.workoutSession] = [];
            }
            grouped[entry.workoutSession].push(entry);
        });
        return Object.entries(grouped).sort((a, b) => b[0] - a[0]);
    };

    const groupExercisesByName = (exercises) => {
        const grouped = {};
        exercises.forEach(exercise => {
            const key = exercise.exerciseID;
            if (!grouped[key]) {
                grouped[key] = [];
            }
            grouped[key].push(exercise);
        });
        return Object.values(grouped);
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    useEffect(() => {
        if (workoutHistory.length > 0) {
            console.log("Workout history data:", workoutHistory);
        }
    }, [workoutHistory]);

    if (loading) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color="#fff" />
            </View>
        );
    }







    return (
        <View style={{ height: '100%', width: '100%' }}>






            {true ? (
                <FlatList
                    
                    data={workoutHistory}
                    style={[styles.list, { height: '90%' }]}
                    contentContainerStyle={styles.listContentContainer}
                    keyExtractor={([session]) => session}
                    ListHeaderComponent={
                        <View style={styles.bodyContainer}>
                            <View style={styles.exerciseNameContainer}>
                                <Text style={styles.exerciseTitle}>{props.exerciseName}</Text>
                            </View>
                            <View style={styles.bodyImagesContainer}>
                                <Body
                                    data={formattedTargets}
                                    gender="male"
                                    side="front"
                                    scale={1}
                                    border="#262626"
                                />
                                <Body
                                    data={formattedTargets}
                                    gender="male"
                                    side="back"
                                    scale={1}
                                    border="#262626"
                                />
                            </View>
                        </View>
                    }




                    renderItem={({item: [session, exercises]}) => (
                        <View style={styles.sessionContainer}>
                            <View style={styles.sessionHeader}>
                                <Text style={styles.sessionTitle}>
                                    Workout {session} - {formatDate(exercises[0].time)}
                                </Text>
                            </View>
                            
                            <View style={styles.exercisesList}>
                                {groupExercisesByName(exercises).map((exerciseGroup, index) => {
                                    const exerciseDetails = exercisesList.find(
                                        ex => ex.exerciseID === exerciseGroup[0].exerciseID
                                    );
                                    
                                    return (
                                        <View key={index} style={styles.exercise}>
                                            <Text style={styles.exerciseName}>
                                                {exerciseDetails ? exerciseDetails.name : `Exercise ${exerciseGroup[0].exerciseID}`}
                                            </Text>
                                            {exerciseGroup.map((set, setIndex) => (
                                            <Text
                                                key={setIndex}
                                                style={[
                                                    styles.setInfo,
                                                    set.pr === 1 && { color: '#30c5b7' }  // Apply this color if set.pr is 1
                                                ]}
                                            >
                                                Set {set.setNum}: {set.weight}kg × {set.reps}
                                            </Text>
))}
                                        </View>
                                    );
                                })}
                            </View>
                        </View>
                    )}
                    showsVerticalScrollIndicator={false}
                />
            ) : (
                <Text style={[styles.title, { color: '#888' }]}>No workout history available</Text>
            )}
        </View>
    );
};

const styles = StyleSheet.create({

    exerciseTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        padding:'2%',
        textAlign: 'center',
        color:'#fff',
    },
    bodyContainer: {
        width: '100%', // Ensure the container takes up full width
        marginBottom: 20, // Add space below the body section
    },
    exerciseNameContainer: {
        alignItems: 'center', // Center the exercise name horizontally
        marginBottom: 10, // Add some space between the name and body images
    },
    bodyImagesContainer: {
        flexDirection: 'row', // Align the body images horizontally
        justifyContent: 'space-between', // Space out the images
    },
    listContentContainer: {
        paddingTop: 0,
        
    },
    container: {
        flex: 1,
        backgroundColor: "#121212",
    },
    list: {
        width: '100%',
        backgroundColor: '#121212',
    },
    sessionContainer: {
        marginHorizontal: 16,
        marginVertical: 8,
        backgroundColor: '#1E1E1E',
        borderRadius: 8,
        overflow: 'hidden',
    },
    sessionHeader: {
        padding: 16,
        backgroundColor: '#2A2A2A',
    },
    sessionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
    },
    exercisesList: {
        padding: 16,
    },
    exercise: {
        marginBottom: 16,
    },
    exerciseName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 8,
    },
    setInfo: {
        color: '#B0B0B0',
        marginLeft: 16,
        marginBottom: 4,
    },
});

export default exerciseHistory;