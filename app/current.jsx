// Force reload
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, Platform, KeyboardAvoidingView, ScrollView } from 'react-native'
import Animated, { LinearTransition } from 'react-native-reanimated';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AntDesign, Feather, Ionicons } from '@expo/vector-icons';


import * as NavigationBar from 'expo-navigation-bar';

import { fetchExercises, getLatestWorkoutSession, insertWorkoutHistory, calculateIfPR, setupDatabase, getExercisePRs } from '../components/db';


import ExerciseEditable from '../components/exerciseEditable'
import SortableExerciseList from '../components/SortableExerciseList';
import ActionSheet from "react-native-actions-sheet";
import ExerciseHistory from "../components/exerciseHistory"


import FilteredExerciseList from '../components/FilteredExerciseList';
import { COLORS, FONTS, SHADOWS } from '../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import Timer from '../components/Timer';


const Current = () => {

    const [exercises, setExercises] = useState([]);
    const [startTime, setStartTime] = useState(null);


    NavigationBar.setBackgroundColorAsync(COLORS.background);

    const startWorkout = async () => {
        const now = new Date().toISOString();
        setStartTime(now);
        saveStartTimeToAsyncStorage(now);

        fetchExercises()
            .then(data => setExercises(data))
            .catch(err => console.error(err));

        actionSheetRef.current?.show();

    };


    const calculateOneRepMax = (weight, reps) => {
        const oneRepMax = weight * (1 + reps / 30);
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
                        set.weight !== null && set.reps !== null
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
                        const is1rmPR = (calculatedOneRM === maxOneRMForExercise && isOverall1rmPR) ? 1 : 0;
                        const isVolumePR = (volume === maxVolumeForExercise && isOverallVolumePR) ? 1 : 0;

                        // Only mark as Weight PR if it's the exact set with max weight and max reps at that weight
                        const isWeightPR = (reps > 0 && weight === maxWeightInfo.weight && reps === maxWeightInfo.reps && isOverallWeightPR) ? 1 : 0;

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

    const renderItem = useCallback(({ item, drag, isActive, index, simultaneousHandlers }) => {
        return (
            <View key={item.id}>
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
                            drag={drag}
                            isActive={isActive}
                            onOpenDetails={() => showExerciseInfo(exerciseDetails)}
                            simultaneousHandlers={simultaneousHandlers}
                        />
                    );
                })}
            </View>
        );
    }, [setCurrentWorkout, exercises]);


    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
                {!startTime && currentWorkout.length === 0 && (
                    <View style={styles.startContainer}>
                        <View style={styles.emptyStateContent}>
                            <Feather name="activity" size={64} color={COLORS.primary} style={{ marginBottom: 24, opacity: 0.8 }} />
                            <Text style={styles.emptyStateTitle}>Ready to train?</Text>
                            <Text style={styles.emptyStateSubtitle}>Start an empty workout or choose a template to begin your session.</Text>

                            <TouchableOpacity onPress={startWorkout} activeOpacity={0.8} style={styles.startWorkoutButtonContainer}>
                                <LinearGradient
                                    colors={[COLORS.primary, COLORS.secondary]}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={styles.startButton}
                                >
                                    <Text style={styles.startButtonText}>Start an Empty Workout</Text>
                                </LinearGradient>
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
                                    placeholderTextColor={COLORS.textSecondary}
                                    keyboardType="text"
                                />
                                {startTime && <Timer startTime={startTime} />}
                            </View>
                            <View style={styles.headerDivider} />
                        </View>

                        <SortableExerciseList
                            data={currentWorkout}
                            extraData={currentWorkout}
                            onReorder={setCurrentWorkout}
                            contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 16 }}
                            renderItem={renderItem}
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
                                        <LinearGradient
                                            colors={[COLORS.success, '#00cec9']}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 1 }}
                                            style={styles.finishButton}
                                        >
                                            <Text style={styles.finishButtonText}>Finish Workout</Text>
                                        </LinearGradient>
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
                    containerStyle={{
                        height: '90%',
                        borderTopLeftRadius: 24,
                        borderTopRightRadius: 24,
                        backgroundColor: COLORS.background,
                    }}
                >
                    <View style={{
                        position: 'absolute',
                        top: 16,
                        right: 16,
                        zIndex: 1,
                    }}>
                        <TouchableOpacity onPress={handleCloseExerciseInfo} style={{
                            backgroundColor: COLORS.surface,
                            padding: 8,
                            borderRadius: 20,
                        }}>
                            <Feather name="x" size={24} color="#fff" />
                        </TouchableOpacity>
                    </View>
                    <ExerciseHistory exerciseID={selectedExerciseId} exerciseName={currentExerciseName} />
                </ActionSheet>
            </SafeAreaView>
        </GestureHandlerRootView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
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
        color: COLORS.text,
        marginBottom: 12,
        textAlign: 'center',
    },
    emptyStateSubtitle: {
        fontSize: 16,
        fontFamily: FONTS.regular,
        color: COLORS.textSecondary,
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
        color: COLORS.text,
        fontSize: 16,
        fontFamily: FONTS.bold,
    },
    headerContainer: {
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 8,
        backgroundColor: COLORS.background,
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
        color: COLORS.text,
        marginRight: 16,
    },
    headerDivider: {
        height: 1,
        backgroundColor: COLORS.border,
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
        borderColor: 'rgba(255,255,255,0.1)',
        borderStyle: 'dashed',
    },
    addExerciseText: {
        color: COLORS.primary,
        fontSize: 16,
        fontFamily: FONTS.semiBold,
    },
    finishButtonContainer: {
        ...SHADOWS.medium,
    },
    finishButton: {
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    finishButtonText: {
        color: COLORS.text,
        fontSize: 18,
        fontFamily: FONTS.bold,
        letterSpacing: 0.5,
    },
    footer: {
        padding: 16,
    }
});

export default Current;
