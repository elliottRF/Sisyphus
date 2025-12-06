import { View, Text, StyleSheet, TouchableOpacity, Platform, UIManager, Dimensions, LayoutAnimation, TextInput, Pressable, Keyboard } from 'react-native'
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withSpring,
    runOnJS,
    SlideOutLeft,
    LinearTransition,
    ZoomIn,
    ZoomOut
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import React, { useState, useRef, useEffect } from 'react'
import { COLORS, FONTS, SHADOWS } from '../constants/theme'
import { AntDesign, Feather, Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { fetchLastWorkoutSets } from './db';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = -100;

if (Platform.OS === 'android') {
    if (UIManager.setLayoutAnimationEnabledExperimental) {
        UIManager.setLayoutAnimationEnabledExperimental(true);
    }
}

const ScrollableInput = ({ value, onChangeText, placeholder, keyboardType, maxLength, style, placeholderTextColor, editable = true }) => {
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => {
        const keyboardDidHideListener = Keyboard.addListener(
            'keyboardDidHide',
            () => {
                if (isFocused) {
                    inputRef.current?.blur();
                }
            }
        );

        return () => {
            keyboardDidHideListener.remove();
        };
    }, [isFocused]);

    return (
        <View style={{ flex: 1, justifyContent: 'center' }}>
            <TextInput
                ref={inputRef}
                style={[style, { opacity: editable ? (isFocused ? 1 : 1) : 0.5 }]}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={placeholderTextColor}
                keyboardType={keyboardType}
                maxLength={maxLength}
                editable={editable}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
            />
            {!isFocused && editable && (
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={() => inputRef.current?.focus()}
                />
            )}
        </View>
    );
};

const SwipeableSetRow = ({ children, onDelete, index, simultaneousHandlers }) => {
    const translateX = useSharedValue(0);

    const pan = Gesture.Pan()
        .activeOffsetX([-10, 10]) // Allow vertical scroll without triggering swipe immediately
        .failOffsetY([-5, 5])     // Fail if vertical movement is detected
        .simultaneousWithExternalGesture(simultaneousHandlers)
        .onUpdate((event) => {
            // Only allow swiping to the left
            translateX.value = Math.min(event.translationX, 0);
        })
        .onEnd(() => {
            if (translateX.value < SWIPE_THRESHOLD) {
                // Swipe success - animate off screen then delete
                translateX.value = withTiming(-SCREEN_WIDTH, { duration: 300 }, (finished) => {
                    if (finished) {
                        runOnJS(onDelete)();
                    }
                });
            } else {
                // Swipe cancel - spring back
                translateX.value = withSpring(0);
            }
        });

    const rStyle = useAnimatedStyle(() => {
        return {
            transform: [{ translateX: translateX.value }],
        };
    });

    const rIconStyle = useAnimatedStyle(() => {
        // Icon fades in and scales up slightly
        const opacity = withTiming(translateX.value < -20 ? 1 : 0);
        const scale = withSpring(translateX.value < -40 ? 1 : 0.5);
        return {
            opacity,
            transform: [{ scale }]
        };
    });

    const rRedBoxStyle = useAnimatedStyle(() => {
        return {
            width: -translateX.value,
        };
    });

    return (
        <Animated.View
            layout={LinearTransition.duration(250)}
            entering={ZoomIn.duration(300)}
            exiting={ZoomOut.duration(300)}
            style={styles.swipeableContainer}
        >
            {/* Background (Reveal) */}
            <View style={styles.deleteBackground}>
                <Animated.View style={[styles.deleteActionRegion, rRedBoxStyle]}>
                    <Animated.View style={[styles.deleteIconContainer, rIconStyle]}>
                        <Feather name="trash-2" size={20} color={COLORS.text} />
                    </Animated.View>
                </Animated.View>
            </View>

            {/* Foreground (Set Row) */}
            <GestureDetector gesture={pan}>
                <Animated.View style={[styles.rowForeground, rStyle]}>
                    {children}
                </Animated.View>
            </GestureDetector>
        </Animated.View>
    );
};

