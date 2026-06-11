import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, UIManager, Dimensions, Pressable, Keyboard, TextInput } from 'react-native'
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withSpring,
    withSequence,
    runOnJS,
    LinearTransition,
    FadeIn,
    FadeOut,
    ZoomIn,
    Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { FONTS, getThemedShadow, isLightTheme, withAlpha } from '../constants/theme'
import { Feather, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchLastWorkoutSets, fetchLifetimePRs } from './db';
import { useTheme } from '../context/ThemeContext';
import { formatWeight, unitLabel } from '../utils/units';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import {
    getPRType,
    useWorkoutSuggestions,
} from './suggestions';
import CustomAlert from './CustomAlert';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = -100;

// Session caches: the reorderable list force-remounts cells after a drag,
// which resets component state. These warm-start remounted cards so the
// previous/PR columns render their values immediately instead of flashing
// "-" while the data refetches.
const prevSetsCache = new Map();
const lifetimePRsCache = new Map();

const lightenColor = (color, percent) => {
    if (!color || typeof color !== 'string' || !color.startsWith('#')) return color;
    try {
        const num = parseInt(color.replace("#", ""), 16),
            amt = Math.round(2.55 * percent),
            R = (num >> 16) + amt,
            G = (num >> 8 & 0x00FF) + amt,
            B = (num & 0x0000FF) + amt;
        return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 + (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
    } catch (e) {
        return color;
    }
};


// Compact Scrollable Input
const ScrollableInput = ({ value, onChangeText, placeholder, keyboardType, maxLength, style, placeholderTextColor, editable = true, theme, styles }) => {
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => {
        const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
            if (isFocused) {
                inputRef.current?.blur();
                setIsFocused(false);
            }
        });
        return () => keyboardDidHideListener.remove();
    }, [isFocused]);

    const handlePress = () => {
        if (editable) {
            setIsFocused(true);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    };

    return (
        <Pressable
            style={[style, isFocused && styles.inputFocused, !editable && styles.inputDisabled]}
            onPress={handlePress}
        >
            {isFocused ? (
                <TextInput
                    ref={inputRef}
                    style={[
                        styles.textInputInternal,
                        {
                            color: editable ? theme.text : theme.textSecondary,
                            width: '100%',
                            height: '100%',
                        }
                    ]}
                    value={value || ""}
                    onChangeText={onChangeText}
                    placeholder={placeholder}
                    placeholderTextColor={placeholderTextColor}
                    keyboardType="numeric"
                    maxLength={maxLength}
                    editable={editable}
                    onBlur={() => setIsFocused(false)}
                    selectTextOnFocus
                    autoFocus
                    multiline={Platform.OS === 'android'}
                    blurOnSubmit={true}
                    selectionColor={theme.primary}
                    cursorColor={theme.primary}
                    underlineColorAndroid="transparent"
                />
            ) : (
                <Text style={[styles.textInputInternal, { color: editable ? theme.text : theme.textSecondary }]}>
                    {value || placeholder}
                </Text>
            )}
        </Pressable>
    );
};

const SwipeableSetRow = ({ children, onDelete, index, simultaneousHandlers, isExerciseDragging, completed }) => {
    const { theme } = useTheme();
    const styles = getStyles(theme);
    const translateX = useSharedValue(0);

    const pan = Gesture.Pan()
        .activeOffsetX([-10, 10])
        .failOffsetY([-5, 5])
        .failOffsetY([-5, 5])
        .onUpdate((event) => {
            if (isExerciseDragging) return;
            translateX.value = Math.min(event.translationX, 0);
        })
        .onEnd(() => {
            if (translateX.value < SWIPE_THRESHOLD) {
                translateX.value = withTiming(-SCREEN_WIDTH, { duration: 300 }, (finished) => {
                    if (finished) runOnJS(onDelete)();
                });
            } else {
                translateX.value = withSpring(0);
            }
        });

    const rStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    const rIconStyle = useAnimatedStyle(() => {
        const opacity = withTiming(translateX.value < -20 ? 1 : 0);
        const scale = withSpring(translateX.value < -40 ? 1 : 0.5);
        return { opacity, transform: [{ scale }] };
    });

    const rRedBoxStyle = useAnimatedStyle(() => ({
        width: -translateX.value,
    }));

    return (
        <Animated.View style={[styles.swipeableContainer]}>
            <Animated.View style={styles.deleteBackground}>
                <Animated.View style={[styles.deleteActionRegion, rRedBoxStyle]}>
                    <Animated.View style={[styles.deleteIconContainer, rIconStyle]}>
                        <Feather name="trash-2" size={18} color={theme.text} />
                    </Animated.View>
                </Animated.View>
            </Animated.View>
            <GestureDetector gesture={pan}>
                <Animated.View style={[styles.rowForeground, rStyle]}>
                    {children}
                </Animated.View>
            </GestureDetector>
        </Animated.View>
    );
};

