import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
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

const WorkoutDetail = () => {
    const insets = useSafeAreaInsets();
    const { session, initialData } = useLocalSearchParams();
    const router = useRouter();
    const { theme } = useTheme();
    const styles = getStyles(theme);

    // 1. Synchronously derive initial data from params to ensure first-frame correctness
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

    // 2. Determine if we have valid data for THIS session
    const currentSessionId = parseInt(session);
    const dataSessionId = workoutDetails[0]?.workoutSession;
    const isDataMismatch = workoutDetails.length > 0 && dataSessionId !== currentSessionId;

    // Sync state if params change but component is already mounted (pre-loaded)
    useEffect(() => {
        if (syncedInitialData && syncedInitialData.length > 0) {
            const dataSessionIdSynced = syncedInitialData[0]?.workoutSession;
            if (dataSessionIdSynced === currentSessionId) {
                setWorkoutDetails(syncedInitialData);
                setLoading(false);
            }
        }
    }, [syncedInitialData, currentSessionId]);

    // If mismatch, fall back to synced data (if it matches) or empty
    const effectiveWorkoutDetails = isDataMismatch
        ? (syncedInitialData && syncedInitialData[0]?.workoutSession === currentSessionId ? syncedInitialData : [])
        : workoutDetails;

    // Loading if we have no data for this session
    const [loading, setLoading] = useState(!effectiveWorkoutDetails.length);
    const [hasAttemptedFetch, setHasAttemptedFetch] = useState(false);

    const actionSheetRef = useRef(null);
    const sessionViewRef = useRef(null);
    const [selectedExerciseId, setSelectedExerciseId] = useState(null);
    const [currentExerciseName, setCurrentExerciseName] = useState(null);

    useFocusEffect(
        React.useCallback(() => {
            const loadData = async () => {
                try {
                    // Update exercises list in background or parallel
                    const exPromise = fetchExercises();

                    // Always refresh history for the current session to ensure latest data
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
                    setLoading(false);
                    setHasAttemptedFetch(true);
                }
            };

            // If we have synced data, we are "loaded" immediately, but still want to fetch fresh
            if (syncedInitialData && syncedInitialData.length > 0 && syncedInitialData[0]?.workoutSession === currentSessionId) {
                setLoading(false);
            } else {
                setLoading(true);
            }

            loadData();
        }, [session, syncedInitialData]) // Re-run if session changes
    );

    useFocusEffect(
        React.useCallback(() => {
            // Immediate scroll to top when focused
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



    useFocusEffect(
        React.useCallback(() => {
            if (hasAttemptedFetch && effectiveWorkoutDetails.length === 0) {
                router.replace('/history');
            }
        }, [hasAttemptedFetch, effectiveWorkoutDetails.length, router])
    );

    // 4. Strict data gating for Zero-Flash transitions
    const isDataMatching = effectiveWorkoutDetails.length > 0 && effectiveWorkoutDetails[0]?.workoutSession === currentSessionId;
    const isReadyToShow = isDataMatching;

    if (!isReadyToShow) {
        // Render a completely blank themed background to hide the "Pre-load" transition
        // If it's not found, the useEffect above will redirect
        return (
            <View style={[styles.container, { backgroundColor: theme.background }]} />
        );
    }


    return (
        <View style={[styles.container, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
            <Stack.Screen options={{ headerShown: false }} />


            {effectiveWorkoutDetails && (
                <WorkoutSessionView
                    ref={sessionViewRef}
                    workoutDetails={effectiveWorkoutDetails}
                    exercisesList={exercisesList}
                    onEdit={showEditPage}
                    onExerciseInfo={showExerciseInfo}
                />
            )}


            {loading && (
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
        backButtonOver: {
            position: 'absolute',
            top: 10,
            left: 16,
            zIndex: 10,
            padding: 8,
            backgroundColor: 'rgba(0,0,0,0.3)',
            borderRadius: 20,
        },
        header: {
            paddingHorizontal: 20,
            paddingVertical: 12,
        },
        title: {
            fontSize: 20,
            fontFamily: FONTS.bold,
            color: theme.text,
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
