import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import React, { useState, useCallback, useRef, useLayoutEffect, forwardRef } from 'react';
import { FONTS } from '../constants/theme';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useScrollHandlers } from 'react-native-actions-sheet';
import { NativeViewGestureHandler } from 'react-native-gesture-handler';

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

const PRBadge = React.memo(({ type, theme }) => {
    const iconName = "trophy";
    let label = "PR";

    if (type === '1RM') label = "1RM";
    if (type === 'VOL') label = "Vol.";
    if (type === 'KG') label = "Weight";

    const brightColor = lightenColor(theme.primary, 20);
    const color = brightColor;
    const bgColor = `${brightColor}40`;
    const borderColor = `${brightColor}66`;

    return (
        <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 6,
            paddingVertical: 1,
            borderRadius: 4,
            borderWidth: 1,
            gap: 3,
            marginRight: 6,
            backgroundColor: bgColor,
            borderColor: borderColor
        }}>
            <MaterialCommunityIcons name={iconName} size={10} color={color} />
            <Text style={{ fontSize: 9, fontFamily: FONTS.bold, color: color }}>{label}</Text>
        </View>
    );
});

const SetNumberBadge = React.memo(({ type, number, theme }) => {
    let containerStyle = {
        width: 22,
        height: 18,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 4,
        marginRight: 8,
    };
    let TextStyle = {
        fontSize: 11,
        fontFamily: FONTS.medium,
    };

    if (type === 'W') {
        containerStyle.backgroundColor = 'rgba(253, 203, 110, 0.25)';
        TextStyle.color = theme.warning;
        TextStyle.fontFamily = FONTS.bold;
        TextStyle.fontSize = 10;
    } else if (type === 'D') {
        containerStyle.backgroundColor = 'rgba(116, 185, 255, 0.15)';
        TextStyle.color = theme.info;
        TextStyle.fontFamily = FONTS.semiBold;
    } else {
        containerStyle.backgroundColor = 'rgba(255,255,255,0.05)';
        TextStyle.color = theme.text;
        TextStyle.fontFamily = FONTS.semiBold;
    }

    return (
        <View style={containerStyle}>
            <Text style={TextStyle}>{number}</Text>
        </View>
    );
});