const ExerciseEditable = ({ exercise, exerciseName, updateCurrentWorkout, exerciseID, workoutID, drag, isActive, onOpenDetails, simultaneousHandlers }) => {
    const [isNoteVisible, setIsNoteVisible] = useState(false);
    const [previousSets, setPreviousSets] = useState([]);

    useEffect(() => {
        const loadPreviousData = async () => {
            try {
                const prevSets = await fetchLastWorkoutSets(exerciseID);
                setPreviousSets(prevSets);
            } catch (error) {
                console.error("Error loading previous sets:", error);
            }
        };
        loadPreviousData();
    }, [exerciseID]);

    const handleWeightChange = (text, setIndex) => {
        updateCurrentWorkout(prevWorkout =>
            prevWorkout.map(workout =>
                workout.id === workoutID
                    ? {
                        ...workout,
                        exercises: workout.exercises.map(ex =>
                            ex.exerciseID === exerciseID
                                ? {
                                    ...ex,
                                    sets: ex.sets.map((set, index) =>
                                        index === setIndex
                                            ? { ...set, weight: text }
                                            : set
                                    )
                                }
                                : ex
                        )
                    }
                    : workout
            )
        );
    };

    const handleRepsChange = (text, setIndex) => {
        updateCurrentWorkout(prevWorkout =>
            prevWorkout.map(workout =>
                workout.id === workoutID
                    ? {
                        ...workout,
                        exercises: workout.exercises.map(ex =>
                            ex.exerciseID === exerciseID
                                ? {
                                    ...ex,
                                    sets: ex.sets.map((set, index) =>
                                        index === setIndex
                                            ? { ...set, reps: text }
                                            : set
                                    )
                                }
                                : ex
                        )
                    }
                    : workout
            )
        );
    };

    const toggleSetComplete = (setIndex) => {
        // Dismiss keyboard if marking as complete
        const set = exercise.sets[setIndex];
        if (!set.completed) {
            Keyboard.dismiss();
        }

        updateCurrentWorkout(prevWorkout =>
            prevWorkout.map(workout =>
                workout.id === workoutID
                    ? {
                        ...workout,
                        exercises: workout.exercises.map(ex =>
                            ex.exerciseID === exerciseID
                                ? {
                                    ...ex,
                                    sets: ex.sets.map((set, index) =>
                                        index === setIndex
                                            ? { ...set, completed: !set.completed }
                                            : set
                                    )
                                }
                                : ex
                        )
                    }
                    : workout
            )
        );
    };

    const toggleSetType = (setIndex) => {
        updateCurrentWorkout(prevWorkout =>
            prevWorkout.map(workout =>
                workout.id === workoutID
                    ? {
                        ...workout,
                        exercises: workout.exercises.map(ex =>
                            ex.exerciseID === exerciseID
                                ? {
                                    ...ex,
                                    sets: ex.sets.map((set, index) => {
                                        if (index === setIndex) {
                                            const currentType = set.setType || 'N';
                                            let nextType = 'N';
                                            if (currentType === 'N') nextType = 'W';
                                            else if (currentType === 'W') nextType = 'D';
                                            else nextType = 'N';
                                            return { ...set, setType: nextType };
                                        }
                                        return set;
                                    })
                                }
                                : ex
                        )
                    }
                    : workout
            )
        );
    };

    const handleNoteChange = (text) => {
        updateCurrentWorkout(prevWorkout =>
            prevWorkout.map(workout =>
                workout.id === workoutID
                    ? {
                        ...workout,
                        exercises: workout.exercises.map(ex =>
                            ex.exerciseID === exerciseID
                                ? { ...ex, notes: text }
                                : ex
                        )
                    }
                    : workout
            )
        );
    };

    const addNewSet = () => {
        updateCurrentWorkout(prevWorkout =>
            prevWorkout.map(workout =>
                workout.id === workoutID
                    ? {
                        ...workout,
                        exercises: workout.exercises.map(ex =>
                            ex.exerciseID === exerciseID
                                ? {
                                    ...ex,
                                    sets: [
                                        ...ex.sets,
                                        {
                                            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                                            weight: null,
                                            reps: null,
                                            completed: false,
                                            setType: 'N'
                                        }
                                    ]
                                }
                                : ex
                        )
                    }
                    : workout
            )
        );
    };

    const deleteSet = (setIndex) => {
        updateCurrentWorkout(prevWorkout =>
            prevWorkout.map(workout =>
                workout.id === workoutID
                    ? {
                        ...workout,
                        exercises: workout.exercises.map(ex =>
                            ex.exerciseID === exerciseID
                                ? {
                                    ...ex,
                                    sets: ex.sets.filter((_, index) => index !== setIndex)
                                }
                                : ex
                        )
                    }
                    : workout
            )
        );
    };

    const deleteExercise = () => {
        updateCurrentWorkout(prevWorkout =>
            prevWorkout.map(workout => ({
                ...workout,
                exercises: workout.exercises.filter(ex => ex.exerciseID !== exerciseID)
            })).filter(workout => workout.exercises.length > 0)
        );
    };

    // Logic to map previous sets to current sets, skipping warmups in current workout
    let previousSetIndex = 0;

    return (
        <View style={[
            styles.container,
            isActive && {
                borderColor: COLORS.primary,
                borderWidth: 1,
                ...SHADOWS.medium,
            }
        ]}>
            {/* Header */}
            <LinearGradient
                colors={[COLORS.surface, COLORS.surface]}
                style={styles.header}
            >
                <View style={styles.headerLeft}>
                    <TouchableOpacity
                        style={styles.dragHandle}
                        onLongPress={drag}
                        delayLongPress={200}
                        activeOpacity={0.7}
                    >
                        <MaterialIcons name="drag-handle" size={24} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onOpenDetails} style={{ flex: 1 }}>
                        <Text style={styles.exerciseName}>{exerciseName}</Text>
                    </TouchableOpacity>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TouchableOpacity
                        onPress={() => setIsNoteVisible(!isNoteVisible)}
                        style={[styles.menuButton, (exercise.notes && exercise.notes.length > 0) && { opacity: 1 }]}
                    >
                        <MaterialIcons
                            name="edit-note"
                            size={24}
                            color={exercise.notes && exercise.notes.length > 0 ? COLORS.primary : COLORS.textSecondary}
                        />
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={deleteExercise}
                        style={styles.menuButton}
                    >
                        <Feather name="x" size={20} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                </View>
            </LinearGradient>

            {/* Note Input */}
            {isNoteVisible && (
                <View style={styles.noteContainer}>
                    <TextInput
                        style={styles.noteInput}
                        value={exercise.notes}
                        onChangeText={handleNoteChange}
                        placeholder="Add notes..."
                        placeholderTextColor={COLORS.textSecondary}
                        multiline
                    />
                </View>
            )}

            {/* Table Header */}
            <View style={styles.tableHeader}>
                <Text style={[styles.columnHeader, styles.colSet]}>SET</Text>
                <Text style={[styles.columnHeader, styles.colPrev]}>PREVIOUS</Text>
                <Text style={[styles.columnHeader, styles.colKg]}>KG</Text>
                <Text style={[styles.columnHeader, styles.colReps]}>REPS</Text>
                <View style={styles.colCheck} />
            </View>

            {/* Sets */}
            <View style={styles.setsContainer}>
                {exercise.sets.reduce((acc, set, index) => {
                    // Calculate display number
                    let displayNumber = index + 1;
                    if (set.setType === 'W') displayNumber = 'W';
                    else if (set.setType === 'D') displayNumber = 'D';
                    else {
                        // Count how many previous sets were 'N' (or undefined/null which defaults to N)
                        const normalSetCount = exercise.sets.slice(0, index).filter(s => !s.setType || s.setType === 'N').length;
                        displayNumber = normalSetCount + 1;
                    }

                    // Determine previous set data
                    let prevSetText = '-';
                    if (set.setType !== 'W') {
                        // Only assign a previous set if the current set is NOT a warmup
                        const prevSet = previousSets[previousSetIndex];
                        if (prevSet) {
                            prevSetText = `${prevSet.weight}kg × ${prevSet.reps}`;
                            previousSetIndex++; // Move to next previous set
                        }
                    }

                    acc.push(
                        <SwipeableSetRow
                            key={set.id || index}
                            onDelete={() => deleteSet(index)}
                            index={index}
                            simultaneousHandlers={simultaneousHandlers}
                        >
                            <View style={[
                                styles.setRow,
                                set.completed && styles.setRowCompleted
                            ]}>
                                <View style={styles.colSet}>
                                    <TouchableOpacity
                                        onPress={() => toggleSetType(index)}
                                        style={[
                                            styles.setNumberBadge,
                                            set.setType === 'W' && { backgroundColor: 'rgba(253, 203, 110, 0.2)' }, // Warning/Yellow
                                            set.setType === 'D' && { backgroundColor: 'rgba(116, 185, 255, 0.2)' }  // Secondary/Blue
                                        ]}
                                    >
                                        <Text style={[
                                            styles.setNumberText,
                                            set.setType === 'W' && { color: COLORS.warning },
                                            set.setType === 'D' && { color: COLORS.secondary }
                                        ]}>
                                            {displayNumber}
                                        </Text>
                                    </TouchableOpacity>
                                </View>

                                <Text style={[styles.prevText, styles.colPrev]}>{prevSetText}</Text>

                                <View style={styles.colKg}>
                                    <ScrollableInput
                                        style={styles.input}
                                        value={set.weight?.toString()}
                                        onChangeText={(text) => handleWeightChange(text, index)}
                                        placeholder="0"
                                        placeholderTextColor={COLORS.textSecondary}
                                        keyboardType="numeric"
                                        maxLength={5}
                                        editable={!set.completed}
                                    />
                                </View>

                                <View style={styles.colReps}>
                                    <ScrollableInput
                                        style={styles.input}
                                        value={set.reps?.toString()}
                                        onChangeText={(text) => handleRepsChange(text, index)}
                                        placeholder="0"
                                        placeholderTextColor={COLORS.textSecondary}
                                        keyboardType="numeric"
                                        maxLength={3}
                                        editable={!set.completed}
                                    />
                                </View>

                                <View style={styles.colCheck}>
                                    <TouchableOpacity
                                        style={[
                                            styles.checkButton,
                                            set.completed && styles.checkButtonCompleted
                                        ]}
                                        onPress={() => toggleSetComplete(index)}
                                    >
                                        <Feather
                                            name="check"
                                            size={16}
                                            color={set.completed ? COLORS.background : 'transparent'}
                                        />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </SwipeableSetRow>
                    );
                    return acc;
                }, [])}
            </View>

            {/* Footer */}
            <TouchableOpacity
                style={styles.addSetButton}
                onPress={addNewSet}
            >
                <Text style={styles.addSetText}>+ Add Set</Text>
            </TouchableOpacity>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: COLORS.surface,
        borderRadius: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        ...SHADOWS.small,
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        backgroundColor: 'rgba(255,255,255,0.02)',
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    dragHandle: {
        padding: 4,
        marginRight: 8,
        marginLeft: -4,
    },
    exerciseName: {
        fontSize: 16,
        fontFamily: FONTS.semiBold,
        color: COLORS.primary,
        flex: 1,
        marginTop: 4,
    },
    menuButton: {
        padding: 4,
    },
    noteContainer: {
        paddingHorizontal: 16,
        paddingBottom: 12,
        backgroundColor: 'rgba(255,255,255,0.02)',
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    noteInput: {
        color: COLORS.text,
        fontFamily: FONTS.regular,
        fontSize: 14,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 8,
        padding: 12,
        minHeight: 40, // Reduced height
        textAlignVertical: 'top',
    },
    tableHeader: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 12,
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.2)',
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    columnHeader: {
        fontSize: 10,
        fontFamily: FONTS.bold,
        color: COLORS.textSecondary,
        textAlign: 'center',
        letterSpacing: 0.5,
    },
    colSet: { width: 30, alignItems: 'center' },
    colPrev: { flex: 1, textAlign: 'center' },
    colKg: { width: 60, marginHorizontal: 4 },
    colReps: { width: 60, marginHorizontal: 4 },
    colCheck: { width: 30, alignItems: 'center' },

    setsContainer: {
        backgroundColor: 'rgba(0,0,0,0.2)',
    },
    swipeableContainer: {
        position: 'relative',
        overflow: 'hidden',
    },
    deleteBackground: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: COLORS.surface, // Match container color
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        zIndex: 0,
    },
    deleteActionRegion: {
        backgroundColor: COLORS.danger,
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        width: 0, // Initial width
        overflow: 'hidden',
    },
    deleteIconContainer: {
        // Center the icon in the visible red region if possible, or just keep it there
        width: 60, // Fixed width for icon container so it doesn't squish
        alignItems: 'center',
    },
    rowForeground: {
        backgroundColor: 'transparent',
        zIndex: 1,
    },
    setRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    setRowCompleted: {
        opacity: 0.5,
    },
    setNumberBadge: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    setNumberText: {
        fontSize: 12,
        fontFamily: FONTS.medium,
        color: COLORS.textSecondary,
    },
    prevText: {
        fontSize: 12,
        fontFamily: FONTS.regular,
        color: COLORS.textSecondary,
    },
    input: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 8,
        paddingVertical: 8,
        textAlign: 'center',
        color: COLORS.text,
        fontFamily: FONTS.semiBold,
        fontSize: 16,
    },
    checkButton: {
        width: 28,
        height: 28,
        borderRadius: 6,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkButtonCompleted: {
        backgroundColor: COLORS.success,
    },
    addSetButton: {
        paddingVertical: 16,
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: COLORS.border,
        backgroundColor: 'rgba(255,255,255,0.02)',
    },
    addSetText: {
        fontSize: 12,
        fontFamily: FONTS.bold,
        color: COLORS.primary,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
});

export default ExerciseEditable
