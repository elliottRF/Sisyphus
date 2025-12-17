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

import { fetchExercises, getLatestWorkoutSession, insertWorkoutHistory, calculateIfPR, setupDatabase, getExercisePRs } from '../components/db';


import ExerciseEditable from '../components/exerciseEditable'

import ActionSheet from "react-native-actions-sheet";
import ExerciseHistory from "../components/exerciseHistory"


import FilteredExerciseList from '../components/FilteredExerciseList';
import { FONTS, SHADOWS } from '../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import Timer from '../components/Timer';
import RestTimer from '../components/RestTimer';
import { useFocusEffect } from 'expo-router';

import TestSoundButton from '../components/TestSoundButton';
import TestNotificationButton from '../components/TestNotificationButton';
import { useTheme } from '../context/ThemeContext';

const Current = () => {
    const { theme } = useTheme();
    const styles = getStyles(theme);

    const [exercises, setExercises] = useState([]);
    const [startTime, setStartTime] = useState(null);

    // Ref for ReorderableList
    const listRef = useRef(null);


    NavigationBar.setBackgroundColorAsync(theme.background);

    const startWorkout = async () => {
        const now = new Date().toISOString();
        setStartTime(now);
        saveStartTimeToAsyncStorage(now);

        fetchExercises()
            .then(data => setExercises(data))
            .catch(err => console.error(err));

        actionSheetRef.current?.show();

    };

    const clearWorkout = async () => {
        setCurrentWorkout([]);
        setStartTime(null);
        await AsyncStorage.removeItem('@currentWorkout');
        await AsyncStorage.removeItem('@workoutStartTime');
    };

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

    const actionSheetRef = useRef(null);
    const exerciseInfoActionSheetRef = useRef(null);

    const [currentWorkout, setCurrentWorkout] = useState([]);
    const [workoutTitle, setWorkoutTitle] = useState("New Workout");
    const [selectedExerciseId, setSelectedExerciseId] = useState(null);
    const [currentExerciseName, setCurrentExerciseName] = useState(null);

    console.log("Render Current. Workout length:", currentWorkout.length);

    const endWorkout = useCallback(async () => {
        console.log("endWorkout called. State length:", currentWorkout.length);
        try {
            const latestSessionQuery = await getLatestWorkoutSession();
            const nextSessionNumber = latestSessionQuery + 1;

            if (!currentWorkout || !currentWorkout.length) {
                console.log("No workout data to save");
                return;
            }

            // Filter out sets with null weight or reps
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
                        // Calculate One Rep Max
                        const calculatedOneRM = calculateOneRepMax(
                            parseFloat(set.weight),
                            parseInt(set.reps)
                        );
                        if (calculatedOneRM > maxOneRM) maxOneRM = calculatedOneRM;

                        // Calculate Volume
                        const volume = parseFloat(set.weight) * parseInt(set.reps);
                        if (volume > maxVolume) maxVolume = volume;

                        // Calculate Weight (ignore 0 reps)
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

            // --- STEP 2: Iterate again, calculate PR status, and prepare entries ---
            for (const exerciseGroup of filteredWorkout) {
                for (const exercise of exerciseGroup.exercises) {
                    let setNum = 1;

                    // Retrieve the maximums achieved for this exercise in the current workout
                    const maxOneRMForExercise = maxOneRmsInWorkout.get(exercise.exerciseID);
                    const maxVolumeForExercise = maxVolumesInWorkout.get(exercise.exerciseID);
                    const maxWeightInfo = maxWeightsInWorkout.get(exercise.exerciseID);

                    // Fetch historical bests
                    const historicalPRs = await getExercisePRs(exercise.exerciseID);

                    const isOverall1rmPR = maxOneRMForExercise > historicalPRs.maxOneRM;
                    const isOverallVolumePR = maxVolumeForExercise > historicalPRs.maxVolume;

                    // Weight PR: either new max weight OR matching weight with more reps
                    const isOverallWeightPR =
                        maxWeightInfo.weight > historicalPRs.maxWeight ||
                        (maxWeightInfo.weight === historicalPRs.maxWeight && maxWeightInfo.reps > historicalPRs.maxRepsAtMaxWeight);

                    // Track assigned PRs to avoid duplicate badges in the same workout (first set gets priority)
                    let pr1rmAssigned = false;
                    let prVolumeAssigned = false;
                    let prWeightAssigned = false;

                    for (const set of exercise.sets) {
                        // Calculate metrics for the set
                        const calculatedOneRM = calculateOneRepMax(
                            parseFloat(set.weight),
                            parseInt(set.reps)
                        );
                        const volume = parseFloat(set.weight) * parseInt(set.reps);
                        const weight = parseFloat(set.weight);
                        const reps = parseInt(set.reps);

                        // Determine if this specific set is the PR-setting set
                        // Logic: Must match the workout max AND represent an overall PR AND not have been assigned yet
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

                        // Legacy PR flag (1RM)
                        const isPR = is1rmPR;

                        // Prepare entry for database
                        workoutEntries.push({
                            workoutSession: nextSessionNumber,
                            exerciseNum: globalExerciseNum,
                            setNum: setNum,
                            exerciseID: exercise.exerciseID,
                            weight: set.weight,
                            reps: set.reps,
                            oneRM: calculatedOneRM,
                            time: new Date().toISOString(),
                            name: workoutTitle,
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

            // Calculate duration in minutes
            const endTime = Date.now();
            const startTimeMs = startTime ? new Date(startTime).getTime() : endTime;
            const durationMs = endTime - startTimeMs;
            const durationMinutes = Math.floor(durationMs / 60000);

            await insertWorkoutHistory(workoutEntries, workoutTitle, durationMinutes);

            // Clear AsyncStorage and state
            await AsyncStorage.removeItem('@currentWorkout');
            await AsyncStorage.removeItem('@workoutStartTime');
            setCurrentWorkout([]);
            setStartTime(null);
            setWorkoutTitle("New Workout");
            console.log("Workout saved successfully");
        }
        catch (error) {
            console.error("Error saving workout:", error);
        }
    }, [currentWorkout, startTime, workoutTitle]);

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

    const handleCloseExerciseInfo = () => {
        exerciseInfoActionSheetRef.current?.hide();
    };

    const saveWorkoutToAsyncStorage = async (workout) => {
        const dataToSave = {
            workout,
            workoutTitle,
        };

        try {
            await AsyncStorage.setItem('@currentWorkout', JSON.stringify(dataToSave));
        } catch (error) {
            console.error('Error saving workout to AsyncStorage:', error);
        }
    };

    const saveStartTimeToAsyncStorage = async (time) => {
        try {
            await AsyncStorage.setItem('@workoutStartTime', time);
        } catch (error) {
            console.error('Error saving start time:', error);
        }
    };

    useEffect(() => {
        const loadWorkout = async () => {
            fetchExercises()
                .then(data => setExercises(data))
                .catch(err => console.error(err));

            setupDatabase().catch(err => console.error("DB Setup Error:", err));

            try {
                const storedWorkout = await AsyncStorage.getItem('@currentWorkout');
                if (storedWorkout) {
                    const { workout, title } = JSON.parse(storedWorkout);
                    const workoutWithIds = workout.map(item => ({
                        ...item,
                        id: item.id || Date.now().toString() + Math.random().toString(36).substr(2, 9),
                        exercises: item.exercises.map(ex => ({
                            ...ex,
                            sets: ex.sets.map(set => ({
                                ...set,
                                id: set.id || Date.now().toString() + Math.random().toString(36).substr(2, 9)
                            }))
                        }))
                    }));
                    setCurrentWorkout(workoutWithIds);
                    if (title) setWorkoutTitle(title);
                }
                const storedStartTime = await AsyncStorage.getItem('@workoutStartTime');
                if (storedStartTime) {
                    setStartTime(storedStartTime);
                }
            } catch (error) {
                console.error('Error loading workout from AsyncStorage:', error);
            }
        };

        loadWorkout();
    }, []);

    useFocusEffect(
        React.useCallback(() => {
            fetchExercises()
                .then(data => setExercises(data))
                .catch(err => console.error(err));
        }, [])
    );

    useEffect(() => {
        if (currentWorkout.length > 0) {
            saveWorkoutToAsyncStorage(currentWorkout);
        }
    }, [currentWorkout]);

    const inputExercise = (item) => {
        actionSheetRef.current?.hide();

        const uniqueId = Date.now().toString() + Math.random().toString(36).substr(2, 9);

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
                                setType: 'N' // Normal
                            }
                        ],
                        notes: '' // Initialize notes
                    }
                ]
            }
        ]);
    };

    // Handler for when reordering completes
    const handleReorder = useCallback(({ from, to }) => {
        setCurrentWorkout((prevWorkout) => reorderItems(prevWorkout, from, to));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, []);

    // Render function for each item
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


    // Safe Colors for Reanimated / Linear Gradient fallbacks
    const isDynamic = theme.type === 'dynamic';
    const safeSurface = isDynamic ? '#1e1e1e' : theme.surface;
    const safePrimary = isDynamic ? '#2DC4B6' : theme.primary;
    const safeText = isDynamic ? '#FFFFFF' : theme.text;
    const safeBorder = isDynamic ? 'rgba(255,255,255,0.1)' : theme.border;
    const safeDanger = isDynamic ? '#FF4444' : theme.danger;

    // Helper for Button Gradient
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
                {!startTime && currentWorkout.length === 0 && (
                    <View style={styles.startContainer}>
                        <View style={styles.emptyStateContent}>
                            <Feather name="activity" size={64} color={theme.primary} style={{ marginBottom: 24, opacity: 0.8 }} />
                            <Text style={styles.emptyStateTitle}>Ready to train?</Text>
                            <Text style={styles.emptyStateSubtitle}>Start an empty workout or choose a template to begin your session.</Text>

                            <TouchableOpacity onPress={startWorkout} activeOpacity={0.8} style={styles.startWorkoutButtonContainer}>
                                <ButtonBackground style={styles.startButton}>
                                    <Text style={styles.startButtonText}>Start an Empty Workout</Text>
                                </ButtonBackground>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {(startTime || currentWorkout.length > 0) && (
                    <View style={{ flex: 1 }}>
                        {/* Header */}
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
                                {startTime && (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                        <Timer startTime={startTime} />
                                        <RestTimer />
                                    </View>
                                )}
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
                                        onPress={endWorkout}
                                        activeOpacity={0.8}
                                        style={styles.finishButtonContainer}
                                    >
                                        <ButtonBackground style={styles.finishButton}>
                                            <Text style={styles.finishButtonText}>Finish Workout</Text>
                                        </ButtonBackground>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        onPress={() =>
                                            Alert.alert(
                                                "Clear Workout?",
                                                "This will remove all data.",
                                                [
                                                    { text: "Cancel", style: "cancel" },
                                                    { text: "OK", onPress: clearWorkout }
                                                ]
                                            )
                                        }
                                        activeOpacity={0.7}
                                        style={styles.clearButton}
                                    >
                                        <Text style={styles.clearButtonText}>Clear Workout</Text>
                                    </TouchableOpacity>
                                </Animated.View>
                            }
                        />
                    </View>
                )}
                <FilteredExerciseList
                    exercises={exercises}
                    actionSheetRef={actionSheetRef}
                    setCurrentWorkout={setCurrentWorkout}
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
        startContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 32,
        },
        emptyStateContent: {
            alignItems: 'center',
            width: '100%',
        },
        emptyStateTitle: {
            fontSize: 24,
            fontFamily: FONTS.bold,
            color: safeText,
            marginBottom: 12,
            textAlign: 'center',
        },
        emptyStateSubtitle: {
            fontSize: 16,
            fontFamily: FONTS.regular,
            color: theme.textSecondary,
            textAlign: 'center',
            marginBottom: 48,
            lineHeight: 24,
        },
        startWorkoutButtonContainer: {
            width: '100%',
            ...SHADOWS.medium,
        },
        startButton: {
            paddingVertical: 16,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
        },
        startButtonText: {
            color: safeText,
            fontSize: 16,
            fontFamily: FONTS.bold,
        },
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
        headerDivider: {
            height: 1,
            backgroundColor: safeBorder,
            opacity: 0.5,
        },
        scrollContent: {
            padding: 16,
            paddingBottom: 40,
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
            color: safeDanger,
            opacity: 0.8,
        },
        footer: {
            padding: 16,
        },
        restTimerButton: {
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: 'rgba(64, 186, 173, 0.1)',
            alignItems: 'center',
            justifyContent: 'center',
        }
    });
};
export default Current;