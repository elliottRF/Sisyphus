import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, Platform, KeyboardAvoidingView, ScrollView, LayoutAnimation, ActivityIndicator } from 'react-native'
import Animated, { LinearTransition } from 'react-native-reanimated';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView, Gesture } from 'react-native-gesture-handler';
import ReorderableList, { reorderItems } from 'react-native-reorderable-list';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, Stack, router } from 'expo-router';
import { AntDesign, Feather, Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Dimensions } from 'react-native';
import { getPreloadedData } from '../../constants/preloader';

import {
    fetchExercises,
    createTemplate,
    updateTemplate,
    getTemplate,
    deleteTemplate,
    setupDatabase
} from '../../components/db';

import ExerciseEditable from '../../components/exerciseEditable'
import ActionSheet from "react-native-actions-sheet";
import ExerciseHistory from "../../components/exerciseHistory"
import FilteredExerciseList from '../../components/FilteredExerciseList';
import { FONTS, SHADOWS } from '../../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';

const EditTemplate = () => {
    const params = useLocalSearchParams();
    const TEMPLATE_ID = params.id; // 'new' or a numeric ID

    const { theme } = useTheme();
    const styles = getStyles(theme);

    const [prevId, setPrevId] = useState(TEMPLATE_ID);

    // Initial state based on preloaded data or defaults
    const getInitialState = () => {
        const preloaded = getPreloadedData();
        if (preloaded.template || preloaded.exercises) {
            return {
                exercises: preloaded.exercises || [],
                workout: preloaded.template?.data || [],
                name: preloaded.template?.name || "",
                loading: false
            };
        }
        return {
            exercises: [],
            workout: [],
            name: "",
            loading: true
        };
    };

    const initialState = getInitialState();
    const [exercises, setExercises] = useState(initialState.exercises);
    const [currentWorkout, setCurrentWorkout] = useState(initialState.workout);
    const [templateName, setTemplateName] = useState(initialState.name);
    const [isLoading, setIsLoading] = useState(initialState.loading);

    // Synchronous state reset when TEMPLATE_ID changes
    if (prevId !== TEMPLATE_ID) {
        setPrevId(TEMPLATE_ID);
        const freshState = getInitialState();
        setTemplateName(freshState.name);
        setCurrentWorkout(freshState.workout);
        setExercises(freshState.exercises);
        setIsLoading(freshState.loading);
    }

    const [selectedExerciseId, setSelectedExerciseId] = useState(null);
    const [currentExerciseName, setCurrentExerciseName] = useState(null);
    const actionSheetRef = useRef(null);
    const exerciseInfoActionSheetRef = useRef(null);
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
                            isCardio={exerciseDetails ? exerciseDetails.isCardio : false}
                            isTemplate={true}
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

    const saveTemplateAction = useCallback(async () => {
        if (!templateName.trim()) {
            Alert.alert("Error", "Please enter a template name.");
            return;
        }

        if (!currentWorkout.length) {
            Alert.alert("Error", "Template is empty. Please add at least one exercise.");
            return;
        }

        try {
            // Clean data before saving
            const templateData = currentWorkout.map(group => ({
                id: group.id,
                exercises: group.exercises.map(ex => ({
                    exerciseID: ex.exerciseID,
                    notes: ex.notes,
                    sets: ex.sets.map(set => ({
                        id: set.id,
                        weight: set.weight,
                        reps: set.reps,
                        distance: set.distance,
                        minutes: set.minutes,
                        setType: set.setType
                    }))
                }))
            }));

            if (TEMPLATE_ID === 'new') {
                await createTemplate(templateName, templateData);
                Alert.alert("Success", "Template created successfully!", [
                    { text: "OK", onPress: () => router.back() }
                ]);
            } else {
                await updateTemplate(TEMPLATE_ID, templateName, templateData);
                Alert.alert("Success", "Template updated successfully!", [
                    { text: "OK", onPress: () => router.back() }
                ]);
            }
        } catch (error) {
            console.error("Error saving template:", error);
            Alert.alert("Error", "Could not save template.");
        }
    }, [currentWorkout, templateName, TEMPLATE_ID]);

    const handleDeleteTemplate = useCallback(() => {
        if (TEMPLATE_ID === 'new') {
            router.back();
            return;
        }

        Alert.alert(
            "Delete Template",
            "Are you sure you want to delete this template?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await deleteTemplate(TEMPLATE_ID);
                            router.back();
                        } catch (err) {
                            console.error(err);
                            Alert.alert("Error", "Failed to delete template.");
                        }
                    }
                }
            ]
        );
    }, [TEMPLATE_ID]);

    useEffect(() => {
        const load = async () => {
            // Only show loader if we don't have enough data to render yet
            // This prevents the "brief black screen" flash
            const isMissingData = exercises.length === 0 || (TEMPLATE_ID !== 'new' && currentWorkout.length === 0);
            if (isMissingData) {
                setIsLoading(true);
            }

            try {
                await setupDatabase();
                const exercisesData = await fetchExercises();
                setExercises(exercisesData);

                if (TEMPLATE_ID !== 'new') {
                    const template = await getTemplate(TEMPLATE_ID);
                    if (template) {
                        setTemplateName(template.name);
                        setCurrentWorkout(template.data);
                    }
                } else {
                    // Reset state for new template
                    setTemplateName("");
                    setCurrentWorkout([]);
                }
            } catch (error) {
                console.error("Error loading template editor:", error);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [TEMPLATE_ID]);

    const isDynamic = theme.type === 'dynamic';
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
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background }]}>
                {/* No loading circle here for a smoother feel, or a very subtle one if needed */}
            </View>
        );
    }

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
                <Stack.Screen options={{ title: TEMPLATE_ID === 'new' ? 'New Template' : 'Edit Template' }} />

                <View style={styles.headerContainer}>
                    <TextInput
                        style={styles.templateNameInput}
                        onChangeText={setTemplateName}
                        value={templateName}
                        placeholder="Template Name (e.g. Chest Day)"
                        placeholderTextColor={theme.textSecondary}
                        autoFocus={TEMPLATE_ID === 'new'}
                    />
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
                                onPress={saveTemplateAction}
                                activeOpacity={0.8}
                                style={styles.finishButtonContainer}
                            >
                                <ButtonBackground style={styles.finishButton}>
                                    <Text style={styles.finishButtonText}>Save Template</Text>
                                </ButtonBackground>
                            </TouchableOpacity>

                            {TEMPLATE_ID !== 'new' && (
                                <TouchableOpacity
                                    onPress={handleDeleteTemplate}
                                    activeOpacity={0.8}
                                    style={styles.deleteButton}
                                >
                                    <Text style={styles.deleteButtonText}>Delete Template</Text>
                                </TouchableOpacity>
                            )}

                            <TouchableOpacity
                                onPress={() => router.back()}
                                activeOpacity={0.7}
                                style={styles.clearButton}
                            >
                                <Text style={styles.clearButtonText}>Cancel</Text>
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
                    containerStyle={{ height: '100%', backgroundColor: theme.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}
                    indicatorStyle={{ backgroundColor: theme.textSecondary }}
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
        headerContainer: {
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 8,
            backgroundColor: theme.background,
        },
        templateNameInput: {
            fontSize: 22,
            fontFamily: FONTS.bold,
            color: safeText,
            marginBottom: 8,
        },
        headerDivider: {
            height: 1,
            backgroundColor: safeBorder,
            opacity: 0.5,
        },
        exerciseWrapper: {
            paddingHorizontal: 12,
            marginTop: 12,
        },
        footer: {
            padding: 16,
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
        clearButton: {
            paddingVertical: 12,
            alignItems: 'center',
        },
        clearButtonText: {
            fontSize: 15,
            fontFamily: FONTS.medium,
            color: theme.textSecondary,
        },
    });
};

export default EditTemplate;
