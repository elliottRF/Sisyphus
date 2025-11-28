import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native'
import React, { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchWorkoutHistory, fetchExercises } from '../components/db';
import { useFocusEffect, useRouter } from 'expo-router';
import { COLORS, FONTS, SHADOWS } from '../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

const History = () => {
    const [workoutHistory, setWorkoutHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exercisesList, setExercises] = useState([]);
    const router = useRouter();

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

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const formatDuration = (minutes) => {
        if (minutes === null || minutes === undefined) return 'N/A';
        if (minutes === 0) return '< 1m';
        const hrs = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (hrs > 0) return `${hrs}h ${mins}m`;
        return `${mins}m`;
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
                    const groupedExercises = groupExercisesByName(exercises);
                    const duration = exercises[0].duration;

                    return (
                        <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => router.push(`/workout/${session}`)}
                            style={styles.cardContainer}
                        >
                            <LinearGradient
                                colors={[COLORS.surface, COLORS.surface]}
                                style={styles.cardContent}
                            >
                                <View style={styles.cardHeader}>
                                    <View>
                                        <Text style={styles.workoutName}>{exercises[0].name}</Text>
                                        <View style={styles.metaContainer}>
                                            <View style={styles.metaItem}>
                                                <Feather name="calendar" size={12} color={COLORS.textSecondary} />
                                                <Text style={styles.metaText}>{formatDate(exercises[0].time)}</Text>
                                            </View>
                                            <View style={styles.metaDivider} />
                                            <View style={styles.metaItem}>
                                                <Feather name="clock" size={12} color={COLORS.textSecondary} />
                                                <Text style={styles.metaText}>{formatDuration(duration)}</Text>
                                            </View>
                                        </View>
                                    </View>
                                    <View style={styles.sessionBadge}>
                                        <Text style={styles.sessionBadgeText}>#{session}</Text>
                                    </View>
                                </View>

                                <View style={styles.divider} />

                                <View style={styles.summaryList}>
                                    {groupedExercises.slice(0, 4).map((group, idx) => {
                                        const exerciseName = exercisesList.find(e => e.exerciseID === group[0].exerciseID)?.name || 'Unknown Exercise';
                                        return (
                                            <Text key={idx} style={styles.summaryText} numberOfLines={1}>
                                                <Text style={styles.summaryCount}>{group.length} x</Text> {exerciseName}
                                            </Text>
                                        );
                                    })}
                                    {groupedExercises.length > 4 && (
                                        <Text style={styles.moreText}>+ {groupedExercises.length - 4} more exercises</Text>
                                    )}
                                </View>
                            </LinearGradient>
                        </TouchableOpacity>
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
    cardContent: {
        padding: 16,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    workoutName: {
        fontSize: 18,
        fontFamily: FONTS.bold,
        color: COLORS.text,
        marginBottom: 6,
    },
    metaContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    metaItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    metaText: {
        fontSize: 12,
        fontFamily: FONTS.medium,
        color: COLORS.textSecondary,
    },
    metaDivider: {
        width: 1,
        height: 12,
        backgroundColor: COLORS.border,
    },
    sessionBadge: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    sessionBadgeText: {
        fontSize: 12,
        fontFamily: FONTS.bold,
        color: COLORS.textSecondary,
    },
    divider: {
        height: 1,
        backgroundColor: COLORS.border,
        marginBottom: 12,
        opacity: 0.5,
    },
    summaryList: {
        gap: 4,
    },
    summaryText: {
        fontSize: 14,
        fontFamily: FONTS.regular,
        color: COLORS.textSecondary,
    },
    summaryCount: {
        color: COLORS.primary,
        fontFamily: FONTS.semiBold,
    },
    moreText: {
        fontSize: 12,
        fontFamily: FONTS.medium,
        color: COLORS.textSecondary,
        marginTop: 4,
        fontStyle: 'italic',
    },
});

export default History;