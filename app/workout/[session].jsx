import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchWorkoutHistoryBySession, fetchExercises } from '../../components/db';
import { FONTS } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import ActionSheet from "react-native-actions-sheet";
import ExerciseHistory from '../../components/exerciseHistory';
import WorkoutSessionView from '../../components/WorkoutSessionView';
import { useTheme } from '../../context/ThemeContext';
import { setPreloadedData } from '../../constants/preloader';

const WorkoutDetail = () => {
    const insets = useSafeAreaInsets();
    const { session, initialData } = useLocalSearchParams();
    const router = useRouter();
    const { theme } = useTheme();
    const styles = getStyles(theme);

    const syncedInitialData = React.useMemo(() => {
        if (initialData) {
            try {
                return JSON.parse(initialData);
            } catch (e) {
                console.error("Error parsing initialData", e);
            }
        }
        return null;
    }, [initialData]);

    const [workoutDetails, setWorkoutDetails] = useState(syncedInitialData || []);
    const [exercisesList, setExercises] = useState([]);

    const currentSessionId = parseInt(session);
    const dataSessionId = workoutDetails[0]?.workoutSession;
    const isDataMismatch = workoutDetails.length > 0 && dataSessionId !== currentSessionId;

    useEffect(() => {
        if (syncedInitialData && syncedInitialData.length > 0) {
            const dataSessionIdSynced = syncedInitialData[0]?.workoutSession;
            if (dataSessionIdSynced === currentSessionId) {
                setWorkoutDetails(syncedInitialData);
                setLoading(false);
            }
        }
    }, [syncedInitialData, currentSessionId]);

    const effectiveWorkoutDetails = isDataMismatch
        ? (syncedInitialData && syncedInitialData[0]?.workoutSession === currentSessionId ? syncedInitialData : [])
        : workoutDetails;

    const [loading, setLoading] = useState(!effectiveWorkoutDetails.length);
    const [hasAttemptedFetch, setHasAttemptedFetch] = useState(false);
    const [isActionLoading, setIsActionLoading] = useState(false);

    const [selectedExerciseId, setSelectedExerciseId] = useState(null);
    const [currentExerciseName, setCurrentExerciseName] = useState(null);

    const actionSheetRef = useRef(null);
    const sessionViewRef = useRef(null);
    useFocusEffect(
        React.useCallback(() => {
            let isActive = true;

            const loadData = async () => {
                try {
                    const exPromise = fetchExercises();
                    const historyPromise = fetchWorkoutHistoryBySession(session);

                    const [historyData, exercisesData] = await Promise.all([
                        historyPromise,
                        exPromise
                    ]);

                    if (historyData) setWorkoutDetails(historyData);
                    if (exercisesData) setExercises(exercisesData);

                } catch (error) {
                    console.error("Error loading workout details:", error);
                } finally {
                    if (isActive) {
                        setLoading(false);
                        setHasAttemptedFetch(true);
                    }
                }
            };

            if (syncedInitialData && syncedInitialData.length > 0 && syncedInitialData[0]?.workoutSession === currentSessionId) {
                setLoading(false);
            } else {
                setLoading(true);
            }

            // Defer heavy fetching to ensure the screen transition starts completely smoothly
            const timer = setTimeout(() => {
                if (isActive) loadData();
            }, 50);

            return () => {
                isActive = false;
                clearTimeout(timer);
            };
        }, [session, syncedInitialData])
    );

    useFocusEffect(
        React.useCallback(() => {
            sessionViewRef.current?.scrollTo({ y: 0, animated: false });
        }, [])
    );

    const showExerciseInfo = (exerciseId, exerciseName) => {
        setSelectedExerciseId(exerciseId);
        setCurrentExerciseName(exerciseName);
        actionSheetRef.current?.show();
    };

    const showEditPage = useCallback(() => {
        if (session) {
            router.push(`/workout/EditWorkout?session=${session}`);
        } else {
            console.warn("Cannot navigate to edit page: Session ID is missing.");
        }
    }, [session, router]);

    const handleRepeat = useCallback(async () => {
        if (isActionLoading) return;
        setIsActionLoading(true);
        try {
            const sessionData = await fetchWorkoutHistoryBySession(session);

            const grouped = {};
            const exerciseOrder = [];

            sessionData.forEach(set => {
                if (!grouped[set.exerciseID]) {
                    grouped[set.exerciseID] = [];
                    exerciseOrder.push(set.exerciseID);
                }
                grouped[set.exerciseID].push(set);
            });

            const template = {
                name: effectiveWorkoutDetails[0]?.name || "Repeated Workout",
                data: exerciseOrder.map(exerciseID => ({
                    id: Date.now().toString() + Math.random(),
                    exercises: [{
                        exerciseID: Number(exerciseID),
                        notes: '',
                        sets: grouped[exerciseID].map(s => ({
                            id: Date.now().toString() + Math.random(),
                            weight: s.weight?.toString() || null,
                            reps: s.reps?.toString() || null,
                            distance: s.distance?.toString() || null,
                            minutes: s.seconds
                                ? (s.seconds / 60).toFixed(1).replace(/\.0$/, '')
                                : null,
                            setType: s.setType || 'N',
                            completed: false
                        }))
                    }]
                }))
            };

            router.push({
                pathname: "/current",
                params: { template: JSON.stringify(template) }
            });
        } catch (err) {
            console.error("Failed to repeat workout:", err);
        } finally {
            setIsActionLoading(false);
        }
    }, [session, effectiveWorkoutDetails, isActionLoading, router]);

    const handleSaveAsTemplate = useCallback(async () => {
        if (isActionLoading) return;
        setIsActionLoading(true);
        try {
            const rows = await fetchWorkoutHistoryBySession(session);

            const grouped = new Map();

            rows.forEach(row => {
                if (!grouped.has(row.exerciseNum)) {
                    grouped.set(row.exerciseNum, {
                        id: `${Date.now()}_${row.exerciseNum}_${Math.random().toString(36).substr(2, 6)}`,
                        exercises: [{
                            exerciseID: row.exerciseID,
                            notes: row.notes || '',
                            sets: []
                        }]
                    });
                }

                grouped.get(row.exerciseNum).exercises[0].sets.push({
                    id: `${Date.now()}_${row.setNum}_${Math.random().toString(36).substr(2, 6)}`,
                    weight: row.weight,
                    reps: row.reps,
                    minutes: row.minutes,
                    distance: row.distance,
                    setType: row.setType || 'N',
                    completed: false,
                });
            });

            const workoutData = Array.from(grouped.values());

            setPreloadedData({
                template: { name: '', data: workoutData },
                exercises: []
            });

            router.push(`/template/new?v=${Date.now()}`);
        } catch (err) {
            console.error('handleSaveAsTemplate error:', err);
            Alert.alert('Error', 'Could not load workout data.');
        } finally {
            setIsActionLoading(false);
        }
    }, [session, isActionLoading, router]);

    useFocusEffect(
        React.useCallback(() => {
            if (hasAttemptedFetch && effectiveWorkoutDetails.length === 0) {
                router.replace('/history');
            }
        }, [hasAttemptedFetch, effectiveWorkoutDetails.length, router])
    );

    const isDataMatching = effectiveWorkoutDetails.length > 0 && effectiveWorkoutDetails[0]?.workoutSession === currentSessionId;
    const isReadyToShow = isDataMatching;

    if (!isReadyToShow) {
        return (
            <View style={[styles.container, { backgroundColor: theme.background }]} />
        );
    }

    return (
        <View style={[styles.container, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={{ flex: 1 }}>
                {effectiveWorkoutDetails && (
                    <WorkoutSessionView
                        ref={sessionViewRef}
                        workoutDetails={effectiveWorkoutDetails}
                        exercisesList={exercisesList}
                        onEdit={showEditPage}
                        onRepeat={handleRepeat}
                        onSaveAsTemplate={handleSaveAsTemplate}
                        onExerciseInfo={showExerciseInfo}
                    />
                )}
            </View>

            {(loading || isActionLoading) && (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center', zIndex: 20 }]}>
                    <ActivityIndicator size="large" color={theme.primary} />
                </View>
            )}

            <ActionSheet
                ref={actionSheetRef}
                enableGestureBack={true}
                closeOnPressBack={true}
                androidCloseOnBackPress={true}
                containerStyle={styles.actionSheetContainer}
                indicatorStyle={styles.indicator}
                snapPoints={[100]}
                initialSnapIndex={0}
            >
                <ExerciseHistory
                    exerciseID={selectedExerciseId}
                    exerciseName={currentExerciseName}
                    onClose={() => actionSheetRef.current?.hide()}
                />
            </ActionSheet>
        </View>
    );
};

const getStyles = (theme) => {
    const isDynamic = theme.type === 'dynamic';
    const safeSurface = isDynamic ? '#1e1e1e' : theme.surface;
    const safeIndicator = isDynamic ? '#aaaaaa' : theme.textSecondary;

    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: theme.background,
        },
        actionSheetContainer: {
            backgroundColor: safeSurface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            height: '100%',
        },
        indicator: {
            backgroundColor: safeIndicator,
        }
    });
};

export default WorkoutDetail;