const WorkoutSessionView = forwardRef(({ workoutDetails, exercisesList, onEdit, onExerciseInfo, contentContainerStyle }, ref) => {
    const { theme } = useTheme();
    const styles = getStyles(theme);
    const [expandedWarmups, setExpandedWarmups] = useState({});
    const handlers = useScrollHandlers();

    useLayoutEffect(() => {
        // Reset scroll position when workout details change (e.g. entering a new session)
        // useLayoutEffect runs before paint to eliminate visual "jump"
        if (ref && typeof ref === 'object') {
            ref.current?.scrollTo({ y: 0, animated: false });
        }
    }, [workoutDetails]);

    const toggleWarmups = useCallback((exerciseId, event) => {
        event?.stopPropagation();
        setExpandedWarmups(prev => ({
            ...prev,
            [exerciseId]: !prev[exerciseId],
        }));
    }, []);

    const groupExercisesByName = (exercises) => {
        const grouped = {};
        const order = [];
        exercises.forEach(exercise => {
            const key = exercise.exerciseNum;
            if (!grouped[key]) {
                grouped[key] = [];
                order.push(key);
            }
            grouped[key].push(exercise);
        });
        return order.map(key => grouped[key]);
    };

    const formatDate = (dateString) => {
        if (!dateString) return '';
        return new Date(dateString).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const formatDuration = (minutes) => {
        if (minutes === null || minutes === undefined) return 'N/A';
        if (minutes === 0) return '< 1m';
        const hrs = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (hrs > 0) return `${hrs}h ${mins}m`;
        return `${mins}m`;
    };

    const isEmpty = !workoutDetails || workoutDetails.length === 0;
    if (isEmpty) {
        return (
            <NativeViewGestureHandler simultaneousHandlers={handlers.simultaneousHandlers}>
                <ScrollView
                    {...handlers}
                    ref={ref}
                    contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
                    showsVerticalScrollIndicator={false}
                />
            </NativeViewGestureHandler>
        );
    }

    const workoutName = workoutDetails[0].name;
    const workoutDate = workoutDetails[0].time;
    const workoutDuration = workoutDetails[0].duration;
    const groupedExercises = groupExercisesByName(workoutDetails);

    const totalPRs = workoutDetails.reduce((acc, ex) => {
        return acc + (ex.is1rmPR || 0) + (ex.isVolumePR || 0) + (ex.isWeightPR || 0);
    }, 0);

    return (
        <NativeViewGestureHandler simultaneousHandlers={handlers.simultaneousHandlers}>
            <ScrollView
                {...handlers}
                ref={ref}
                contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
            >
                <View style={styles.sleekHeaderContainer}>
                    {onEdit && (
                        <TouchableOpacity
                            style={styles.editIcon}
                            onPress={onEdit}
                            activeOpacity={0.7}
                        >
                            <Feather name="edit" size={24} color={theme.text} />
                        </TouchableOpacity>
                    )}

                    <Text style={styles.workoutDateDisplay}>{formatDate(workoutDate)}</Text>
                    <Text style={styles.workoutNameHuge}>{workoutName}</Text>

                    <View style={styles.metaDataRow}>
                        <View style={styles.metaItem}>
                            <Feather name="clock" size={14} color={theme.text} />
                            <Text style={styles.metaText}>{formatDuration(workoutDuration)}</Text>
                        </View>

                        {totalPRs > 0 && (
                            <View style={[
                                styles.metaItem,
                                { borderColor: `${lightenColor(theme.primary, 20)}66`, backgroundColor: `${lightenColor(theme.primary, 20)}40` }
                            ]}>
                                <MaterialCommunityIcons name="trophy" size={14} color={lightenColor(theme.primary, 20)} />
                                <Text style={[styles.metaText, { color: lightenColor(theme.primary, 20), fontFamily: FONTS.bold }]}>
                                    {totalPRs} New PR{totalPRs > 1 ? 's' : ''}
                                </Text>
                            </View>
                        )}
                    </View>
                </View>

                <View style={styles.exercisesList}>
                    {groupedExercises.map((exerciseGroup, index) => {
                        const exerciseId = exerciseGroup[0].exerciseID;
                        const exerciseDetails = exercisesList?.find(ex => ex.exerciseID === exerciseId);
                        const exerciseName = exerciseDetails ? exerciseDetails.name : `Exercise ${exerciseId}`;

                        let workingSetCount = 0;
                        const setsWithDisplayNumbers = exerciseGroup.map(set => {
                            let displayNumber = set.setType;
                            if (set.setType === 'N' || !set.setType) {
                                workingSetCount++;
                                displayNumber = workingSetCount;
                            }
                            return { ...set, displayNumber };
                        });

                        const exerciseNote = exerciseGroup.find(e => e.notes)?.notes;
                        const warmups = setsWithDisplayNumbers.filter(s => (s.setType || 'N') === 'W');
                        const nonWarmups = setsWithDisplayNumbers.filter(s => (s.setType || 'N') !== 'W');
                        const warmupsExpanded = !!expandedWarmups[exerciseId];
                        const visibleSets = warmupsExpanded ? [...warmups, ...nonWarmups] : nonWarmups;

                        return (
                            <View key={index} style={styles.exerciseCard}>
                                <TouchableOpacity
                                    activeOpacity={onExerciseInfo ? 0.8 : 1}
                                    onPress={() => onExerciseInfo?.(exerciseId, exerciseName)}
                                    style={styles.exerciseHeader}
                                    disabled={!onExerciseInfo}
                                >
                                    <Text style={styles.exerciseName}>{exerciseName}</Text>
                                    {onExerciseInfo && <Feather name="chevron-right" size={18} color={theme.textSecondary} />}
                                </TouchableOpacity>

                                {exerciseNote && (
                                    <View style={styles.noteContainer}>
                                        <MaterialCommunityIcons
                                            name="comment-text-outline"
                                            size={12}
                                            color={theme.textSecondary}
                                            style={{ marginTop: 2 }}
                                        />
                                        <Text style={styles.noteText}>{exerciseNote}</Text>
                                    </View>
                                )}

                                {warmups.length > 0 && (
                                    <TouchableOpacity
                                        onPress={(e) => toggleWarmups(exerciseId, e)}
                                        activeOpacity={0.8}
                                        style={styles.warmupToggle}
                                    >
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                            <MaterialCommunityIcons name="fire" size={14} color={theme.textSecondary} />
                                            <Text style={styles.warmupToggleText}>{warmups.length}</Text>
                                        </View>
                                        <Feather
                                            name={warmupsExpanded ? 'chevron-down' : 'chevron-right'}
                                            size={16}
                                            color={theme.textSecondary}
                                        />
                                    </TouchableOpacity>
                                )}

                                <View style={styles.setsContainer}>
                                    <View style={styles.setsHeaderRow}>
                                        <Text style={[styles.colHeader, styles.colHeaderSet]}>SET</Text>
                                        <Text style={[styles.colHeader, styles.colHeaderLift]}>{exerciseDetails?.isCardio ? "DIST / TIME" : "LIFT"}</Text>
                                        <Text style={[styles.colHeader, styles.colHeader1RM]}>{exerciseDetails?.isCardio ? "PACE" : "1RM"}</Text>
                                    </View>
                                    {visibleSets.map((set, setIndex) => {
                                        const isPR = set.is1rmPR === 1 || set.isVolumePR === 1 || set.isWeightPR === 1;
                                        const setType = set.setType || 'N';
                                        const isWarmup = setType === 'W';
                                        const isDrop = setType === 'D';

                                        return (
                                            <View key={`${set.exerciseHistoryID ?? ''}-${setIndex}`} style={[
                                                styles.setRowContainer,
                                                setIndex % 2 === 1 && styles.setRowOdd,
                                                isWarmup && { backgroundColor: 'rgba(253, 203, 110, 0.06)' },
                                                isDrop && { backgroundColor: 'rgba(116, 185, 255, 0.05)' },
                                            ]}>
                                                <View style={styles.setRow}>
                                                    <SetNumberBadge type={setType} number={set.displayNumber} theme={theme} />
                                                    <Text style={[
                                                        styles.setLift,
                                                        isWarmup && styles.setLiftWarmup,
                                                        isDrop && styles.setLiftDrop,
                                                    ]}>
                                                        {exerciseDetails?.isCardio ? (
                                                            `${set.distance || 0}km / ${(set.seconds / 60).toFixed(1)}m`
                                                        ) : (
                                                            `${set.weight}kg × ${set.reps}`
                                                        )}
                                                    </Text>
                                                    <Text style={styles.setOneRM}>
                                                        {exerciseDetails?.isCardio ? (
                                                            set.distance > 0 ? `${((set.seconds / 60) / set.distance).toFixed(1)} m/k` : '-'
                                                        ) : (
                                                            set.oneRM ? Math.round(set.oneRM) : '-'
                                                        )}
                                                    </Text>
                                                </View>
                                                {isPR && (
                                                    <View style={styles.badgeRow}>
                                                        <View style={{ width: 32 }} />
                                                        {set.is1rmPR === 1 && <PRBadge type="1RM" theme={theme} />}
                                                        {set.isVolumePR === 1 && <PRBadge type="VOL" theme={theme} />}
                                                        {set.isWeightPR === 1 && <PRBadge type="KG" theme={theme} />}
                                                    </View>
                                                )}
                                            </View>
                                        );
                                    })}
                                </View>
                            </View>
                        );
                    })}
                </View>
            </ScrollView>
        </NativeViewGestureHandler>
    );
});

const getStyles = (theme) => {
    return StyleSheet.create({
        scrollContent: {
            paddingTop: 10,
            paddingBottom: 40,
        },
        sleekHeaderContainer: {
            paddingHorizontal: 20,
            paddingVertical: 12,
            marginBottom: 16,
        },
        editIcon: {
            position: 'absolute',
            top: 10,
            right: 20,
            zIndex: 10,
            padding: 5,
        },
        workoutDateDisplay: {
            fontSize: 12,
            fontFamily: FONTS.medium,
            color: theme.textSecondary,
            marginBottom: 2,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
        },
        workoutNameHuge: {
            fontSize: 28,
            fontFamily: FONTS.bold,
            color: theme.text,
            lineHeight: 34,
            marginBottom: 10,
        },
        metaDataRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
        },
        metaItem: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: theme.surface,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: theme.border,
        },
        metaText: {
            fontSize: 12,
            fontFamily: FONTS.medium,
            color: theme.text,
        },
        exercisesList: {
            gap: 8,
            paddingHorizontal: 12,
        },
        exerciseCard: {
            backgroundColor: theme.surface,
            borderRadius: 12,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: theme.border,
        },
        exerciseHeader: {
            paddingHorizontal: 12,
            paddingVertical: 10,
            backgroundColor: 'rgba(255,255,255,0.03)',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(255,255,255,0.05)',
        },
        exerciseName: {
            fontSize: 15,
            fontFamily: FONTS.bold,
            color: theme.text,
            flex: 1,
        },
        noteContainer: {
            flexDirection: 'row',
            paddingHorizontal: 12,
            paddingVertical: 6,
            gap: 6,
            backgroundColor: 'rgba(255, 253, 203, 0.05)',
        },
        noteText: {
            flex: 1,
            fontSize: 14,
            color: theme.textSecondary,
            fontFamily: FONTS.regular,
            fontStyle: 'italic',
            lineHeight: 16,
        },
        warmupToggle: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(255,255,255,0.05)',
            backgroundColor: 'rgba(255,255,255,0.02)',
        },
        warmupToggleText: {
            fontSize: 12,
            fontFamily: FONTS.medium,
            color: theme.textSecondary,
        },
        setsContainer: {
            paddingVertical: 2,
        },
        setsHeaderRow: {
            flexDirection: 'row',
            paddingVertical: 6,
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(255,255,255,0.05)',
            paddingHorizontal: 12,
        },
        colHeader: {
            fontSize: 9,
            fontFamily: FONTS.medium,
            color: theme.textSecondary,
            textTransform: 'uppercase',
        },
        colHeaderSet: { width: 32 },
        colHeaderLift: {
            flex: 2,
            textAlign: 'left',
            paddingLeft: 6,
        },
        colHeader1RM: { flex: 1, textAlign: 'center' },
        setRowContainer: {
            paddingVertical: 3,
            paddingHorizontal: 12,
        },
        setRow: {
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 28,
        },
        setRowOdd: {
            backgroundColor: 'rgba(255,255,255,0.01)',
        },
        badgeRow: {
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 4,
            flexWrap: 'wrap',
        },
        setLift: {
            flex: 2,
            textAlign: 'left',
            paddingLeft: 6,
            fontSize: 15,
            fontFamily: FONTS.bold,
            color: theme.text,
            letterSpacing: 0.3,
        },
        setLiftWarmup: {
            color: theme.textSecondary,
            opacity: 0.75,
        },
        setLiftDrop: {
            color: theme.info,
            opacity: 0.8,
        },
        setOneRM: {
            flex: 1,
            textAlign: 'center',
            fontSize: 12,
            fontFamily: FONTS.medium,
            color: theme.textSecondary,
        },
    });
};

export default WorkoutSessionView;