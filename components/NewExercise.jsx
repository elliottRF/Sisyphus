import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    ScrollView as RNScrollView, Animated
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
import { updateExerciseSnapshot, getExerciseSnapshotSync } from '../utils/exerciseSnapshots';

const MUSCLE_OPTIONS = [
    'Chest', 'Triceps', 'Deltoids', 'Trapezius', 'Upper-Back', 'Lower-Back',
    'Biceps', 'Forearm', 'Abs', 'Quadriceps', 'Hamstring', 'Gluteal',
    'Calves', 'Adductors', 'Neck', 'Obliques'
];

const MUSCLE_DISPLAY_NAMES = {
    'Gluteal': 'Glutes',
    'Upper-Back': 'Back',
    'Lower-Back': 'Lower Back',
};

// ─── Animated muscle chip ────────────────────────────────────────────────────
const AnimatedMuscleChip = React.memo(({ muscle, isSelected, isDisabled, onPress, styles, theme, inactiveBg }) => {
    const activeProgress = useRef(new Animated.Value(isSelected ? 1 : 0)).current;
    const pressScale = useRef(new Animated.Value(1)).current;

    // Cross-fade the active overlay whenever selection changes
    useEffect(() => {
        Animated.timing(activeProgress, {
            toValue: isSelected ? 1 : 0,
            duration: 180,
            useNativeDriver: false, // needed for backgroundColor
        }).start();
    }, [isSelected]);

    const handlePressIn = () =>
        Animated.spring(pressScale, { toValue: 0.92, speed: 40, bounciness: 2, useNativeDriver: true }).start();
    const handlePressOut = () =>
        Animated.spring(pressScale, { toValue: 1, speed: 24, bounciness: 5, useNativeDriver: true }).start();

    const activeBg = activeProgress.interpolate({ inputRange: [0, 1], outputRange: [inactiveBg, theme.primary] });
    const activeBorder = activeProgress.interpolate({ inputRange: [0, 1], outputRange: [theme.border, theme.primary] });
    const textColor = activeProgress.interpolate({ inputRange: [0, 1], outputRange: [theme.text, theme.textAlternate ?? '#ffffff'] });

    return (
        <Animated.View style={{ transform: [{ scale: pressScale }], opacity: isDisabled ? 0.4 : 1 }}>
            <TouchableOpacity
                activeOpacity={1}
                onPress={onPress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
            >
                <Animated.View style={[styles.chip, { backgroundColor: activeBg, borderColor: activeBorder }]}>
                    <Animated.Text style={[styles.chipText, { color: textColor }]}>
                        {MUSCLE_DISPLAY_NAMES[muscle] || muscle}
                    </Animated.Text>
                </Animated.View>
            </TouchableOpacity>
        </Animated.View>
    );
});

// ─── Chip row ─────────────────────────────────────────────────────────────────
const MuscleChips = ({ type, selectedData, handleMuscleToggle, accessorySelected, targetSelected, styles, theme, inactiveBg }) => (
    <View style={styles.chipContainer}>
        {MUSCLE_OPTIONS.map((muscle) => {
            const isSelected = selectedData.includes(muscle);
            const isDisabled = type === 'target'
                ? accessorySelected.includes(muscle)
                : targetSelected.includes(muscle);
            return (
                <AnimatedMuscleChip
                    key={muscle}
                    muscle={muscle}
                    isSelected={isSelected}
                    isDisabled={isDisabled}
                    onPress={() => handleMuscleToggle(muscle, type)}
                    styles={styles}
                    theme={theme}
                    inactiveBg={inactiveBg}
                />
            );
        })}
    </View>
);

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

        // Update snapshot cache for muscles and name so history screen is instant
        const existingSnapshot = getExerciseSnapshotSync(props.exerciseID || newExerciseObj.exerciseID);
        await updateExerciseSnapshot(props.exerciseID || newExerciseObj.exerciseID, {
            name: newExerciseObj.name,
            muscles: {
                target: targetSelected,
                accessory: accessorySelected
            }
        });

        emit(AppEvents.WORKOUT_DATA_IMPORTED);
        props.close(newExerciseObj);
    };

    const safeBorder = theme.type === 'dynamic' ? '#4d4d4d' : theme.border;
    const safeBodyColors = theme.type === 'dynamic'
        ? [theme.bodyFill, '#2DC4B6', '#2DC4B680']
        : [theme.bodyFill, theme.primary, `${theme.primary}60`];
    const chipInactiveBg = isLightTheme(theme) ? theme.background : theme.surface;

    // ── Entrance animation ──────────────────────────────────────────────────────
    const entranceOpacity = useRef(new Animated.Value(0)).current;
    const entranceY = useRef(new Animated.Value(24)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(entranceOpacity, {
                toValue: 1, duration: 320, useNativeDriver: true,
            }),
            Animated.spring(entranceY, {
                toValue: 0, speed: 14, bounciness: 5, useNativeDriver: true,
            }),
        ]).start();
    }, []);

    // ── Muscle section collapse when cardio is toggled ──────────────────────────
    const musclesAnim = useRef(new Animated.Value(isCardio ? 0 : 1)).current;

    useEffect(() => {
        Animated.timing(musclesAnim, {
            toValue: isCardio ? 0 : 1,
            duration: 260,
            useNativeDriver: false, // opacity + maxHeight need JS driver
        }).start();
    }, [isCardio]);

    // ── Animated toggle cards ───────────────────────────────────────────────────
    const cardioScale = useRef(new Animated.Value(1)).current;
    const assistedScale = useRef(new Animated.Value(1)).current;

    const punchScale = (anim) => {
        Animated.sequence([
            Animated.spring(anim, { toValue: 0.98, speed: 60, bounciness: 2, useNativeDriver: true }),
            Animated.spring(anim, { toValue: 1, speed: 30, bounciness: 6, useNativeDriver: true }),
        ]).start();
    };

    const AnimatedCard = Animated.createAnimatedComponent(TouchableOpacity);

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <NativeViewGestureHandler simultaneousHandlers={handlers.simultaneousHandlers}>
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
                    {/* Body highlighter – plain view, no animation */}
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

                    {/* Rest of content slides + fades in */}
                    <Animated.View style={{ opacity: entranceOpacity, transform: [{ translateY: entranceY }] }}>

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

                        <AnimatedCard
                            style={[styles.cardioToggleCard, { transform: [{ scale: cardioScale }] }]}
                            activeOpacity={0.85}
                            onPress={() => {
                                punchScale(cardioScale);
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
                        </AnimatedCard>

                        <AnimatedCard
                            style={[styles.cardioToggleCard, { transform: [{ scale: assistedScale }] }]}
                            activeOpacity={0.85}
                            onPress={() => {
                                punchScale(assistedScale);
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
                        </AnimatedCard>

                        {/* Muscle sections – animate out when Cardio is enabled */}
                        <Animated.View style={{
                            opacity: musclesAnim,
                            maxHeight: musclesAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, 2000],
                            }),
                            overflow: 'hidden',
                        }}>
                            <View style={styles.sectionContainer}>
                                <Text style={styles.sectionTitle}>Target Muscles</Text>
                                <MuscleChips
                                    type="target"
                                    selectedData={targetSelected}
                                    handleMuscleToggle={handleMuscleToggle}
                                    accessorySelected={accessorySelected}
                                    targetSelected={targetSelected}
                                    styles={styles}
                                    theme={theme}
                                    inactiveBg={chipInactiveBg}
                                />
                            </View>

                            <View style={styles.sectionContainer}>
                                <Text style={styles.sectionTitle}>Secondary Muscles</Text>
                                <MuscleChips
                                    type="accessory"
                                    selectedData={accessorySelected}
                                    handleMuscleToggle={handleMuscleToggle}
                                    accessorySelected={accessorySelected}
                                    targetSelected={targetSelected}
                                    styles={styles}
                                    theme={theme}
                                    inactiveBg={chipInactiveBg}
                                />
                            </View>
                        </Animated.View>

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

                    </Animated.View>
                </RNScrollView>
            </NativeViewGestureHandler>
        </View>
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
            borderWidth: 1,
            borderColor: theme.border,
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 20,
            margin: 4,
        },
        chipText: {
            fontFamily: FONTS.medium,
            fontSize: 14,
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
