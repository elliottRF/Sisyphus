// COMPLETE FIXED EditWorkout.js

import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, Platform, KeyboardAvoidingView, ScrollView, LayoutAnimation } from 'react-native'
import Animated, { LinearTransition } from 'react-native-reanimated';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView, Gesture } from 'react-native-gesture-handler';
import ReorderableList, { reorderItems } from 'react-native-reorderable-list';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, Stack, router } from 'expo-router'; // FIXED: Added router
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AntDesign, Feather, Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Dimensions } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { ActivityIndicator } from 'react-native';

import {
    fetchExercises,
    getLatestWorkoutSession,
    insertWorkoutHistory,
    calculateIfPR,
    deleteWorkoutSession,
    setupDatabase,
    getExercisePRs,
    fetchWorkoutHistoryBySession,
    overwriteWorkoutSession // FIXED: Changed from updateWorkoutHistory
} from '../../components/db';

import ExerciseEditable from '../../components/exerciseEditable'
import ActionSheet from "react-native-actions-sheet";
import ExerciseHistory from "../../components/exerciseHistory"
import FilteredExerciseList from '../../components/FilteredExerciseList';
import { FONTS, SHADOWS } from '../../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';

// FIXED: Component now uses route params instead of props
const EditWorkout = () => {
    const params = useLocalSearchParams();
    const WORKOUT_SESSION_NUMBER = params.session ? parseInt(params.session) : null;

    const { theme } = useTheme();
    const styles = getStyles(theme);

    const [exercises, setExercises] = useState([]);
    const [currentWorkout, setCurrentWorkout] = useState([]);
    const [workoutTitle, setWorkoutTitle] = useState("");
    const [originalStartTime, setOriginalStartTime] = useState(null);
    const [originalDurationMinutes, setOriginalDurationMinutes] = useState(0);
    const [isLoading, setIsLoading] = useState(true); // ADDED: Loading state

    // UI State
    const [selectedExerciseId, setSelectedExerciseId] = useState(null);
    const [currentExerciseName, setCurrentExerciseName] = useState(null);
    const actionSheetRef = useRef(null);
    const exerciseInfoActionSheetRef = useRef(null);
    const listRef = useRef(null);


    // --- Utility Functions ---
    const calculateOneRepMax = (weight, reps) => {
        let oneRepMax;
        if (reps === 0) {
            oneRepMax = 0;
        } else if (reps === 1) {
            oneRepMax = weight;
        } else {
            oneRepMax = weight * (1 + reps / 30);
        }
        return Math.round(oneRepMax * 100) / 100;
    };

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
                                setType: 'N',
                                completed: false,
                            }
                        ],
                        notes: ''
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

    const handleReorder = useCallback(({ from, to }) => {
        setCurrentWorkout((prevWorkout) => reorderItems(prevWorkout, from, to));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, []);

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

    const panGesture = useMemo(
        () => Gesture.Pan().activeOffsetX([-20, 20]).activeOffsetY([0, 0]),
        []
    );

    // FIXED: Save workout function
    const saveWorkout = useCallback(async () => {
        console.log("saveWorkout called (Edit). State length:", currentWorkout.length);
        try {
            if (!currentWorkout || !currentWorkout.length) {
                Alert.alert("Error", "Workout is empty. Cannot save.");
                return;
            }

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

            for (const exerciseGroup of filteredWorkout) {
                for (const exercise of exerciseGroup.exercises) {
                    let setNum = 1;

                    const maxOneRMForExercise = maxOneRmsInWorkout.get(exercise.exerciseID);
                    const maxVolumeForExercise = maxVolumesInWorkout.get(exercise.exerciseID);
                    const maxWeightInfo = maxWeightsInWorkout.get(exercise.exerciseID);

                    const historicalPRs = await getExercisePRs(exercise.exerciseID);

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

                        const isPR = is1rmPR;

                        workoutEntries.push({
                            workoutSession: WORKOUT_SESSION_NUMBER,
                            exerciseNum: globalExerciseNum,
                            setNum: setNum,
                            exerciseID: exercise.exerciseID,
                            weight: set.weight,
                            reps: set.reps,
                            oneRM: calculatedOneRM,
                            time: originalStartTime,
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

            // FIXED: Use overwriteWorkoutSession with correct parameters
            await overwriteWorkoutSession(
                WORKOUT_SESSION_NUMBER,
                workoutEntries,
                workoutTitle,
                originalDurationMinutes
            );

            Alert.alert("Success", "Workout updated successfully!", [
                { text: "OK", onPress: () => router.back() }
            ]);

        } catch (error) {
            console.error("Error saving edited workout:", error);
            Alert.alert("Error", "Could not save workout. Please check console.");
        }
    }, [currentWorkout, workoutTitle, originalStartTime, originalDurationMinutes, WORKOUT_SESSION_NUMBER]);


    const deleteWorkout = useCallback(() => {
        Alert.alert(
            "Delete Workout",
            "This will permanently delete this workout. This cannot be undone.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await deleteWorkoutSession(WORKOUT_SESSION_NUMBER);
                            Alert.alert("Deleted", "Workout deleted.", [
                                { text: "OK", onPress: () => router.back() }
                            ]);
                        } catch (err) {
                            console.error(err);
                            Alert.alert("Error", "Failed to delete workout.");
                        }
                    }
                }
            ]
        );
    }, [WORKOUT_SESSION_NUMBER]);




    // FIXED: Data Loading Effect
    useEffect(() => {
        const loadWorkout = async () => {


            setIsLoading(true);
            setCurrentWorkout([]);
            setWorkoutTitle('');


            console.log("Loading workout for session:", WORKOUT_SESSION_NUMBER);

            if (!WORKOUT_SESSION_NUMBER) {
                Alert.alert("Error", "No session number provided");
                setIsLoading(false);
                return;
            }

            try {
                // Load exercises list
                const exercisesData = await fetchExercises();
                setExercises(exercisesData);

                await setupDatabase();

                // Load workout history
                const sessionData = await fetchWorkoutHistoryBySession(WORKOUT_SESSION_NUMBER);
                console.log("Loaded session data:", sessionData?.length, "rows");

                console.log("First few rows:", sessionData.slice(0, 8).map(r => ({
                    exerciseNum: r.exerciseNum,
                    exerciseID: r.exerciseID,
                    setNum: r.setNum,
                    exerciseName: r.exerciseName
                })));


                if (sessionData && sessionData.length > 0) {
                    // Extract metadata from first row
                    const firstRow = sessionData[0];
                    setWorkoutTitle(firstRow.name || "Edited Workout");
                    setOriginalStartTime(firstRow.time);
                    setOriginalDurationMinutes(firstRow.duration || 0);

                    // Group by exerciseNum (each exerciseNum represents a separate exercise instance)
                    const exerciseGroups = new Map();

                    sessionData.forEach((row, index) => {
                        // Use exerciseNum as the unique key (not exerciseID)
                        // exerciseNum increments for each exercise in the workout, even if same exerciseID
                        const groupKey = row.exerciseNum;

                        if (!exerciseGroups.has(groupKey)) {
                            exerciseGroups.set(groupKey, {
                                id: `exercise-${row.exerciseNum}-${index}`,
                                exerciseNum: row.exerciseNum,
                                exercises: [{
                                    exerciseID: row.exerciseID,
                                    sets: [],
                                    notes: row.notes || '',
                                }]
                            });
                        }

                        const group = exerciseGroups.get(groupKey);
                        group.exercises[0].sets.push({
                            id: `set-${row.exerciseNum}-${row.setNum}-${index}`,
                            weight: parseFloat(row.weight),
                            reps: parseInt(row.reps),
                            setType: row.setType || 'N',
                            completed: true,
                        });
                    });

                    const groupedWorkout = Array.from(exerciseGroups.values());
                    console.log("Reconstructed workout:", groupedWorkout.length, "exercises");
                    setCurrentWorkout(groupedWorkout);

                } else {
                    Alert.alert("Error", "Workout not found or is empty.");
                }
            } catch (error) {
                console.error('Error loading workout from DB:', error);
                Alert.alert("Error", `Could not load workout history: ${error.message}`);
            } finally {
                setIsLoading(false);
            }
        };

        loadWorkout();
    }, [WORKOUT_SESSION_NUMBER]);

    // UI variables
    const isDynamic = theme.type === 'dynamic';
    const safeSurface = isDynamic ? '#1e1e1e' : theme.surface;
    const safePrimary = isDynamic ? '#2DC4B6' : theme.primary;
    const safeText = isDynamic ? '#FFFFFF' : theme.text;
    const safeBorder = isDynamic ? 'rgba(255,255,255,0.1)' : theme.border;

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

    if (isLoading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={theme.primary} />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
                <View style={styles.headerContainer}>
                    <View style={styles.headerTopRow}>
                        <TextInput
                            style={styles.workoutTitleInput}
                            onChangeText={setWorkoutTitle}
                            value={workoutTitle}
                            placeholder="Workout Name"
                            placeholderTextColor={theme.textSecondary}
                        />
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
                                onPress={deleteWorkout}
                                activeOpacity={0.8}
                                style={styles.deleteButton}
                            >
                                <Text style={styles.deleteButtonText}>Delete Workout</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => router.back()}
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

    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: theme.background,
        },
        list: {
            flex: 1,
        },
        deleteButton: {
            paddingVertical: 14,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
            backgroundColor: 'rgba(255,0,0,0.08)',
            borderWidth: 1,
            borderColor: 'rgba(255,0,0,0.4)',
        },
        deleteButtonText: {
            fontSize: 16,
            fontFamily: FONTS.semiBold,
            color: '#FF4D4D',
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
            color: theme.textSecondary,
            opacity: 0.8,
        },
        footer: {
            padding: 16,
        },
    });
};

export default EditWorkout;