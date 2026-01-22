import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, UIManager, Dimensions, LayoutAnimation, Pressable, Keyboard, TextInput } from 'react-native'
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withSpring,
    runOnJS,
    LinearTransition,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useReorderableDrag, useIsActive } from 'react-native-reorderable-list';

import { FONTS, SHADOWS } from '../constants/theme'
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { fetchLastWorkoutSets } from './db';
import { useTheme } from '../context/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = -100;



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
            // Delayed focus to ensure state updates first
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
                    style={[styles.textInputInternal, { color: editable ? theme.text : theme.textSecondary, width: '100%', height: '100%' }]}
                    value={value}
                    onChangeText={onChangeText}
                    placeholder={placeholder}
                    placeholderTextColor={placeholderTextColor}
                    keyboardType={keyboardType}
                    maxLength={maxLength}
                    editable={editable}
                    onBlur={() => setIsFocused(false)}
                    selectTextOnFocus
                    autoFocus
                />
            ) : (
                <Text style={[styles.textInputInternal, { color: editable ? theme.text : theme.textSecondary }]}>
                    {value || placeholder}
                </Text>
            )}
        </Pressable>
    );
};

const SwipeableSetRow = ({ children, onDelete, index, simultaneousHandlers, isExerciseDragging }) => {
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
        // Safe for Reanimated: opacity and scale are numbers
        const opacity = withTiming(translateX.value < -20 ? 1 : 0);
        const scale = withSpring(translateX.value < -40 ? 1 : 0.5);
        return { opacity, transform: [{ scale }] };
    });

    const rRedBoxStyle = useAnimatedStyle(() => ({
        width: -translateX.value,
    }));

    const rDeleteBackgroundStyle = useAnimatedStyle(() => ({
        opacity: translateX.value < -5 ? 1 : 0, // Only show red background when swiping
    }));

    return (
        <Animated.View
            style={styles.swipeableContainer}
        >
            <Animated.View style={[styles.deleteBackground, rDeleteBackgroundStyle]}>
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

const ExerciseEditable = ({ exercise, exerciseName, updateCurrentWorkout, exerciseID, workoutID, onOpenDetails, simultaneousHandlers, onSetComplete, isCardio, isTemplate = false }) => {
    const { theme } = useTheme();
    const styles = getStyles(theme);
    const [isNoteVisible, setIsNoteVisible] = useState(false);
    const [previousSets, setPreviousSets] = useState([]);

    // Use the reorderable list hooks
    const drag = useReorderableDrag();
    const isActive = useIsActive();

    useEffect(() => {
        if (isTemplate) return; // Don't load previous sets for templates
        const loadPreviousData = async () => {
            try {
                const prevSets = await fetchLastWorkoutSets(exerciseID);
                setPreviousSets(prevSets);
            } catch (error) {
                console.error("Error loading previous sets:", error);
            }
        };
        loadPreviousData();
    }, [exerciseID, isTemplate]);

    const handleWeightChange = (text, setIndex) => {
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.map(e => e.id === exercise.id ? { ...e, sets: e.sets.map((s, i) => i === setIndex ? { ...s, weight: text } : s) } : e) } : w));
    };
    const handleRepsChange = (text, setIndex) => {
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.map(e => e.id === exercise.id ? { ...e, sets: e.sets.map((s, i) => i === setIndex ? { ...s, reps: text } : s) } : e) } : w));
    };
    const handleDistanceChange = (text, setIndex) => {
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.map(e => e.id === exercise.id ? { ...e, sets: e.sets.map((s, i) => i === setIndex ? { ...s, distance: text } : s) } : e) } : w));
    };
    const handleMinutesChange = (text, setIndex) => {
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.map(e => e.id === exercise.id ? { ...e, sets: e.sets.map((s, i) => i === setIndex ? { ...s, minutes: text } : s) } : e) } : w));
    };
    const toggleSetComplete = (setIndex) => {
        if (isTemplate) return; // No completion in templates
        const set = exercise.sets[setIndex];
        if (!set.completed) {
            Keyboard.dismiss();
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

    let previousSetIndex = 0;

    return (
        <View style={[
            styles.container,
            isActive && styles.containerActive
        ]}>
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
                    <TouchableOpacity onPress={onOpenDetails} style={{ flex: 1 }}>
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
                {!isTemplate ? (
                    <Text style={[styles.columnHeader, styles.colPrev]}>PREVIOUS</Text>
                ) : (
                    <View style={{ flex: 1 }} />
                )}
                <Text style={[styles.columnHeader, styles.colKg]}>{isCardio ? "DIST (km)" : "KG"}</Text>
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

                    let prevSetText = '-';
                    const prevSet = previousSets[previousSetIndex];
                    if (prevSet) {
                        if (isCardio) {
                            // Convert previous seconds to minutes for display
                            const prevMins = prevSet.seconds ? (prevSet.seconds / 60).toFixed(1).replace(/\.0$/, '') : '0';
                            prevSetText = `${prevSet.distance || 0}km / ${prevMins}m`;
                        } else {
                            prevSetText = `${prevSet.weight} × ${prevSet.reps}`;
                        }
                        previousSetIndex++;
                    }

                    acc.push(
                        <SwipeableSetRow
                            key={set.id || index}
                            onDelete={() => deleteSet(index)}
                            index={index}
                            simultaneousHandlers={simultaneousHandlers}
                            isExerciseDragging={isActive}
                        >
                            <View style={styles.setRow}>
                                {set.completed && <View style={styles.completionOverlay} />}
                                <View style={styles.colSet}>
                                    <TouchableOpacity
                                        onPress={() => toggleSetType(index)}
                                        style={[
                                            styles.setNumberBadge,
                                            set.setType === 'W' && styles.badgeWarmup,
                                            set.setType === 'D' && styles.badgeDrop
                                        ]}
                                    >
                                        <Text style={[
                                            styles.setNumberText,
                                            set.setType === 'W' && styles.textWarmup,
                                            set.setType === 'D' && styles.textDrop
                                        ]}>
                                            {displayNumber}
                                        </Text>
                                    </TouchableOpacity>
                                </View>

                                {!isTemplate ? (
                                    <Text style={[styles.prevText, styles.colPrev]} numberOfLines={1}>{prevSetText}</Text>
                                ) : (
                                    <View style={{ flex: 1 }} />
                                )}

                                <View style={styles.colKg}>
                                    <ScrollableInput
                                        style={styles.inputContainer}
                                        value={isCardio ? set.distance?.toString() : set.weight?.toString()}
                                        onChangeText={(text) => isCardio ? handleDistanceChange(text, index) : handleWeightChange(text, index)}
                                        placeholder="-"
                                        placeholderTextColor={theme.textSecondary}
                                        keyboardType="numeric"
                                        maxLength={6}
                                        editable={!set.completed}
                                        theme={theme}
                                        styles={styles}
                                    />
                                </View>

                                <View style={styles.colReps}>
                                    <ScrollableInput
                                        style={styles.inputContainer}
                                        value={isCardio ? set.minutes?.toString() : set.reps?.toString()}
                                        onChangeText={(text) => isCardio ? handleMinutesChange(text, index) : handleRepsChange(text, index)}
                                        placeholder="-"
                                        placeholderTextColor={theme.textSecondary}
                                        keyboardType="numeric"
                                        maxLength={4}
                                        editable={!set.completed}
                                        theme={theme}
                                        styles={styles}
                                    />
                                </View>

                                {!isTemplate && (
                                    <View style={styles.colCheck}>
                                        <TouchableOpacity
                                            style={[styles.checkButton, set.completed && styles.checkButtonCompleted]}
                                            onPress={() => toggleSetComplete(index)}
                                        >
                                            <Feather name="check" size={14} color={set.completed ? '#fff' : 'transparent'} />
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
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
    )
}

const getStyles = (theme) => {
    // Determine safe colors for Reanimated components
    const isDynamic = theme.type === 'dynamic';
    const safeSurface = isDynamic ? '#1e1e1e' : theme.surface;
    const safeError = isDynamic ? '#EF4444' : (theme.error || '#EF4444');
    const safePrimary = isDynamic ? '#2DC4B6' : theme.primary;
    const safeSuccess = isDynamic ? '#22c55e' : (theme.success || '#22c55e');

    return StyleSheet.create({
        container: {
            backgroundColor: theme.surface,
            borderRadius: 12,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: 'transparent',
        },
        containerActive: {
            borderColor: safePrimary,
            backgroundColor: theme.surface,
            elevation: 10,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 3.84,
        },
        header: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingVertical: 10,
            backgroundColor: theme.surface,
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
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
            backgroundColor: theme.overlayMedium,
            borderRadius: 4,
            padding: 8,
            minHeight: 32,
        },
        tableHeader: {
            flexDirection: 'row',
            paddingHorizontal: 12,
            paddingVertical: 6,
            alignItems: 'center',
            backgroundColor: theme.overlaySubtle,
        },
        columnHeader: {
            fontSize: 10,
            fontFamily: FONTS.bold,
            color: theme.textSecondary,
            textAlign: 'center',
            letterSpacing: 0.5,
        },
        colSet: { width: 30, alignItems: 'center', justifyContent: 'center' },
        colPrev: { flex: 1, textAlign: 'center' },
        colKg: { width: 65, marginHorizontal: 2 },
        colReps: { width: 65, marginHorizontal: 2 },
        colCheck: { width: 30, alignItems: 'center' },

        setsContainer: {
            backgroundColor: theme.surface,
        },
        swipeableContainer: {
            overflow: 'hidden',
            backgroundColor: 'transparent',
        },
        deleteBackground: {
            ...StyleSheet.absoluteFillObject,
            backgroundColor: safeError,
            flexDirection: 'row',
            justifyContent: 'flex-end',
            alignItems: 'center',
            paddingRight: 16,
        },
        deleteActionRegion: {
            alignItems: 'center',
            justifyContent: 'center'
        },
        deleteIconContainer: {
            // Add this style if missing
            alignItems: 'center',
            justifyContent: 'center',
        },
        rowForeground: {
            // Add this style if missing
            backgroundColor: 'transparent',
        },

        setRow: {
            backgroundColor: theme.surface,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingVertical: 4,
            borderBottomWidth: 1,
            borderBottomColor: theme.overlayMedium,
            overflow: 'hidden',
        },
        completionOverlay: {
            ...StyleSheet.absoluteFillObject,
            backgroundColor: 'rgba(0,255,0,0.05)',
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
        badgeWarmup: { backgroundColor: 'rgba(253, 203, 110, 0.2)' },
        textWarmup: { color: '#fdcb6e' },
        badgeDrop: { backgroundColor: 'rgba(116, 185, 255, 0.2)' },
        textDrop: { color: '#74b9ff' },

        prevText: {
            fontSize: 12,
            fontFamily: FONTS.regular,
            color: theme.textSecondary,
            textAlign: 'center',
            opacity: 0.7,
        },

        inputContainer: {
            backgroundColor: theme.overlayInput,
            borderRadius: 4,
            height: 32,
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: theme.overlayBorder,
        },
        inputFocused: {
            borderColor: safePrimary,
            backgroundColor: theme.overlayInputFocused,
        },
        inputDisabled: {
            opacity: 0.5,
            backgroundColor: 'transparent',
            borderWidth: 0,
        },
        textInputInternal: {
            textAlign: 'center',
            fontFamily: FONTS.bold,
            fontSize: 16,
            padding: 0,
            includeFontPadding: false,
        },

        checkButton: {
            width: 24,
            height: 24,
            borderRadius: 4,
            backgroundColor: theme.overlayBorder,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: theme.overlayBorder,
        },
        checkButtonCompleted: {
            backgroundColor: safeSuccess,
            borderColor: safeSuccess,
        },

        addSetButton: {
            paddingVertical: 10,
            alignItems: 'center',
            backgroundColor: theme.overlaySubtle,
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 12,
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