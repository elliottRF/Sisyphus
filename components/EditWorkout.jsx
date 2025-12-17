import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, Platform, KeyboardAvoidingView, ScrollView, LayoutAnimation } from 'react-native'
import Animated, { LinearTransition } from 'react-native-reanimated';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView, Gesture } from 'react-native-gesture-handler';
import ReorderableList, { reorderItems } from 'react-native-reorderable-list';
import * as Haptics from 'expo-haptics';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AntDesign, Feather, Ionicons, MaterialIcons } from '@expo/vector-icons';

import { Dimensions } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';

import {
    fetchExercises,
    getLatestWorkoutSession,
    insertWorkoutHistory, // Used for saving edited workout
    calculateIfPR,
    setupDatabase,
    getExercisePRs,
    fetchWorkoutData, // <--- New function to fetch historical data
    updateWorkoutHistory // <--- New function to update historical data
} from '../components/db';


import ExerciseEditable from '../components/exerciseEditable'

import ActionSheet from "react-native-actions-sheet";
import ExerciseHistory from "../components/exerciseHistory"


import FilteredExerciseList from '../components/FilteredExerciseList';
import { FONTS, SHADOWS } from '../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
// RestTimer and Timer are explicitly excluded as per your request.

// Assume this component receives the sessionNumber (ID of the workout to edit) via props or route params
const EditWorkout = ({ sessionNumber, onSaveSuccess, onCancel }) => {
    // Replace with your actual route/prop retrieval logic for sessionNumber
    const WORKOUT_SESSION_NUMBER = sessionNumber || 1;

    const { theme } = useTheme();
    const styles = getStyles(theme);

    const [exercises, setExercises] = useState([]);
    const [currentWorkout, setCurrentWorkout] = useState([]);
    const [workoutTitle, setWorkoutTitle] = useState(""); // Will be loaded from DB
    const [originalStartTime, setOriginalStartTime] = useState(null); // Loaded from DB
    const [originalDurationMinutes, setOriginalDurationMinutes] = useState(0); // Loaded from DB

    // UI State
    const [selectedExerciseId, setSelectedExerciseId] = useState(null);
    const [currentExerciseName, setCurrentExerciseName] = useState(null);
    const actionSheetRef = useRef(null);
    const exerciseInfoActionSheetRef = useRef(null);
    const listRef = useRef(null);

    NavigationBar.setBackgroundColorAsync(theme.background);

    // --- Utility Functions (Copied/Modified from Current.js) ---

    const calculateOneRepMax = (weight, reps) => {
        let oneRepMax;
        if (reps === 0) {
            oneRepMax = 0;
        } else if (reps === 1) {
            oneRepMax = weight;
        } else {
            oneRepMax = weight * (1 + reps / 30);
        }
        return Math.round(oneRepMax * 100) / 100; // Truncates to 2 decimal places
    };

    const inputExercise = (item) => {
        actionSheetRef.current?.hide();

        const uniqueId = Date.now().toString() + Math.random().toString(36).substr(2, 9);

        // For an edited workout, we add the new exercise at the end
        setCurrentWorkout((prevWorkouts) => [
            ...prevWorkouts,
            {
                id: uniqueId,
                exercises: [
                    {
                        exerciseID: item.exerciseID,
                        sets: [
                            {
                                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                                weight: null,
                                reps: null,
                                setType: 'N', // Normal
                                completed: false, // Ensure new sets are marked as incomplete by default
                            }
                        ],
                        notes: '' // Initialize notes
                    }
                ]
            }
        ]);
    };

    const plusButtonShowExerciseList = () => {
        fetchExercises()
            .then(data => setExercises(data))
            .catch(err => console.error(err));

        actionSheetRef.current?.show();
    };

    const showExerciseInfo = (exerciseDetails) => {
        if (exerciseDetails) {
            setSelectedExerciseId(exerciseDetails.exerciseID);
            setCurrentExerciseName(exerciseDetails.name);
            exerciseInfoActionSheetRef.current?.show();
        }
    };

    // Handler for when reordering completes
    const handleReorder = useCallback(({ from, to }) => {
        setCurrentWorkout((prevWorkout) => reorderItems(prevWorkout, from, to));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, []);

    // Render function for each item (Same as Current.js)
    const renderItem = useCallback(({ item, index }) => {
        return (
            <View collapsable={false} style={styles.exerciseWrapper}>
                {item.exercises.map((exercise, exerciseIndex) => {
                    const exerciseDetails = exercises.find(
                        (e) => e.exerciseID === exercise.exerciseID
                    );

                    return (
                        <ExerciseEditable
                            exerciseID={exercise.exerciseID}
                            workoutID={item.id}
                            key={exerciseIndex}
                            exercise={exercise}
                            exerciseName={exerciseDetails ? exerciseDetails.name : 'Unknown Exercise'}
                            updateCurrentWorkout={setCurrentWorkout}
                            onOpenDetails={() => showExerciseInfo(exerciseDetails)}
                            simultaneousHandlers={listRef}
                        />
                    );
                })}
            </View>
        );
    }, [setCurrentWorkout, exercises]);

    // Pan gesture configuration to work with swipeable rows
    const panGesture = useMemo(
        () => Gesture.Pan().activeOffsetX([-20, 20]).activeOffsetY([0, 0]),
        []
    );


    // --- Core Logic for Saving/Updating the Workout ---

    const saveWorkout = useCallback(async () => {
        console.log("saveWorkout called (Edit). State length:", currentWorkout.length);
        try {
            if (!currentWorkout || !currentWorkout.length) {
                console.log("No workout data to save");
                Alert.alert("Error", "Workout is empty. Cannot save.");
                return;
            }

            // Filter out sets with null weight or reps and incomplete sets
            const filteredWorkout = currentWorkout.map(exerciseGroup => ({
                ...exerciseGroup,
                exercises: exerciseGroup.exercises.map(exercise => ({
                    ...exercise,
                    sets: exercise.sets.filter(set =>
                        set.weight !== null && set.reps !== null && set.completed
                    )
                }))
            }));

            const workoutEntries = [];
            let globalExerciseNum = 1;

            // --- STEP 1: Determine the maximums for each exercise in this workout ---
            // (Same logic as in Current.js endWorkout for PR calculation)
            // Maps to store: { exerciseID: maxVal_in_this_workout }
            const maxOneRmsInWorkout = new Map();
            const maxVolumesInWorkout = new Map();
            const maxWeightsInWorkout = new Map();

            for (const exerciseGroup of filteredWorkout) {
                for (const exercise of exerciseGroup.exercises) {
                    let maxOneRM = 0;
                    let maxVolume = 0;
                    let maxWeight = 0;
                    let maxRepsAtMaxWeight = 0;

                    for (const set of exercise.sets) {
                        const calculatedOneRM = calculateOneRepMax(
                            parseFloat(set.weight),
                            parseInt(set.reps)
                        );
                        if (calculatedOneRM > maxOneRM) maxOneRM = calculatedOneRM;

                        const volume = parseFloat(set.weight) * parseInt(set.reps);
                        if (volume > maxVolume) maxVolume = volume;

                        const weight = parseFloat(set.weight);
                        const reps = parseInt(set.reps);
                        if (reps > 0) {
                            if (weight > maxWeight) {
                                maxWeight = weight;
                                maxRepsAtMaxWeight = reps;
                            } else if (weight === maxWeight && reps > maxRepsAtMaxWeight) {
                                maxRepsAtMaxWeight = reps;
                            }
                        }
                    }
                    maxOneRmsInWorkout.set(exercise.exerciseID, maxOneRM);
                    maxVolumesInWorkout.set(exercise.exerciseID, maxVolume);
                    maxWeightsInWorkout.set(exercise.exerciseID, { weight: maxWeight, reps: maxRepsAtMaxWeight });
                }
            }
            // --------------------------------------------------------------------------

            // --- STEP 2: Iterate again, calculate PR status, and prepare entries for UPDATE ---
            // Note: The PR calculation needs to check against the ALL-TIME PRs, not just this edited workout's maxes.

            // We need to fetch ALL PRs *before* inserting/updating to correctly mark the new/edited set PRs. 
            // The updateWorkoutHistory function handles clearing old PR flags and setting new ones.

            for (const exerciseGroup of filteredWorkout) {
                for (const exercise of exerciseGroup.exercises) {
                    let setNum = 1;

                    // Retrieve the maximums achieved for this exercise in the current workout
                    const maxOneRMForExercise = maxOneRmsInWorkout.get(exercise.exerciseID);
                    const maxVolumeForExercise = maxVolumesInWorkout.get(exercise.exerciseID);
                    const maxWeightInfo = maxWeightsInWorkout.get(exercise.exerciseID);

                    // Fetch historical bests (will fetch the *current* all-time best)
                    const historicalPRs = await getExercisePRs(exercise.exerciseID);

                    // Check if *this* workout's bests surpass the historical ALL-TIME bests
                    const isOverall1rmPR = maxOneRMForExercise > historicalPRs.maxOneRM;
                    const isOverallVolumePR = maxVolumeForExercise > historicalPRs.maxVolume;
                    const isOverallWeightPR =
                        maxWeightInfo.weight > historicalPRs.maxWeight ||
                        (maxWeightInfo.weight === historicalPRs.maxWeight && maxWeightInfo.reps > historicalPRs.maxRepsAtMaxWeight);

                    let pr1rmAssigned = false;
                    let prVolumeAssigned = false;
                    let prWeightAssigned = false;

                    for (const set of exercise.sets) {
                        const calculatedOneRM = calculateOneRepMax(
                            parseFloat(set.weight),
                            parseInt(set.reps)
                        );
                        const volume = parseFloat(set.weight) * parseInt(set.reps);
                        const weight = parseFloat(set.weight);
                        const reps = parseInt(set.reps);

                        // Determine if this specific set is the PR-setting set
                        let is1rmPR = 0;
                        if (!pr1rmAssigned && calculatedOneRM === maxOneRMForExercise && isOverall1rmPR) {
                            is1rmPR = 1;
                            pr1rmAssigned = true;
                        }

                        let isVolumePR = 0;
                        if (!prVolumeAssigned && volume === maxVolumeForExercise && isOverallVolumePR) {
                            isVolumePR = 1;
                            prVolumeAssigned = true;
                        }

                        let isWeightPR = 0;
                        if (!prWeightAssigned && reps > 0 && weight === maxWeightInfo.weight && reps === maxWeightInfo.reps && isOverallWeightPR) {
                            isWeightPR = 1;
                            prWeightAssigned = true;
                        }

                        const isPR = is1rmPR; // Legacy PR flag

                        // Prepare entry for database update
                        workoutEntries.push({
                            workoutSession: WORKOUT_SESSION_NUMBER, // Important: Use the original session number
                            exerciseNum: globalExerciseNum, // This will be recalculated based on the new order
                            setNum: setNum,
                            exerciseID: exercise.exerciseID,
                            weight: set.weight,
                            reps: set.reps,
                            oneRM: calculatedOneRM,
                            time: originalStartTime, // Keep original time for history/sorting consistency
                            name: workoutTitle, // Use the new title
                            pr: isPR,
                            setType: set.setType || 'N',
                            notes: exercise.notes || '',
                            is1rmPR: is1rmPR,
                            isVolumePR: isVolumePR,
                            isWeightPR: isWeightPR
                        });

                        setNum++;
                    }

                    globalExerciseNum++;
                }
            }

            // Call a new DB function to handle the update
            // This function should:
            // 1. Delete all existing records for WORKOUT_SESSION_NUMBER
            // 2. Insert the new/edited workoutEntries
            // 3. Update the session summary table (title, duration)
            await updateWorkoutHistory(workoutEntries, workoutTitle, originalDurationMinutes, WORKOUT_SESSION_NUMBER);

            Alert.alert("Success", "Workout updated successfully!");
            onSaveSuccess && onSaveSuccess(); // Callback to navigate away

        }
        catch (error) {
            console.error("Error saving edited workout:", error);
            Alert.alert("Error", "Could not save workout. Please check console.");
        }
    }, [currentWorkout, workoutTitle, originalStartTime, originalDurationMinutes, WORKOUT_SESSION_NUMBER, onSaveSuccess]);


    // --- Data Loading Effect ---

    useEffect(() => {
        const loadWorkout = async () => {
            // 1. Load available exercises for the list (same as Current.js)
            fetchExercises()
                .then(data => setExercises(data))
                .catch(err => console.error(err));

            setupDatabase().catch(err => console.error("DB Setup Error:", err));

            // 2. Load the specific workout session from the database
            try {
                const sessionData = await fetchWorkoutData(WORKOUT_SESSION_NUMBER);

                if (sessionData && sessionData.workout.length > 0) {
                    const { workout, title, startTime, durationMinutes } = sessionData;

                    // Group sets by exercise/group (similar structure to currentWorkout state)
                    const groupedWorkout = [];
                    let currentExerciseGroup = null;

                    workout.forEach(dbEntry => {
                        const exerciseId = dbEntry.exerciseID;

                        // Check if this set belongs to the current exercise group
                        // In a simple log, each set is a row. We need to reconstruct the list structure.
                        // Assuming exerciseNum can be used as a grouping ID for simplicity
                        if (!currentExerciseGroup || currentExerciseGroup.exerciseNum !== dbEntry.exerciseNum) {
                            // Start a new exercise group (treating each unique exerciseNum as a group/reorderable item)
                            currentExerciseGroup = {
                                id: dbEntry.exerciseNum.toString(), // Unique ID for ReorderableList
                                exerciseNum: dbEntry.exerciseNum,
                                exercises: [{
                                    exerciseID: exerciseId,
                                    sets: [],
                                    notes: dbEntry.notes,
                                }],
                            };
                            groupedWorkout.push(currentExerciseGroup);
                        }

                        // Add the set to the current exercise
                        const currentExercise = currentExerciseGroup.exercises[0];
                        currentExercise.sets.push({
                            id: Date.now().toString() + Math.random().toString(36).substr(2, 9), // Generate a temp client-side ID for list keys
                            weight: parseFloat(dbEntry.weight),
                            reps: parseInt(dbEntry.reps),
                            setType: dbEntry.setType || 'N',
                            completed: true, // Mark all loaded sets as completed
                        });
                    });

                    setCurrentWorkout(groupedWorkout);
                    setWorkoutTitle(title || "Edited Workout");
                    setOriginalStartTime(startTime);
                    setOriginalDurationMinutes(durationMinutes);

                } else {
                    Alert.alert("Error", "Workout not found or is empty.");
                }
            } catch (error) {
                console.error('Error loading workout from DB:', error);
                Alert.alert("Error", "Could not load workout history.");
            }
        };

        loadWorkout();
    }, [WORKOUT_SESSION_NUMBER]);

    // --- UI Rendering ---

    const isDynamic = theme.type === 'dynamic';
    const safeSurface = isDynamic ? '#1e1e1e' : theme.surface;
    const safePrimary = isDynamic ? '#2DC4B6' : theme.primary;
    const safeText = isDynamic ? '#FFFFFF' : theme.text;
    const safeBorder = isDynamic ? 'rgba(255,255,255,0.1)' : theme.border;
    const safeDanger = isDynamic ? '#FF4444' : theme.danger;

    const ButtonBackground = ({ children, style }) => {
        if (isDynamic) {
            return (
                <View style={[style, { backgroundColor: safePrimary, alignItems: 'center', justifyContent: 'center' }]}>
                    {children}
                </View>
            );
        }
        return (
            <LinearGradient
                colors={[theme.primary, theme.secondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={style}
            >
                {children}
            </LinearGradient>
        );
    };


    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>

                {/* Header for Editing */}
                <View style={styles.headerContainer}>
                    <View style={styles.headerTopRow}>
                        <TextInput
                            style={styles.workoutTitleInput}
                            onChangeText={setWorkoutTitle}
                            value={workoutTitle}
                            placeholder="Workout Name"
                            placeholderTextColor={theme.textSecondary}
                            keyboardType="text"
                        />
                        {/* Status (No Timer/Rest Timer) */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            {originalStartTime && (
                                <Text style={styles.headerStatusText}>
                                    {new Date(originalStartTime).toLocaleDateString()}
                                </Text>
                            )}
                            <Text style={styles.headerStatusText}>
                                {originalDurationMinutes} min
                            </Text>
                        </View>
                    </View>
                    <View style={styles.headerDivider} />
                </View>

                <ReorderableList
                    ref={listRef}
                    data={currentWorkout}
                    onReorder={handleReorder}
                    keyExtractor={(item) => String(item.id)}
                    renderItem={renderItem}
                    style={styles.list}
                    contentContainerStyle={{ paddingBottom: 160, paddingHorizontal: 1 }}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    panGesture={panGesture}
                    updateActiveItem
                    ListFooterComponent={
                        <Animated.View layout={LinearTransition.springify()} style={styles.footer}>
                            <TouchableOpacity
                                style={styles.addExerciseButton}
                                onPress={plusButtonShowExerciseList}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.addExerciseText}>Add Exercise</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={saveWorkout}
                                activeOpacity={0.8}
                                style={styles.finishButtonContainer}
                            >
                                <ButtonBackground style={styles.finishButton}>
                                    <Text style={styles.finishButtonText}>Save Changes</Text>
                                </ButtonBackground>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={onCancel} // Use a cancel callback
                                activeOpacity={0.7}
                                style={styles.clearButton}
                            >
                                <Text style={styles.clearButtonText}>Cancel Edit</Text>
                            </TouchableOpacity>
                        </Animated.View>
                    }
                />

                <FilteredExerciseList
                    exercises={exercises}
                    actionSheetRef={actionSheetRef}
                    setCurrentWorkout={setCurrentWorkout}
                    // For editing, inputExercise is used, which manually updates state
                    inputExercise={inputExercise}
                />

                <ActionSheet
                    ref={exerciseInfoActionSheetRef}
                    enableGestureBack={true}
                    closeOnPressBack={true}
                    androidCloseOnBackPress={true}
                    containerStyle={{ height: '100%', backgroundColor: safeSurface, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}
                    indicatorStyle={{ backgroundColor: isDynamic ? '#aaaaaa' : theme.textSecondary }}
                    snapPoints={[100]}
                    initialSnapIndex={0}
                >
                    <ExerciseHistory
                        exerciseID={selectedExerciseId}
                        exerciseName={currentExerciseName}
                    />
                </ActionSheet>
            </SafeAreaView>
        </GestureHandlerRootView>
    );
};


const getStyles = (theme) => {
    const isDynamic = theme.type === 'dynamic';
    const safePrimary = isDynamic ? '#2DC4B6' : theme.primary;
    const safeText = isDynamic ? '#FFFFFF' : theme.text;
    const safeBorder = isDynamic ? 'rgba(255,255,255,0.1)' : theme.border;
    const safeDanger = isDynamic ? '#FF4444' : theme.danger;

    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: theme.background,
        },
        list: {
            flex: 1,
        },
        // Removed startContainer/emptyState styles as they are not needed for editing
        headerContainer: {
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 8,
            backgroundColor: theme.background,
            zIndex: 10,
        },
        headerTopRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
        },
        workoutTitleInput: {
            flex: 1,
            fontSize: 20,
            fontFamily: FONTS.bold,
            color: safeText,
            marginRight: 16,
        },
        headerStatusText: {
            fontSize: 14,
            fontFamily: FONTS.medium,
            color: theme.textSecondary,
        },
        headerDivider: {
            height: 1,
            backgroundColor: safeBorder,
            opacity: 0.5,
        },
        exerciseWrapper: {
            marginBottom: 0,
        },
        addExerciseButton: {
            backgroundColor: 'rgba(255,255,255,0.05)',
            paddingVertical: 16,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 24,
            borderWidth: 1,
            borderColor: safeBorder,
            borderStyle: 'dashed',
        },
        addExerciseText: {
            color: safePrimary,
            fontSize: 16,
            fontFamily: FONTS.semiBold,
        },
        finishButtonContainer: {
            marginBottom: 16,
            borderRadius: 12,
            ...SHADOWS.medium,
        },
        finishButton: {
            paddingVertical: 16,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
        },
        finishButtonText: {
            fontSize: 18,
            fontFamily: FONTS.bold,
            color: safeText,
            letterSpacing: 0.5,
        },
        clearButton: {
            paddingVertical: 12,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 8,
        },
        clearButtonText: {
            fontSize: 15,
            fontFamily: FONTS.medium,
            color: theme.textSecondary, // Changed color from danger to a neutral color for 'Cancel'
            opacity: 0.8,
        },
        footer: {
            padding: 16,
        },
    });
};

export default EditWorkout;

// You will also need to update your '../components/db' file
// with the placeholder functions used:
// 1. fetchWorkoutData(sessionNumber)
// 2. updateWorkoutHistory(workoutEntries, workoutTitle, durationMinutes, sessionNumber)