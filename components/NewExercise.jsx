import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    ScrollView as RNScrollView, Animated, ActivityIndicator
} from 'react-native';
import Body from 'react-native-body-highlighter';
import { insertExercise, updateExercise, fetchExercises, getCachedExercises, recalculateExercisePRs, updateExerciseEquipment, getExerciseUsage, deleteExercise } from '../components/db';
import { EquipmentEditor } from './EquipmentEditor';
import Collapsible from './Collapsible';
import { EQUIPMENT, EQUIPMENT_PHRASES, isPlateLoaded, parseEquipment, serialiseEquipment, guessEquipmentType } from '../utils/equipment';
import { FONTS, getThemedShadow, isLightTheme, withAlpha } from '../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useScrollHandlers } from 'react-native-actions-sheet';
import { NativeViewGestureHandler } from 'react-native-gesture-handler';
import { useTheme } from '../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context'; // <-- Added this import
import * as haptics from '../utils/haptics';
import { emit, AppEvents } from '../utils/events';
import { customAlert } from '../utils/customAlert';
import { updateExerciseSnapshot, getExerciseSnapshotSync } from '../utils/exerciseSnapshots';

const MUSCLE_OPTIONS = [
    'Chest', 'Triceps', 'Deltoids', 'Trapezius', 'Upper-Back', 'Lower-Back',
    'Biceps', 'Forearm', 'Abs', 'Quadriceps', 'Hamstring', 'Gluteal',
    'Calves', 'Adductors', 'Neck', 'Obliques'
];

// Map any-cased muscle name or slug back to its canonical MUSCLE_OPTIONS value
// (the body diagram and snapshot store lowercase slugs; we keep capitalised
// names so the chips match and Save writes the right format).
const OPTION_BY_SLUG = MUSCLE_OPTIONS.reduce((acc, opt) => {
    acc[opt.toLowerCase()] = opt;
    return acc;
}, {});
const canonicalMuscle = (m) => OPTION_BY_SLUG[String(m || '').trim().toLowerCase()] || null;

const blankEquipment = (type) => {
    if (isPlateLoaded(type)) {
        return {
            type,
            bar: type === EQUIPMENT.PLATE_MACHINE ? 0 : null,
            plates: null,
            perSide: true,
        };
    }
    if (type === EQUIPMENT.DUMBBELL) return { type, ladder: null, extra: [], pair: false };
    if (type === EQUIPMENT.STACK) return { type, stack: [], addOns: [] };
    return null;
};

