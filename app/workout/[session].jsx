import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import React, { useState, useEffect } from 'react';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchWorkoutHistoryBySession, fetchExercises } from '../../components/db';
import { COLORS, FONTS, SHADOWS } from '../../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';

const WorkoutDetail = () => {
    const { session } = useLocalSearchParams();
    const router = useRouter();
    const [workoutDetails, setWorkoutDetails] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exercisesList, setExercises] = useState([]);

    useEffect(() => {
        const loadData = async () => {
            try {
                const [historyData, exercisesData] = await Promise.all([
                    fetchWorkoutHistoryBySession(session),
                    fetchExercises()
                ]);
                setWorkoutDetails(historyData);
                setExercises(exercisesData);
            } catch (error) {
                console.error("Error loading workout details:", error);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [session]);

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

    const formatDate = (dateString) => {
        if (!dateString) return '';
        return new Date(dateString).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
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

    if (!workoutDetails || workoutDetails.length === 0) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.navigate('history')} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={COLORS.text} />
                    </TouchableOpacity>
                    <Text style={styles.title}>Workout Not Found</Text>
                </View>
            </SafeAreaView>
        );
    }

    const workoutName = workoutDetails[0].name;
    const workoutDate = workoutDetails[0].time;
    const groupedExercises = groupExercisesByName(workoutDetails);

    return (
        <SafeAreaView style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.navigate('history')} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Session {session}</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.summaryCard}>
                    <LinearGradient
                        colors={[COLORS.surface, COLORS.surface]}
                        style={styles.summaryGradient}
                    >
                        <Text style={styles.workoutName}>{workoutName}</Text>
                        <View style={styles.dateContainer}>
                            <Feather name="calendar" size={16} color={COLORS.primary} />
                            <Text style={styles.dateText}>{formatDate(workoutDate)}</Text>
                        </View>
                    </LinearGradient>
                </View>

                <View style={styles.exercisesList}>
                    {groupedExercises.map((exerciseGroup, index) => {
                        const exerciseDetails = exercisesList.find(
                            ex => ex.exerciseID === exerciseGroup[0].exerciseID
                        );

                        return (
                            <View key={index} style={styles.exerciseCard}>
                                <LinearGradient
                                    colors={['rgba(255,255,255,0.03)', 'rgba(255,255,255,0.01)']}
                                    style={styles.exerciseHeader}
                                >
                                    <Text style={styles.exerciseName}>
                                        {exerciseDetails ? exerciseDetails.name : `Exercise ${exerciseGroup[0].exerciseID}`}
                                    </Text>
                                </LinearGradient>

                                <View style={styles.setsContainer}>
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
                            </View>
                        );
                    })}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 18,
        fontFamily: FONTS.bold,
        color: COLORS.text,
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 40,
    },
    summaryCard: {
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 24,
        borderWidth: 1,
        borderColor: COLORS.border,
        ...SHADOWS.medium,
    },
    summaryGradient: {
        padding: 20,
        alignItems: 'center',
    },
    workoutName: {
        fontSize: 24,
        fontFamily: FONTS.bold,
        color: COLORS.text,
        marginBottom: 8,
        textAlign: 'center',
    },
    dateContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'rgba(255,255,255,0.05)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    dateText: {
        fontSize: 14,
        fontFamily: FONTS.medium,
        color: COLORS.textSecondary,
    },
    exercisesList: {
        gap: 16,
    },
    exerciseCard: {
        backgroundColor: COLORS.surface,
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    exerciseHeader: {
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    exerciseName: {
        fontSize: 18,
        fontFamily: FONTS.semiBold,
        color: COLORS.primary,
    },
    setsContainer: {
        padding: 16,
    },
    setRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    setNumberContainer: {
        width: 28,
        height: 28,
        borderRadius: 14,
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
        fontSize: 18,
        fontFamily: FONTS.bold,
        color: COLORS.text,
    },
    setX: {
        fontSize: 14,
        color: COLORS.textSecondary,
        marginHorizontal: 4,
    },
    setReps: {
        fontSize: 18,
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

export default WorkoutDetail;
