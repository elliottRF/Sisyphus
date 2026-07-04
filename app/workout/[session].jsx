import { View, StyleSheet, ActivityIndicator } from 'react-native';
import React, { useState, useRef, useCallback } from 'react';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchWorkoutHistoryBySession, fetchExercises, getCachedExercises } from '../../components/db';
import WorkoutSessionView from '../../components/WorkoutSessionView';
import WorkoutSummaryOverview from '../../components/WorkoutSummaryOverview';
import { useTheme } from '../../context/ThemeContext';
import { setPreloadedData } from '../../constants/preloader';
import { formatWeight } from '../../utils/units';
import { customAlert } from '../../utils/customAlert';

const WorkoutDetail = () => {
    const insets = useSafeAreaInsets();
    const { session, initialData, readOnly, viewMode, fromExercise } = useLocalSearchParams();
    const router = useRouter();
    const { theme, useImperial } = useTheme();
    const styles = getStyles(theme);

    const isSummary = viewMode === 'summary';

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
    // Seed from the cached exercise list so names/muscle data are present on
    // first paint (the live fetch below still refreshes it) — avoids the
    // exercise names and muscle split flashing in on the summary.
    const [exercisesList, setExercises] = useState(() => getCachedExercises() || []);

    const currentSessionId = parseInt(session);
    const dataSessionId = workoutDetails[0]?.workoutSession;
    const isDataMismatch = workoutDetails.length > 0 && dataSessionId !== currentSessionId;

    const effectiveWorkoutDetails = isDataMismatch
        ? (syncedInitialData && syncedInitialData[0]?.workoutSession === currentSessionId ? syncedInitialData : [])
        : workoutDetails;

    const [loading, setLoading] = useState(!effectiveWorkoutDetails.length);
    const [hasAttemptedFetch, setHasAttemptedFetch] = useState(false);
    const [isActionLoading, setIsActionLoading] = useState(false);

    const sessionViewRef = useRef(null);

    useFocusEffect(
        React.useCallback(() => {
            let isActive = true;

            const haveInitial = syncedInitialData && syncedInitialData.length > 0 && syncedInitialData[0]?.workoutSession === currentSessionId;

            const loadData = async () => {
                try {
                    // Summary mode: the passed-in data is the authoritative,
                    // complete just-finished workout (incl. duration + PR flags),
                    // so don't overwrite workoutDetails — re-setting it mid-count
                    // forces a heavy re-render that stutters the count-up. Only
                    // pull exercises if they weren't already seeded from cache.
                    if (isSummary && haveInitial) {
                        if (!exercisesList.length) {
                            const exercisesData = await fetchExercises();
                            if (isActive && exercisesData) setExercises(exercisesData);
                        }
                        return;
                    }

                    const [historyData, exercisesData] = await Promise.all([
                        fetchWorkoutHistoryBySession(session),
                        fetchExercises()
                    ]);

                    if (isActive) {
                        if (historyData) setWorkoutDetails(historyData);
                        if (exercisesData) setExercises(exercisesData);
                    }
                } catch (error) {
                    console.error("Error loading workout details:", error);
                } finally {
                    if (isActive) {
                        setLoading(false);
                        setHasAttemptedFetch(true);
                    }
                }
            };

            if (haveInitial) {
                setLoading(false);
            } else {
                setLoading(true);
            }

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

    const isDataMatching = effectiveWorkoutDetails.length > 0 && effectiveWorkoutDetails[0]?.workoutSession === currentSessionId;
    const isReadyToShow = isDataMatching;

    useFocusEffect(
        React.useCallback(() => {
            if (hasAttemptedFetch && effectiveWorkoutDetails.length === 0) {
                // This session has no data (e.g. it was just deleted). Pop the
                // stack to return to where we came from — replacing with the
                // '/history' tab route from here remounts a whole new (tabs)
                // navigator each time (lazy:false → all tabs), which piles up
                // and progressively slows the app until a force-close.
                if (router.canGoBack()) {
                    router.back();
                } else {
                    router.replace('/history');
                }
            }
        }, [hasAttemptedFetch, effectiveWorkoutDetails.length, router])
    );

    const showExerciseInfo = useCallback((exerciseId, exerciseName) => {
        if (!exerciseId || !isReadyToShow) return;
        router.push(`/exercise/${exerciseId}?name=${encodeURIComponent(exerciseName || '')}`);
    }, [router, isReadyToShow]);

    const showEditPage = useCallback(() => {
        if (session) {
            router.push(`/workout/EditWorkout?session=${session}`);
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
                            weight: formatWeight(s.weight, useImperial),
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

            // dismissAll first — see onDone: navigate from a stacked screen
            // would push a duplicate (tabs) navigator on RN7.
            if (router.canDismiss()) router.dismissAll();
            router.navigate({
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
                    reps: row.reps?.toString() || null,
                    minutes: row.seconds ? (row.seconds / 60).toFixed(1).replace(/\.0$/, '') : null,
                    distance: row.distance?.toString() || null,
                    setType: row.setType || 'N',
                    completed: false,
                });

            });

            setPreloadedData({
                template: { name: effectiveWorkoutDetails[0]?.name || '', data: Array.from(grouped.values()) },
                exercises: []
            });

            router.push(`/template/new?v=${Date.now()}`);
        } catch (err) {
            console.error('handleSaveAsTemplate error:', err);
            customAlert('Error', 'Could not load workout data.');
        } finally {
            setIsActionLoading(false);
        }
    }, [session, isActionLoading, router]);

    if (!isReadyToShow) {
        return <View style={[styles.container, { backgroundColor: theme.background }]} />;
    }

    return (
        <View style={[styles.container, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={{ flex: 1 }}>
                {isSummary ? (
                    <WorkoutSummaryOverview
                        workoutDetails={effectiveWorkoutDetails}
                        exercisesList={exercisesList}
                        celebrate
                        // Pop everything stacked over the real tabs BEFORE
                        // navigating: on React Navigation 7, navigate from a
                        // stacked screen no longer rewinds to the existing
                        // (tabs) — it pushes a duplicate navigator that leaks.
                        onDone={() => {
                            if (router.canDismiss()) router.dismissAll();
                            router.navigate('/history');
                        }}
                        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
                    />
                ) : (
                    <WorkoutSessionView
                        ref={sessionViewRef}
                        workoutDetails={effectiveWorkoutDetails}
                        exercisesList={exercisesList}
                        onEdit={readOnly === 'true' ? null : showEditPage}
                        onRepeat={readOnly === 'true' ? null : handleRepeat}
                        onSaveAsTemplate={readOnly === 'true' ? null : handleSaveAsTemplate}
                        // No exercise->history links when this session was opened
                        // FROM an exercise page (prevents endless browse chains).
                        onExerciseInfo={(readOnly === 'true' || fromExercise === '1') ? null : showExerciseInfo}
                        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
                    />
                )}
            </View>

            {(loading || isActionLoading) && (
                <View style={[StyleSheet.absoluteFill, {
                    backgroundColor: theme.background,
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 20
                }]}>
                    <ActivityIndicator size="large" color={theme.primary} />
                </View>
            )}
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