// ─── SetRowBody ───────────────────────────────────────────────────────────────
const SetRowBody = React.memo(({
    set, index, displayNumber,
    isTemplate, hidePrevious,
    columnText, fillData,
    showSuggestion, computedSuggestion,
    isLifetimePRSuggestion, brightColor,
    isCardio, theme, styles,
    onFillFromPrevious,
    onToggleSetType, onToggleSetComplete,
    onWeightChange, onRepsChange,
    onDistanceChange, onMinutesChange,
}) => {
    const fillFlash = useSharedValue(0);

    const flashOverlayStyle = useAnimatedStyle(() => ({
        opacity: fillFlash.value,
    }));

    // Mount guard: the reorderable list remounts cells after a drag, which would
    // replay all `entering` animations. Suppress them on (re)mount; only animate
    // genuine state changes that happen after mount.
    const hasMountedRef = useRef(false);
    useEffect(() => { hasMountedRef.current = true; }, []);

    // Previous/suggestion text: dissolve to the new value when it actually
    // changes. No animation on mount/remount, and none when the value is equal
    // (e.g. reordering in "previous" mode, where history doesn't depend on order).
    const cellTextOpacity = useSharedValue(1);
    const [displayedText, setDisplayedText] = useState(columnText);
    const displayedTextRef = useRef(columnText);

    useEffect(() => {
        if (columnText === displayedTextRef.current) return;
        displayedTextRef.current = columnText;
        cellTextOpacity.value = withSequence(
            withTiming(0, { duration: 110 }, (finished) => {
                if (finished) runOnJS(setDisplayedText)(columnText);
            }),
            withTiming(1, { duration: 160 })
        );
    }, [columnText, cellTextOpacity]);

    const cellTextStyle = useAnimatedStyle(() => ({
        opacity: cellTextOpacity.value,
    }));

    const handleFillPress = () => {
        if (!fillData || set.completed) return;
        fillFlash.value = withSequence(
            withTiming(1, { duration: 80 }),
            withTiming(0, { duration: 420 }),
        );
        onFillFromPrevious(index, fillData);
    };

    const color = brightColor;
    const bgColor = withAlpha(brightColor, isLightTheme(theme) ? 0.14 : 0.25);
    const borderColor = withAlpha(brightColor, isLightTheme(theme) ? 0.24 : 0.4);

    return (
        <View style={styles.setRow}>
            {set.completed && (
                <Animated.View
                    style={styles.completedBackground}
                    entering={hasMountedRef.current ? FadeIn.duration(180) : undefined}
                    exiting={FadeOut.duration(150)}
                />
            )}

            {/* Fill-tap flash overlay */}
            <Animated.View
                style={[StyleSheet.absoluteFillObject, styles.fillFlashOverlay, flashOverlayStyle]}
                pointerEvents="none"
            />

            {/* SET column */}
            <View style={styles.colSet}>
                <TouchableOpacity
                    onPress={() => onToggleSetType(index)}
                    style={[
                        styles.setNumberBadge,
                        set.setType === 'W' && styles.badgeWarmup,
                        set.setType === 'D' && styles.badgeDrop,
                    ]}
                >
                    <Text style={[
                        styles.setNumberText,
                        set.setType === 'W' && styles.textWarmup,
                        set.setType === 'D' && styles.textDrop,
                    ]}>
                        {displayNumber}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* PREVIOUS / SUGGESTION column */}
            {(!isTemplate && !hidePrevious) ? (
                <Pressable
                    style={styles.colPrev}
                    onPress={handleFillPress}
                    disabled={!fillData || set.completed}
                >
                    <View style={styles.prevContentWrapper}>
                        <Animated.View
                            style={[
                                cellTextStyle,
                                styles.prevTextContainer,
                                isLifetimePRSuggestion && {
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    backgroundColor: withAlpha(brightColor, 0.05),
                                    borderColor: withAlpha(brightColor, 0.1),
                                    borderWidth: 1,
                                    borderRadius: 10,
                                    paddingHorizontal: 8,
                                    paddingVertical: 3,
                                    gap: 3,
                                }
                            ]}
                        >
                            <Text
                                style={[
                                    styles.prevText,
                                    showSuggestion && computedSuggestion && styles.suggestionText,
                                    isLifetimePRSuggestion && {
                                        color: brightColor,
                                        fontFamily: FONTS.bold,
                                    },
                                ]}
                                numberOfLines={1}
                            >
                                {displayedText}
                            </Text>

                            {isLifetimePRSuggestion && (
                                <MaterialCommunityIcons
                                    name="trophy"
                                    size={11}
                                    color={brightColor}
                                    style={{ marginLeft: 2 }}
                                />
                            )}
                        </Animated.View>
                    </View>
                </Pressable>
            ) : (
                <View style={{ flex: 1 }} />
            )}

            {/* WEIGHT / DIST column */}
            <View style={styles.colKg}>
                <ScrollableInput
                    style={styles.inputContainer}
                    value={isCardio ? set.distance?.toString() : set.weight?.toString()}
                    onChangeText={(text) => isCardio ? onDistanceChange(text, index) : onWeightChange(text, index)}
                    placeholder="-"
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="numeric"
                    maxLength={6}
                    editable={!set.completed}
                    theme={theme}
                    styles={styles}
                />
            </View>

            {/* REPS / TIME column */}
            <View style={styles.colReps}>
                <ScrollableInput
                    style={styles.inputContainer}
                    value={isCardio ? set.minutes?.toString() : set.reps?.toString()}
                    onChangeText={(text) => isCardio ? onMinutesChange(text, index) : onRepsChange(text, index)}
                    placeholder="-"
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="numeric"
                    maxLength={4}
                    editable={!set.completed}
                    theme={theme}
                    styles={styles}
                />
            </View>

            {/* CHECK column */}
            {!isTemplate && (
                <View style={styles.colCheck}>
                    <TouchableOpacity
                        style={[styles.checkButton, set.completed && styles.checkButtonCompleted]}
                        onPress={() => onToggleSetComplete(index)}
                        hitSlop={{ top: 20, bottom: 20, left: 5, right: 20 }}
                    >
                        <Animated.View
                            key={`check-${set.id}-${set.completed}`}
                            entering={set.completed && hasMountedRef.current ? ZoomIn.duration(200).easing(Easing.out(Easing.back(1.5))) : undefined}
                        >
                            <Feather name="check" size={14} color={set.completed ? '#fff' : theme.textSecondary} />
                        </Animated.View>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
});

const ExerciseEditable = ({
    exercise,
    exerciseName,
    updateCurrentWorkout,
    exerciseID,
    workoutID,
    onOpenDetails,
    simultaneousHandlers,
    onSetComplete,
    isCardio,
    isAssisted,
    isTemplate = false,
    hidePrevious = false,
    muscleOccurrenceIndex = 1,
    PRMODE = false,
    onReorderStart,
    onReorderEnd,
    reorderFingerY
}) => {
    const { theme, useImperial, repRangeMin, repRangeMax } = useTheme();
    const styles = getStyles(theme);
    const [isNoteVisible, setIsNoteVisible] = useState(false);
    const [previousSets, setPreviousSets] = useState(() => prevSetsCache.get(exerciseID) ?? []);
    const [showDeleteAlert, setShowDeleteAlert] = useState(false);

    // The reorderable list remounts cells after a drag; suppress entering
    // animations on (re)mount so reordering doesn't make content flash.
    const hasMountedRef = useRef(false);
    useEffect(() => { hasMountedRef.current = true; }, []);

    // Hold-to-reorder: a pan that activates after a stationary hold on the
    // header. It hands the screen the absolute finger position (start +
    // every move) so the reorder overlay can place the held row directly
    // under the finger. Scroll wins if the finger moves before the hold
    // completes; quick taps fall through to onPress.
    const reorderPan = useMemo(() => {
        if (!onReorderStart || !onReorderEnd) return null;
        return Gesture.Pan()
            .activateAfterLongPress(250)
            .maxPointers(1)
            .shouldCancelWhenOutside(false)
            .onStart((e) => {
                'worklet';
                if (reorderFingerY) reorderFingerY.value = e.absoluteY;
                runOnJS(onReorderStart)(workoutID, e.absoluteY);
            })
            .onUpdate((e) => {
                'worklet';
                if (reorderFingerY) reorderFingerY.value = e.absoluteY;
            })
            .onFinalize(() => {
                'worklet';
                runOnJS(onReorderEnd)();
            });
    }, [onReorderStart, onReorderEnd, reorderFingerY, workoutID]);

    const brightColor = useMemo(() => lightenColor(theme.primary, 20), [theme.primary]);

    useEffect(() => {
        if (isTemplate || hidePrevious) return;
        const loadPreviousData = async () => {
            try {
                const prevSets = await fetchLastWorkoutSets(exerciseID);
                prevSetsCache.set(exerciseID, prevSets);
                setPreviousSets(prevSets);
            } catch (error) {
                console.error("Error loading previous sets:", error);
            }
        };
        loadPreviousData();
    }, [exerciseID, isTemplate, hidePrevious]);

    const [lifetimePRs, setLifetimePRs] = useState(() => lifetimePRsCache.get(exerciseID) ?? null);

    useEffect(() => {
        if (!PRMODE || isAssisted) return;
        if (isTemplate || hidePrevious || isCardio) return;
        const loadPRs = async () => {
            try {
                const prs = await fetchLifetimePRs(exerciseID);
                lifetimePRsCache.set(exerciseID, prs);
                setLifetimePRs(prs);
            } catch (e) { console.error(e); }
        };
        loadPRs();
    }, [exerciseID, PRMODE, isAssisted]);

    const sanitizeDecimal = (text) => {
        let cleaned = text.replace(/[^0-9.]/g, '');
        if (cleaned.startsWith('.')) cleaned = '0' + cleaned;
        const parts = cleaned.split('.');
        if (parts.length > 2) cleaned = parts[0] + '.' + parts.slice(1).join('');
        return cleaned;
    };

    const sanitizeInteger = (text) => text.replace(/[^0-9]/g, '');

    const handleWeightChange = (text, setIndex) => {
        const sanitized = sanitizeDecimal(text);
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.map(e => e.id === exercise.id ? { ...e, sets: e.sets.map((s, i) => i === setIndex ? { ...s, weight: sanitized } : s) } : e) } : w));
    };
    const handleRepsChange = (text, setIndex) => {
        const sanitized = sanitizeInteger(text);
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.map(e => e.id === exercise.id ? { ...e, sets: e.sets.map((s, i) => i === setIndex ? { ...s, reps: sanitized } : s) } : e) } : w));
    };
    const handleDistanceChange = (text, setIndex) => {
        const sanitized = sanitizeDecimal(text);
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.map(e => e.id === exercise.id ? { ...e, sets: e.sets.map((s, i) => i === setIndex ? { ...s, distance: sanitized } : s) } : e) } : w));
    };
    const handleMinutesChange = (text, setIndex) => {
        const sanitized = sanitizeInteger(text);
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.map(e => e.id === exercise.id ? { ...e, sets: e.sets.map((s, i) => i === setIndex ? { ...s, minutes: sanitized } : s) } : e) } : w));
    };

    const playTapSound = async () => {
        try {
            const { sound } = await Audio.Sound.createAsync(
                require('../assets/notifications/tap.mp3'),
                { volume: 0 }
            );
            await sound.playAsync();
            sound.setOnPlaybackStatusUpdate(async (status) => {
                if (status.didJustFinish) {
                    await sound.unloadAsync();
                }
            });
        } catch (error) {
            console.error("Failed to play tap sound", error);
        }
    };

    const toggleSetComplete = (setIndex) => {
        if (isTemplate) return;
        const set = exercise.sets[setIndex];
        if (!set.completed) {
            Keyboard.dismiss();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (onSetComplete) onSetComplete();
        }
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.map(e => e.id === exercise.id ? { ...e, sets: e.sets.map((s, i) => i === setIndex ? { ...s, completed: !s.completed } : s) } : e) } : w));
    };

    const toggleSetType = (setIndex) => {
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.map(e => e.id === exercise.id ? { ...e, sets: e.sets.map((s, i) => { if (i === setIndex) { const t = s.setType || 'N'; const n = t === 'N' ? 'W' : t === 'W' ? 'D' : 'N'; return { ...s, setType: n }; } return s; }) } : e) } : w));
    };
    const handleNoteChange = (text) => {
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.map(e => e.id === exercise.id ? { ...e, notes: text } : e) } : w));
    };
    const addNewSet = () => {
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.map(e => e.id === exercise.id ? { ...e, sets: [...e.sets, { id: Date.now().toString() + Math.random().toString(36).substr(2, 9), weight: null, reps: null, distance: null, minutes: null, completed: false, setType: 'N' }] } : e) } : w));
    };
    const deleteSet = (setIndex) => {
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.map(e => e.id === exercise.id ? { ...e, sets: e.sets.filter((_, i) => i !== setIndex) } : e) } : w));
    };
    const deleteExercise = () => {
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.filter(ex => ex.id !== exercise.id) } : w).filter(w => w.exercises.length > 0));
    };

    const fillFromPrevious = (setIndex, fillData) => {
        if (!fillData) return;
        const currentSet = exercise.sets[setIndex];
        if (currentSet.completed) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? {
            ...w,
            exercises: w.exercises.map(e => e.id === exercise.id ? {
                ...e,
                sets: e.sets.map((s, i) => i === setIndex ? {
                    ...s,
                    ...(isCardio
                        ? {
                            distance: fillData.distance?.toString() || s.distance,
                            minutes: fillData.minutes?.toString() || s.minutes,
                        }
                        : {
                            weight: fillData.weight?.toString() || s.weight,
                            reps: fillData.reps?.toString() || s.reps,
                        }
                    )
                } : s)
            } : e)
        } : w));
    };

    const { prevWarmups, prevWorking } = React.useMemo(() => ({
        prevWarmups: previousSets.filter(s => s.setType === 'W'),
        prevWorking: previousSets.filter(s => s.setType !== 'W'),
    }), [previousSets]);

    const showSuggestion = PRMODE && !isTemplate && !hidePrevious && !isCardio && !isAssisted;

    const workingSuggestions = useWorkoutSuggestions({
        showSuggestion,
        exerciseID,
        repRangeMin,
        repRangeMax,
        isAssisted,
        muscleOccurrenceIndex,
    });

    const headerKey = showSuggestion ? 'suggest' : 'prev';

    let prevWarmupIndex = 0;
    let prevWorkingIndex = 0;
    let suggestWorkingIndex = 0;

    const headerLeftContent = (
        <>
            <View style={styles.dragHandle}>
                <MaterialIcons name="drag-indicator" size={20} color={theme.textSecondary} />
            </View>
            <TouchableOpacity
                onPress={onOpenDetails}
                style={{ flex: 1 }}
            >
                <Text style={styles.exerciseName} numberOfLines={1}>{exerciseName}</Text>
            </TouchableOpacity>
        </>
    );

    return (
        <Animated.View
            style={styles.container}
            layout={LinearTransition.duration(200).easing(Easing.out(Easing.ease))}
        >
            {/* Header */}
            <View style={styles.header}>
                {reorderPan ? (
                    <GestureDetector gesture={reorderPan}>
                        <View style={styles.headerLeft} collapsable={false}>
                            {headerLeftContent}
                        </View>
                    </GestureDetector>
                ) : (
                    <View style={styles.headerLeft}>
                        {headerLeftContent}
                    </View>
                )}

                <View style={styles.headerActions}>
                    <TouchableOpacity
                        onPress={() => setIsNoteVisible(!isNoteVisible)}
                        style={styles.iconButton}
                    >
                        <MaterialIcons
                            name="sticky-note-2"
                            size={18}
                            color={exercise.notes && exercise.notes.length > 0 ? theme.primary : theme.textSecondary}
                        />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setShowDeleteAlert(true)} style={styles.iconButton}>
                        <Feather name="x" size={18} color={theme.textSecondary} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Note Input */}
            {isNoteVisible && (
                <View style={styles.noteContainer}>
                    <TextInput
                        style={styles.noteInput}
                        value={exercise.notes}
                        onChangeText={handleNoteChange}
                        placeholder="Add notes..."
                        placeholderTextColor={theme.textSecondary}
                        multiline
                    />
                </View>
            )}

            {/* Table Header */}
            <View style={styles.tableHeader}>
                <Text style={[styles.columnHeader, styles.colSet]}>SET</Text>
                {(!isTemplate && !hidePrevious) ? (
                    <Animated.View
                        key={headerKey}
                        entering={hasMountedRef.current ? FadeIn.duration(220) : undefined}
                        style={[styles.colPrev, { alignItems: 'center', justifyContent: 'center' }]}
                    >
                        {showSuggestion ? (
                            <MaterialCommunityIcons name="trending-up" size={12} color={theme.textSecondary} />
                        ) : (
                            <Text style={[styles.columnHeader]}>PREVIOUS</Text>
                        )}
                    </Animated.View>
                ) : (
                    <View style={{ flex: 1 }} />
                )}
                <Text style={[styles.columnHeader, styles.colKg]}>{isCardio ? "DIST (km)" : (isAssisted ? `ASSIST (${unitLabel(useImperial)})` : unitLabel(useImperial).toUpperCase())}</Text>
                <Text style={[styles.columnHeader, styles.colReps]}>{isCardio ? "TIME (min)" : "REPS"}</Text>
                {!isTemplate && <View style={styles.colCheck}><Feather name="check" size={12} color={theme.textSecondary} /></View>}
            </View>

            {/* Sets */}
            <Animated.View
                style={styles.setsContainer}
                layout={LinearTransition.duration(200).easing(Easing.out(Easing.ease))}
            >
                {exercise.sets.reduce((acc, set, index) => {
                    let displayNumber = index + 1;
                    if (set.setType === 'W') displayNumber = 'W';
                    else if (set.setType === 'D') displayNumber = 'D';
                    else {
                        const normalSetCount = exercise.sets.slice(0, index).filter(s => !s.setType || s.setType === 'N').length;
                        displayNumber = normalSetCount + 1;
                    }

                    let prevSetText = '-';
                    let prevSet = null;
                    prevSet = set.setType === 'W'
                        ? prevWarmups[prevWarmupIndex++]
                        : prevWorking[prevWorkingIndex++];

                    if (prevSet) {
                        if (isCardio) {
                            const prevMins = prevSet.seconds ? (prevSet.seconds / 60).toFixed(1).replace(/\.0$/, '') : '0';
                            prevSetText = `${prevSet.distance || 0}km / ${prevMins}mins`;
                        } else {
                            prevSetText = `${formatWeight(prevSet.weight, useImperial)} × ${prevSet.reps}`;
                        }
                    }

                    let suggestionText = '-';
                    let computedSuggestion = null;
                    let fillData = null;

                    if (showSuggestion) {
                        const isWarmup = set.setType === 'W';
                        if (isWarmup) {
                            if (prevSet) {
                                suggestionText = `${formatWeight(prevSet.weight, useImperial)} × ${prevSet.reps}`;
                                fillData = { weight: prevSet.weight || 0, reps: prevSet.reps || 0 };
                            }
                        } else {
                            const suggestIndex = suggestWorkingIndex++;
                            const computed = workingSuggestions[suggestIndex];
                            if (computed) {
                                suggestionText = `${formatWeight(computed.weight, useImperial)} × ${computed.reps}`;
                                computedSuggestion = computed;
                                fillData = { weight: computed.weight, reps: computed.reps };
                            }
                        }
                    } else if (prevSet) {
                        if (isCardio) {
                            fillData = {
                                distance: prevSet.distance || 0,
                                minutes: prevSet.seconds ? Math.round(prevSet.seconds / 60) : 0,
                            };
                        } else {
                            fillData = { weight: prevSet.weight || 0, reps: prevSet.reps || 0 };
                        }
                    }

                    const columnText = showSuggestion ? suggestionText : prevSetText;

                    const prType = getPRType(computedSuggestion, lifetimePRs, isCardio);
                    const isLifetimePRSuggestion =
                        showSuggestion &&
                        lifetimePRs !== null &&
                        prType !== null;

                    acc.push(
                        <Animated.View
                            key={set.id || index}
                            entering={hasMountedRef.current ? FadeIn.duration(180) : undefined}
                            exiting={FadeOut.duration(150)}
                            layout={LinearTransition.duration(200).easing(Easing.out(Easing.ease))}
                        >
                            <SwipeableSetRow
                                onDelete={() => deleteSet(index)}
                                index={index}
                                simultaneousHandlers={simultaneousHandlers}
                                isExerciseDragging={false}
                                completed={set.completed}
                            >
                                <SetRowBody
                                    set={set}
                                    index={index}
                                    displayNumber={displayNumber}
                                    isTemplate={isTemplate}
                                    hidePrevious={hidePrevious}
                                    columnText={columnText}
                                    fillData={fillData}
                                    showSuggestion={showSuggestion}
                                    computedSuggestion={computedSuggestion}
                                    isLifetimePRSuggestion={isLifetimePRSuggestion}
                                    brightColor={brightColor}
                                    isCardio={isCardio}
                                    theme={theme}
                                    styles={styles}
                                    onFillFromPrevious={fillFromPrevious}
                                    onToggleSetType={toggleSetType}
                                    onToggleSetComplete={toggleSetComplete}
                                    onWeightChange={handleWeightChange}
                                    onRepsChange={handleRepsChange}
                                    onDistanceChange={handleDistanceChange}
                                    onMinutesChange={handleMinutesChange}
                                />
                            </SwipeableSetRow>
                        </Animated.View>
                    );
                    return acc;
                }, [])}
            </Animated.View>

            {/* Footer */}
            <Animated.View layout={LinearTransition.duration(200).easing(Easing.out(Easing.ease))}>
                <TouchableOpacity style={styles.addSetButton} onPress={addNewSet} activeOpacity={0.6}>
                    <Text style={styles.addSetText}>+ ADD SET</Text>
                </TouchableOpacity>
            </Animated.View>

            <CustomAlert
                visible={showDeleteAlert}
                title="Remove Exercise"
                description={`Remove ${exerciseName} from this workout?`}
                iconType="destructive"
                onClose={() => setShowDeleteAlert(false)}
                buttons={[
                    {
                        text: 'Cancel',
                        style: 'cancel',
                    },
                    {
                        text: 'Remove',
                        style: 'destructive',
                        onPress: deleteExercise,
                    },
                ]}
            />
        </Animated.View>
    );
};

