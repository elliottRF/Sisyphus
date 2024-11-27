import { View, Text, ScrollView, StyleSheet, TextInput, Button, FlatList, TouchableOpacity } from 'react-native'
import React, { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator } from 'react-native';
import { fetchWorkoutHistory, fetchWorkoutHistoryBySession, calculateSessionVolume, fetchExercises } from '../components/db';
import { useFocusEffect } from 'expo-router';

const History = () => {
    const [workoutHistory, setWorkoutHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedSessions, setExpandedSessions] = useState(new Set());
    const [exercisesList, setExercises] = useState([]);

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
            const history = await fetchWorkoutHistory();
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
        const order = [];
    
        exercises.forEach(exercise => {
            const key = exercise.exerciseID;
            if (!grouped[key]) {
                grouped[key] = [];
                order.push(key);
            }
            grouped[key].push(exercise);
        });
    
        return order.map(key => grouped[key]);
    };

    const toggleSession = (sessionNumber) => {
        setExpandedSessions(prev => {
            const newSet = new Set(prev);
            if (newSet.has(sessionNumber)) {
                newSet.delete(sessionNumber);
            } else {
                newSet.add(sessionNumber);
            }
            return newSet;
        });
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <ActivityIndicator size="large" color="#fff" />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <Text style={styles.title}>Workout History</Text>
            <FlatList

                data={workoutHistory}
                style={styles.list}
                contentContainerStyle={styles.listContentContainer}
                keyExtractor={([session]) => session}
                renderItem={({item: [session, exercises]}) => (
                    <View style={styles.sessionContainer}>
                        <TouchableOpacity 
                            style={styles.sessionHeader}
                            onPress={() => toggleSession(session)}
                        >
                            <Text style={styles.sessionTitle}>
                                {exercises[0].name} - {formatDate(exercises[0].time)}
                            </Text>
                        </TouchableOpacity>
                        
                        {expandedSessions.has(session) && (
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
                        )}
                    </View>
                )}
            />
        </SafeAreaView>
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
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
        padding: 16,
        textAlign: 'center',
    },
    list: {
        flex: 1,
        width: '100%',
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

export default History;