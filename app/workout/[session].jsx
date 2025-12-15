import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import React, { useState, useEffect, useRef } from 'react';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchWorkoutHistoryBySession, fetchExercises } from '../../components/db';
import { FONTS, SHADOWS } from '../../constants/theme';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import ActionSheet from "react-native-actions-sheet";
import ExerciseHistory from '../../components/exerciseHistory';
import { useTheme } from '../../context/ThemeContext';

const PRBadge = React.memo(({ type }) => {
    // Fixed: Use MaterialCommunityIcons for Trophy
    const iconName = "trophy";
    let label = "PR";

    // Logic: Distinction in Text, Unity in Color
    if (type === '1RM') label = "1RM";
    if (type === 'VOL') label = "Vol.";
    if (type === 'KG') label = "Weight";

    const color = '#FFD700'; // Gold
    const bgColor = 'rgba(255, 215, 0, 0.15)'; // Low opacity gold
    const borderColor = 'rgba(255, 215, 0, 0.3)';

    // Note: Styles for this are passed or computed? 
    // Since getStyles is inside main component, we can't use it easily here unless we pass styles prop or use inline.
    // I'll stick to a small static style object for the badge layout/text, but colors are inline.
    return (
        <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 6,
            paddingVertical: 1,
            borderRadius: 4,
            borderWidth: 1,
            gap: 3,
            marginRight: 6,
            backgroundColor: bgColor,
            borderColor: borderColor
        }}>
            <MaterialCommunityIcons name={iconName} size={10} color={color} />
            <Text style={{ fontSize: 9, fontFamily: FONTS.bold, color: color }}>{label}</Text>
        </View>
    );
});

const SetNumberBadge = React.memo(({ type, number, theme }) => {
    let containerStyle = {
        width: 20,
        height: 18,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 4,
        marginRight: 8,
    };
    let TextStyle = {
        fontSize: 11,
        fontFamily: FONTS.medium,
    };

    if (type === 'W') {
        containerStyle.backgroundColor = 'rgba(253, 203, 110, 0.15)';
        TextStyle.color = theme.warning;
    } else if (type === 'D') {
        containerStyle.backgroundColor = 'rgba(116, 185, 255, 0.15)';
        TextStyle.color = theme.info;
    } else {
        // Default
        TextStyle.color = theme.textSecondary;
    }

    return (
        <View style={containerStyle}>
            <Text style={TextStyle}>{number}</Text>
        </View>
    );
});


// --- Main Component ---

