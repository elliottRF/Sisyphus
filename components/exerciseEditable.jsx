import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, UIManager, Dimensions, LayoutAnimation, Pressable, Keyboard, TextInput } from 'react-native'
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
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useReorderableDrag, useIsActive } from 'react-native-reorderable-list';

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

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = -100;

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
    // Flash overlay: opacity 0 → 1 → 0 when row is filled
    const fillFlash = useSharedValue(0);

    const flashOverlayStyle = useAnimatedStyle(() => ({
        opacity: fillFlash.value,
    }));

    const handleFillPress = () => {
        if (!fillData || set.completed) return;
        // Quick pop then fade out
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
                    entering={FadeIn.duration(180)}
                    exiting={FadeOut.duration(150)}
                />
            )}

            {/* Fill-tap flash overlay — sits above completedBackground, below content */}
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
                            key={columnText} // Key moves to the wrapper so the whole badge fades in/out
                            entering={FadeIn.duration(200)}
                            style={[
                                styles.prevTextContainer, // General container styles
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
                                {columnText}
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
                            entering={set.completed ? ZoomIn.springify().damping(25) : undefined}
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
    onPrewarmDetails,
    simultaneousHandlers,
    onSetComplete,
    isCardio,
    isAssisted,
    isTemplate = false,
    hidePrevious = false,
    muscleOccurrenceIndex = 1,
    PRMODE = false
}) => {
    const { theme, useImperial, repRangeMin, repRangeMax } = useTheme();
    const styles = getStyles(theme);
    const [isNoteVisible, setIsNoteVisible] = useState(false);
    const [previousSets, setPreviousSets] = useState([]);

    const drag = useReorderableDrag();
    const isActive = useIsActive();

    const brightColor = useMemo(() => lightenColor(theme.primary, 20), [theme.primary]);

    useEffect(() => {
        if (isTemplate || hidePrevious) return;
        const loadPreviousData = async () => {
            try {
                const prevSets = await fetchLastWorkoutSets(exerciseID);
                setPreviousSets(prevSets);
            } catch (error) {
                console.error("Error loading previous sets:", error);
            }
        };
        loadPreviousData();
    }, [exerciseID, isTemplate, hidePrevious]);

    const [lifetimePRs, setLifetimePRs] = useState(null);

    useEffect(() => {
        if (!PRMODE || isAssisted) return;
        if (isTemplate || hidePrevious || isCardio) return;
        const loadPRs = async () => {
            try {
                const prs = await fetchLifetimePRs(exerciseID);
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
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        if (!set.completed) {
            Keyboard.dismiss();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            //playTapSound();
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

    // New progressive-overload logic (replaces old computeSuggestion + adjustedSuggestions)
    const showSuggestion = PRMODE && !isTemplate && !hidePrevious && !isCardio && !isAssisted;

    const workingSuggestions = useWorkoutSuggestions({
        showSuggestion,
        exerciseID,
        repRangeMin,
        repRangeMax,
        isAssisted,
        muscleOccurrenceIndex,
    });

    // Whether the header should show the suggestion icon or "PREVIOUS" label.
    const headerKey = showSuggestion ? 'suggest' : 'prev';

    let prevWarmupIndex = 0;
    let prevWorkingIndex = 0;
    let suggestWorkingIndex = 0;

    return (
        <View style={[styles.container, isActive && styles.containerActive]}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <TouchableOpacity
                        style={styles.dragHandle}
                        onLongPress={drag}
                        delayLongPress={100}
                        activeOpacity={0.7}
                    >
                        <MaterialIcons name="drag-indicator" size={20} color={theme.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={onOpenDetails}
                        onPressIn={onPrewarmDetails}
                        onLongPress={drag}
                        delayLongPress={100}
                        style={{ flex: 1 }}
                    >
                        <Text style={styles.exerciseName} numberOfLines={1}>{exerciseName}</Text>
                    </TouchableOpacity>
                </View>

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
                    <TouchableOpacity onPress={deleteExercise} style={styles.iconButton}>
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
                        entering={FadeIn.duration(220)}
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
            <View style={styles.setsContainer}>
                {exercise.sets.reduce((acc, set, index) => {
                    let displayNumber = index + 1;
                    if (set.setType === 'W') displayNumber = 'W';
                    else if (set.setType === 'D') displayNumber = 'D';
                    else {
                        const normalSetCount = exercise.sets.slice(0, index).filter(s => !s.setType || s.setType === 'N').length;
                        displayNumber = normalSetCount + 1;
                    }

                    // --- PREVIOUS column (always computed for warmups + non-suggestion mode) ---
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

                    // --- SUGGESTION column (new progressive overload logic) ---
                    let suggestionText = '-';
                    let computedSuggestion = null;
                    let fillData = null;

                    if (showSuggestion) {
                        const isWarmup = set.setType === 'W';
                        if (isWarmup) {
                            // Warmups are not progressively overloaded – just copy last warmup
                            if (prevSet) {
                                suggestionText = `${formatWeight(prevSet.weight, useImperial)} × ${prevSet.reps}`;
                                fillData = { weight: prevSet.weight || 0, reps: prevSet.reps || 0 };
                            }
                        } else {
                            // Working sets use the new computeNextSet logic from the hook
                            const suggestIndex = suggestWorkingIndex++;
                            const computed = workingSuggestions[suggestIndex];
                            if (computed) {
                                suggestionText = `${formatWeight(computed.weight, useImperial)} × ${computed.reps}`;
                                computedSuggestion = computed;
                                fillData = { weight: computed.weight, reps: computed.reps };
                            }
                        }
                    } else if (prevSet) {
                        // Non-PRMODE → classic previous fill
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
                        <SwipeableSetRow
                            key={set.id || index}
                            onDelete={() => deleteSet(index)}
                            index={index}
                            simultaneousHandlers={simultaneousHandlers}
                            isExerciseDragging={isActive}
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
                    );
                    return acc;
                }, [])}
            </View>

            {/* Footer */}
            <TouchableOpacity style={styles.addSetButton} onPress={addNewSet} activeOpacity={0.6}>
                <Text style={styles.addSetText}>+ ADD SET</Text>
            </TouchableOpacity>
        </View>
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
        containerActive: {
            borderColor: safePrimary,
            backgroundColor: theme.surface,
            elevation: 10,
            shadowColor: lightTheme ? '#7C8FAA' : "#000",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: lightTheme ? 0.18 : 0.25,
            shadowRadius: 16,
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
        textWarmup: { color: '#fdcb6e' },
        badgeDrop: { backgroundColor: withAlpha(theme.info, lightTheme ? 0.16 : 0.2) },
        textDrop: { color: '#74b9ff' },

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