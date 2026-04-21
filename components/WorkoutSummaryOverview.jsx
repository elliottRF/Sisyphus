import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import React, { useState, useCallback, useMemo, useLayoutEffect, forwardRef } from 'react';
import { FONTS, getThemedShadow, isLightTheme, withAlpha } from '../constants/theme';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useScrollHandlers } from 'react-native-actions-sheet';
import { NativeViewGestureHandler } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { formatWeight, unitLabel } from '../utils/units';

// --- UTILS ---
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

// --- BADGES ---
const PRBadge = React.memo(({ type, theme }) => {
    let label = type === '1RM' ? "1RM" : type === 'VOL' ? "Vol." : "Weight";
    const brightColor = lightenColor(theme.primary, 20);
    const bgColor = withAlpha(brightColor, isLightTheme(theme) ? 0.14 : 0.25);
    const borderColor = withAlpha(brightColor, isLightTheme(theme) ? 0.24 : 0.4);

    return (
        <View style={{
            flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6,
            paddingVertical: 2, borderRadius: 4, borderWidth: 1, gap: 3,
            marginRight: 6, backgroundColor: bgColor, borderColor: borderColor
        }}>
            <MaterialCommunityIcons name="trophy" size={10} color={brightColor} />
            <Text style={{ fontSize: 9, fontFamily: FONTS.bold, color: brightColor }}>{label}</Text>
        </View>
    );
});

const SetNumberBadge = React.memo(({ type, number, theme }) => {
    let containerStyle = { width: 22, height: 18, alignItems: 'center', justifyContent: 'center', borderRadius: 4, marginRight: 8 };
    let TextStyle = { fontSize: 11, fontFamily: FONTS.medium };

    if (type === 'W') {
        containerStyle.backgroundColor = withAlpha(theme.warning, isLightTheme(theme) ? 0.18 : 0.25);
        TextStyle.color = theme.warning;
        TextStyle.fontFamily = FONTS.bold;
        TextStyle.fontSize = 10;
    } else if (type === 'D') {
        containerStyle.backgroundColor = withAlpha(theme.info, isLightTheme(theme) ? 0.12 : 0.15);
        TextStyle.color = theme.info;
        TextStyle.fontFamily = FONTS.semiBold;
    } else {
        containerStyle.backgroundColor = isLightTheme(theme) ? theme.overlayMedium : 'rgba(255,255,255,0.05)';
        TextStyle.color = isLightTheme(theme) ? theme.textSecondary : theme.text;
        TextStyle.fontFamily = FONTS.semiBold;
    }

    return (
        <View style={containerStyle}>
            <Text style={TextStyle}>{number}</Text>
        </View>
    );
});

