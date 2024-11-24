import { View, Text, ScrollView, StyleSheet, TextInput, Button, FlatList, TouchableOpacity } from 'react-native'
import React, { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator } from 'react-native';
import { fetchWorkoutHistory, fetchWorkoutHistoryBySession, calculateSessionVolume, fetchExercises, fetchExerciseHistory } from './db';
import { useFocusEffect } from 'expo-router';

const exerciseHistory = props => {
    const [workoutHistory, setWorkoutHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exercisesList, setExercises] = useState([]);

    useEffect(() => {
        fetchExercises()
        .then(data => setExercises(data))
        .catch(err => console.error(err));
    }, []);

    useFocusEffect(
        React.useCallback(() => {
            loadWorkoutHistory();
            console.log(props.exerciseID)
        }, [])
    );

    const loadWorkoutHistory = async () => {
        try {
            const history = await fetchExerciseHistory(props.exerciseID);
            const groupedHistory = groupBySession(history);
            setWorkoutHistory(groupedHistory);
            console.log(JSON.stringify(groupedHistory));
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
            {workoutHistory.length > 0 ? (
                <FlatList
                    data={workoutHistory}
                    style={[styles.list, { height: '90%' }]}
                    contentContainerStyle={styles.listContentContainer}
                    keyExtractor={([session]) => session}
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
    listContentContainer: {
        paddingBottom: 100,
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