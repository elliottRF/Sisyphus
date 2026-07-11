// COMPLETE FIXED EditWorkout.js

import { View, Text, StyleSheet, TouchableOpacity, TextInput, Platform, KeyboardAvoidingView, ScrollView, LayoutAnimation, FlatList } from 'react-native'
import Animated, { LinearTransition, Easing } from 'react-native-reanimated';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
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
import FilteredExerciseList from '../../components/FilteredExerciseList';
import { useOverlayReorder } from '../../utils/useOverlayReorder';
import ReorderOverlay from '../../components/ReorderOverlay';
import { FONTS, getThemedShadow, isLightTheme, withAlpha } from '../../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { formatWeight } from '../../utils/units';
import { filterCompletedSets, buildWorkoutEntries } from '../../utils/workoutEntries';
import { customAlert } from '../../utils/customAlert';

// See the matching flag in exerciseEditable.jsx — layout animations restored
// after the leak was pinned on scrolled-wrapper retention instead.
const DISABLE_LAYOUT_ANIMS = false;
const layoutAnim = DISABLE_LAYOUT_ANIMS ? undefined : LinearTransition.duration(200).easing(Easing.out(Easing.ease));

// FIXED: Component now uses route params instead of props
const EditWorkout = () => {
    const insets = useSafeAreaInsets();
    const params = useLocalSearchParams();
    const WORKOUT_SESSION_NUMBER = params.session ? parseInt(params.session) : null;

    const { theme, useImperial } = useTheme();
    const styles = getStyles(theme);

    const [exercises, setExercises] = useState([]);
    const [currentWorkout, setCurrentWorkout] = useState([]);
    const [workoutTitle, setWorkoutTitle] = useState("");
    const [originalStartTime, setOriginalStartTime] = useState(null);
    const [originalDurationMinutes, setOriginalDurationMinutes] = useState(0);
    const [isLoading, setIsLoading] = useState(true); // ADDED: Loading state

    // UI State
    const actionSheetRef = useRef(null);
    const listRef = useRef(null);


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
                                minutes: null,
                                distance: null,
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

    // Navigate to the exercise page like everywhere else in the app (this used
    // to open an embedded full-height ActionSheet copy of ExerciseHistory).
    const showExerciseInfo = (exerciseDetails) => {
        if (exerciseDetails) {
            router.push(`/exercise/${exerciseDetails.exerciseID}?name=${encodeURIComponent(exerciseDetails.name || '')}`);
        }
    };

    const { session: reorderSession, overlayRef, listWrapperRef, fingerY, startReorder, endReorder, handleScrollToIndexFailed, isReordering } =
        useOverlayReorder(listRef, currentWorkout, setCurrentWorkout);

    const reorderRows = useMemo(() => {
        if (!reorderSession) return [];
        return currentWorkout.map(group => {
            const firstExercise = group.exercises[0];
            const details = exercises.find(e => e.exerciseID === firstExercise?.exerciseID);
            const setCount = group.exercises.reduce((n, ex) => n + ex.sets.length, 0);
            return {
                id: group.id,
                label: details ? details.name : 'Unknown Exercise',
                meta: `${setCount} ${setCount === 1 ? 'set' : 'sets'}`,
            };
        });
    }, [reorderSession, currentWorkout, exercises]);

    const renderItem = useCallback(({ item, index }) => {
        return (
            <Animated.View
                collapsable={false}
                style={styles.exerciseWrapper}
                layout={layoutAnim}
            >
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
                            isCardio={exerciseDetails ? exerciseDetails.isCardio : false}
                            isAssisted={exerciseDetails ? (exerciseDetails.isAssisted === 1) : false}
                            hidePrevious={true}
                            onReorderStart={startReorder}
                            onReorderEnd={endReorder}
                            reorderFingerY={fingerY}
                        />
                    );
                })}
            </Animated.View>
        );
    }, [setCurrentWorkout, exercises, startReorder, endReorder, fingerY]);

    const saveWorkout = useCallback(async () => {
        try {
            if (!currentWorkout || !currentWorkout.length) {
                customAlert("Empty Workout", "Add at least one completed set before saving.");
                return;
            }

            const filteredWorkout = filterCompletedSets(currentWorkout);

            // Same engine as finishing a workout on the Current tab — identical
            // set-filtering and PR-flag rules. Historical PRs exclude the
            // session being rewritten so its own old rows don't block its new
            // flags; overwriteWorkoutSession recalculates PRs afterwards.
            const workoutEntries = await buildWorkoutEntries({
                workout: filteredWorkout,
                exercises,
                useImperial,
                sessionNumber: WORKOUT_SESSION_NUMBER,
                time: originalStartTime,
                workoutTitle,
                getHistoricalPRs: (exerciseID) => getExercisePRs(exerciseID, WORKOUT_SESSION_NUMBER),
            });

            await overwriteWorkoutSession(
                WORKOUT_SESSION_NUMBER,
                workoutEntries,
                workoutTitle,
                originalDurationMinutes
            );

            customAlert("Success", "Workout updated successfully!", [
                { text: "OK", onPress: () => router.back() }
            ]);

        } catch (error) {
            // The overwrite is transactional, so a failure leaves the stored
            // session untouched and the edits still on screen.
            console.error("Error saving edited workout:", error);
            customAlert("Save Failed", "Your changes couldn't be saved. Nothing was lost — please try again.");
        }
        // exercises drives the isAssisted lookups (PR flags) and useImperial the
        // kg conversion — both must be current when the edit is saved.
    }, [currentWorkout, workoutTitle, originalStartTime, originalDurationMinutes, WORKOUT_SESSION_NUMBER, exercises, useImperial]);


    const deleteWorkout = useCallback(() => {
        customAlert(
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
                            // Brief delay to allow the confirmation alert to dismiss smoothly
                            setTimeout(() => {
                                customAlert("Deleted", "Workout deleted.", [
                                    {
                                        text: "OK",
                                        onPress: () => {
                                            // Pop straight to the tabs and land on
                                            // History. Backing into the now-empty
                                            // session screen flashed it briefly and
                                            // it popped itself — chained transitions
                                            // interrupting each other, which retained
                                            // the screen's views (~370 per delete).
                                            if (router.canDismiss()) router.dismissAll();
                                            router.navigate('/history');
                                        }
                                    }
                                ]);
                            }, 300);
                        } catch (err) {
                            console.error(err);
                            customAlert("Error", "Failed to delete workout.");
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



            if (!WORKOUT_SESSION_NUMBER) {
                // Return silently. If eagerly mounted by Tabs lazy: false, session is missing.
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
                            weight: formatWeight(parseFloat(row.weight), useImperial), // convert kg→user unit for display
                            reps: parseInt(row.reps),
                            distance: row.distance || null,
                            minutes: row.seconds ? (row.seconds / 60).toString() : null,
                            setType: row.setType || 'N',
                            completed: true,
                        });
                    });

                    const groupedWorkout = Array.from(exerciseGroups.values());
                    setCurrentWorkout(groupedWorkout);

                } else {
                    customAlert("Error", "Workout not found or is empty.");
                }
            } catch (error) {
                console.error('Error loading workout from DB:', error);
                customAlert("Error", `Could not load workout history: ${error.message}`);
            } finally {
                setIsLoading(false);
            }
        };

        loadWorkout();
    }, [WORKOUT_SESSION_NUMBER]);

    // UI variables
    const ButtonBackground = ({ children, style }) => (
        <LinearGradient
            colors={[theme.primary, theme.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={style}
        >
            {children}
        </LinearGradient>
    );

    if (isLoading) {
        return (
            <View style={[styles.container, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={theme.primary} />
                </View>
            </View>
        );
    }

    return (
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.background }}>
            <View style={[styles.container, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
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

                <View ref={listWrapperRef} style={{ flex: 1 }} collapsable={false}>
                    {/* Core FlatList, NOT ReorderableList: the reorderable list's
                    Reanimated cell wrappers left the whole screen's views
                    permanently retained after unmount once it had been scrolled
                    (Reanimated 4.x churn leak — see project memory). Hold-to-
                    reorder is handled by the custom overlay, which only needs a
                    scrollable container. */}
                    <FlatList
                        ref={listRef}
                        data={currentWorkout}
                        onScrollToIndexFailed={handleScrollToIndexFailed}
                        keyExtractor={(item) => String(item.id)}
                        renderItem={renderItem}
                        // Workouts are a handful of cards — keep every cell mounted
                        // so scrolling never churns unmounts (churned cells with
                        // gesture/animation content leak views on this stack).
                        initialNumToRender={50}
                        maxToRenderPerBatch={50}
                        windowSize={99}
                        // Android defaults this ON for FlatList: scrolled-out
                        // views get natively detached ("clipped"), and views
                        // clipped at screen-unmount time leak. History's list
                        // already runs with it off for the same Android issues.
                        removeClippedSubviews={false}
                        style={styles.list}
                        contentContainerStyle={{ paddingBottom: 160, paddingHorizontal: 1 }}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="on-drag"
                        scrollEnabled={!isReordering}
                        ListFooterComponent={
                            <Animated.View
                                layout={layoutAnim}
                                style={styles.footer}
                            >
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
                                            "Save Changes?",
                                            "Are you sure you want to save the changes to this workout?",
                                            [
                                                { text: "Cancel", style: "cancel" },
                                                { text: "Save", onPress: saveWorkout }
                                            ]
                                        );
                                    }}
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
                    {reorderSession && (
                        <ReorderOverlay
                            ref={overlayRef}
                            rows={reorderRows}
                            activeId={reorderSession.activeId}
                            fingerY={fingerY}
                            frame={reorderSession.frame}
                        />
                    )}
                </View>

                <FilteredExerciseList
                    exercises={exercises}
                    actionSheetRef={actionSheetRef}
                    setCurrentWorkout={setCurrentWorkout}
                    inputExercise={inputExercise}
                    onExerciseCreated={() => fetchExercises().then(data => setExercises(data))}
                />

            </View>
        </GestureHandlerRootView>
    );
};

const getStyles = (theme) => {
    const lightTheme = isLightTheme(theme);
    const safePrimary = theme.primary;
    const safeText = theme.text;
    const safeBorder = theme.border;

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
            backgroundColor: withAlpha(theme.danger || '#FF4D4D', lightTheme ? 0.1 : 0.08),
            borderWidth: 1,
            borderColor: withAlpha(theme.danger || '#FF4D4D', lightTheme ? 0.25 : 0.4),
        },
        deleteButtonText: {
            fontSize: 16,
            fontFamily: FONTS.semiBold,
            color: theme.danger || '#FF4D4D',
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
            backgroundColor: lightTheme ? theme.overlaySubtle : 'rgba(255,255,255,0.05)',
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
            ...getThemedShadow(theme, 'medium'),
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
            color: theme.textSecondary,
            opacity: 0.8,
        },
        footer: {
            padding: 16,
        },
    });
};

export default EditWorkout;
