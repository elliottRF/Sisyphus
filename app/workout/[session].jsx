import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import React, { useState, useEffect, useRef } from 'react';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchWorkoutHistoryBySession, fetchExercises } from '../../components/db';
import { COLORS, FONTS, SHADOWS } from '../../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import ActionSheet from "react-native-actions-sheet";
import ExerciseHistory from '../../components/exerciseHistory';
import { Dimensions } from 'react-native';   // ← make sure this import exists at the top!
const WorkoutDetail = () => {
    const { session } = useLocalSearchParams();
    const router = useRouter();
    const [workoutDetails, setWorkoutDetails] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exercisesList, setExercises] = useState([]);

    // ActionSheet state
    const actionSheetRef = useRef(null);
    const [selectedExerciseId, setSelectedExerciseId] = useState(null);
    const [currentExerciseName, setCurrentExerciseName] = useState(null);

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
            weekday: 'short',
            month: 'short',
            day: 'numeric',
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

    const showExerciseInfo = (exerciseId, exerciseName) => {
        setSelectedExerciseId(exerciseId);
        setCurrentExerciseName(exerciseName);
        actionSheetRef.current?.show();
    };

    const handleCloseActionSheet = () => {
        actionSheetRef.current?.hide();
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
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={COLORS.text} />
                    </TouchableOpacity>
                    <Text style={styles.title}>Workout Not Found</Text>
                </View>
            </SafeAreaView>
        );
    }

    const workoutName = workoutDetails[0].name;
    const workoutDate = workoutDetails[0].time;
    const workoutDuration = workoutDetails[0].duration;
    const groupedExercises = groupExercisesByName(workoutDetails);

    // Calculate total PRs
    const totalPRs = workoutDetails.reduce((acc, ex) => {
        return acc + (ex.is1rmPR || 0) + (ex.isVolumePR || 0) + (ex.isWeightPR || 0);
    }, 0);

    return (
        <SafeAreaView style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Session #{session}</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Dense Header Card */}
                <View style={styles.summaryCard}>
                    <LinearGradient
                        colors={[COLORS.surface, COLORS.surface]}
                        style={styles.summaryContent}
                    >
                        <View style={styles.summaryMain}>
                            <Text style={styles.workoutName}>{workoutName}</Text>
                            <View style={styles.statsRow}>
                                <View style={styles.statItem}>
                                    <Feather name="calendar" size={14} color={COLORS.textSecondary} />
                                    <Text style={styles.statText}>{formatDate(workoutDate)}</Text>
                                </View>
                                <View style={styles.statDivider} />
                                <View style={styles.statItem}>
                                    <Feather name="clock" size={14} color={COLORS.textSecondary} />
                                    <Text style={styles.statText}>{formatDuration(workoutDuration)}</Text>
                                </View>
                                {totalPRs > 0 && (
                                    <>
                                        <View style={styles.statDivider} />
                                        <View style={styles.statItem}>
                                            <MaterialCommunityIcons name="trophy" size={14} color={COLORS.primary} />
                                            <Text style={[styles.statText, { color: COLORS.primary, fontFamily: FONTS.bold }]}>
                                                {totalPRs} PRs
                                            </Text>
                                        </View>
                                    </>
                                )}
                            </View>
                        </View>
                    </LinearGradient>
                </View>

                <View style={styles.exercisesList}>
                    {groupedExercises.map((exerciseGroup, index) => {
                        const exerciseDetails = exercisesList.find(
                            ex => ex.exerciseID === exerciseGroup[0].exerciseID
                        );
                        const exerciseName = exerciseDetails ? exerciseDetails.name : `Exercise ${exerciseGroup[0].exerciseID}`;

                        // Calculate display numbers
                        let workingSetCount = 0;
                        const setsWithDisplayNumbers = exerciseGroup.map(set => {
                            if (set.setType === 'N' || !set.setType) {
                                workingSetCount++;
                                return { ...set, displayNumber: workingSetCount };
                            }
                            return { ...set, displayNumber: set.setType };
                        });

                        const exerciseNote = exerciseGroup.find(e => e.notes)?.notes;

                        return (
                            <View key={index} style={styles.exerciseCard}>
                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={() => showExerciseInfo(exerciseGroup[0].exerciseID, exerciseName)}
                                    style={styles.exerciseHeader}
                                >
                                    <Text style={styles.exerciseName}>
                                        {exerciseName}
                                    </Text>
                                    <Feather name="chevron-right" size={16} color={COLORS.textSecondary} />
                                </TouchableOpacity>

                                {exerciseNote && (
                                    <View style={styles.noteContainer}>
                                        <MaterialCommunityIcons name="text" size={14} color={COLORS.textSecondary} style={{ marginTop: 2 }} />
                                        <Text style={styles.noteText}>{exerciseNote}</Text>
                                    </View>
                                )}

                                <View style={styles.setsContainer}>
                                    <View style={styles.setsHeaderRow}>
                                        <Text style={[styles.colHeader, { width: 30, textAlign: 'center' }]}>Set</Text>
                                        <Text style={[styles.colHeader, { flex: 1, textAlign: 'center' }]}>kg</Text>
                                        <Text style={[styles.colHeader, { flex: 1, textAlign: 'center' }]}>Reps</Text>
                                        <Text style={[styles.colHeader, { flex: 1, textAlign: 'center' }]}>1RM</Text>
                                        <View style={{ width: 60 }} />
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
                        );
                    })}
                </View>
            </ScrollView>

            <ActionSheet
                ref={actionSheetRef}
                enableGestureBack={true}
                closeOnPressBack={true}
                androidCloseOnBackPress={true}
                containerStyle={{ height: '94%' }}
                snapPoints={[94]}
                initialSnapIndex={0}
            >
                <ExerciseHistory
                    exerciseID={selectedExerciseId}
                    exerciseName={currentExerciseName}
                />
            </ActionSheet>
        </SafeAreaView>
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
        flex: 1,
        backgroundColor: COLORS.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
        backgroundColor: COLORS.background,
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 16,
        fontFamily: FONTS.bold,
        color: COLORS.text,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 40,
    },
    summaryCard: {
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.surface,
        ...SHADOWS.small,
    },
    summaryContent: {
        padding: 16,
    },
    workoutName: {
        fontSize: 20,
        fontFamily: FONTS.bold,
        color: COLORS.text,
        marginBottom: 8,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
    },
    statItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    statText: {
        fontSize: 13,
        fontFamily: FONTS.medium,
        color: COLORS.textSecondary,
    },
    statDivider: {
        width: 1,
        height: 12,
        backgroundColor: COLORS.border,
    },
    exercisesList: {
        gap: 12,
    },
    exerciseCard: {
        backgroundColor: COLORS.surface,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    exerciseHeader: {
        paddingHorizontal: 12,
        paddingVertical: 12,
        backgroundColor: 'rgba(255,255,255,0.02)',
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    exerciseName: {
        fontSize: 16,
        fontFamily: FONTS.semiBold,
        color: COLORS.primary,
        flex: 1,
    },
    noteContainer: {
        flexDirection: 'row',
        paddingHorizontal: 12,
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
        paddingHorizontal: 12,
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
        paddingHorizontal: 12,
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
        width: 60,
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
    actionSheetContainer: {
        height: '90%',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        backgroundColor: COLORS.background,
    },
    closeIconContainer: {
        position: 'absolute',
        top: 16,
        right: 16,
        zIndex: 1,
    },
    closeIcon: {
        backgroundColor: COLORS.surface,
        padding: 8,
        borderRadius: 20,
    },
});

export default WorkoutDetail;