// --- MAIN COMPONENT ---
const WorkoutSummaryOverview = forwardRef(({ workoutDetails, exercisesList, onDone, contentContainerStyle, onExerciseInfo }, ref) => {
    const { theme, useImperial } = useTheme();
    const router = useRouter();
    const styles = getStyles(theme);
    const handlers = useScrollHandlers();
    const [expandedWarmups, setExpandedWarmups] = useState({});

    useLayoutEffect(() => {
        if (ref && typeof ref === 'object') {
            ref.current?.scrollTo({ y: 0, animated: false });
        }
    }, [workoutDetails]);

    const toggleWarmups = useCallback((exerciseId, event) => {
        event?.stopPropagation();
        setExpandedWarmups(prev => ({ ...prev, [exerciseId]: !prev[exerciseId] }));
    }, []);

    // --- DATA PROCESSING ---
    const { workoutName, workoutDate, workoutDuration, groupedExercises, stats, prHighlights } = useMemo(() => {
        if (!workoutDetails || workoutDetails.length === 0) return { isEmpty: true };

        const grouped = {};
        const order = [];
        let totalVolume = 0;
        let totalSets = 0;
        const prs = [];

        workoutDetails.forEach(exercise => {
            const key = exercise.exerciseNum;
            if (!grouped[key]) {
                grouped[key] = [];
                order.push(key);
            }
            grouped[key].push(exercise);

            // Stats calculation
            if (exercise.setType !== 'W') totalSets++;
            if (exercise.weight && exercise.reps) totalVolume += (exercise.weight * exercise.reps);

            // PR extraction
            const isPR = exercise.is1rmPR || exercise.isVolumePR || exercise.isWeightPR;
            if (isPR) {
                const exDetails = exercisesList?.find(ex => ex.exerciseID === exercise.exerciseID);
                if (!prs.some(pr => pr.exerciseID === exercise.exerciseID)) {
                    prs.push({
                        exerciseID: exercise.exerciseID,
                        name: exDetails ? exDetails.name : `Exercise ${exercise.exerciseID}`,
                        records: [
                            ...(exercise.is1rmPR ? ['1RM'] : []),
                            ...(exercise.isVolumePR ? ['Volume'] : []),
                            ...(exercise.isWeightPR ? ['Weight'] : [])
                        ]
                    });
                }
            }
        });

        return {
            isEmpty: false,
            workoutName: workoutDetails[0].name,
            workoutDate: workoutDetails[0].time,
            workoutDuration: workoutDetails[0].duration,
            groupedExercises: order.map(key => grouped[key]),
            stats: { totalVolume, totalSets },
            prHighlights: prs
        };
    }, [workoutDetails, exercisesList]);

    if (!workoutDetails || workoutDetails.length === 0) return <View />;

    const formatDuration = (minutes) => {
        if (minutes == null) return 'N/A';
        if (minutes === 0) return '< 1m';
        const hrs = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
    };

    const formatDate = (dateString) => {
        if (!dateString) return '';
        return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };
    const isEmpty = !workoutDetails || workoutDetails.length === 0;

    return (
        <NativeViewGestureHandler simultaneousHandlers={handlers.simultaneousHandlers}>
            <ScrollView {...handlers} ref={ref} contentContainerStyle={[styles.scrollContent, contentContainerStyle]} showsVerticalScrollIndicator={false}>

                {/* HERO SECTION */}
                <View style={styles.heroContainer}>
                    <View style={styles.heroHeader}>
                        <View style={styles.iconCircle}>
                            <MaterialCommunityIcons name="check-decagram" size={32} color={theme.primary} />
                        </View>
                        <View>
                            <Text style={styles.completionText}>Workout Complete!</Text>
                            <Text style={styles.workoutNameHuge}>{workoutName}</Text>
                            <Text style={styles.workoutDateDisplay}>{formatDate(workoutDate)}</Text>
                        </View>
                    </View>

                    {/* STATS DASHBOARD */}
                    <View style={styles.statsRow}>
                        <View style={styles.statBox}>
                            <Feather name="clock" size={18} color={theme.textSecondary} />
                            <Text style={styles.statValue}>{formatDuration(workoutDuration)}</Text>
                            <Text style={styles.statLabel}>Time</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statBox}>
                            <MaterialCommunityIcons name="weight-lifter" size={20} color={theme.textSecondary} />
                            <Text style={styles.statValue}>{formatWeight(stats.totalVolume, useImperial)} <Text style={{ fontSize: 12 }}>{unitLabel(useImperial)}</Text></Text>
                            <Text style={styles.statLabel}>Volume</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statBox}>
                            <MaterialCommunityIcons name="format-list-numbered" size={20} color={theme.textSecondary} />
                            <Text style={styles.statValue}>{stats.totalSets}</Text>
                            <Text style={styles.statLabel}>Sets</Text>
                        </View>
                    </View>
                </View>

                {/* PR SPOTLIGHT */}
                {prHighlights.length > 0 && (
                    <View style={styles.prSpotlightContainer}>
                        <View style={styles.prHeader}>
                            <MaterialCommunityIcons name="trophy" size={22} color={lightenColor(theme.primary, 10)} />
                            <Text style={styles.prSpotlightTitle}>Achievements</Text>
                        </View>
                        {prHighlights.map((pr, idx) => (
                            <View key={idx} style={styles.prItem}>
                                <Text style={styles.prExerciseName} numberOfLines={1}>{pr.name}</Text>
                                <View style={{ flexDirection: 'row' }}>
                                    {pr.records.map(r => <PRBadge key={r} type={r === 'Volume' ? 'VOL' : r} theme={theme} />)}
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {/* EXERCISE BREAKDOWN */}
                <Text style={styles.sectionTitle}>Workout Breakdown</Text>
                <View style={styles.exercisesList}>
                    {!isEmpty && groupedExercises.map((exerciseGroup, index) => {
                        const exerciseId = exerciseGroup[0].exerciseID;
                        const exerciseDetails = exercisesList?.find(ex => ex.exerciseID === exerciseId);
                        const exerciseName = exerciseDetails ? exerciseDetails.name : `Exercise ${exerciseId}`;
                        const isAssisted = !!exerciseDetails?.isAssisted;

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
                        const visibleSets = warmupsExpanded
                            ? [...warmups, ...nonWarmups]
                            : [...warmups.filter(s => s.is1rmPR === 1 || s.isVolumePR === 1 || s.isWeightPR === 1), ...nonWarmups];

                        const hasMuscles = exerciseDetails && (
                            (exerciseDetails.targetMuscle && exerciseDetails.targetMuscle.trim() !== '') ||
                            (exerciseDetails.accessoryMuscles && exerciseDetails.accessoryMuscles.trim() !== '')
                        );

                        return (
                            <View key={index} style={styles.exerciseCard}>
                                <TouchableOpacity
                                    activeOpacity={onExerciseInfo ? 0.8 : 1}
                                    onPress={() => onExerciseInfo?.(exerciseId, exerciseName)}
                                    style={styles.exerciseHeader}
                                    disabled={!onExerciseInfo}
                                >
                                    <Text style={styles.exerciseName}>{exerciseName}</Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                        {!hasMuscles && exerciseDetails && !exerciseDetails.isCardio && (
                                            <TouchableOpacity
                                                onPress={() => router.push(`/exercise/new?id=${exerciseId}`)}
                                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                            >
                                                <Feather name="help-circle" size={18} color={theme.textSecondary} />
                                            </TouchableOpacity>
                                        )}
                                        {onExerciseInfo && <Feather name="chevron-right" size={18} color={theme.textSecondary} />}
                                    </View>
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
                                        {!isAssisted && <Text style={[styles.colHeader, styles.colHeader1RM]}>{exerciseDetails?.isCardio ? "PACE" : "1RM"}</Text>}
                                    </View>
                                    {(() => {
                                        let workingIndex = 0;
                                        return visibleSets.map((set, setIndex) => {
                                            const isPR = set.is1rmPR === 1 || set.isVolumePR === 1 || set.isWeightPR === 1;
                                            const setType = set.setType || 'N';
                                            const isWarmup = setType === 'W';
                                            const isDrop = setType === 'D';

                                            const isOdd = !isWarmup && (workingIndex % 2 === 1);
                                            if (!isWarmup) workingIndex++;

                                            return (
                                                <View key={`${set.exerciseHistoryID ?? ''}-${setIndex}`} style={[
                                                    styles.setRowContainer,
                                                    isOdd && styles.setRowOdd,
                                                    isWarmup && { backgroundColor: 'rgba(253, 203, 110, 0.06)' },
                                                ]}>
                                                    <View style={styles.setRow}>
                                                        <SetNumberBadge type={setType} number={set.displayNumber} theme={theme} />
                                                        <Text style={[
                                                            styles.setLift,
                                                            isWarmup && styles.setLiftWarmup,
                                                        ]}>
                                                            {exerciseDetails?.isCardio ? (
                                                                `${set.distance || 0}km / ${(set.seconds / 60).toFixed(1)} mins`
                                                            ) : (
                                                                `${isAssisted && set.weight > 0 ? '-' : ''}${formatWeight(set.weight, useImperial)} ${unitLabel(useImperial)} × ${set.reps}`
                                                            )}
                                                        </Text>
                                                        {!isAssisted && (
                                                            <Text style={styles.setOneRM}>
                                                                {exerciseDetails?.isCardio ? (
                                                                    set.distance > 0 ? `${((set.seconds / 60) / set.distance).toFixed(1)} min/km` : '-'
                                                                ) : (
                                                                    set.oneRM ? `${Math.round(formatWeight(set.oneRM, useImperial, 0))}` : '-'
                                                                )}
                                                            </Text>
                                                        )}
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
                                        });
                                    })()}
                                </View>
                            </View>
                        );
                    })}
                </View>

                {/* BOTTOM ACTION */}
                {onDone && (
                    <TouchableOpacity style={styles.doneButton} onPress={onDone} activeOpacity={0.8}>
                        <Text style={styles.doneButtonText}>Finish & Save</Text>
                    </TouchableOpacity>
                )}
            </ScrollView>
        </NativeViewGestureHandler>
    );
});

const getStyles = (theme) => {
    const lightTheme = isLightTheme(theme);
    const primaryGlow = withAlpha(theme.primary, lightTheme ? 0.1 : 0.15);

    return StyleSheet.create({
        scrollContent: {
            paddingTop: 10,
            paddingBottom: 60,
        },
        heroContainer: {
            paddingHorizontal: 20,
            paddingVertical: 16,
            marginBottom: 10,
        },
        heroHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 16,
            marginBottom: 24,
        },
        iconCircle: {
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: primaryGlow,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: withAlpha(theme.primary, 0.3),
        },
        completionText: {
            fontSize: 13,
            fontFamily: FONTS.bold,
            color: theme.primary,
            textTransform: 'uppercase',
            letterSpacing: 1,
            marginBottom: 4,
        },
        workoutNameHuge: {
            fontSize: 26,
            fontFamily: FONTS.bold,
            color: theme.text,
            lineHeight: 32,
        },
        workoutDateDisplay: {
            fontSize: 14,
            fontFamily: FONTS.medium,
            color: theme.textSecondary,
            marginTop: 4,
        },
        statsRow: {
            flexDirection: 'row',
            backgroundColor: theme.surface,
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: theme.border,
            ...getThemedShadow(theme, 'medium'),
            justifyContent: 'space-between',
        },
        statBox: {
            flex: 1,
            alignItems: 'center',
            gap: 4,
        },
        statDivider: {
            width: 1,
            backgroundColor: theme.border,
            marginVertical: 4,
        },
        statValue: {
            fontSize: 18,
            fontFamily: FONTS.bold,
            color: theme.text,
            marginTop: 4,
        },
        statLabel: {
            fontSize: 12,
            fontFamily: FONTS.medium,
            color: theme.textSecondary,
        },
        prSpotlightContainer: {
            marginHorizontal: 20,
            marginBottom: 20,
            backgroundColor: withAlpha(theme.primary, lightTheme ? 0.08 : 0.12),
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: withAlpha(theme.primary, 0.3),
        },
        prHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
        },
        prSpotlightTitle: {
            fontSize: 16,
            fontFamily: FONTS.bold,
            color: lightenColor(theme.primary, 10),
        },
        prItem: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 8,
            borderTopWidth: 1,
            borderTopColor: withAlpha(theme.primary, 0.1),
        },
        prExerciseName: {
            fontSize: 14,
            fontFamily: FONTS.semiBold,
            color: theme.text,
            flex: 1,
            marginRight: 10,
        },
        sectionTitle: {
            fontSize: 18,
            fontFamily: FONTS.bold,
            color: theme.text,
            marginHorizontal: 20,
            marginBottom: 12,
            marginTop: 10,
        },
        exerciseCard: {
            backgroundColor: theme.surface,
            borderRadius: 12,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: theme.border,
            ...getThemedShadow(theme, 'small'),
        },
        exerciseHeader: {
            paddingHorizontal: 12,
            paddingVertical: 10,
            backgroundColor: lightTheme ? theme.overlaySubtle : theme.overlayMedium,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
        },
        exerciseName: {
            fontSize: 15,
            fontFamily: FONTS.bold,
            color: theme.text,
            flex: 1,
        },
        warmupToggle: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: theme.overlayBorder,
            backgroundColor: theme.background,
        },
        warmupToggleText: {
            fontSize: 13,
            fontFamily: FONTS.medium,
            color: theme.textSecondary,
        },
        setsContainer: {
            paddingVertical: 4,
        },
        setRowContainer: {
            paddingVertical: 6,
            paddingHorizontal: 16,
        },
        setRow: {
            flexDirection: 'row',
            alignItems: 'center',
        },
        badgeRow: {
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 4,
            flexWrap: 'wrap',
        },
        setLift: {
            flex: 1,
            fontSize: 15,
            fontFamily: FONTS.semiBold,
            color: theme.text,
            letterSpacing: 0.3,
        },
        setLiftWarmup: {
            color: theme.textSecondary,
            opacity: 0.75,
        },
        doneButton: {
            marginHorizontal: 20,
            marginTop: 30,
            backgroundColor: theme.primary,
            paddingVertical: 16,
            borderRadius: 12,
            alignItems: 'center',
            ...getThemedShadow(theme, 'medium'),
        },
        doneButtonText: {
            color: '#fff',
            fontSize: 16,
            fontFamily: FONTS.bold,
        },
        noteContainer: {
            flexDirection: 'row',
            paddingHorizontal: 12,
            paddingVertical: 6,
            gap: 6,
            backgroundColor: lightTheme ? theme.overlaySubtle : theme.overlayBorder,
        },
        scrollContent: {
            paddingTop: 10,
            paddingBottom: 40,
        },
        sleekHeaderContainer: {
            paddingHorizontal: 20,
            paddingVertical: 12,
            marginBottom: 16,
        },
        headerActions: {
            position: 'absolute',
            top: 10,
            right: 20,
            zIndex: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
        },
        headerActionButton: {
            padding: 6,
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
            borderColor: lightTheme ? theme.overlayBorder : theme.border,
            backgroundColor: lightTheme ? theme.surface : theme.surface,
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
            ...getThemedShadow(theme, 'small'),
        },
        exerciseHeader: {
            paddingHorizontal: 12,
            paddingVertical: 10,
            backgroundColor: lightTheme ? theme.overlaySubtle : theme.overlayMedium,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
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
            backgroundColor: lightTheme ? theme.overlaySubtle : theme.overlayBorder,
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
            borderBottomColor: theme.overlayBorder,
            backgroundColor: lightTheme ? theme.overlaySubtle : theme.overlaySubtle,
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
            borderBottomColor: theme.overlayBorder,
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
            borderTopWidth: 1,
            borderTopColor: lightTheme ? withAlpha(theme.border, 0.45) : 'transparent',
        },
        setRow: {
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 28,
        },
        setRowOdd: {
            backgroundColor: lightTheme ? theme.overlaySubtle : theme.overlaySubtle,
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

export default WorkoutSummaryOverview;