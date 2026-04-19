import React, { useState, useEffect, useMemo } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    ScrollView as RNScrollView
} from 'react-native';
import Body from 'react-native-body-highlighter';
import { insertExercise, updateExercise, fetchExercises, recalculateExercisePRs } from '../components/db';
import { FONTS, getThemedShadow, isLightTheme } from '../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useScrollHandlers } from 'react-native-actions-sheet';
import { NativeViewGestureHandler } from 'react-native-gesture-handler';
import { useTheme } from '../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context'; // <-- Added this import
import { emit, AppEvents } from '../utils/events';

const MUSCLE_OPTIONS = [
    'Chest', 'Triceps', 'Deltoids', 'Trapezius', 'Upper-Back', 'Lower-Back',
    'Biceps', 'Forearm', 'Abs', 'Quadriceps', 'Hamstring', 'Gluteal',
    'Calves', 'Adductors', 'Neck', 'Obliques'
];

const GradientOrView = ({ colors, style, theme, children }) => {
    if (theme?.type === 'dynamic') {
        return (
            <View style={[style, { backgroundColor: theme.surface || '#ffffff' }]}>
                {children}
            </View>
        );
    }

    const safeColors = Array.isArray(colors) && colors.every(c => !!c)
        ? colors
        : ['transparent', 'transparent'];

    return (
        <LinearGradient colors={safeColors} style={style}>
            {children}
        </LinearGradient>
    );
};