const MUSCLE_DISPLAY_NAMES = {
    'Gluteal': 'Glutes',
    'Upper-Back': 'Back',
    'Lower-Back': 'Lower Back',
    'Forearm': 'Forearms',
    'Hamstring': 'Hamstrings'
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
    const textColor = activeProgress.interpolate({ inputRange: [0, 1], outputRange: [theme.text, theme.textAlternate ?? '#ffffff'] });

    return (
        <Animated.View style={{ transform: [{ scale: pressScale }], opacity: isDisabled ? 0.4 : 1 }}>
            <TouchableOpacity
                activeOpacity={1}
                onPress={onPress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
            >
                <Animated.View style={[styles.chip, { backgroundColor: activeBg }]}>
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
    const { theme, gender, useImperial, gymEquipment } = useTheme();
    // Memoised: `styles` is a prop of the React.memo'd AnimatedMuscleChip, and
    // there is one chip per muscle — a new object each render re-rendered them all.
    const styles = useMemo(() => getStyles(theme), [theme]);
    const handlers = useScrollHandlers();
    const insets = useSafeAreaInsets(); // <-- Initialize safe area insets

    // Seed the muscle selection and name synchronously from the warmed snapshot cache so
    // the body diagram and title are rendered on the first paint (no pop-in). The async
    // load below reconciles it with the DB (same values → no flicker).
    const seededData = useMemo(() => {
        const snap = props.exerciseID ? getExerciseSnapshotSync(props.exerciseID) : null;
        const norm = (arr) => (Array.isArray(arr) ? arr.map(canonicalMuscle).filter(Boolean) : []);
        return { 
            name: snap?.name || '',
            target: norm(snap?.muscles?.target), 
            accessory: norm(snap?.muscles?.accessory) 
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Equipment and isCardio are not in the snapshot above, but they ARE in
    // the exercise-list cache, so seed them from there for the same reason.
    //
    // Getting these wrong on the first paint is not cosmetic. A null
    // equipment reads exactly like an exercise that has none, and isCardio
    // false like one that is not cardio -- so the form offered "looks like a
    // barbell" to an exercise configured months ago, showed the whole
    // Equipment section to a cardio exercise, and rendered the muscle
    // sections for one before animating them away.
    const seededEquipment = useMemo(() => {
        if (!props.exerciseID) return { known: true, equipment: null, isCardio: false };
        const row = (getCachedExercises() || []).find((ex) => ex.exerciseID === props.exerciseID);
        if (!row) return { known: false, equipment: null, isCardio: false };
        return { known: true, equipment: parseEquipment(row.equipment), isCardio: !!row.isCardio };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const [exerciseName, setExerciseName] = useState(seededData.name);
    const [targetSelected, setTargetSelected] = useState(seededData.target);
    const [accessorySelected, setAccessorySelected] = useState(seededData.accessory);
    const [isCardio, setIsCardio] = useState(seededEquipment.isCardio);
    const [isAssisted, setIsAssisted] = useState(false);
    const [originalIsAssisted, setOriginalIsAssisted] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    // What this exercise's weight is made of. Held as a config object (or
    // null for "not set") and serialised on save.
    const [equipment, setEquipment] = useState(seededEquipment.equipment);
    // False only when the cache was cold, which is the one case that has to
    // wait for the read below rather than draw a guess it cannot make yet.
    const [equipmentLoaded, setEquipmentLoaded] = useState(seededEquipment.known);
    // What is standing in the way of deleting this exercise, or null while
    // we do not know yet. Only ever asked for in edit mode.
    const [usage, setUsage] = useState(null);
    const [deleting, setDeleting] = useState(false);
    // What the exercise looked like when it was loaded. Equipment lives on
    // this screen but is not part of the exercise definition, so opening it
    // to set a bar weight and saving must not run the definition update --
    // that sets userCustomised, which freezes the exercise's muscle groups
    // against every future catalogue correction. Before equipment existed
    // nobody opened this screen without meaning to edit the exercise; now
    // they will, constantly.
    const originalDefinitionRef = useRef(null);
    const isCanonical = props.exerciseID && props.exerciseID < 1000;
    const equipmentGuess = useMemo(() => guessEquipmentType(exerciseName), [exerciseName]);

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
                    setEquipment(parseEquipment(exercise.equipment));
                    originalDefinitionRef.current = {
                        name: exercise.name,
                        targetMuscle: exercise.targetMuscle || '',
                        accessoryMuscles: exercise.accessoryMuscles || '',
                        isCardio: exercise.isCardio ? 1 : 0,
                        isAssisted: exercise.isAssisted ? 1 : 0,
                    };

                    const targets = exercise.targetMuscle ? exercise.targetMuscle.split(',').map((m) => m.trim()) : [];
                    const accessories = exercise.accessoryMuscles ? exercise.accessoryMuscles.split(',').map((m) => m.trim()) : [];

                    setTargetSelected(targets);
                    setAccessorySelected(accessories);
                }
                setEquipmentLoaded(true);
                try {
                    setUsage(await getExerciseUsage(props.exerciseID));
                } catch (e) {
                    // Without an answer the control stays hidden, which fails
                    // towards keeping the exercise.
                    console.error('Failed to read exercise usage:', e);
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

    // Tap a muscle on the figure to cycle it: unset → primary → secondary → unset
    // (the same three intensities the diagram already renders). Keeps the body
    // and the chip lists in perfect sync since both drive the same state.
    const handleBodyPartPress = (bodyPart) => {
        if (isCardio) return; // muscles don't apply to cardio
        const slug = bodyPart?.slug;
        if (!slug) return;
        const option = MUSCLE_OPTIONS.find(m => m.toLowerCase() === slug);
        if (!option) return; // a body part we don't expose as a selectable muscle

        haptics.select();
        const inTarget = targetSelected.includes(option);
        const inAccessory = accessorySelected.includes(option);
        if (!inTarget && !inAccessory) {
            setTargetSelected(prev => [...prev, option]);
        } else if (inTarget) {
            setTargetSelected(prev => prev.filter(m => m !== option));
            setAccessorySelected(prev => [...prev, option]);
        } else {
            setAccessorySelected(prev => prev.filter(m => m !== option));
        }
    };

    const formatListToString = (list) => {
        if (!Array.isArray(list)) throw new Error('Input must be an array');
        return list.map((item) => String(item).trim()).filter((item) => item.length > 0).join(',');
    };

    // Deleting is deliberately narrow: built-ins come back on the next launch
    // because they are re-seeded from the catalogue, and an exercise with
    // history behind it cannot go without taking logged sets with it. Both are
    // enforced in db.jsx too -- this only decides what to show.
    const deleteBlockedReason = () => {
        if (!usage || usage.canDelete) return null;
        if (usage.isBuiltIn) return 'Built-in exercises are part of the app and cannot be deleted.';
        const bits = [];
        if (usage.sets > 0) {
            bits.push(
                `${usage.sets} logged ${usage.sets === 1 ? 'set' : 'sets'} across ` +
                `${usage.sessions} ${usage.sessions === 1 ? 'workout' : 'workouts'}`
            );
        }
        if (usage.templates.length > 0) {
            bits.push(`the ${usage.templates.map((t) => `"${t}"`).join(', ')} ${usage.templates.length === 1 ? 'template' : 'templates'}`);
        }
        return `Kept because your training refers to it — ${bits.join(' and ')}.`;
    };

    const handleDelete = () => {
        if (!usage?.canDelete || deleting) return;
        customAlert(
            'Delete Exercise',
            `Delete "${exerciseName}"? It has never been logged, so nothing else changes. This cannot be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        setDeleting(true);
                        try {
                            await deleteExercise(props.exerciseID);
                            emit(AppEvents.WORKOUT_DATA_IMPORTED);
                            props.close?.({ deleted: true });
                        } catch (e) {
                            console.error('Failed to delete exercise:', e);
                            customAlert('Could Not Delete', e?.message || 'Something went wrong.');
                            setDeleting(false);
                        }
                    },
                },
            ]
        );
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
            const before = originalDefinitionRef.current;
            const definitionChanged = !before
                || before.name !== newExerciseObj.name
                || before.targetMuscle !== newExerciseObj.targetMuscle
                || before.accessoryMuscles !== newExerciseObj.accessoryMuscles
                || before.isCardio !== newExerciseObj.isCardio
                || before.isAssisted !== newExerciseObj.isAssisted;

            if (definitionChanged) {
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

        // Equipment goes through its own writer: it describes the user's gym
        // rather than the exercise, so it is saveable on a built-in exercise
        // whose name and type are locked, and it must not mark the exercise
        // as customised (which would freeze its muscles against future
        // catalogue updates).
        await updateExerciseEquipment(
            props.exerciseID || newExerciseObj.exerciseID,
            serialiseEquipment(isCardio ? null : equipment)
        );

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

    const safeBorder = theme.border;
    const safeBodyColors = [theme.bodyFill, theme.primary, `${theme.primary}60`];
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

    const canSave = exerciseName.trim().length > 0;
    // Derive from props (not the async-loaded isEditMode) so the title doesn't
    // flash "New Exercise" → "Edit Exercise" on open.
    const headerTitle = props.exerciseID ? 'Edit Exercise' : 'New Exercise';

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {props.isScreen && (
                <View style={styles.header}>
                    <Text style={styles.headerTitle} numberOfLines={1}>{headerTitle}</Text>
                    <TouchableOpacity
                        onPress={() => props.close?.()}
                        style={styles.headerClose}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        activeOpacity={0.7}
                    >
                        <Feather name="x" size={22} color={theme.text} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={handleSave}
                        disabled={!canSave}
                        activeOpacity={0.9}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <GradientOrView
                            colors={[theme.primary, theme.secondary]}
                            theme={theme}
                            style={[styles.headerSaveButton, !canSave && styles.saveButtonDisabled]}
                        >
                            <Text style={styles.headerSaveButtonText}>Save</Text>
                        </GradientOrView>
                    </TouchableOpacity>
                </View>
            )}
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
                    {/* Body highlighter – tap a muscle to cycle primary/secondary */}
                    <View style={styles.bodyWrapper}>
                        <Body
                            data={formattedTargets}
                            gender={gender}
                            side="front"
                            scale={0.75}
                            border={safeBorder}
                            colors={safeBodyColors}
                            defaultFill={theme.bodyFill}
                            onBodyPartPress={handleBodyPartPress}
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
                            onBodyPartPress={handleBodyPartPress}
                        />
                    </View>
                    {!isCardio && (
                        <Text style={styles.bodyHint}>
                            Tap a muscle: once for primary, again for secondary
                        </Text>
                    )}

                    {/* Rest of content slides + fades in */}
                    <Animated.View style={{ opacity: entranceOpacity, transform: [{ translateY: entranceY }] }}>

                        <View style={[styles.inputContainer, isCanonical && { opacity: 0.6 }]}>
                            <Feather name={isCanonical ? "lock" : "edit-2"} size={20} color={theme.textSecondary} style={styles.inputIcon} />
                            <TextInput
                                style={styles.input}
                                onChangeText={setExerciseName}
                                value={exerciseName}
                                placeholder="Exercise Name"
                                placeholderTextColor={theme.textSecondary}
                                keyboardType="default"
                                editable={!isCanonical}
                            />
                        </View>

                        {isCanonical && (
                            <View style={styles.infoNote}>
                                <Feather name="info" size={15} color={theme.textSecondary} style={{ marginTop: 1 }} />
                                <Text style={styles.infoNoteText}>
                                    Built-in exercise — you can adjust its muscle groups, but the name and type are fixed.
                                </Text>
                            </View>
                        )}

                        <AnimatedCard
                            style={[styles.cardioToggleCard, { transform: [{ scale: cardioScale }] }, isCanonical && { opacity: 0.6 }]}
                            activeOpacity={0.85}
                            onPress={() => {
                                if (isCanonical) return;
                                punchScale(cardioScale);
                                setIsCardio(!isCardio);
                                if (!isCardio) setIsAssisted(false);
                            }}
                        >
                            <View style={styles.cardioTextWrapper}>
                                <Text style={styles.label}>Cardio Exercise</Text>
                            </View>
                            {isCanonical ? (
                                <Feather name="lock" size={20} color={theme.textSecondary} />
                            ) : (
                                <Feather
                                    name={isCardio ? "check-circle" : "circle"}
                                    size={26}
                                    color={isCardio ? theme.primary : theme.textSecondary}
                                />
                            )}
                        </AnimatedCard>

                        <AnimatedCard
                            style={[styles.cardioToggleCard, { transform: [{ scale: assistedScale }] }, isCanonical && { opacity: 0.6 }]}
                            activeOpacity={0.85}
                            onPress={() => {
                                if (isCanonical) return;
                                punchScale(assistedScale);
                                setIsAssisted(!isAssisted);
                                if (!isAssisted) setIsCardio(false);
                            }}
                        >
                            <View style={styles.cardioTextWrapper}>
                                <Text style={styles.label}>Assisted Machine</Text>
                            </View>
                            {isCanonical ? (
                                <Feather name="lock" size={20} color={theme.textSecondary} />
                            ) : (
                                <Feather
                                    name={isAssisted ? "check-circle" : "circle"}
                                    size={26}
                                    color={isAssisted ? theme.primary : theme.textSecondary}
                                />
                            )}
                        </AnimatedCard>

                        {/* Equipment. Deliberately outside the isCanonical lock:
                            the name and muscles of a built-in exercise are ours,
                            but what the machine in front of the user weighs is
                            theirs, and most people never create an exercise at
                            all. Hidden for cardio, where there is no weight. */}
                        {/* Held back until the exercise's own equipment is known.
                            Rendering on the first paint showed this section to a
                            cardio exercise and offered "looks like a barbell" to one
                            configured months ago, then took both away again. That was
                            always wrong; it was a single frame before these blocks
                            animated, and a visible 220ms afterwards.

                            Mounting once, already settled, also means neither block
                            animates on arrival: Collapsible only grows what opens
                            AFTER it mounts. */}
                        {equipmentLoaded && (
                        <Collapsible open={!isCardio}>
                            <View style={styles.sectionContainer}>
                                <View style={styles.sectionTitleRow}>
                                    <Text style={styles.sectionTitle}>Equipment</Text>
                                </View>
                                {/* Tapping this sets the equipment, which is what
                                    hides it -- so it has to collapse rather than
                                    vanish out from under the finger. */}
                                <Collapsible open={!equipment && equipmentGuess !== EQUIPMENT.NONE}>
                                    <TouchableOpacity
                                        style={styles.guessRow}
                                        onPress={() => setEquipment(blankEquipment(equipmentGuess))}
                                        activeOpacity={0.7}
                                    >
                                        <Feather name="zap" size={14} color={theme.primary} />
                                        <Text style={styles.guessText}>
                                            Looks like {EQUIPMENT_PHRASES[equipmentGuess]} — set it up
                                        </Text>
                                    </TouchableOpacity>
                                </Collapsible>
                                <EquipmentEditor
                                    value={equipment}
                                    onChange={setEquipment}
                                    theme={theme}
                                    useImperial={useImperial}
                                    gym={gymEquipment}
                                />
                            </View>
                        </Collapsible>
                        )}

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
                                <View style={styles.sectionTitleRow}>
                                    <Text style={styles.sectionTitle}>Target Muscles</Text>
                                    {targetSelected.length > 0 && (
                                        <Text style={styles.sectionCount}>{targetSelected.length}</Text>
                                    )}
                                </View>
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
                                <View style={styles.sectionTitleRow}>
                                    <Text style={styles.sectionTitle}>Secondary Muscles</Text>
                                    {accessorySelected.length > 0 && (
                                        <Text style={styles.sectionCount}>{accessorySelected.length}</Text>
                                    )}
                                </View>
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

                        {!props.isScreen && (
                            <>
                                <TouchableOpacity onPress={handleSave} activeOpacity={0.9} disabled={!canSave}>
                                    <GradientOrView
                                        colors={[theme.primary, theme.secondary]}
                                        theme={theme}
                                        style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
                                    >
                                        <Text style={styles.saveButtonText}>
                                            {isEditMode ? 'Update Exercise' : 'Create Exercise'}
                                        </Text>
                                    </GradientOrView>
                                </TouchableOpacity>
                                {!canSave && (
                                    <Text style={styles.saveHint}>Add a name to save</Text>
                                )}
                            </>
                        )}

                        {/* Delete lives at the bottom, after everything that
                            edits the exercise, and only once we know whether it
                            can go. A control that looks available and then
                            refuses is worse than one that explains itself. */}
                        {isEditMode && usage && !usage.isBuiltIn && (
                            <View style={styles.dangerZone}>
                                <TouchableOpacity
                                    style={[styles.deleteButton, !usage.canDelete && styles.deleteButtonDisabled]}
                                    onPress={handleDelete}
                                    disabled={!usage.canDelete || deleting}
                                    activeOpacity={0.7}
                                >
                                    {deleting
                                        ? <ActivityIndicator size="small" color={theme.error} />
                                        : <Feather name="trash-2" size={16} color={usage.canDelete ? theme.error : theme.textSecondary} />}
                                    <Text style={[styles.deleteText, !usage.canDelete && { color: theme.textSecondary }]}>
                                        Delete Exercise
                                    </Text>
                                </TouchableOpacity>
                                {!usage.canDelete && (
                                    <Text style={styles.deleteHint}>{deleteBlockedReason()}</Text>
                                )}
                            </View>
                        )}

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
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: 12,
        },
        dangerZone: { marginTop: 28, gap: 8 },
        deleteButton: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 13,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: withAlpha(theme.error, 0.35),
            backgroundColor: withAlpha(theme.error, 0.08),
        },
        deleteButtonDisabled: {
            borderColor: theme.border,
            backgroundColor: 'transparent',
        },
        deleteText: {
            fontFamily: FONTS.semiBold,
            fontSize: 15,
            color: theme.error,
        },
        deleteHint: {
            fontFamily: FONTS.regular,
            fontSize: 13,
            lineHeight: 18,
            color: theme.textSecondary,
            textAlign: 'center',
            paddingHorizontal: 8,
        },
        headerTitle: {
            color: theme.text,
            fontFamily: FONTS.bold,
            fontSize: 22,
            letterSpacing: -0.3,
            flex: 1,
        },
        headerClose: {
            width: 34,
            height: 34,
            borderRadius: 17,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: lightTheme ? theme.overlaySubtle : theme.surface,
        },
        headerSaveButton: {
            marginLeft: 10,
            paddingHorizontal: 18,
            height: 34,
            borderRadius: 17,
            alignItems: 'center',
            justifyContent: 'center',
            ...getThemedShadow(theme, 'small'),
        },
        headerSaveButtonText: {
            color: theme.textAlternate ?? '#FFFFFF',
            fontSize: 15,
            fontFamily: FONTS.bold,
            letterSpacing: 0.3,
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
            marginBottom: 10,
            ...getThemedShadow(theme, 'small'),
        },
        bodyHint: {
            color: theme.textSecondary,
            fontFamily: FONTS.medium,
            fontSize: 12.5,
            textAlign: 'center',
            marginBottom: 20,
        },
        infoNote: {
            flexDirection: 'row',
            gap: 8,
            backgroundColor: lightTheme ? theme.overlaySubtle : theme.surface,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            marginBottom: 20,
        },
        infoNoteText: {
            flex: 1,
            color: theme.textSecondary,
            fontFamily: FONTS.regular,
            fontSize: 13,
            lineHeight: 18,
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
        },
        guessRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            alignSelf: 'flex-start',
            paddingHorizontal: 10,
            paddingVertical: 7,
            borderRadius: 100,
            backgroundColor: theme.overlayInput,
            marginBottom: 12,
        },
        guessText: {
            fontSize: 12,
            fontFamily: FONTS.semiBold,
            color: theme.primary,
        },
        sectionTitleRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
        },
        sectionTitle: {
            color: theme.text,
            fontFamily: FONTS.bold,
            fontSize: 16,
        },
        sectionCount: {
            minWidth: 20,
            textAlign: 'center',
            color: theme.textAlternate ?? '#FFFFFF',
            backgroundColor: theme.primary,
            fontFamily: FONTS.bold,
            fontSize: 12,
            overflow: 'hidden',
            borderRadius: 10,
            paddingHorizontal: 6,
            paddingVertical: 2,
        },
        chipContainer: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            marginHorizontal: -4,
        },
        chip: {
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
        saveButtonDisabled: {
            opacity: 0.45,
        },
        saveButtonText: {
            color: theme.textAlternate ?? '#FFFFFF',
            fontSize: 18,
            fontFamily: FONTS.bold,
            letterSpacing: 0.5,
        },
        saveHint: {
            textAlign: 'center',
            color: theme.textSecondary,
            fontFamily: FONTS.medium,
            fontSize: 13,
            marginTop: 10,
        },
    });
};

export default NewExercise;
