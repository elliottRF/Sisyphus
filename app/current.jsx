// Force reload
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, Platform, KeyboardAvoidingView, ScrollView } from 'react-native'
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AntDesign, Feather, Ionicons } from '@expo/vector-icons';


import * as NavigationBar from 'expo-navigation-bar';

import { fetchExercises, getLatestWorkoutSession, insertWorkoutHistory, calculateIfPR } from '../components/db';


import ExerciseEditable from '../components/exerciseEditable'

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



    const endWorkout = async () => {
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

            // Prepare workout entries for database insertion
            const workoutEntries = [];
            let globalExerciseNum = 1;

            for (const exerciseGroup of filteredWorkout) {
                for (const exercise of exerciseGroup.exercises) {
                    let setNum = 1;

                    for (const set of exercise.sets) {
                        // Calculate One Rep Max
                        const calculatedOneRM = calculateOneRepMax(
                            parseFloat(set.weight),
                            parseInt(set.reps)
                        );

                        // Check if it's a PR
                        const isPR = await calculateIfPR(exercise.exerciseID, calculatedOneRM);

                        // Prepare entry for database
                        workoutEntries.push({
                            workoutSession: nextSessionNumber,
                            exerciseNum: globalExerciseNum,
                            setNum: setNum,
                            exerciseID: exercise.exerciseID,
                            weight: set.weight,
                            reps: set.reps,
                            oneRM: calculatedOneRM,
                            time: new Date().toISOString(), // Current timestamp
                            name: workoutTitle,
                            pr: isPR
                        });

                        setNum++;
                    }

                    globalExerciseNum++;
                }
            }
            await insertWorkoutHistory(workoutEntries, workoutTitle);

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
    };





    const plusButtonShowExerciseList = () => {


        fetchExercises()
            .then(data => setExercises(data))
            .catch(err => console.error(err));

        actionSheetRef.current?.show();
    };


    const actionSheetRef = useRef(null);

    const [currentWorkout, setCurrentWorkout] = useState([]);
    const [workoutTitle, setWorkoutTitle] = useState("New Workout");



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



            try {
                const storedWorkout = await AsyncStorage.getItem('@currentWorkout');
                if (storedWorkout) {

                    const { workout, title } = JSON.parse(storedWorkout);
                    setCurrentWorkout(workout);
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

        setCurrentWorkout((prevWorkouts) => [
            ...prevWorkouts,
            {
                exercises: [
                    {
                        exerciseID: item.exerciseID,
                        sets: [
                            {
                                weight: null,
                                reps: null
                            }
                        ]
                    }
                ]
            }
        ]);
    };


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

                        <ScrollView
                            style={styles.scrollContent}
                            showsVerticalScrollIndicator={false}
                        >
                            {currentWorkout.map((exerciseGroup, groupIndex) => (
                                <View key={groupIndex}>
                                    {exerciseGroup.exercises.map((exercise, exerciseIndex) => {
                                        const exerciseDetails = exercises.find(
                                            (e) => e.exerciseID === exercise.exerciseID
                                        );

                                        return (
                                            <ExerciseEditable
                                                exerciseID={exercise.exerciseID}
                                                key={exerciseIndex}
                                                exercise={exercise}
                                                exerciseName={exerciseDetails ? exerciseDetails.name : 'Unknown Exercise'}
                                                updateCurrentWorkout={setCurrentWorkout}
                                            />
                                        );
                                    })}
                                </View>
                            ))}

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

                            <View style={{ height: 100 }} />
                        </ScrollView>
                    </View>
                )}
                <FilteredExerciseList
                    exercises={exercises}
                    actionSheetRef={actionSheetRef}
                    setCurrentWorkout={setCurrentWorkout}
                />
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
});

export default Current;