const NewExercise = (props) => {
    const { theme, gender } = useTheme();
    const styles = getStyles(theme);
    const handlers = useScrollHandlers();
    const insets = useSafeAreaInsets(); // <-- Initialize safe area insets

    const [exerciseName, setExerciseName] = useState('');
    const [targetSelected, setTargetSelected] = useState([]);
    const [accessorySelected, setAccessorySelected] = useState([]);
    const [isCardio, setIsCardio] = useState(false);
    const [isAssisted, setIsAssisted] = useState(false);
    const [originalIsAssisted, setOriginalIsAssisted] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);

    // Load exercise data if exerciseID is provided
    useEffect(() => {
        const loadExercise = async () => {
            if (props.exerciseID) {
                setIsEditMode(true);
                const exercises = await fetchExercises();
                const exercise = exercises.find((ex) => ex.exerciseID === props.exerciseID);

                if (exercise) {
                    setExerciseName(exercise.name);
                    setIsCardio(!!exercise.isCardio);
                    setIsAssisted(!!exercise.isAssisted);
                    setOriginalIsAssisted(!!exercise.isAssisted);

                    const targets = exercise.targetMuscle ? exercise.targetMuscle.split(',').map((m) => m.trim()) : [];
                    const accessories = exercise.accessoryMuscles ? exercise.accessoryMuscles.split(',').map((m) => m.trim()) : [];

                    setTargetSelected(targets);
                    setAccessorySelected(accessories);
                }
            }
        };
        loadExercise();
    }, [props.exerciseID]);


    const ALL_MUSCLE_SLUGS = [
        'chest', 'quadriceps', 'triceps', 'biceps', 'hamstring',
        'upper-back', 'lower-back', 'deltoids', 'gluteal', 'forearm',
        'trapezius', 'calves', 'abs', 'adductors', 'obliques',
        'tibialis', 'abductors', 'neck', 'hands', 'feet', 'knees', 'ankles'
    ];






    // Derive formatted targets for the Body Highlighter automatically
    const formattedTargets = useMemo(() => {
        const workedSlugs = new Set();

        const targets = targetSelected.map(t => {
            const slug = t.toLowerCase();
            workedSlugs.add(slug);
            return { slug, intensity: 2 };
        });
        const accessories = accessorySelected.map(a => {
            const slug = a.toLowerCase();
            workedSlugs.add(slug);
            return { slug, intensity: 3 };
        });
        const unworked = ALL_MUSCLE_SLUGS
            .filter(slug => !workedSlugs.has(slug))
            .map(slug => ({ slug, intensity: 1 }));

        return [...targets, ...accessories, ...unworked];
    }, [targetSelected, accessorySelected]);

    const handleMuscleToggle = (muscle, type) => {
        if (type === 'target') {
            setTargetSelected(prev =>
                prev.includes(muscle) ? prev.filter(m => m !== muscle) : [...prev, muscle]
            );
            setAccessorySelected(prev => prev.filter(m => m !== muscle)); // Ensure mutually exclusive
        } else {
            setAccessorySelected(prev =>
                prev.includes(muscle) ? prev.filter(m => m !== muscle) : [...prev, muscle]
            );
            setTargetSelected(prev => prev.filter(m => m !== muscle)); // Ensure mutually exclusive
        }
    };

    const formatListToString = (list) => {
        if (!Array.isArray(list)) throw new Error('Input must be an array');
        return list.map((item) => String(item).trim()).filter((item) => item.length > 0).join(',');
    };

    const handleSave = async () => {
        if (!exerciseName.trim()) return;

        let newExerciseObj = {
            name: exerciseName,
            targetMuscle: formatListToString(targetSelected),
            accessoryMuscles: formatListToString(accessorySelected),
            isCardio: isCardio ? 1 : 0,
            isAssisted: isAssisted ? 1 : 0
        };

        if (isEditMode && props.exerciseID) {
            await updateExercise(
                props.exerciseID,
                newExerciseObj.name,
                newExerciseObj.targetMuscle,
                newExerciseObj.accessoryMuscles,
                newExerciseObj.isCardio,
                newExerciseObj.isAssisted
            );
            if (originalIsAssisted !== isAssisted) {
                await recalculateExercisePRs(props.exerciseID);
            }
            newExerciseObj.exerciseID = props.exerciseID;
        } else {
            const newId = await insertExercise(
                newExerciseObj.name,
                newExerciseObj.targetMuscle,
                newExerciseObj.accessoryMuscles,
                newExerciseObj.isCardio,
                newExerciseObj.isAssisted
            );
            newExerciseObj.exerciseID = newId;
        }

        emit(AppEvents.WORKOUT_DATA_IMPORTED);
        props.close(newExerciseObj);
    };

    const safeBorder = theme.type === 'dynamic' ? '#4d4d4d' : theme.border;
    const safeBodyColors = theme.type === 'dynamic'
        ? [theme.bodyFill, '#2DC4B6', '#2DC4B680']
        : [theme.bodyFill, theme.primary, `${theme.primary}60`];
    // Helper component to render inline muscle chips
    const MuscleChips = ({ type, selectedData }) => (
        <View style={styles.chipContainer}>
            {MUSCLE_OPTIONS.map((muscle) => {
                const isSelected = selectedData.includes(muscle);
                const isDisabled = type === 'target'
                    ? accessorySelected.includes(muscle)
                    : targetSelected.includes(muscle);

                return (
                    <TouchableOpacity
                        key={muscle}
                        activeOpacity={0.7}
                        onPress={() => handleMuscleToggle(muscle, type)}
                        style={[
                            styles.chip,
                            isSelected && styles.chipActive,
                            isDisabled && styles.chipDisabled
                        ]}
                    >
                        <Text style={[
                            styles.chipText,
                            isSelected && styles.chipTextActive,
                            isDisabled && styles.chipTextDisabled
                        ]}>
                            {muscle}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );

    return (
        < View style={[styles.container, { paddingTop: insets.top }]} >
            <NativeViewGestureHandler simultaneousHandlers={handlers.simultaneousHandlers} >
                <RNScrollView
                    {...handlers}
                    contentContainerStyle={[
                        styles.scrollContent,
                        { paddingBottom: insets.bottom + 20 }
                    ]}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                >
                    <View style={styles.bodyWrapper}>
                        <Body
                            data={formattedTargets}
                            gender={gender}
                            side="front"
                            scale={0.75}
                            border={safeBorder}
                            colors={safeBodyColors}
                            defaultFill={theme.bodyFill}
                        />
                        <View style={styles.bodyDivider} />
                        <Body
                            data={formattedTargets}
                            gender={gender}
                            side="back"
                            scale={0.75}
                            border={safeBorder}
                            colors={safeBodyColors}
                            defaultFill={theme.bodyFill}
                        />
                    </View>

                    <View style={styles.inputContainer}>
                        <Feather name="edit-2" size={20} color={theme.textSecondary} style={styles.inputIcon} />
                        <TextInput
                            style={styles.input}
                            onChangeText={setExerciseName}
                            value={exerciseName}
                            placeholder="Exercise Name"
                            placeholderTextColor={theme.textSecondary}
                            keyboardType="default"
                        />
                    </View>

                    <TouchableOpacity
                        style={styles.cardioToggleCard}
                        activeOpacity={0.8}
                        onPress={() => {
                            setIsCardio(!isCardio);
                            if (!isCardio) setIsAssisted(false);
                        }}
                    >
                        <View style={styles.cardioTextWrapper}>
                            <Text style={styles.label}>Cardio Exercise</Text>
                        </View>
                        <Feather
                            name={isCardio ? "check-circle" : "circle"}
                            size={26}
                            color={isCardio ? theme.primary : theme.textSecondary}
                        />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.cardioToggleCard}
                        activeOpacity={0.8}
                        onPress={() => {
                            setIsAssisted(!isAssisted);
                            if (!isAssisted) setIsCardio(false);
                        }}
                    >
                        <View style={styles.cardioTextWrapper}>
                            <Text style={styles.label}>Assisted Machine</Text>
                        </View>
                        <Feather
                            name={isAssisted ? "check-circle" : "circle"}
                            size={26}
                            color={isAssisted ? theme.primary : theme.textSecondary}
                        />
                    </TouchableOpacity>

                    {!isCardio && (
                        <>
                            <View style={styles.sectionContainer}>
                                <Text style={styles.sectionTitle}>Target Muscles</Text>
                                <MuscleChips type="target" selectedData={targetSelected} />
                            </View>

                            <View style={styles.sectionContainer}>
                                <Text style={styles.sectionTitle}>Secondary Muscles</Text>
                                <MuscleChips type="accessory" selectedData={accessorySelected} />
                            </View>
                        </>
                    )}

                    <TouchableOpacity onPress={handleSave} activeOpacity={0.9}>
                        <GradientOrView
                            colors={[theme.primary, theme.secondary]}
                            theme={theme}
                            style={styles.saveButton}
                        >
                            <Text style={styles.saveButtonText}>
                                {isEditMode ? 'Update Exercise' : 'Create Exercise'}
                            </Text>
                        </GradientOrView>
                    </TouchableOpacity>
                </RNScrollView>
            </NativeViewGestureHandler>
        </View >
    );
};

const getStyles = (theme) => {
    const lightTheme = isLightTheme(theme);
    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: theme.background,
        },
        scrollContent: {
            paddingHorizontal: 20,
        },
        bodyWrapper: {
            flexDirection: 'row',
            justifyContent: 'space-evenly',
            alignItems: 'center',
            paddingVertical: 0,
            backgroundColor: theme.surface,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: theme.border,
            marginBottom: 24,
            ...getThemedShadow(theme, 'small'),
        },
        bodyDivider: {
            width: 1,
            height: '80%',
            backgroundColor: theme.border,
            opacity: 0.5,
        },
        inputContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: lightTheme ? 'rgba(255,255,255,0.94)' : theme.surface,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: theme.border,
            paddingHorizontal: 16,
            marginBottom: 20,
            ...getThemedShadow(theme, 'small'),
        },
        inputIcon: {
            marginRight: 10,
        },
        input: {
            flex: 1,
            color: theme.text,
            fontFamily: FONTS.medium,
            fontSize: 16,
            paddingVertical: 16,
        },
        cardioToggleCard: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: theme.surface,
            padding: 18,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: theme.border,
            marginBottom: 24,
            ...getThemedShadow(theme, 'small'),
        },
        cardioTextWrapper: {
            flex: 1,
        },
        label: {
            color: theme.text,
            fontFamily: FONTS.bold,
            fontSize: 16,
        },
        subtext: {
            color: theme.textSecondary,
            fontFamily: FONTS.regular,
            fontSize: 13,
        },
        sectionContainer: {
            marginBottom: 24,
            backgroundColor: lightTheme ? 'rgba(255,255,255,0.72)' : 'transparent',
            borderRadius: 18,
            padding: lightTheme ? 16 : 0,
            borderWidth: lightTheme ? 1 : 0,
            borderColor: lightTheme ? theme.overlayBorder : 'transparent',
        },
        sectionTitle: {
            color: theme.text,
            fontFamily: FONTS.bold,
            fontSize: 16,
            marginBottom: 12,
        },
        chipContainer: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            marginHorizontal: -4,
        },
        chip: {
            backgroundColor: lightTheme ? theme.background : theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 20,
            margin: 4,
        },
        chipActive: {
            backgroundColor: theme.primary,
            borderColor: theme.primary,
        },
        chipDisabled: {
            opacity: 0.4,
        },
        chipText: {
            color: theme.text,
            fontFamily: FONTS.medium,
            fontSize: 14,
        },
        chipTextActive: {
            color: '#FFFFFF',
            color: theme.textAlternate
        },
        chipTextDisabled: {
            color: theme.textSecondary,
        },
        saveButton: {
            paddingVertical: 18,
            borderRadius: 30,
            alignItems: 'center',
            marginTop: 10,
            ...getThemedShadow(theme, 'medium'),
        },
        saveButtonText: {
            color: '#FFFFFF',
            fontSize: 18,
            fontFamily: FONTS.bold,
            letterSpacing: 0.5,
        },
    });
};

export default NewExercise;
