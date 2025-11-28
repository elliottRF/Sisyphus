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

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = -100;

if (Platform.OS === 'android') {
    if (UIManager.setLayoutAnimationEnabledExperimental) {
        UIManager.setLayoutAnimationEnabledExperimental(true);
    }
}

const ScrollableInput = ({ value, onChangeText, placeholder, keyboardType, maxLength, style, placeholderTextColor }) => {
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
                style={[style, { opacity: isFocused ? 1 : 1 }]} // Keep visible
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={placeholderTextColor}
                keyboardType={keyboardType}
                maxLength={maxLength}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
            />
            {!isFocused && (
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
    const itemHeight = useSharedValue(60); // Approximate height, will be adjusted by layout if needed but mostly for exit

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
        const opacity = withTiming(translateX.value < -20 ? 1 : 0);
        return { opacity };
    });

    const rBackgroundStyle = useAnimatedStyle(() => {
        return {
            opacity: translateX.value < -5 ? 1 : 0,
        };
    });

    return (
        <Animated.View
            layout={LinearTransition.springify().damping(14).stiffness(100)}
            entering={ZoomIn.duration(300)}
            exiting={ZoomOut.duration(300)}
            style={styles.swipeableContainer}
        >
            {/* Background (Bin Icon) */}
            <Animated.View style={[styles.deleteBackground, rBackgroundStyle]}>
                <Animated.View style={[styles.deleteIconContainer, rIconStyle]}>
                    <Feather name="trash-2" size={20} color={COLORS.text} />
                </Animated.View>
            </Animated.View>

            {/* Foreground (Set Row) */}
            <GestureDetector gesture={pan}>
                <Animated.View style={[styles.rowForeground, rStyle]}>
                    {children}
                </Animated.View>
            </GestureDetector>
        </Animated.View>
    );
};

const ExerciseEditable = ({ exercise, exerciseName, updateCurrentWorkout, exerciseID, drag, isActive, onOpenDetails, simultaneousHandlers }) => {

    const handleWeightChange = (text, setIndex) => {
        updateCurrentWorkout(prevWorkout =>
            prevWorkout.map(workout =>
                workout.exercises.includes(exercise)
                    ? {
                        ...workout,
                        exercises: workout.exercises.map(ex =>
                            ex === exercise
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
                workout.exercises.includes(exercise)
                    ? {
                        ...workout,
                        exercises: workout.exercises.map(ex =>
                            ex === exercise
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
        updateCurrentWorkout(prevWorkout =>
            prevWorkout.map(workout =>
                workout.exercises.includes(exercise)
                    ? {
                        ...workout,
                        exercises: workout.exercises.map(ex =>
                            ex === exercise
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

    const addNewSet = () => {
        updateCurrentWorkout(prevWorkout =>
            prevWorkout.map(workout =>
                workout.exercises.includes(exercise)
                    ? {
                        ...workout,
                        exercises: workout.exercises.map(ex =>
                            ex === exercise
                                ? {
                                    ...ex,
                                    sets: [
                                        ...ex.sets,
                                        {
                                            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                                            weight: null,
                                            reps: null,
                                            completed: false
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
                workout.exercises.includes(exercise)
                    ? {
                        ...workout,
                        exercises: workout.exercises.map(ex =>
                            ex === exercise
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
                exercises: workout.exercises.filter(ex => ex !== exercise)
            })).filter(workout => workout.exercises.length > 0)
        );
    };

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
                <TouchableOpacity
                    onPress={deleteExercise}
                    style={styles.menuButton}
                >
                    <Feather name="x" size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>
            </LinearGradient>

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
                {exercise.sets.map((set, index) => (
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
                                <View style={styles.setNumberBadge}>
                                    <Text style={styles.setNumberText}>{index + 1}</Text>
                                </View>
                            </View>

                            <Text style={[styles.prevText, styles.colPrev]}>-</Text>

                            <View style={styles.colKg}>
                                <ScrollableInput
                                    style={styles.input}
                                    value={set.weight?.toString()}
                                    onChangeText={(text) => handleWeightChange(text, index)}
                                    placeholder="0"
                                    placeholderTextColor={COLORS.textSecondary}
                                    keyboardType="numeric"
                                    maxLength={5}
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
                ))}
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
    },
    menuButton: {
        padding: 4,
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
        backgroundColor: COLORS.danger,
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingRight: 20,
        zIndex: 0,
    },
    deleteIconContainer: {
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
