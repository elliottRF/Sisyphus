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
        }, [props.exerciseID])
    );

    const loadWorkoutHistory = async () => {
        try {
            const history = await fetchExerciseHistory(props.exerciseID);
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
            // Only count sets with at least 1 rep for personal best
            if (entry.reps > 0 && entry.weight > maxWeight) {
                maxWeight = entry.weight;
            }
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
            weekday: 'short',
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
                keyExtractor={([session]) => session.toString()}
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
                    const workoutName = exercises[0].name || "Workout";

                    // Calculate display numbers
                    let workingSetCount = 0;
                    const setsWithDisplayNumbers = exercises.map(set => {
                        if (set.setType === 'N' || !set.setType) {
                            workingSetCount++;
                            return { ...set, displayNumber: workingSetCount };
                        }
                        return { ...set, displayNumber: set.setType };
                    });

                    return (
                        <View style={styles.sessionCard}>
                            <View style={styles.sessionHeader}>
                                <View>
                                    <Text style={styles.sessionTitle}>{workoutName}</Text>
                                    <View style={styles.sessionDateContainer}>
                                        <Feather name="calendar" size={12} color={COLORS.textSecondary} />
                                        <Text style={styles.sessionDate}>
                                            {formatDate(exercises[0].time)}
                                        </Text>
                                        <View style={styles.dot} />
                                        <Text style={styles.sessionDate}>Session {session}</Text>
                                    </View>
                                </View>
                            </View>

                            {/* Session Note */}
                            {sessionNote && (
                                <View style={styles.noteContainer}>
                                    <MaterialCommunityIcons name="text" size={14} color={COLORS.textSecondary} style={{ marginTop: 2 }} />
                                    <Text style={styles.noteText}>{sessionNote}</Text>
                                </View>
                            )}

                            <View style={styles.setsContainer}>
                                <View style={styles.setsHeaderRow}>
                                    <Text style={[styles.colHeader, { width: 30, textAlign: 'center' }]}>Set</Text>
                                    <Text style={[styles.colHeader, { flex: 1, textAlign: 'center' }]}>kg</Text>
                                    <Text style={[styles.colHeader, { flex: 1, textAlign: 'center' }]}>Reps</Text>
                                    <Text style={[styles.colHeader, { flex: 1, textAlign: 'center' }]}>1RM</Text>
                                    <View style={{ width: 40 }} />
                                </View>
                                {setsWithDisplayNumbers.map((set, setIndex) => {
                                    const isPR = set.is1rmPR === 1 || set.isVolumePR === 1 || set.isWeightPR === 1;
                                    return (
                                        <View key={setIndex} style={[
                                            styles.setRow,
                                            setIndex % 2 === 1 && { backgroundColor: 'rgba(255,255,255,0.02)' },
                                            isPR && { backgroundColor: 'rgba(64, 186, 173, 0.15)' }
                                        ]}>
                                            <View style={[
                                                styles.setBadge,
                                                set.setType === 'W' && { backgroundColor: 'rgba(253, 203, 110, 0.15)' },
                                                set.setType === 'D' && { backgroundColor: 'rgba(116, 185, 255, 0.15)' }
                                            ]}>
                                                <Text style={[
                                                    styles.setNumber,
                                                    set.setType === 'W' && { color: COLORS.warning },
                                                    set.setType === 'D' && { color: COLORS.secondary }
                                                ]}>
                                                    {set.displayNumber}
                                                </Text>
                                            </View>

                                            <Text style={styles.setWeight}>{set.weight}</Text>
                                            <Text style={styles.setReps}>{set.reps}</Text>
                                            <Text style={styles.setOneRM}>{set.oneRM ? Math.round(set.oneRM) : '-'}</Text>

                                            <View style={styles.prContainer}>
                                                {set.is1rmPR === 1 && <PRBadge type="1RM" />}
                                                {set.isVolumePR === 1 && <PRBadge type="VOL" />}
                                                {set.isWeightPR === 1 && <PRBadge type="KG" />}
                                            </View>
                                        </View>
                                    );
                                })}
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

const PRBadge = ({ type }) => {
    let colors = [COLORS.primary, COLORS.secondary];
    let icon = "trophy";

    if (type === 'VOL') {
        colors = ['#4834d4', '#686de0'];
        icon = "chart-bar";
    } else if (type === 'KG') {
        colors = ['#6ab04c', '#badc58'];
        icon = "weight-kilogram";
    }

    return (
        <LinearGradient
            colors={colors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.miniPrBadge}
        >
            <Text style={styles.miniPrText}>{type}</Text>
        </LinearGradient>
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
        fontSize: 24,
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
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: 350,
        marginTop: 24,
        marginBottom: 20,
        gap: 20,
    },
    sectionTitle: {
        fontSize: 18,
        fontFamily: FONTS.bold,
        color: COLORS.text,
        marginLeft: 20,
        marginTop: 16,
        marginBottom: 16,
    },
    sessionCard: {
        marginHorizontal: 16,
        marginBottom: 16,
        backgroundColor: COLORS.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
        ...SHADOWS.small,
        overflow: 'hidden',
    },
    sessionHeader: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: 'rgba(255,255,255,0.02)',
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    sessionTitle: {
        fontSize: 16,
        fontFamily: FONTS.semiBold,
        color: COLORS.text,
        marginBottom: 4,
    },
    sessionDateContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    sessionDate: {
        fontSize: 13,
        fontFamily: FONTS.medium,
        color: COLORS.textSecondary,
    },
    dot: {
        width: 3,
        height: 3,
        borderRadius: 1.5,
        backgroundColor: COLORS.textSecondary,
        opacity: 0.5,
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
        fontSize: 13,
        color: COLORS.textSecondary,
        fontFamily: FONTS.regular,
        fontStyle: 'italic',
        lineHeight: 18,
    },
    setsContainer: {
        paddingVertical: 4,
    },
    setsHeaderRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    colHeader: {
        fontSize: 11,
        fontFamily: FONTS.medium,
        color: COLORS.textSecondary,
        textTransform: 'uppercase',
    },
    setRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 16,
    },
    setBadge: {
        width: 30,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 4,
        paddingVertical: 2,
    },
    setNumber: {
        fontSize: 13,
        fontFamily: FONTS.medium,
        color: COLORS.textSecondary,
    },
    setWeight: {
        flex: 1,
        textAlign: 'center',
        fontSize: 15,
        fontFamily: FONTS.semiBold,
        color: COLORS.text,
    },
    setReps: {
        flex: 1,
        textAlign: 'center',
        fontSize: 15,
        fontFamily: FONTS.semiBold,
        color: COLORS.text,
    },
    setOneRM: {
        flex: 1,
        textAlign: 'center',
        fontSize: 14,
        fontFamily: FONTS.medium,
        color: COLORS.textSecondary,
    },
    prContainer: {
        width: 40,
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 4,
    },
    miniPrBadge: {
        paddingHorizontal: 4,
        paddingVertical: 2,
        borderRadius: 4,
    },
    miniPrText: {
        fontSize: 9,
        fontFamily: FONTS.bold,
        color: '#fff',
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