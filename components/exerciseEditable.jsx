import { View, Text, StyleSheet, TextInput, TouchableOpacity, LayoutAnimation, Platform, UIManager } from 'react-native'
import React, { useState, useRef } from 'react'
import { COLORS, FONTS, SHADOWS } from '../constants/theme'
import { AntDesign, Feather, Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';

if (Platform.OS === 'android') {
    if (UIManager.setLayoutAnimationEnabledExperimental) {
        UIManager.setLayoutAnimationEnabledExperimental(true);
    }
}

const ExerciseEditable = ({ exercise, exerciseName, updateCurrentWorkout, exerciseID, onReorder, drag, isActive }) => {

    const [sets, setSets] = useState(exercise.sets);

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
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        updateCurrentWorkout(prevWorkout =>
            prevWorkout.map(workout => ({
                ...workout,
                exercises: workout.exercises.filter(ex => ex !== exercise)
            })).filter(workout => workout.exercises.length > 0)
        );
    };


    const renderRightActions = (progress, dragX, index) => {
        return (
            <TouchableOpacity
                style={styles.deleteAction}
                onPress={() => deleteSet(index)}
            >
                <Feather name="trash-2" size={20} color={COLORS.text} />
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <TouchableOpacity
                        style={styles.dragHandle}
                        onLongPress={onReorder}
                        delayLongPress={200}
                        activeOpacity={0.7}
                    >
                        <MaterialIcons name="drag-handle" size={24} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                    <Text style={styles.exerciseName}>{exerciseName}</Text>
                </View>
                <TouchableOpacity
                    onPress={deleteExercise}
                    style={styles.menuButton}
                >
                    <Feather name="x" size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>
            </View>

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
                    <Swipeable
                        key={index}
                        renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, index)}
                        containerStyle={styles.swipeableContainer}
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
                                <TextInput
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
                                <TextInput
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
                    </Swipeable>
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
        overflow: 'hidden',
        ...SHADOWS.small,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
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
        paddingVertical: 8,
        alignItems: 'center',
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

    },
    swipeableContainer: {
        backgroundColor: COLORS.danger,
    },
    setRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: COLORS.surface,
    },
    setRowCompleted: {
        backgroundColor: 'rgba(0, 184, 148, 0.05)',
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
        paddingVertical: 6,
        textAlign: 'center',
        color: COLORS.text,
        fontFamily: FONTS.semiBold,
        fontSize: 14,
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
    deleteAction: {
        backgroundColor: COLORS.danger,
        justifyContent: 'center',
        alignItems: 'center',
        width: 60,
        height: '100%',
    },
    addSetButton: {
        paddingVertical: 12,
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.05)',
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