const WorkoutDetail = () => {
    const { session } = useLocalSearchParams();
    const router = useRouter();
    const { theme } = useTheme();
    const styles = getStyles(theme);

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
            weekday: 'long',
            month: 'long',
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

    const showExerciseInfo = (exerciseId, exerciseName) => {
        setSelectedExerciseId(exerciseId);
        setCurrentExerciseName(exerciseName);
        actionSheetRef.current?.show();
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <ActivityIndicator size="large" color={theme.primary} />
            </SafeAreaView>
        );
    }

    if (!workoutDetails || workoutDetails.length === 0) {
        return (
            <SafeAreaView style={styles.container}>
                {/* Fixed: Back Button Overlay logic with dynamic theme */}
                <TouchableOpacity onPress={() => router.back()} style={styles.backButtonOver}>
                    <Ionicons name="arrow-back" size={24} color={theme.text} />
                </TouchableOpacity>
                <View style={[styles.header, { justifyContent: 'center', marginTop: 60 }]}>
                    <Text style={styles.title}>Workout Not Found</Text>
                </View>
            </SafeAreaView>
        );
    }

    const workoutName = workoutDetails[0].name;
    const workoutDate = workoutDetails[0].time;
    const workoutDuration = workoutDetails[0].duration;
    const groupedExercises = groupExercisesByName(workoutDetails);

    // Calculate total PRs (Matching History Logic: counting individual records, not just sets)
    const totalPRs = workoutDetails.reduce((acc, ex) => {
        return acc + (ex.is1rmPR || 0) + (ex.isVolumePR || 0) + (ex.isWeightPR || 0);
    }, 0);

    return (
        <SafeAreaView style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />


            <ScrollView contentContainerStyle={styles.scrollContent}>

                {/* New Sleek Header (Replaces Summary Card) */}
                <View style={styles.sleekHeaderContainer}>
                    <TouchableOpacity
                        style={styles.editIcon}
                        onPress={() => console.log('Edit Pressed')} // Add your navigation/action here
                        activeOpacity={0.7}
                    >
                        <Feather name="edit" size={24} color={theme.text} />
                    </TouchableOpacity>
                    <Text style={styles.workoutDateDisplay}>{formatDate(workoutDate)}</Text>
                    <Text style={styles.workoutNameHuge}>{workoutName}</Text>

                    <View style={styles.metaDataRow}>
                        <View style={styles.metaItem}>
                            <Feather name="clock" size={14} color={theme.text} />
                            <Text style={styles.metaText}>{formatDuration(workoutDuration)}</Text>
                        </View>
                        {totalPRs > 0 && (
                            <View style={[styles.metaItem, { borderColor: 'rgba(255, 215, 0, 0.3)', backgroundColor: 'rgba(255, 215, 0, 0.05)' }]}>
                                <MaterialCommunityIcons name="trophy" size={14} color={'#FFD700'} />
                                <Text style={[styles.metaText, { color: '#FFD700', fontFamily: FONTS.bold }]}>
                                    {totalPRs} New PR{totalPRs > 1 ? 's' : ''}
                                </Text>
                            </View>
                        )}
                    </View>
                </View>

                {/* Exercises List */}
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

                        // Get note from any set
                        const exerciseNote = exerciseGroup.find(e => e.notes)?.notes;

                        return (
                            <View key={index} style={styles.exerciseCard}>
                                {/* Exercise Header */}
                                <TouchableOpacity
                                    activeOpacity={0.8}
                                    onPress={() => showExerciseInfo(exerciseGroup[0].exerciseID, exerciseName)}
                                    style={styles.exerciseHeader}
                                >
                                    <Text style={styles.exerciseName}>{exerciseName}</Text>
                                    <Feather name="chevron-right" size={18} color={theme.textSecondary} />
                                </TouchableOpacity>

                                {/* Note Section */}
                                {exerciseNote && (
                                    <View style={styles.noteContainer}>
                                        <MaterialCommunityIcons name="comment-text-outline" size={12} color={theme.textSecondary} style={{ marginTop: 2 }} />
                                        <Text style={styles.noteText}>{exerciseNote}</Text>
                                    </View>
                                )}

                                <View style={styles.setsContainer}>
                                    {/* Sets Header Row */}
                                    <View style={styles.setsHeaderRow}>
                                        <Text style={[styles.colHeader, styles.colHeaderSet]}>SET</Text>
                                        <Text style={[styles.colHeader, styles.colHeaderKg]}>KG</Text>
                                        <Text style={[styles.colHeader, styles.colHeaderReps]}>REPS</Text>
                                        <Text style={[styles.colHeader, styles.colHeader1RM]}>1RM</Text>
                                    </View>

                                    {setsWithDisplayNumbers.map((set, setIndex) => {
                                        const isPR = set.is1rmPR === 1 || set.isVolumePR === 1 || set.isWeightPR === 1;
                                        const setType = set.setType || 'N';

                                        return (
                                            // Set Row Container
                                            <View key={setIndex} style={[
                                                styles.setRowContainer,
                                                setIndex % 2 === 1 && styles.setRowOdd
                                            ]}>
                                                <View style={styles.setRow}>
                                                    <SetNumberBadge type={setType} number={set.displayNumber} theme={theme} />
                                                    <Text style={styles.setWeight}>{set.weight} kg</Text>
                                                    <Text style={styles.setReps}>{set.reps}</Text>
                                                    <Text style={styles.setOneRM}>{set.oneRM ? Math.round(set.oneRM) : '-'}</Text>
                                                </View>

                                                {/* PR Row */}
                                                {isPR && (
                                                    <View style={styles.badgeRow}>
                                                        {/* Indent */}
                                                        <View style={{ width: 32 }} />
                                                        {set.is1rmPR === 1 && <PRBadge type="1RM" />}
                                                        {set.isVolumePR === 1 && <PRBadge type="VOL" />}
                                                        {set.isWeightPR === 1 && <PRBadge type="KG" />}
                                                    </View>
                                                )}
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
                indicatorStyle={styles.indicator}
                snapPoints={[94]}
                initialSnapIndex={0}
            >
                {/* Note: ExerciseHistory needs its own refactor for Theme support, passing theme ID or context usage inside it */}
                <ExerciseHistory
                    exerciseID={selectedExerciseId}
                    exerciseName={currentExerciseName}
                />
            </ActionSheet>
        </SafeAreaView>
    );
};

// --- Styles Generator ---
const getStyles = (theme) => {
    // Safe Colors for Reanimated (ActionSheet)
    const isDynamic = theme.type === 'dynamic';
    const safeSurface = isDynamic ? '#1e1e1e' : theme.surface;
    const safeIndicator = isDynamic ? '#aaaaaa' : theme.textSecondary;

    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: theme.background,
        },
        backButtonOver: {
            // Floating button, keeping static style logic but could theme background?
            // Let's keep it semi-transparent black as it might be over content
            position: 'absolute',
            top: 10,
            left: 16,
            zIndex: 10,
            padding: 8,
            backgroundColor: 'rgba(0,0,0,0.3)',
            borderRadius: 20,
        },
        editIcon: {
            position: 'absolute',
            top: 10, // Adjust this value for vertical spacing
            right: 20, // Adjust this value for horizontal spacing
            zIndex: 10, // Ensures it appears above the ScrollView content
            padding: 5, // Optional: makes the tap target a bit bigger
        },
        scrollContent: {
            paddingTop: 10,
            paddingBottom: 40,
        },

        // Header
        sleekHeaderContainer: {
            paddingHorizontal: 20,
            paddingVertical: 12,
            marginBottom: 16,
        },
        workoutDateDisplay: {
            fontSize: 12,
            fontFamily: FONTS.medium,
            color: theme.textSecondary,
            marginBottom: 2,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
        },
        workoutNameHuge: {
            fontSize: 28,
            fontFamily: FONTS.bold,
            color: theme.text,
            lineHeight: 34,
            marginBottom: 10,
        },
        metaDataRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
        },
        metaItem: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: theme.surface,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: theme.border,
        },
        metaText: {
            fontSize: 12,
            fontFamily: FONTS.medium,
            color: theme.text,
        },

        // Exercise List
        exercisesList: {
            gap: 8,
            paddingHorizontal: 12,
        },
        exerciseCard: {
            backgroundColor: theme.surface,
            borderRadius: 12,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: theme.border,
        },
        exerciseHeader: {
            paddingHorizontal: 12,
            paddingVertical: 10,
            backgroundColor: 'rgba(255,255,255,0.03)',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(255,255,255,0.05)',
        },
        exerciseName: {
            fontSize: 15,
            fontFamily: FONTS.bold,
            color: theme.text,
            flex: 1,
        },
        noteContainer: {
            flexDirection: 'row',
            paddingHorizontal: 12,
            paddingVertical: 6,
            gap: 6,
            backgroundColor: 'rgba(255, 253, 203, 0.05)',
        },
        noteText: {
            flex: 1,
            fontSize: 11,
            color: theme.textSecondary,
            fontFamily: FONTS.regular,
            fontStyle: 'italic',
            lineHeight: 16,
        },

        // Sets Table
        setsContainer: {
            paddingVertical: 2,
        },
        setsHeaderRow: {
            flexDirection: 'row',
            paddingVertical: 6,
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(255,255,255,0.05)',
            paddingHorizontal: 12,
        },
        colHeader: {
            fontSize: 9,
            fontFamily: FONTS.medium,
            color: theme.textSecondary,
            textTransform: 'uppercase',
        },
        colHeaderSet: { width: 32 },
        colHeaderKg: { flex: 1, textAlign: 'center' },
        colHeaderReps: { flex: 1, textAlign: 'center' },
        colHeader1RM: { flex: 1, textAlign: 'center' },

        // Set Rows
        setRowContainer: {
            paddingVertical: 4,
            paddingHorizontal: 12,
        },
        setRow: {
            flexDirection: 'row',
            alignItems: 'center',
        },
        setRowOdd: {
            backgroundColor: 'rgba(255,255,255,0.01)',
        },
        badgeRow: {
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 4,
            flexWrap: 'wrap',
        },
        setWeight: {
            flex: 1,
            textAlign: 'center',
            fontSize: 14,
            fontFamily: FONTS.semiBold,
            color: theme.text,
        },
        setReps: {
            flex: 1,
            textAlign: 'center',
            fontSize: 14,
            fontFamily: FONTS.semiBold,
            color: theme.text,
        },
        setOneRM: {
            flex: 1,
            textAlign: 'center',
            fontSize: 12,
            fontFamily: FONTS.medium,
            color: theme.textSecondary,
        },
        actionSheetContainer: {
            backgroundColor: safeSurface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            height: '94%',
        },
        indicator: {
            backgroundColor: safeIndicator,
        }
    });
};

export default WorkoutDetail;