const getStyles = (theme) => {
    const isDynamic = theme.type === 'dynamic';
    const lightTheme = isLightTheme(theme);
    const safeSurface = isDynamic ? '#1e1e1e' : theme.surface;
    const safeError = isDynamic ? '#EF4444' : (theme.error || '#EF4444');
    const safePrimary = isDynamic ? '#2DC4B6' : theme.primary;
    const safeSuccess = isDynamic ? '#22c55e' : (theme.success || '#22c55e');
    const completedFill = withAlpha(safeSuccess, lightTheme ? 0.06 : 0.045);
    const fillFlashColor = withAlpha(safePrimary, lightTheme ? 0.12 : 0.18);

    return StyleSheet.create({
        container: {
            backgroundColor: theme.surface,
            borderRadius: 16,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: lightTheme ? theme.border : 'transparent',
            ...getThemedShadow(theme, 'small'),
        },
        header: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingVertical: 10,
            backgroundColor: lightTheme ? theme.overlaySubtle : theme.surface,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            borderBottomWidth: 1,
            borderBottomColor: lightTheme ? theme.overlayBorder : 'transparent',
        },
        headerLeft: {
            flexDirection: 'row',
            alignItems: 'center',
            flex: 1,
        },
        dragHandle: {
            paddingRight: 8,
            paddingVertical: 4,
        },
        exerciseName: {
            fontSize: 15,
            fontFamily: FONTS.bold,
            color: theme.primary,
        },
        headerActions: {
            flexDirection: 'row',
            gap: 12,
        },
        iconButton: {
            padding: 2,
        },
        noteContainer: {
            paddingHorizontal: 12,
            paddingBottom: 8,
            backgroundColor: theme.surface,
        },
        noteInput: {
            color: theme.text,
            fontFamily: FONTS.regular,
            fontSize: 13,
            backgroundColor: lightTheme ? theme.overlaySubtle : theme.overlayMedium,
            borderRadius: 8,
            padding: 10,
            minHeight: 32,
            borderWidth: 1,
            borderColor: lightTheme ? theme.overlayBorder : 'transparent',
        },
        tableHeader: {
            flexDirection: 'row',
            paddingHorizontal: 12,
            paddingVertical: 6,
            alignItems: 'center',
            backgroundColor: lightTheme ? theme.overlaySubtle : theme.overlaySubtle,
        },
        columnHeader: {
            fontSize: 10,
            fontFamily: FONTS.bold,
            color: theme.textSecondary,
            textAlign: 'center',
            letterSpacing: 0.5,
        },
        colSet: { width: 30, alignItems: 'center', justifyContent: 'center' },
        colPrev: { flex: 1, alignItems: 'center', justifyContent: 'center' },
        colKg: { width: 76, marginHorizontal: 2 },
        colReps: { width: 76, marginHorizontal: 2 },
        colCheck: { width: 30, alignItems: 'center' },

        setsContainer: {
            backgroundColor: theme.surface,
        },
        swipeableContainer: {
            overflow: 'hidden',
            backgroundColor: theme.surface,
            marginBottom: -StyleSheet.hairlineWidth,
        },
        deleteBackground: {
            ...StyleSheet.absoluteFillObject,
            flexDirection: 'row',
            justifyContent: 'flex-end',
            alignItems: 'center',
        },
        deleteActionRegion: {
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: safeError,
            height: '100%',
        },
        deleteIconContainer: {
            alignItems: 'center',
            justifyContent: 'center',
        },
        rowForeground: {
            backgroundColor: 'transparent',
        },
        setRow: {
            backgroundColor: 'transparent',
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingVertical: 6,
            overflow: 'hidden',
            position: 'relative',
        },
        completedBackground: {
            ...StyleSheet.absoluteFillObject,
            backgroundColor: completedFill,
            zIndex: -1,
        },
        fillFlashOverlay: {
            backgroundColor: fillFlashColor,
            zIndex: 0,
        },
        setNumberBadge: {
            width: 20,
            height: 20,
            borderRadius: 4,
            backgroundColor: 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
        },
        setNumberText: {
            fontSize: 13,
            fontFamily: FONTS.bold,
            color: theme.textSecondary,
        },
        badgeWarmup: { backgroundColor: withAlpha(theme.warning, lightTheme ? 0.18 : 0.2) },
        // Pastels are illegible on light surfaces — use the stronger theme tones there
        textWarmup: { color: lightTheme ? theme.warning : '#fdcb6e' },
        badgeDrop: { backgroundColor: withAlpha(theme.info, lightTheme ? 0.16 : 0.2) },
        textDrop: { color: lightTheme ? theme.info : '#74b9ff' },

        prevContentWrapper: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 3,
        },
        prevText: {
            fontSize: 12,
            fontFamily: FONTS.regular,
            color: theme.textSecondary,
            textAlign: 'center',
            opacity: 0.7,
            flexShrink: 1,
        },
        suggestionText: {
            color: safePrimary,
            opacity: 1,
        },

        inputContainer: {
            backgroundColor: lightTheme ? theme.background : theme.overlayInput,
            borderRadius: 8,
            height: 36,
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: lightTheme ? theme.border : theme.overlayBorder,
        },
        inputFocused: {
            borderColor: safePrimary,
            backgroundColor: lightTheme ? withAlpha(safePrimary, 0.08) : theme.overlayInputFocused,
        },
        inputDisabled: {
            opacity: 0.5,
            backgroundColor: 'transparent',
            borderWidth: 0,
        },
        textInputInternal: {
            textAlign: 'center',
            textAlignVertical: 'center',
            fontFamily: FONTS.bold,
            fontSize: 17,
            padding: 0,
            paddingHorizontal: 0,
            margin: 0,
            includeFontPadding: false,
        },
        checkButton: {
            width: 30,
            height: 30,
            borderRadius: 8,
            backgroundColor: lightTheme ? theme.background : theme.overlayBorder,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: lightTheme ? theme.border : theme.overlayBorder,
        },
        checkButtonCompleted: {
            backgroundColor: safeSuccess,
            borderColor: safeSuccess,
        },
        addSetButton: {
            paddingVertical: 12,
            alignItems: 'center',
            backgroundColor: lightTheme ? theme.overlaySubtle : theme.overlaySubtle,
            borderBottomLeftRadius: 16,
            borderBottomRightRadius: 16,
        },
        addSetText: {
            fontSize: 11,
            fontFamily: FONTS.bold,
            color: theme.primary,
            letterSpacing: 0.5,
        },
    });
};

export default React.memo(ExerciseEditable);