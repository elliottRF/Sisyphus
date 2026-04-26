
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, Platform, KeyboardAvoidingView, ScrollView, LayoutAnimation, Dimensions, Modal } from 'react-native'
import Animated, { LinearTransition } from 'react-native-reanimated';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useScrollToTop } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView, Gesture } from 'react-native-gesture-handler';
import ReorderableList, { reorderItems } from 'react-native-reorderable-list';
import * as Haptics from 'expo-haptics';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AntDesign, Feather, Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';

import * as NavigationBar from 'expo-navigation-bar';

import { fetchExercises, getLatestWorkoutSession, insertWorkoutHistory, calculateIfPR, setupDatabase, getExercisePRs, getTemplates, deleteTemplate, fetchLastWorkoutSets, getTemplate } from '../../components/db';
import { setPreloadedData } from '../../constants/preloader';
import { toStorageKg, formatWeight } from '../../utils/units';


import ExerciseEditable from '../../components/exerciseEditable'

import ActionSheet from "react-native-actions-sheet";


import FilteredExerciseList from '../../components/FilteredExerciseList';
import { FONTS, SHADOWS } from '../../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import Timer from '../../components/Timer';
import RestTimer from '../../components/RestTimer';
import { useFocusEffect, router } from 'expo-router';
import { Audio } from 'expo-av';
import LottieView from 'lottie-react-native';

import TestSoundButton from '../../components/TestSoundButton';
import TestNotificationButton from '../../components/TestNotificationButton';
import { useTheme } from '../../context/ThemeContext';
import { ActivityIndicator } from 'react-native';
import { AppEvents, emit } from '../../utils/events';
import { useLocalSearchParams } from 'expo-router';

import * as Notifications from 'expo-notifications';
import { customAlert } from '../../utils/customAlert';



const { width } = Dimensions.get('window');

