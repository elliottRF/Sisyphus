import { View, Text, StyleSheet, FlatList, Dimensions } from 'react-native'
import React, { useState, useEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import { fetchExerciseHistory, fetchExercises } from './db';
import { useFocusEffect } from 'expo-router';
import { COLORS, FONTS, SHADOWS } from '../constants/theme';
import { Feather, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Body from "react-native-body-highlighter";

const { width } = Dimensions.get('window');

const ExerciseHistory = (props) => {
    const [workoutHistory, setWorkoutHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exercisesList, setExercises] = useState([]);
    const [formattedTargets, setFormattedTargets] = useState([]);
    const [stats, setStats] = useState({
        totalSets: 0,
        personalBest: 0,
        totalVolume: 0
    });

    useEffect(() => {
        if (exercisesList) {
            const { targetMuscles, accessoryMuscles } = getExerciseMuscles(props.exerciseID, exercisesList);
            handleMuscleStrings(targetMuscles, accessoryMuscles)
        }
    }, [exercisesList]);

    const getExerciseMuscles = (exerciseID, exerciseLog) => {
        const exercise = exerciseLog.find(ex => ex.exerciseID === exerciseID);
        if (!exercise) return { targetMuscles: [], accessoryMuscles: [] };
        const targetMuscles = exercise.targetMuscle ? exercise.targetMuscle.split(',') : [];
        const accessoryMuscles = exercise.accessoryMuscles ? exercise.accessoryMuscles.split(',') : [];
        return { targetMuscles, accessoryMuscles };
    };

    const handleMuscleStrings = (targetSelected, accessorySelected) => {
        const sluggedTargets = targetSelected.map(target => ({
            slug: typeof target === 'string' ? target.toLowerCase() : '',
            intensity: 1
        }));
        const sluggedAccessories = accessorySelected.map(accessory => ({
            slug: typeof accessory === 'string' ? accessory.toLowerCase() : '',
            intensity: 2
        }));
        setFormattedTargets([...sluggedTargets, ...sluggedAccessories]);
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
            console.log("Fetched History Sample:", history.slice(0, 3)); // Log first 3 entries
            const groupedHistory = groupBySession(history);
            setWorkoutHistory(groupedHistory);
            calculateStats(history);
        } catch (error) {
            console.error("Error loading workout history:", error);
        } finally {
            setLoading(false);
        }
    };

    const calculateStats = (history) => {
        let maxWeight = 0;
        let volume = 0;

        history.forEach(entry => {
            if (entry.weight > maxWeight) maxWeight = entry.weight;
            volume += (entry.weight * entry.reps);
        });

        setStats({
            totalSets: history.length,
            personalBest: maxWeight,
            totalVolume: volume
        });
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

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
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
                    <View>
                        <LinearGradient
                            colors={[COLORS.surface, COLORS.background]}
                            style={styles.headerGradient}
                        >
                            <Text style={styles.exerciseTitle}>{props.exerciseName}</Text>

                            <View style={styles.statsRow}>
                                <View style={styles.statItem}>
                                    <Text style={styles.statLabel}>Personal Best</Text>
                                    <Text style={styles.statValue}>{stats.personalBest}kg</Text>
                                </View>
                                <View style={styles.statDivider} />
                                <View style={styles.statItem}>
                                    <Text style={styles.statLabel}>Total Sets</Text>
                                    <Text style={styles.statValue}>{stats.totalSets}</Text>
                                </View>
                                <View style={styles.statDivider} />
                                <View style={styles.statItem}>
                                    <Text style={styles.statLabel}>Volume</Text>
                                    <Text style={styles.statValue}>{(stats.totalVolume / 1000).toFixed(1)}k</Text>
                                </View>
                            </View>
                        </LinearGradient>

                        <View style={styles.bodyContainer}>
                            <Body
                                data={formattedTargets}
                                gender="male"
                                side="front"
                                scale={1.0}
                                border={COLORS.border}
                            />
                            <Body
                                data={formattedTargets}
                                gender="male"
                                side="back"
                                scale={1.0}
                                border={COLORS.border}
                            />
                        </View>

                        <Text style={styles.sectionTitle}>History</Text>
                    </View>
                }
                renderItem={({ item: [session, exercises] }) => {
                    const sessionNote = exercises.find(e => e.notes)?.notes;

                    return (
                        <View style={styles.sessionCard}>
                            <View style={styles.sessionHeader}>
                                <View style={styles.sessionDateContainer}>
                                    <Feather name="calendar" size={14} color={COLORS.primary} />
                                    <Text style={styles.sessionDate}>
                                        {formatDate(exercises[0].time)}
                                    </Text>
                                </View>
                                <View style={styles.sessionBadge}>
                                    <Text style={styles.sessionBadgeText}>Session {session}</Text>
                                </View>
                            </View>

                            {/* Session Note */}
                            {sessionNote && (
                                <View style={styles.noteContainer}>
                                    <MaterialIcons name="sticky-note-2" size={14} color={COLORS.textSecondary} style={{ marginTop: 2 }} />
                                    <Text style={styles.noteText}>{sessionNote}</Text>
                                </View>
                            )}

                            <View style={styles.exercisesList}>
                                {exercises.map((set, setIndex) => (
                                    <View key={setIndex} style={styles.setRow}>
                                        <View style={[
                                            styles.setNumberContainer,
                                            set.setType === 'W' && { backgroundColor: 'rgba(253, 203, 110, 0.2)' },
                                            set.setType === 'D' && { backgroundColor: 'rgba(116, 185, 255, 0.2)' }
                                        ]}>
                                            <Text style={[
                                                styles.setNumber,
                                                set.setType === 'W' && { color: COLORS.warning },
                                                set.setType === 'D' && { color: COLORS.secondary }
                                            ]}>
                                                {set.setType === 'W' ? 'W' : set.setType === 'D' ? 'D' : set.setNum}
                                            </Text>
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
                    )
                }}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Feather name="activity" size={48} color={COLORS.textSecondary} style={{ opacity: 0.5 }} />
                        <Text style={styles.emptyText}>No workout history yet</Text>
                        <Text style={styles.emptySubtext}>Complete a workout to see your progress</Text>
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
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: COLORS.background,
    },
    list: {
        flex: 1,
    },
    listContentContainer: {
        paddingBottom: 120,
    },
    headerGradient: {
        paddingTop: 20,
        paddingBottom: 24,
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    exerciseTitle: {
        fontSize: 28,
        fontFamily: FONTS.bold,
        color: COLORS.text,
        textAlign: 'center',
        marginBottom: 24,
        paddingHorizontal: 20,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-evenly',
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    statItem: {
        alignItems: 'center',
    },
    statLabel: {
        fontSize: 12,
        fontFamily: FONTS.medium,
        color: COLORS.textSecondary,
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    statValue: {
        fontSize: 20,
        fontFamily: FONTS.bold,
        color: COLORS.primary,
    },
    statDivider: {
        width: 1,
        height: 30,
        backgroundColor: COLORS.border,
    },
    bodyContainer: {
        flexDirection: 'row',
        justifyContent: 'center', // Change to center to horizontally center the two Body components
        alignItems: 'center',    // Vertically center them if they had different heights, good practice
        width: '100%',           // Take full width
        height: 350,             // Fixed height for the container
        marginTop: 24,
        marginBottom: 20,        // Slightly reduce margin from previous suggestion, find a sweet spot
        gap: 20,                 // Add a gap between the front and back body figures
    },
    sectionTitle: {
        fontSize: 18,
        fontFamily: FONTS.bold,
        color: COLORS.text,
        marginLeft: 20,
        marginTop: 16, // Added or adjusted to ensure space from bodyContainer
        marginBottom: 16,
    },
    sessionCard: {
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
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        backgroundColor: 'rgba(255,255,255,0.02)',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    sessionDateContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    sessionDate: {
        fontSize: 14,
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
    noteContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 4,
        gap: 8,
    },
    noteText: {
        flex: 1,
        fontSize: 14,
        fontFamily: FONTS.regular,
        color: COLORS.textSecondary,
        lineHeight: 20,
    },
    exercisesList: {
        padding: 16,
    },
    setRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
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
    emptyContainer: {
        padding: 40,
        alignItems: 'center',
        marginTop: 40,
    },
    emptyText: {
        color: COLORS.text,
        fontFamily: FONTS.bold,
        fontSize: 18,
        marginTop: 16,
        marginBottom: 8,
    },
    emptySubtext: {
        color: COLORS.textSecondary,
        fontFamily: FONTS.regular,
        fontSize: 14,
    }
});

export default ExerciseHistory;