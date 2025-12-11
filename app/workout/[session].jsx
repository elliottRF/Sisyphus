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
import { Dimensions } from 'react-native';

// --- Helper Components (Optimized for space) ---

const PRBadge = React.memo(({ type }) => {
    let colors = [COLORS.primary, COLORS.secondary];

    if (type === 'VOL') {
        colors = ['#4834d4', '#686de0'];
    } else if (type === 'KG') {
        colors = ['#6ab04c', '#badc58'];
    } else if (type === '1RM') {
        colors = [COLORS.primary, COLORS.secondary];
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
});

const SetNumberBadge = React.memo(({ type, number }) => {
    let style = styles.setNumberDefault;
    let textStyle = styles.setNumberTextDefault;

    if (type === 'W') {
        style = styles.setNumberWarmup;
        textStyle = styles.setNumberTextWarmup;
    } else if (type === 'D') {
        style = styles.setNumberDrop;
        textStyle = styles.setNumberTextDrop;
    }

    return (
        <View style={style}>
            <Text style={textStyle}>{number}</Text>
        </View>
    );
});


// --- Main Component ---

const WorkoutDetail = () => {
    const { session } = useLocalSearchParams();
    const router = useRouter();
    const [workoutDetails, setWorkoutDetails] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exercisesList, setExercises] = useState([]);

    const actionSheetRef = useRef(null);
    const [selectedExerciseId, setSelectedExerciseId] = useState(null);
    const [currentExerciseName, setCurrentExerciseName] = useState(null);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setWorkoutDetails([]);
            setExercises([]);
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
        // Count PRs once per set
        return acc + ((ex.is1rmPR === 1 || ex.isVolumePR === 1 || ex.isWeightPR === 1) ? 1 : 0);
    }, 0);

    return (
        <SafeAreaView style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />

            {/* Header: Back Button and Session Number */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Session #{session}</Text>
                <View style={{ width: 24 }} />
            </View>

            {/* Aggressively Reduced Padding on ScrollView */}
            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Simplified Summary Card (Reduced Vertical Padding) */}
                <View style={styles.summaryCard}>
                    <Text style={styles.workoutName}>{workoutName}</Text>
                    <View style={styles.statsRow}>
                        <View style={styles.statItem}>
                            <Feather name="calendar" size={13} color={COLORS.textSecondary} />
                            <Text style={styles.statText}>{formatDate(workoutDate)}</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statItem}>
                            <Feather name="clock" size={13} color={COLORS.textSecondary} />
                            <Text style={styles.statText}>{formatDuration(workoutDuration)}</Text>
                        </View>
                        {totalPRs > 0 && (
                            <>
                                <View style={styles.statDivider} />
                                <View style={styles.statItem}>
                                    <MaterialCommunityIcons name="trophy" size={13} color={COLORS.primary} />
                                    <Text style={[styles.statText, { color: COLORS.primary, fontFamily: FONTS.bold }]}>
                                        {totalPRs} PR{totalPRs > 1 ? 's' : ''}
                                    </Text>
                                </View>
                            </>
                        )}
                    </View>
                </View>

                {/* Exercises List (Reduced Gap) */}
                <View style={styles.exercisesList}>
                    {groupedExercises.map((exerciseGroup, index) => {
                        const exerciseDetails = exercisesList.find(
                            ex => ex.exerciseID === exerciseGroup[0].exerciseID
                        );
                        const exerciseName = exerciseDetails ? exerciseDetails.name : `Exercise ${exerciseGroup[0].exerciseID}`;

                        let workingSetCount = 0;
                        const setsWithDisplayNumbers = exerciseGroup.map(set => {
                            let displayNumber = set.setType;
                            if (set.setType === 'N' || !set.setType) {
                                workingSetCount++;
                                displayNumber = workingSetCount;
                            }
                            return { ...set, displayNumber: displayNumber };
                        });

                        // Get note from any set (assuming notes are usually consistent per exercise in a session)
                        const exerciseNote = exerciseGroup.find(e => e.notes)?.notes;

                        return (
                            <View key={index} style={styles.exerciseCard}>
                                {/* Exercise Header (Reduced Vertical Padding) */}
                                <TouchableOpacity
                                    activeOpacity={0.8}
                                    onPress={() => showExerciseInfo(exerciseGroup[0].exerciseID, exerciseName)}
                                    style={styles.exerciseHeader}
                                >
                                    <Text style={styles.exerciseName}>{exerciseName}</Text>
                                    <Feather name="chevron-right" size={16} color={COLORS.primary} />
                                </TouchableOpacity>

                                {/* Note Section (Reduced Vertical Padding and smaller text) */}
                                {exerciseNote && (
                                    <View style={styles.noteContainer}>
                                        <MaterialCommunityIcons name="comment-text-outline" size={12} color={COLORS.textSecondary} style={{ marginTop: 2 }} />
                                        <Text style={styles.noteText}>{exerciseNote}</Text>
                                    </View>
                                )}

                                <View style={styles.setsContainer}>
                                    {/* Sets Header Row (Minimum Padding) */}
                                    <View style={styles.setsHeaderRow}>
                                        <Text style={[styles.colHeader, styles.colHeaderSet]}>SET</Text>
                                        <Text style={[styles.colHeader, styles.colHeaderKg]}>KG</Text>
                                        <Text style={[styles.colHeader, styles.colHeaderReps]}>REPS</Text>
                                        <Text style={[styles.colHeader, styles.colHeader1RM]}>1RM</Text>
                                        <View style={styles.colHeaderPRs} />
                                    </View>

                                    {setsWithDisplayNumbers.map((set, setIndex) => {
                                        const isPR = set.is1rmPR === 1 || set.isVolumePR === 1 || set.isWeightPR === 1;
                                        const setType = set.setType || 'N';

                                        return (
                                            // Set Row (Aggressively reduced Vertical Padding)
                                            <View key={setIndex} style={[
                                                styles.setRow,
                                                setIndex % 2 === 1 && styles.setRowOdd,
                                                isPR && styles.setRowPR,
                                            ]}>
                                                <SetNumberBadge type={setType} number={set.displayNumber} />
                                                <Text style={styles.setWeight}>{set.weight}</Text>
                                                <Text style={styles.setReps}>{set.reps}</Text>
                                                <Text style={styles.setOneRM}>{set.oneRM ? Math.round(set.oneRM) : '-'}</Text>

                                                {/* PR Container (Minimized width) */}
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

            {/* Action Sheet for Exercise History */}
            <ActionSheet
                ref={actionSheetRef}
                enableGestureBack={true}
                closeOnPressBack={true}
                androidCloseOnBackPress={true}
                containerStyle={styles.actionSheetContainer}
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


// --- Refined Styles (HIGH DENSITY OPTIMIZATION) ---

// Define the base style object outside of StyleSheet.create
const setNumberBaseStyle = {
    width: 35, // Reduced width
    height: 20, // Reduced height
    alignItems: 'center',
    justifyContent: 'center',
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
        paddingVertical: 10, // Reduced padding
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
        backgroundColor: COLORS.surface,
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 17, // Slightly reduced font size
        fontFamily: FONTS.bold,
        color: COLORS.text,
    },
    scrollContent: {
        padding: 12, // Reduced padding
        paddingBottom: 40,
    },

    // Summary Card (Reduced Vertical Padding)
    summaryCard: {
        backgroundColor: COLORS.surface,
        borderRadius: 12,
        padding: 12, // Reduced padding
        marginBottom: 12, // Reduced margin
        borderWidth: 1,
        borderColor: COLORS.border,
        ...SHADOWS.small,
    },
    workoutName: {
        fontSize: 17, // Reduced font size
        fontFamily: FONTS.semiBold,
        color: COLORS.text,
        marginBottom: 8, // Reduced margin
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
    },
    statItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    statText: {
        fontSize: 12, // Reduced font size
        fontFamily: FONTS.medium,
        color: COLORS.textSecondary,
    },
    statDivider: {
        width: 1,
        height: 12,
        backgroundColor: COLORS.border,
        opacity: 0.5,
    },

    // Exercise List
    exercisesList: {
        gap: 10, // Reduced gap between exercises
    },
    exerciseCard: {
        backgroundColor: COLORS.surface,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    // Exercise Header (Reduced Vertical Padding)
    exerciseHeader: {
        paddingHorizontal: 12,
        paddingVertical: 10, // Reduced padding
        backgroundColor: 'rgba(255,255,255,0.03)',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    exerciseName: {
        fontSize: 15, // Reduced font size
        fontFamily: FONTS.semiBold,
        color: COLORS.text,
        flex: 1,
    },

    // Note Section (Reduced Padding and Smaller Icon/Text)
    noteContainer: {
        flexDirection: 'row',
        paddingHorizontal: 12,
        paddingTop: 8, // Reduced padding
        paddingBottom: 4, // Reduced padding
        gap: 6, // Reduced gap
        backgroundColor: 'rgba(255, 253, 203, 0.05)',
    },
    noteText: {
        flex: 1,
        fontSize: 11, // Smaller font size
        color: COLORS.textSecondary,
        fontFamily: FONTS.regular,
        fontStyle: 'italic',
        lineHeight: 16, // Reduced line height
    },

    // Set Table
    setsContainer: {
        paddingVertical: 2, // Reduced padding
        paddingHorizontal: 10,
    },
    setsHeaderRow: {
        flexDirection: 'row',
        paddingVertical: 6, // Reduced padding
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    colHeader: {
        fontSize: 10,
        fontFamily: FONTS.medium,
        color: COLORS.textSecondary,
        textTransform: 'uppercase',
        textAlign: 'center',
    },
    // Column widths for alignment
    colHeaderSet: { width: 40 },
    colHeaderKg: { flex: 1 },
    colHeaderReps: { flex: 1 },
    colHeader1RM: { flex: 1 },
    colHeaderPRs: { width: 55 }, // Increased slightly for badges

    // Set Row (Aggressively reduced vertical padding)
    setRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 5, // Aggressively reduced padding
    },
    setRowOdd: {
        backgroundColor: 'rgba(255,255,255,0.01)',
    },
    setRowPR: {
        backgroundColor: 'rgba(64, 186, 173, 0.15)',
    },

    // Set Number Badges (FIXED & Reduced size)
    setNumberDefault: {
        ...setNumberBaseStyle,
    },
    setNumberWarmup: {
        ...setNumberBaseStyle,
        backgroundColor: 'rgba(253, 203, 110, 0.15)',
        borderRadius: 4,
        marginRight: 4,
    },
    setNumberDrop: {
        ...setNumberBaseStyle,
        backgroundColor: 'rgba(116, 185, 255, 0.15)',
        borderRadius: 4,
        marginRight: 4,
    },
    setNumberTextDefault: {
        fontSize: 13, // Reduced font size
        fontFamily: FONTS.regular,
        color: COLORS.textSecondary,
    },
    setNumberTextWarmup: {
        fontSize: 13,
        fontFamily: FONTS.medium,
        color: COLORS.warning,
    },
    setNumberTextDrop: {
        fontSize: 13,
        fontFamily: FONTS.medium,
        color: COLORS.secondary,
    },

    // Set Values (Reduced font size)
    setWeight: {
        flex: 1,
        textAlign: 'center',
        fontSize: 14, // Reduced font size
        fontFamily: FONTS.semiBold,
        color: COLORS.text,
    },
    setReps: {
        flex: 1,
        textAlign: 'center',
        fontSize: 14, // Reduced font size
        fontFamily: FONTS.semiBold,
        color: COLORS.text,
    },
    setOneRM: {
        flex: 1,
        textAlign: 'center',
        fontSize: 12, // Reduced font size
        fontFamily: FONTS.medium,
        color: COLORS.textSecondary,
    },

    // PR Badge Container
    prContainer: {
        width: 55, // Fixed width
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 3, // Reduced gap
        alignItems: 'center',
    },
    miniPrBadge: {
        paddingHorizontal: 4,
        paddingVertical: 1, // Reduced vertical padding
        borderRadius: 4,
    },
    miniPrText: {
        fontSize: 8, // Minimum font size for readability
        fontFamily: FONTS.bold,
        color: '#fff',
    },

    // Action Sheet
    actionSheetContainer: {
        height: '94%',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        backgroundColor: COLORS.surface,
    },
});

export default WorkoutDetail;