const Current = () => {
    const insets = useSafeAreaInsets();
    const { theme, setWorkoutInProgress, useImperial, workoutStartTime, updateWorkoutStartTime } = useTheme();
    const styles = getStyles(theme);

    const [exercises, setExercises] = useState([]);
    const [isReady, setIsReady] = useState(false);

    const actionSheetRef = useRef(null);
    const restTimerRef = useRef(null);
    const listRef = useRef(null);
    const emptyStateScrollRef = useRef(null);
    const isFirstLaunch = useRef(true);

    useScrollToTop(listRef);
    useScrollToTop(emptyStateScrollRef);


    const [PRMODE, setPRMODE] = useState(false);

    // Real template data
    const [templates, setTemplates] = useState([]);
    const [loadingTemplateId, setLoadingTemplateId] = useState(null);

    // Real template data


    const loadTemplates = async () => {
        try {
            const data = await getTemplates();
            setTemplates(data);
        } catch (error) {
            console.error("Error loading templates:", error);
        }
    };


    const requestNotificationPermissionOnce = async () => {
        const asked = await AsyncStorage.getItem('notifications_permission_asked');
        if (asked) return;

        await AsyncStorage.setItem('notifications_permission_asked', 'true');
        await Notifications.requestPermissionsAsync();
    };



    const startWorkout = async () => {
        const now = new Date().toISOString();
        updateWorkoutStartTime(now);

        fetchExercises()
            .then(data => setExercises(data))
            .catch(err => console.error(err));

        actionSheetRef.current?.show();
    };

    const loadTemplate = async (template) => {
        const now = new Date().toISOString();
        updateWorkoutStartTime(now);
        setWorkoutTitle(template.name);

        const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 9);

        // Fetch history for all exercises in the template to overwrite structure
        const workoutWithDynamicData = await Promise.all(template.data.map(async (item) => {
            const updatedExercises = await Promise.all(item.exercises.map(async (ex) => {
                const history = await fetchLastWorkoutSets(ex.exerciseID);

                let setsToUse = ex.sets;
                if (history && history.length > 0) {
                    // Overwrite template sets with history (weights, reps, counts)
                    setsToUse = history.map(hSet => ({
                        id: generateId(),
                        weight: formatWeight(hSet.weight, useImperial),
                        reps: hSet.reps?.toString() || null,
                        distance: hSet.distance?.toString() || null,
                        minutes: hSet.seconds ? (hSet.seconds / 60).toFixed(1).replace(/\.0$/, '') : null,
                        setType: hSet.setType || 'N',
                        completed: false
                    }));
                } else {
                    // Use template sets but refresh IDs
                    setsToUse = ex.sets.map(set => ({
                        ...set,
                        id: generateId(),
                        weight: formatWeight(set.weight, useImperial),
                        completed: false
                    }));
                }

                return {
                    ...ex,
                    id: generateId(),
                    sets: setsToUse
                };
            }));

            return {
                ...item,
                id: generateId(),
                exercises: updatedExercises
            };
        }));

        setCurrentWorkout(workoutWithDynamicData);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };

    const handleLongPressTemplate = async (template) => {
        setLoadingTemplateId(template.id);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        try {
            // We fetch the full template data in parallel with a 300ms visual delay
            // This ensures the next screen has what it needs before it even mounts
            const [fullTemplate, exercisesData] = await Promise.all([
                getTemplate(template.id),
                fetchExercises(),
                new Promise(resolve => setTimeout(resolve, 300))
            ]);

            setPreloadedData({
                template: fullTemplate,
                exercises: exercisesData
            });

            router.push(`/template/${template.id}?v=${Date.now()}`);
        } catch (error) {
            console.error("Error pre-loading template:", error);
            router.push(`/template/${template.id}?v=${Date.now()}`);
        }
    };

    const handleAddTemplate = async () => {
        setLoadingTemplateId('new');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        try {
            // Clear preloader and fetch exercises in background during the delay
            const [exercisesData] = await Promise.all([
                fetchExercises(),
                new Promise(resolve => setTimeout(resolve, 300))
            ]);

            setPreloadedData({
                template: null,
                exercises: exercisesData
            });

            router.push(`/template/new?v=${Date.now()}`);
        } catch (error) {
            router.push(`/template/new?v=${Date.now()}`);
        }
    };

    const clearWorkout = async () => {
        setCurrentWorkout([]);
        updateWorkoutStartTime(null);
        setWorkoutTitle("New Workout"); // Reset title
        restTimerRef.current?.stopTimer();
        setPRMODE(false);
        await AsyncStorage.removeItem('@currentWorkout');
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


    const [currentWorkout, setCurrentWorkout] = useState([]);
    const [workoutTitle, setWorkoutTitle] = useState("New Workout");

    console.log("Render Current. Workout length:", currentWorkout.length);


    const params = useLocalSearchParams();

    useEffect(() => {
        if (params.template) {
            try {
                const parsed = JSON.parse(params.template);
                loadTemplate(parsed);
                router.setParams({ template: "" });
            } catch (e) {
                console.error("Invalid template passed:", e);
            }
        }
    }, [params.template]);


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
                        set.completed && (
                            (set.weight !== null && set.reps !== null) ||
                            (set.distance !== null && set.minutes !== null)
                        )
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
                    let minWeight = Infinity;
                    let maxRepsAtMaxWeight = 0;

                    const exerciseDetails = exercises.find(e => e.exerciseID === exercise.exerciseID);
                    const isAssisted = !!exerciseDetails?.isAssisted;

                    for (const set of exercise.sets) {
                        // Convert user-input weight to kg for storage
                        const weightKg = toStorageKg(set.weight, useImperial);
                        // Calculate One Rep Max
                        const calculatedOneRM = calculateOneRepMax(
                            weightKg,
                            parseInt(set.reps) || 0
                        );
                        if (calculatedOneRM > maxOneRM) maxOneRM = calculatedOneRM;

                        // Calculate Volume
                        const volume = weightKg * (parseInt(set.reps) || 0);
                        if (volume > maxVolume) maxVolume = volume;

                        // Calculate Weight (ignore 0 reps)
                        const weight = weightKg;
                        const reps = parseInt(set.reps) || 0;
                        if (reps > 0) {
                            if (isAssisted) {
                                if (weight < minWeight) {
                                    minWeight = weight;
                                    maxRepsAtMaxWeight = reps;
                                } else if (weight === minWeight && reps > maxRepsAtMaxWeight) {
                                    maxRepsAtMaxWeight = reps;
                                }
                            } else {
                                if (weight > maxWeight) {
                                    maxWeight = weight;
                                    maxRepsAtMaxWeight = reps;
                                } else if (weight === maxWeight && reps > maxRepsAtMaxWeight) {
                                    maxRepsAtMaxWeight = reps;
                                }
                            }
                        }
                    }
                    maxOneRmsInWorkout.set(exercise.exerciseID, maxOneRM);
                    maxVolumesInWorkout.set(exercise.exerciseID, maxVolume);
                    maxWeightsInWorkout.set(exercise.exerciseID, { weight: isAssisted ? minWeight : maxWeight, reps: maxRepsAtMaxWeight });
                }
            }

            // --------------------------------------------------------------------------

            // --- STEP 2: Iterate again, calculate PR status, and prepare entries ---
            for (const exerciseGroup of filteredWorkout) {
                for (const exercise of exerciseGroup.exercises) {
                    let setNum = 1;

                    const exerciseDetails = exercises.find(e => e.exerciseID === exercise.exerciseID);
                    const isAssisted = !!exerciseDetails?.isAssisted;

                    // Retrieve the maximums achieved for this exercise in the current workout
                    const maxOneRMForExercise = maxOneRmsInWorkout.get(exercise.exerciseID);
                    const maxVolumeForExercise = maxVolumesInWorkout.get(exercise.exerciseID);
                    const maxWeightInfo = maxWeightsInWorkout.get(exercise.exerciseID);

                    // Fetch historical bests
                    const historicalPRs = await getExercisePRs(exercise.exerciseID);

                    const isOverall1rmPR = isAssisted ? false : (maxOneRMForExercise > historicalPRs.maxOneRM);
                    const isOverallVolumePR = isAssisted ? false : (maxVolumeForExercise > historicalPRs.maxVolume);

                    // Weight PR: either new max weight OR matching weight with more reps
                    const isOverallWeightPR = isAssisted
                        ? (maxWeightInfo.weight < historicalPRs.maxWeight ||
                            (maxWeightInfo.weight === historicalPRs.maxWeight && maxWeightInfo.reps > historicalPRs.maxRepsAtMaxWeight))
                        : (maxWeightInfo.weight > historicalPRs.maxWeight ||
                            (maxWeightInfo.weight === historicalPRs.maxWeight && maxWeightInfo.reps > historicalPRs.maxRepsAtMaxWeight));

                    // Track assigned PRs to avoid duplicate badges in the same workout (first set gets priority)
                    let pr1rmAssigned = false;
                    let prVolumeAssigned = false;
                    let prWeightAssigned = false;

                    for (const set of exercise.sets) {
                        // Calculate metrics for the set
                        const weightKg = toStorageKg(set.weight, useImperial);
                        const calculatedOneRM = calculateOneRepMax(
                            weightKg,
                            parseInt(set.reps) || 0
                        );
                        const volume = weightKg * (parseInt(set.reps) || 0);
                        const weight = weightKg;
                        const reps = parseInt(set.reps) || 0;

                        // Determine if this specific set is the PR-setting set
                        // Logic: Must match the workout max AND represent an overall PR AND not have been assigned yet
                        let is1rmPR = 0;
                        if (!pr1rmAssigned && !isAssisted && calculatedOneRM === maxOneRMForExercise && isOverall1rmPR) {
                            is1rmPR = 1;
                            pr1rmAssigned = true;
                        }

                        let isVolumePR = 0;
                        if (!prVolumeAssigned && !isAssisted && volume === maxVolumeForExercise && isOverallVolumePR) {
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
                            weight: toStorageKg(set.weight, useImperial), // always store in kg
                            reps: set.reps,
                            oneRM: calculatedOneRM,   // already in kg
                            time: new Date().toISOString(),
                            name: workoutTitle,
                            pr: isPR,
                            setType: set.setType || 'N',
                            notes: exercise.notes || '',
                            is1rmPR: is1rmPR,
                            isVolumePR: isVolumePR,
                            isWeightPR: isWeightPR,
                            distance: set.distance || null,
                            seconds: set.minutes ? Math.round(parseFloat(set.minutes) * 60) : null
                        });

                        setNum++;
                    }

                    globalExerciseNum++;
                }
            }

            // Calculate duration in minutes
            const endTime = Date.now();
            const startTimeMs = workoutStartTime ? new Date(workoutStartTime).getTime() : endTime;
            const durationMs = endTime - startTimeMs;
            const durationMinutes = Math.floor(durationMs / 60000);
            await insertWorkoutHistory(workoutEntries, workoutTitle, durationMinutes);

            // Emit event so Global Overlay triggers
            emit(AppEvents.WORKOUT_COMPLETED);

            try {
                const { sound } = await Audio.Sound.createAsync(
                    require('../../assets/notifications/greatSuccess.mp3')
                );

                await sound.playAsync();

                // Cleanup when done – allow the full sound to play even during navigation
                sound.setOnPlaybackStatusUpdate(async (status) => {
                    if (status.didJustFinish) {
                        await sound.unloadAsync();
                    }
                });
            } catch (e) {
                console.log("Error playing success sound", e);
            }

            // Give the Global Modal a moment to fade in and cover the screen before we clear the state
            await new Promise(resolve => setTimeout(resolve, 500));

            // Clear AsyncStorage and state
            await AsyncStorage.removeItem('@currentWorkout');
            setCurrentWorkout([]);
            updateWorkoutStartTime(null);
            setWorkoutTitle("New Workout");
            restTimerRef.current?.stopTimer();
            setPRMODE(false);
            console.log("Workout saved successfully");

            // Build our history stack effectively
            router.navigate('/history');

            router.push({
                pathname: `/workout/${nextSessionNumber}`,
                params: {
                    session: nextSessionNumber,
                    initialData: JSON.stringify(workoutEntries), // This is the "bridge" that prevents the kick-out
                    viewMode: 'summary' // optional
                }
            });
        }
        catch (error) {
            console.error("Error saving workout:", error);
        }
    }, [currentWorkout, workoutStartTime, workoutTitle]);

    const plusButtonShowExerciseList = () => {
        fetchExercises()
            .then(data => setExercises(data))
            .catch(err => console.error(err));

        actionSheetRef.current?.show();
    };

    const showExerciseInfo = (exerciseDetails) => {
        if (exerciseDetails) {
            router.push(`/exercise/${exerciseDetails.exerciseID}?name=${encodeURIComponent(exerciseDetails.name || '')}`);
        }
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

    useEffect(() => {
        setupDatabase()
            .then(() => fetchExercises())
            .then(data => setExercises(data))
            .catch(err => console.error("Initial load error:", err));

        loadTemplates();
        setIsReady(true);
    }, []);

    const autoTimerEnabledRef = useRef(true);

    useFocusEffect(
        React.useCallback(() => {
            fetchExercises()
                .then(data => setExercises(data))
                .catch(err => console.error(err));
            loadTemplates(); // Refresh templates when focusing
            setLoadingTemplateId(null);

            AsyncStorage.getItem('settings_auto_timer').then(val => {
                if (val !== null) autoTimerEnabledRef.current = val === 'true';
            });

            const checkActiveWorkout = async () => {
                try {
                    const storedWorkout = await AsyncStorage.getItem('@currentWorkout');
                    if (storedWorkout) {
                        const { workout, title } = JSON.parse(storedWorkout);
                        setCurrentWorkout(current => {
                            if (current.length === 0 && workout && workout.length > 0) {
                                if (title) setWorkoutTitle(title);
                                return workout;
                            }
                            return current;
                        });
                    } else {
                        setCurrentWorkout(current => current.length === 0 ? [] : current);
                    }
                    const storedStartTime = await AsyncStorage.getItem('@workoutStartTime');
                    if (storedStartTime) {
                        // Global state update is enough, but ensure local context sync
                        updateWorkoutStartTime(storedStartTime);
                    } else {
                        updateWorkoutStartTime(null);
                    }
                } catch (e) {
                    console.error("Error recovering active workout state:", e);
                }
            };
            checkActiveWorkout();
        }, [])
    );

    useEffect(() => {
        if (currentWorkout.length > 0) {
            saveWorkoutToAsyncStorage(currentWorkout);
        }
        setWorkoutInProgress(currentWorkout.length > 0 || !!workoutStartTime);
    }, [currentWorkout, workoutStartTime]);

    const inputExercise = (item) => {
        actionSheetRef.current?.hide();

        const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 9);

        setCurrentWorkout((prevWorkouts) => [
            ...prevWorkouts,
            {
                id: generateId(),
                exercises: [
                    {
                        id: generateId(),
                        exerciseID: item.exerciseID,
                        sets: [
                            {
                                id: generateId(),
                                weight: null,
                                reps: null,
                                distance: null,
                                minutes: null,
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

    const handleSetComplete = useCallback(() => {
        console.log("Set completed, restarting timer...");
        if (autoTimerEnabledRef.current) {
            restTimerRef.current?.restartTimer();
        }
    }, []);


    const getFirstOccurrenceMap = (currentWorkout, exercisesData) => {
        const seenMuscles = {};
        const occurrenceMap = {};

        currentWorkout.forEach((workoutGroup) => {
            workoutGroup.exercises.forEach((ex) => {
                const details = exercisesData.find((d) => d.exerciseID === ex.exerciseID);
                const targets = (details?.targetMuscle || '')
                    .split(',')
                    .map(m => m.trim().toLowerCase())
                    .filter(Boolean);

                let maxOcc = 0;
                targets.forEach(m => {
                    const count = seenMuscles[m] || 0;
                    if (count > maxOcc) maxOcc = count;
                });

                const currentOccIdx = maxOcc + 1; // 1 for first time, 2 for second time, etc.

                occurrenceMap[ex.id] = currentOccIdx;

                targets.forEach(m => {
                    seenMuscles[m] = (seenMuscles[m] || 0) + 1;
                });
            });
        });
        return occurrenceMap;
    };


    const occurrenceMap = useMemo(() =>
        getFirstOccurrenceMap(currentWorkout, exercises),
        [currentWorkout, exercises]
    );

    const renderItem = useCallback(({ item, index }) => {
        return (
            <View collapsable={false} style={styles.exerciseWrapper}>
                {item.exercises.map((exercise, exerciseIndex) => {
                    const exerciseDetails = exercises.find(
                        (e) => e.exerciseID === exercise.exerciseID
                    );

                    return (
                        <ExerciseEditable
                            key={exercise.id} // Use the unique instance ID
                            exerciseID={exercise.exerciseID}
                            workoutID={item.id}
                            exercise={exercise}
                            exerciseName={exerciseDetails ? exerciseDetails.name : 'Unknown Exercise'}
                            updateCurrentWorkout={setCurrentWorkout}
                            onOpenDetails={() => showExerciseInfo(exerciseDetails)}
                            simultaneousHandlers={listRef}
                            onSetComplete={handleSetComplete}
                            isCardio={!!exerciseDetails?.isCardio}
                            isAssisted={!!exerciseDetails?.isAssisted}
                            // Use the map we pre-calculated!
                            muscleOccurrenceIndex={occurrenceMap[exercise.id]}
                            PRMODE={PRMODE}
                        />
                    );
                })}
            </View>
        );
    }, [setCurrentWorkout, exercises, handleSetComplete, occurrenceMap, PRMODE]);

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
            <View style={[styles.container, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
                {!isReady ? (
                    <View style={styles.loadingContainer} />
                ) : (
                    <>
                        {!workoutStartTime && currentWorkout.length === 0 && (
                            <View style={{ flex: 1 }}>
                                <ScrollView ref={emptyStateScrollRef} contentContainerStyle={styles.emptyStateScrollContent} showsVerticalScrollIndicator={false} >
                                    <View style={styles.emptyStateHeader}>
                                        <Feather name="activity" size={48} color={theme.primary} style={{ marginBottom: 16, opacity: 0.8 }} />
                                        <Text style={styles.emptyStateTitle}>Ready to train?</Text>
                                        <Text style={styles.emptyStateSubtitle}>Start an empty workout or choose a template to begin your session.</Text>
                                    </View>

                                    <View style={styles.templatesGrid}>
                                        {[...templates].reverse().map((template) => {
                                            const exerciseNames = template.data.flatMap(group =>
                                                group.exercises.map(ex => {
                                                    const detail = exercises.find(e => e.exerciseID === ex.exerciseID);
                                                    return detail ? detail.name : 'Unknown';
                                                })
                                            );
                                            const displayNames = exerciseNames.slice(0, 4);
                                            const moreCount = exerciseNames.length - displayNames.length;

                                            return (
                                                <TouchableOpacity
                                                    key={template.id}
                                                    style={styles.templateCard}
                                                    activeOpacity={0.7}
                                                    onPress={() => loadTemplate(template)}
                                                >
                                                    <View style={{ flex: 1 }}>
                                                        <View style={styles.templateCardHeader}>
                                                            <Text style={styles.templateName} numberOfLines={1}>{template.name}</Text>
                                                            <TouchableOpacity
                                                                style={styles.templateEditButton}
                                                                onPress={(e) => {
                                                                    e.stopPropagation();
                                                                    handleLongPressTemplate(template);
                                                                }}
                                                                disabled={!!loadingTemplateId}
                                                            >
                                                                {loadingTemplateId === template.id ? (
                                                                    <ActivityIndicator size="small" color={theme.primary} />
                                                                ) : (
                                                                    <Feather name="edit-2" size={14} color={theme.textSecondary} />
                                                                )}
                                                            </TouchableOpacity>
                                                        </View>

                                                        <View style={styles.templateOverview}>
                                                            {displayNames.map((name, idx) => (
                                                                <Text key={idx} style={styles.templateExerciseItem} numberOfLines={1}>
                                                                    • {name}
                                                                </Text>
                                                            ))}
                                                            {moreCount > 0 ? (
                                                                <Text style={styles.templateMoreCount}>
                                                                    + {moreCount} more
                                                                </Text>
                                                            ) : null}
                                                        </View>
                                                    </View>

                                                    <View style={styles.cardFooter}>
                                                        <Text style={styles.templateDetails}>
                                                            {exerciseNames.length} {exerciseNames.length === 1 ? 'exercise' : 'exercises'}
                                                        </Text>
                                                        <Ionicons name="chevron-forward" size={16} color={theme.primary} opacity={0.5} />
                                                    </View>
                                                </TouchableOpacity>
                                            );
                                        })}

                                        {/* Add Template Button */}
                                        <TouchableOpacity
                                            style={[styles.templateCard, styles.addTemplateCard]}
                                            activeOpacity={0.7}
                                            onPress={handleAddTemplate}
                                            disabled={!!loadingTemplateId}
                                        >
                                            <View style={styles.addTemplateInner}>
                                                <AntDesign name="plus" size={28} color={theme.textSecondary} style={{ marginBottom: 4 }} />
                                                <Text style={styles.addTemplateText}>New Template</Text>
                                            </View>
                                        </TouchableOpacity>
                                    </View>
                                </ScrollView>

                                <View style={[styles.bottomButtonContainer, { bottom: Math.max(insets.bottom + 80, 115) }]}>
                                    <TouchableOpacity onPress={startWorkout} activeOpacity={0.8} style={styles.startWorkoutButtonContainer}>
                                        <ButtonBackground style={styles.startButton}>
                                            <Text style={styles.startButtonText}>Start an Empty Workout</Text>
                                        </ButtonBackground>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}

                        {(workoutStartTime || currentWorkout.length > 0) && (
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
                                        {workoutStartTime && (
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                                <TouchableOpacity onPress={() => setPRMODE(!PRMODE)}>
                                                    <MaterialCommunityIcons name="trending-up" size={24} color={PRMODE ? theme.primary : theme.textSecondary} />
                                                </TouchableOpacity>
                                                <RestTimer ref={restTimerRef} onFirstStart={requestNotificationPermissionOnce} />
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
                                    showsVerticalScrollIndicator={false}
                                    keyboardDismissMode="on-drag"
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
                                                onPress={() => {
                                                    customAlert(
                                                        "Finish Workout?",
                                                        "Are you sure you want to finish and save this workout?",
                                                        [
                                                            { text: "Cancel", style: "cancel" },
                                                            { text: "Finish", onPress: endWorkout, style: "bold" }
                                                        ]
                                                    );
                                                }}
                                                activeOpacity={0.8}
                                                style={styles.finishButtonContainer}
                                            >

                                                <ButtonBackground style={styles.finishButton}>
                                                    <Text style={styles.finishButtonText}>Finish Workout</Text>
                                                </ButtonBackground>
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                onPress={() =>
                                                    customAlert(
                                                        "Clear Workout?",
                                                        "This will remove all data.",
                                                        [
                                                            { text: "Cancel", style: "cancel" },
                                                            { text: "Clear", onPress: clearWorkout, style: "destructive" }
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
                            onExerciseCreated={() => fetchExercises().then(data => setExercises(data))}
                        />
                    </>
                )}
            </View>
        </GestureHandlerRootView>
    );
};



const getStyles = (theme) => {
    const isDynamic = theme.type === 'dynamic';
    const safePrimary = isDynamic ? '#2DC4B6' : theme.primary;
    const safeText = isDynamic ? '#FFFFFF' : theme.text;
    const safeBorder = isDynamic ? theme.overlayInput : theme.border;
    const safeDanger = isDynamic ? '#FF4444' : theme.danger;

    const insets = useSafeAreaInsets(); // Access insets inside getStyles if needed, but it's passed from component
    // Actually, getStyles is called inside the component, but it doesn't take insets.
    // I should pass insets to getStyles or just use them directly if I'm within the Hook.
    // Wait, getStyles is a separate function. I'll pass insets to it.

    // Grid sizing - CHANGED TO 2 COLUMNS
    const numColumns = 2;
    const gap = 12;
    const padding = 16;
    const availableWidth = width - (padding * 2) - ((numColumns - 1) * gap);
    const itemWidth = Math.floor(availableWidth / numColumns);

    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: theme.background,
        },
        list: {
            flex: 1,
        },
        loadingContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
        },
        emptyStateScrollContent: {
            padding: padding,
            paddingBottom: 240,
        },
        emptyStateHeader: {
            alignItems: 'center',
            marginTop: 20,
            marginBottom: 32,
        },
        emptyStateTitle: {
            fontSize: 24,
            fontFamily: FONTS.bold,
            color: safeText,
            marginBottom: 8,
            textAlign: 'center',
        },
        emptyStateSubtitle: {
            fontSize: 16,
            fontFamily: FONTS.regular,
            color: theme.textSecondary,
            textAlign: 'center',
            lineHeight: 24,
            width: '80%',
        },
        templatesGrid: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: gap,
        },
        templateCard: {
            width: itemWidth,
            height: 200, // Fixed height for consistency with overview
            backgroundColor: theme.surface,
            borderRadius: 16,
            padding: 14,
            justifyContent: 'space-between',
            borderWidth: 1,
            borderColor: safeBorder,
            position: 'relative',
            ...SHADOWS.small,
        },
        templateCardHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
        },
        templateOverview: {
            flex: 1,
            marginTop: 4,
        },
        templateExerciseItem: {
            fontSize: 12,
            fontFamily: FONTS.medium,
            color: theme.textSecondary,
            marginBottom: 2,
            opacity: 0.8,
        },
        templateMoreCount: {
            fontSize: 11,
            fontFamily: FONTS.regular,
            color: theme.textSecondary,
            marginTop: 2,
            opacity: 0.6,
        },
        cardFooter: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 8,
            paddingTop: 8,
            borderTopWidth: 1,
            borderTopColor: theme.overlayBorder,
        },
        addTemplateInner: {
            alignItems: 'center',
            justifyContent: 'center',
        },
        addTemplateText: {
            fontSize: 14,
            fontFamily: FONTS.semiBold,
            color: theme.textSecondary,
        },
        plusCardLoader: {
            position: 'absolute',
            bottom: 12,
            right: 12,
        },
        addTemplateCard: {
            alignItems: 'center',
            justifyContent: 'center',
            borderStyle: 'dashed',
            backgroundColor: 'transparent',
            borderColor: theme.overlayBorder,
            opacity: 0.8,
        },
        templateEditButton: {
            width: 28,
            height: 28,
            borderRadius: 8,
            backgroundColor: theme.overlayInput,
            alignItems: 'center',
            justifyContent: 'center',
        },
        templateName: {
            fontSize: 15,
            fontFamily: FONTS.bold,
            color: safeText,
            flex: 1,
            marginRight: 8,
        },
        templateDetails: {
            fontSize: 12,
            fontFamily: FONTS.semiBold,
            color: theme.textSecondary,
        },
        bottomButtonContainer: {
            position: 'absolute',
            // Use props passed to getStyles or fallback. 
            // I'll update the component to pass insets to getStyles.
            bottom: 75, // Base offset, will be adjusted in the component style if needed
            left: 0,
            right: 0,
            paddingHorizontal: 16,
            backgroundColor: 'transparent',
            zIndex: 100,
        },
        startWorkoutButtonContainer: {
            width: '100%',
            ...SHADOWS.medium,
        },
        startButton: {
            paddingVertical: 16,
            borderRadius: 16, // Rounder for premium feel
            alignItems: 'center',
            justifyContent: 'center',
        },
        startButtonText: {
            color: theme.textAlternate,
            fontSize: 16,
            fontFamily: FONTS.bold,
            letterSpacing: 0.5,
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
            backgroundColor: theme.overlayBorder,
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
            color: theme.textAlternate,
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
            backgroundColor: theme.overlayInput,
            alignItems: 'center',
            justifyContent: 'center',
        }
    });
};
export default Current;
