import { View, Text, ScrollView, StyleSheet, TextInput, Button, FlatList, TouchableOpacity } from 'react-native'
import React, { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator } from 'react-native';
import { fetchWorkoutHistory, fetchWorkoutHistoryBySession, calculateSessionVolume, fetchExercises } from '../components/db';
import { useFocusEffect } from 'expo-router';
import { COLORS, FONTS, SHADOWS } from '../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import AntDesign from '@expo/vector-icons/AntDesign';

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
                <ActivityIndicator size="large" color={COLORS.primary} />
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
                renderItem={({ item: [session, exercises] }) => {
                    const isExpanded = expandedSessions.has(session);
                    return (
                        <View style={styles.cardContainer}>
                            <TouchableOpacity
                                activeOpacity={0.9}
                                onPress={() => toggleSession(session)}
                            >
                                <LinearGradient
                                    colors={[COLORS.surface, COLORS.surface]} // Keep it subtle or use a slight gradient if desired
                                    style={styles.cardHeader}
                                >
                                    <View style={styles.headerContent}>
                                        <View>
                                            <Text style={styles.sessionTitle}>
                                                {exercises[0].name}
                                            </Text>
                                            <Text style={styles.sessionDate}>
                                                {formatDate(exercises[0].time)}
                                            </Text>
                                        </View>
                                        <AntDesign name={isExpanded ? "up" : "down"} size={20} color={COLORS.textSecondary} />
                                    </View>
                                </LinearGradient>
                            </TouchableOpacity>

                            {isExpanded && (
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
                                                    <View key={setIndex} style={styles.setRow}>
                                                        <Text style={[styles.setInfo, set.pr === 1 && styles.prText]}>
                                                            Set {set.setNum}
                                                        </Text>
                                                        <Text style={[styles.setInfo, set.pr === 1 && styles.prText]}>
                                                            {set.weight}kg × {set.reps}
                                                        </Text>
                                                    </View>
                                                ))}
                                            </View>
                                        );
                                    })}
                                </View>
                            )}
                        </View>
                    );
                }}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    title: {
        fontSize: 28,
        fontFamily: FONTS.bold,
        color: COLORS.text,
        padding: 20,
    },
    list: {
        flex: 1,
        width: '100%',
    },
    listContentContainer: {
        paddingBottom: 100,
        paddingHorizontal: 16,
    },
    cardContainer: {
        marginBottom: 16,
        borderRadius: 16,
        backgroundColor: COLORS.surface,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: COLORS.border,
        ...SHADOWS.small,
    },
    cardHeader: {
        padding: 16,
    },
    headerContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    sessionTitle: {
        fontSize: 18,
        fontFamily: FONTS.semiBold,
        color: COLORS.text,
        marginBottom: 4,
    },
    sessionDate: {
        fontSize: 14,
        fontFamily: FONTS.medium,
        color: COLORS.textSecondary,
    },
    exercisesList: {
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: COLORS.border,
        backgroundColor: '#181818', // Slightly darker than surface
    },
    exercise: {
        marginBottom: 16,
    },
    exerciseName: {
        fontSize: 16,
        fontFamily: FONTS.semiBold,
        color: COLORS.primary,
        marginBottom: 8,
    },
    setRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4,
        paddingLeft: 10,
    },
    setInfo: {
        fontSize: 14,
        fontFamily: FONTS.regular,
        color: COLORS.textSecondary,
    },
    prText: {
        color: COLORS.success,
        fontFamily: FONTS.bold,
    },
});

export default History;