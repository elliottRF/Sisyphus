import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native'
import React, { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchWorkoutHistory, fetchExercises } from '../components/db';
import { useFocusEffect } from 'expo-router';
import { COLORS, FONTS, SHADOWS } from '../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons, AntDesign } from '@expo/vector-icons';

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
                                    colors={[COLORS.surface, COLORS.surface]}
                                    style={styles.cardHeader}
                                >
                                    <View style={styles.headerContent}>
                                        <View>
                                            <View style={styles.sessionHeaderTop}>
                                                <Text style={styles.sessionTitle}>
                                                    {exercises[0].name}
                                                </Text>
                                                <View style={styles.sessionBadge}>
                                                    <Text style={styles.sessionBadgeText}>Session {session}</Text>
                                                </View>
                                            </View>
                                            <View style={styles.sessionDateContainer}>
                                                <Feather name="calendar" size={14} color={COLORS.primary} />
                                                <Text style={styles.sessionDate}>
                                                    {formatDate(exercises[0].time)}
                                                </Text>
                                            </View>
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
                                                        <View style={styles.setNumberContainer}>
                                                            <Text style={styles.setNumber}>{set.setNum}</Text>
                                                        </View>
                                                        <View style={styles.setDetails}>
                                                            <Text style={styles.setWeight}>{set.weight} <Text style={styles.unit}>kg</Text></Text>
                                                            <Text style={styles.setX}>×</Text>
                                                            <Text style={styles.setReps}>{set.reps} <Text style={styles.unit}>reps</Text></Text>
                                                        </View>
                                                        {set.pr === 1 && (
                                                            <LinearGradient
                                                                colors={[COLORS.primary, COLORS.secondary]}
                                                                start={{ x: 0, y: 0 }}
                                                                end={{ x: 1, y: 1 }}
                                                                style={styles.prBadge}
                                                            >
                                                                <MaterialCommunityIcons name="trophy" size={12} color="#fff" />
                                                                <Text style={styles.prText}>PR</Text>
                                                            </LinearGradient>
                                                        )}
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
        backgroundColor: 'rgba(255,255,255,0.02)',
    },
    headerContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    sessionHeaderTop: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
        gap: 12,
    },
    sessionTitle: {
        fontSize: 18,
        fontFamily: FONTS.semiBold,
        color: COLORS.text,
    },
    sessionBadge: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    sessionBadgeText: {
        fontSize: 10,
        fontFamily: FONTS.medium,
        color: COLORS.textSecondary,
    },
    sessionDateContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
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
        backgroundColor: 'rgba(0,0,0,0.2)',
    },
    exercise: {
        marginBottom: 20,
    },
    exerciseName: {
        fontSize: 16,
        fontFamily: FONTS.semiBold,
        color: COLORS.primary,
        marginBottom: 12,
    },
    setRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    setNumberContainer: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    setNumber: {
        fontSize: 12,
        fontFamily: FONTS.bold,
        color: COLORS.textSecondary,
    },
    setDetails: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 4,
    },
    setWeight: {
        fontSize: 16,
        fontFamily: FONTS.bold,
        color: COLORS.text,
    },
    setX: {
        fontSize: 14,
        color: COLORS.textSecondary,
        marginHorizontal: 4,
    },
    setReps: {
        fontSize: 16,
        fontFamily: FONTS.bold,
        color: COLORS.text,
    },
    unit: {
        fontSize: 12,
        fontFamily: FONTS.medium,
        color: COLORS.textSecondary,
    },
    prBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 4,
    },
    prText: {
        color: '#fff',
        fontSize: 10,
        fontFamily: FONTS.bold,
    },
});

export default History;