import { View, Text, ScrollView, StyleSheet, TextInput, Button, FlatList, TouchableOpacity } from 'react-native'
import React, { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator } from 'react-native';
import { fetchWorkoutHistory, fetchWorkoutHistoryBySession, calculateSessionVolume, fetchExercises, fetchExerciseHistory } from './db';
import { useFocusEffect } from 'expo-router';
import { COLORS, FONTS, SHADOWS } from '../constants/theme';
import { Feather } from '@expo/vector-icons';

import Body from "react-native-body-highlighter";

const exerciseHistory = props => {
    const [workoutHistory, setWorkoutHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exercisesList, setExercises] = useState([]);
    const [formattedTargets, setFormattedTargets] = useState([]);

    useEffect(() => {
        if (exercisesList) {
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
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <FlatList
                data={workoutHistory}
                style={styles.list}
                contentContainerStyle={styles.listContentContainer}
                keyExtractor={([session]) => session}
                ListHeaderComponent={
                    <View style={styles.headerContainer}>
                        <Text style={styles.exerciseTitle}>{props.exerciseName}</Text>
                        <View style={styles.bodyContainer}>
                            <Body
                                data={formattedTargets}
                                gender="male"
                                side="front"
                                scale={1.1}
                                border={COLORS.border}
                            />
                            <Body
                                data={formattedTargets}
                                gender="male"
                                side="back"
                                scale={1.1}
                                border={COLORS.border}
                            />
                        </View>
                    </View>
                }
                renderItem={({ item: [session, exercises] }) => (
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
                                        {exerciseGroup.map((set, setIndex) => (
                                            <View key={setIndex} style={styles.setRow}>
                                                <Text style={[
                                                    styles.setInfo,
                                                    set.pr === 1 && styles.prText
                                                ]}>
                                                    Set {set.setNum}: {set.weight}kg × {set.reps}
                                                </Text>
                                                {set.pr === 1 && (
                                                    <View style={styles.prBadge}>
                                                        <Text style={styles.prBadgeText}>PR</Text>
                                                    </View>
                                                )}
                                            </View>
                                        ))}
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                )}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>No workout history available</Text>
                    </View>
                }
                showsVerticalScrollIndicator={false}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        height: '100%',
        backgroundColor: COLORS.background,
    },
    list: {
        flex: 1,
    },
    listContentContainer: {
        paddingBottom: 40,
    },
    headerContainer: {
        alignItems: 'center',
        paddingVertical: 20,
        backgroundColor: COLORS.background,
    },
    exerciseTitle: {
        fontSize: 24,
        fontFamily: FONTS.bold,
        color: COLORS.text,
        marginBottom: 20,
        textAlign: 'center',
    },
    bodyContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        width: '100%',
        height: 300,
        marginBottom: 20,
    },
    sessionContainer: {
        marginHorizontal: 16,
        marginBottom: 16,
        backgroundColor: COLORS.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        ...SHADOWS.small,
        overflow: 'hidden',
    },
    sessionHeader: {
        padding: 16,
        backgroundColor: COLORS.surface,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    sessionTitle: {
        fontSize: 16,
        fontFamily: FONTS.bold,
        color: COLORS.text,
    },
    exercisesList: {
        padding: 16,
    },
    exercise: {
        // marginBottom: 8,
    },
    setRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    setInfo: {
        color: COLORS.textSecondary,
        fontFamily: FONTS.medium,
        fontSize: 14,
    },
    prText: {
        color: COLORS.primary,
        fontFamily: FONTS.bold,
    },
    prBadge: {
        backgroundColor: COLORS.primary,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        marginLeft: 8,
    },
    prBadgeText: {
        color: '#fff',
        fontSize: 10,
        fontFamily: FONTS.bold,
    },
    emptyContainer: {
        padding: 40,
        alignItems: 'center',
    },
    emptyText: {
        color: COLORS.textSecondary,
        fontFamily: FONTS.medium,
        fontSize: 16,
    }
});

export default exerciseHistory;