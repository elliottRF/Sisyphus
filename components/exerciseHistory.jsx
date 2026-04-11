import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Switch, ActivityIndicator, Animated } from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import Body from "react-native-body-highlighter";
import ActionSheet from "react-native-actions-sheet";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { fetchExerciseHistory, fetchExercises, fetchWorkoutHistoryBySession } from './db';
import { FONTS, SHADOWS } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import PRGraphCard from "./PRGraphCard";
import WorkoutSessionView from './WorkoutSessionView';
import { Stack } from 'expo-router';



const { width } = Dimensions.get('window');

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
    const bgColor = `${brightColor}25`; // Softer background
    const borderColor = `${brightColor}50`;

    return (
        <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 6,
            borderWidth: 1,
            gap: 4,
            marginRight: 6,
            backgroundColor: bgColor,
            borderColor: borderColor
        }}>
            <MaterialCommunityIcons name={iconName} size={10} color={brightColor} />
            <Text style={{ fontSize: 9, fontFamily: FONTS.bold, color: brightColor }}>{label}</Text>
        </View>
    );
});

const SetNumberBadge = React.memo(({ type, number, theme }) => {
    let containerStyle = {
        width: 24,
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 6,
        marginRight: 10,
    };
    let textStyle = {
        fontSize: 11,
        fontFamily: FONTS.bold,
    };

    if (type === 'W') {
        containerStyle.backgroundColor = 'rgba(253, 203, 110, 0.2)';
        textStyle.color = theme.warning;
        textStyle.fontSize = 10;
    } else if (type === 'D') {
        containerStyle.backgroundColor = 'rgba(116, 185, 255, 0.15)';
        textStyle.color = theme.info;
    } else {
        containerStyle.backgroundColor = theme.border; // Slightly more visible for normal sets
        textStyle.color = theme.textSecondary;
    }

    return (
        <View style={containerStyle}>
            <Text style={textStyle}>{number}</Text>
        </View>
    );
});
const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

const HistorySessionCard = React.memo(({ session, exercises, theme, styles, formatDate, onSessionSelect, exercisesList }) => {
    const [isLoading, setIsLoading] = useState(false);

    const handlePress = async () => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            const sessionData = await fetchWorkoutHistoryBySession(session);
            onSessionSelect(sessionData);
        } catch (error) {
            console.error("Error pre-fetching workout:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const scaleAnim = useRef(new Animated.Value(1)).current;

    const handlePressIn = () => {
        Animated.spring(scaleAnim, {
            toValue: 0.98,
            useNativeDriver: true,
            speed: 20,
            bounciness: 4,
        }).start();
    };

    const handlePressOut = () => {
        Animated.spring(scaleAnim, {
            toValue: 1,
            useNativeDriver: true,
            speed: 20,
            bounciness: 4,
        }).start();
    };


    const sessionNote = exercises.find(e => e.notes)?.notes;
    const workoutName = exercises[0].name || "Workout";

    let workingSetCount = 0;
    const setsWithDisplayNumbers = exercises.map(set => {
        let displayNumber = set.setType;
        if (set.setType === 'N' || !set.setType) {
            workingSetCount++;
            displayNumber = workingSetCount;
        }
        return { ...set, displayNumber };
    });

    const exerciseID = exercises[0]?.exerciseID;
    const exerciseDetails = exercisesList ? exercisesList.find(e => e.exerciseID === exerciseID) : null;
    const isCardio = exerciseDetails
        ? exerciseDetails.isCardio === 1
        : exercises.some(ex => ex.distance > 0 || ex.seconds > 0);
    const isAssisted = exerciseDetails?.isAssisted === 1;

    return (
        <AnimatedTouchableOpacity
            activeOpacity={0.8}
            onPress={handlePress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            style={[styles.cardContainer, { transform: [{ scale: scaleAnim }] }]}

            disabled={isLoading}
        >
            <View style={styles.sessionCard}>
                <View style={styles.sessionHeader}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.sessionTitle}>{workoutName}</Text>
                        <View style={styles.sessionDateContainer}>
                            <Feather name="calendar" size={12} color={theme.textSecondary} />
                            <Text style={styles.sessionDate}>
                                {formatDate(exercises[0].time)}
                            </Text>
                            <View style={styles.dot} />
                            <Text style={styles.sessionDate}>Session {session}</Text>
                        </View>
                    </View>
                    <View style={styles.iconButton}>
                        <Feather name="chevron-right" size={18} color={theme.textSecondary} />
                    </View>
                </View>

                {!!sessionNote && (
                    <View style={styles.noteContainer}>
                        <MaterialCommunityIcons name="comment-text-outline" size={14} color={theme.textSecondary} style={{ marginTop: 2 }} />
                        <Text style={styles.noteText}>{sessionNote}</Text>
                    </View>
                )}

                <View style={styles.setsContainer}>
                    <View style={styles.setsHeaderRow}>
                        <Text style={[styles.colHeader, styles.colHeaderSet]}>SET</Text>
                        <Text style={[styles.colHeader, styles.colHeaderLift]}>{isCardio ? "DIST / TIME" : "LIFT"}</Text>
                        {!isAssisted && <Text style={[styles.colHeader, styles.colHeader1RM]}>{isCardio ? "PACE" : "1RM"}</Text>}
                    </View>

                    {setsWithDisplayNumbers.map((set, setIndex) => {
                        const isPR = set.is1rmPR === 1 || set.isVolumePR === 1 || set.isWeightPR === 1;
                        const setType = set.setType || 'N';
                        const isWarmup = setType === 'W';
                        const isDrop = setType === 'D';

                        return (
                            <View
                                key={`${set.exerciseHistoryID ?? ''}-${setIndex}`}
                                style={[
                                    styles.setRowContainer,
                                    setIndex % 2 === 1 && styles.setRowOdd,
                                    isWarmup && { backgroundColor: 'rgba(253, 203, 110, 0.04)' },
                                    isDrop && { backgroundColor: 'rgba(116, 185, 255, 0.04)' },
                                ]}
                            >
                                <View style={styles.setRow}>
                                    <SetNumberBadge type={setType} number={set.displayNumber} theme={theme} />

                                    <Text
                                        style={[
                                            styles.setLift,
                                            isWarmup && styles.setLiftWarmup,
                                            isDrop && styles.setLiftDrop,
                                        ]}
                                    >
                                        {isCardio ? (
                                            `${set.distance || 0}km / ${(set.seconds / 60).toFixed(1)}m`
                                        ) : (
                                            `${isAssisted && set.weight > 0 ? '-' : ''}${set.weight}kg × ${set.reps}`
                                        )}
                                    </Text>

                                    {!isAssisted && (
                                        <Text style={styles.setOneRM}>
                                            {isCardio ? (
                                                set.distance > 0 ? `${((set.seconds / 60) / set.distance).toFixed(1)}` : '-'
                                            ) : (
                                                set.oneRM ? Math.round(set.oneRM) : '-'
                                            )}
                                        </Text>
                                    )}
                                </View>

                                {isPR && (
                                    <View style={styles.badgeRow}>
                                        <View style={{ width: 34 }} />
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
        </AnimatedTouchableOpacity>
    );
});

const ExerciseHistory = (props) => {
    const { theme, gender } = useTheme();
    const router = useRouter();
    const styles = getStyles(theme);

    const [workoutHistory, setWorkoutHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exercisesList, setExercises] = useState([]);
    const [formattedTargets, setFormattedTargets] = useState([]);
    const [selectedSessionData, setSelectedSessionData] = useState(null);
    const [stats, setStats] = useState({
        totalSets: 0,
        personalBest: 0,
        totalVolume: 0
    });
    const [showOnlyPRs, setShowOnlyPRs] = useState(false);

    const [exerciseName, setExerciseName] = useState(props.exerciseName);


    const filteredWorkoutHistory = useMemo(() => {
        if (!showOnlyPRs) return workoutHistory;

        return workoutHistory
            .map(([session, exercises]) => {
                const prSets = exercises.filter(set =>
                    set.is1rmPR === 1 || set.isVolumePR === 1 || set.isWeightPR === 1
                );
                return prSets.length > 0 ? [session, prSets] : null;
            })
            .filter(Boolean);
    }, [workoutHistory, showOnlyPRs]);

    const sessionActionSheetRef = useRef(null);

    const showEditSheet = () => {
        router.push(`/exercise/new?id=${props.exerciseID}`);
    };

    const handleSessionSelect = (data) => {
        setSelectedSessionData(data);
        sessionActionSheetRef.current?.show();
    };

    useEffect(() => {
        if (exercisesList.length > 0) {
            const { targetMuscles, accessoryMuscles } = getExerciseMuscles(props.exerciseID, exercisesList);
            handleMuscleStrings(targetMuscles, accessoryMuscles);
            setExerciseName(currentExerciseDetails.name);
        }
    }, [exercisesList]);

    const getExerciseMuscles = (exerciseID, exerciseLog) => {
        const exercise = exerciseLog.find(ex => ex.exerciseID === exerciseID);
        if (!exercise) return { targetMuscles: [], accessoryMuscles: [] };
        const targetMuscles = exercise.targetMuscle ? exercise.targetMuscle.split(',') : [];
        const accessoryMuscles = exercise.accessoryMuscles ? exercise.accessoryMuscles.split(',') : [];
        return { targetMuscles, accessoryMuscles };
    };

    const ALL_MUSCLE_SLUGS = [
        'chest', 'quadriceps', 'triceps', 'biceps', 'hamstring',
        'upper-back', 'lower-back', 'deltoids', 'gluteal', 'forearm',
        'trapezius', 'calves', 'abs', 'adductors', 'obliques',
        'tibialis', 'abductors', 'neck', 'hands', 'feet', 'knees', 'ankles'
    ];

    const handleMuscleStrings = (targetSelected, accessorySelected) => {
        const workedSlugs = new Set();

        const sluggedTargets = targetSelected.map(target => {
            const slug = typeof target === 'string' ? target.trim().toLowerCase() : '';
            workedSlugs.add(slug);
            return { slug, intensity: 3 };
        });

        const sluggedAccessories = accessorySelected.map(accessory => {
            const slug = typeof accessory === 'string' ? accessory.trim().toLowerCase() : '';
            workedSlugs.add(slug);
            return { slug, intensity: 2 };
        });

        const unworked = ALL_MUSCLE_SLUGS
            .filter(slug => !workedSlugs.has(slug))
            .map(slug => ({ slug, intensity: 1 }));

        setFormattedTargets([...sluggedTargets, ...sluggedAccessories, ...unworked]);
    };

    useFocusEffect(
        useCallback(() => {
            fetchExercises()
                .then(data => setExercises(data))
                .catch(err => console.error(err));
        }, [])
    );

    useFocusEffect(
        useCallback(() => {
            loadWorkoutHistory();
        }, [props.exerciseID])
    );

    const loadWorkoutHistory = async () => {
        try {
            const history = await fetchExerciseHistory(props.exerciseID);
            const groupedHistory = groupBySession(history);
            setWorkoutHistory(groupedHistory);
        } catch (error) {
            console.error("Error loading workout history:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!workoutHistory || workoutHistory.length === 0) return;

        let maxWeight = 0;
        let minWeight = Infinity;
        let volume = 0;
        let totalSetsCount = 0;

        workoutHistory.forEach(([session, exercises]) => {
            exercises.forEach(entry => {
                totalSetsCount++;
                if (entry.reps > 0 && entry.weight > maxWeight) maxWeight = entry.weight;
                if (entry.reps > 0 && entry.weight < minWeight) minWeight = entry.weight;
                volume += (entry.weight * entry.reps);
            });
        });

        const currentEx = exercisesList.find(e => e.exerciseID === props.exerciseID);
        const isAssisted = !!currentEx?.isAssisted;

        setStats({
            totalSets: totalSetsCount,
            personalBest: isAssisted ? (minWeight === Infinity ? 0 : minWeight) : maxWeight,
            totalVolume: volume
        });
    }, [workoutHistory, exercisesList, props.exerciseID]);

    const groupBySession = (history) => {
        const grouped = {};
        history.forEach(entry => {
            if (!grouped[entry.workoutSession]) {
                grouped[entry.workoutSession] = [];
            }
            grouped[entry.workoutSession].push(entry);
        });
        return Object.entries(grouped).sort((a, b) => b[0] - a[0]);
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const isDynamic = theme.type === 'dynamic';
    const bodyColors = isDynamic
        ? [theme.bodyFill, '#2DC4B660', '#2DC4B6']
        : [theme.bodyFill, `${theme.primary}60`, theme.primary];
    const safeBorder = isDynamic ? '#4d4d4d' : theme.border;
    const safeSurface = isDynamic ? '#1e1e1e' : theme.surface;

    const currentExerciseDetails = exercisesList.find(e => e.exerciseID === props.exerciseID);
    const isCardioHeader = !!currentExerciseDetails?.isCardio;
    const isAssistedHeader = !!currentExerciseDetails?.isAssisted;




    return (
        <View style={styles.container}>
            <FlatList
                data={filteredWorkoutHistory}
                style={styles.list}
                contentContainerStyle={[styles.listContentContainer]}
                keyExtractor={([session]) => session.toString()}
                removeClippedSubviews={true}
                maxToRenderPerBatch={5}
                updateCellsBatchingPeriod={50}
                windowSize={10}
                showsVerticalScrollIndicator={false}
                ListHeaderComponent={
                    <View style={styles.headerWrapper}>
                        <View style={styles.titleRow}>
                            <Text style={styles.exerciseTitle}>{exerciseName}</Text>
                            <TouchableOpacity
                                onPress={showEditSheet}
                                style={styles.editButton}
                                activeOpacity={0.7}
                            >
                                <MaterialIcons name="edit" size={20} color={theme.text} />
                            </TouchableOpacity>
                        </View>

                        {/* Updated Stats Cards */}
                        <View style={styles.statsRow}>
                            {!isCardioHeader && (
                                <View style={styles.statCard}>
                                    <Feather name="award" size={16} color={theme.primary} style={styles.statIcon} />
                                    <Text style={styles.statValue}>{isAssistedHeader && stats.personalBest > 0 ? '-' : ''}{stats.personalBest}kg</Text>
                                    <Text style={styles.statLabel}>Best Lift</Text>
                                </View>
                            )}
                            <View style={styles.statCard}>
                                <Feather name="layers" size={16} color={theme.primary} style={styles.statIcon} />
                                <Text style={styles.statValue}>{stats.totalSets}</Text>
                                <Text style={styles.statLabel}>Total Sets</Text>
                            </View>
                            {!isCardioHeader && !isAssistedHeader && (
                                <View style={styles.statCard}>
                                    <Feather name="activity" size={16} color={theme.primary} style={styles.statIcon} />
                                    <Text style={styles.statValue}>{(stats.totalVolume / 1000).toFixed(1)}k</Text>
                                    <Text style={styles.statLabel}>Volume</Text>
                                </View>
                            )}
                        </View>

                        {!isCardioHeader && (
                            <View style={styles.bodyWrapper}>
                                <Body
                                    data={formattedTargets}
                                    gender={gender}
                                    side="front"
                                    scale={0.75}
                                    border={safeBorder}
                                    colors={bodyColors}
                                    defaultFill={theme.bodyFill}
                                />
                                <View style={styles.bodyDivider} />
                                <Body
                                    data={formattedTargets}
                                    gender={gender}
                                    side="back"
                                    scale={0.75}
                                    border={safeBorder}
                                    colors={bodyColors}
                                    defaultFill={theme.bodyFill}
                                />
                            </View>
                        )}

                        {!isCardioHeader && (
                            <PRGraphCard
                                exerciseID={props.exerciseID}
                                exerciseName={exerciseName}
                                isCompact={true}
                            />
                        )}

                        <View style={styles.historyHeaderRow}>
                            <Text style={styles.sectionTitle}>History</Text>
                            {!isCardioHeader && (
                                <View style={styles.prFilterContainer}>
                                    <Text style={[
                                        styles.prFilterText,
                                        showOnlyPRs && { color: theme.text }
                                    ]}>
                                        PRs Only
                                    </Text>
                                    <Switch
                                        value={showOnlyPRs}
                                        onValueChange={setShowOnlyPRs}
                                        trackColor={{ false: theme.border, true: theme.primary }}
                                        thumbColor={showOnlyPRs ? '#FFF' : theme.textSecondary}
                                        ios_backgroundColor={theme.border}
                                        style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                                    />
                                </View>
                            )}
                        </View>
                    </View>
                }
                renderItem={({ item: [session, exercises] }) => (
                    <HistorySessionCard
                        session={session}
                        exercises={exercises}
                        theme={theme}
                        styles={styles}
                        formatDate={formatDate}
                        onSessionSelect={handleSessionSelect}
                        exercisesList={exercisesList}
                    />
                )}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <View style={styles.emptyIconCircle}>
                            <Feather name="activity" size={32} color={theme.textSecondary} />
                        </View>
                        <Text style={styles.emptyText}>No history yet</Text>
                        <Text style={styles.emptySubtext}>Complete a workout to see your progress.</Text>
                    </View>
                }
                showsVerticalScrollIndicator={false}
            />

            <ActionSheet
                ref={sessionActionSheetRef}
                enableGestureBack={true}
                closeOnPressBack={true}
                androidCloseOnBackPress={true}
                containerStyle={{ height: '100%', backgroundColor: safeSurface }}
                indicatorStyle={{ backgroundColor: theme.textSecondary }}
                snapPoints={[100]}
                initialSnapIndex={0}
            >
                {selectedSessionData && (
                    <WorkoutSessionView
                        workoutDetails={selectedSessionData}
                        exercisesList={exercisesList}
                    />
                )}
            </ActionSheet>
        </View>
    );
};

const getStyles = (theme) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.background,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.background,
    },
    list: {
        flex: 1,
    },
    listContentContainer: {
        paddingBottom: 100,
    },
    headerWrapper: {
        paddingTop: 10,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
        position: 'relative',
        minHeight: 44,
        paddingHorizontal: 12,
    },
    exerciseTitle: {
        fontSize: 24,
        fontFamily: FONTS.bold,
        color: theme.text,
        textAlign: 'center',
        paddingHorizontal: 50,
    },
    editButton: {
        position: 'absolute',
        right: 0,
        padding: 10,
        backgroundColor: theme.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.border,
        marginRight: 12,
        ...SHADOWS.small,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 24,
        gap: 12,
        paddingHorizontal: 12,
    },
    statCard: {
        flex: 1,
        backgroundColor: theme.surface,
        borderRadius: 16,
        paddingVertical: 16,
        paddingHorizontal: 8,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.border,
        ...SHADOWS.small,
    },
    statIcon: {
        marginBottom: 8,
        opacity: 0.8,
    },
    statValue: {
        fontSize: 18,
        fontFamily: FONTS.bold,
        color: theme.text,
        marginBottom: 2,
    },
    statLabel: {
        fontSize: 11,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    bodyWrapper: {
        flexDirection: 'row',
        justifyContent: 'space-evenly',
        alignItems: 'center',
        backgroundColor: theme.surface,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: theme.border,
        marginBottom: 24,
        marginHorizontal: 12,
        ...SHADOWS.small,
    },
    bodyDivider: {
        width: 1,
        height: '80%',
        backgroundColor: theme.border,
        opacity: 0.5,
    },
    historyHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 10,
        marginBottom: 16,
        paddingHorizontal: 12,
    },
    sectionTitle: {
        fontSize: 20,
        fontFamily: FONTS.bold,
        color: theme.text,
    },
    prFilterContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.surface,
        paddingLeft: 12,
        paddingRight: 4,
        paddingVertical: 4,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: theme.border,
    },
    prFilterText: {
        fontSize: 13,
        fontFamily: FONTS.semiBold,
        color: theme.textSecondary,
        marginRight: 6,
    },
    sessionCard: {
        marginBottom: 16,
        marginHorizontal: 12,
        backgroundColor: theme.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.border,
        overflow: 'hidden',
        ...SHADOWS.small,
    },
    sessionHeader: {
        paddingHorizontal: 12,
        paddingVertical: 14,
        backgroundColor: 'rgba(255,255,255,0.02)',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
    },
    sessionTitle: {
        fontSize: 16,
        fontFamily: FONTS.bold,
        color: theme.text,
        marginBottom: 4,
    },
    sessionDateContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    sessionDate: {
        fontSize: 12,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
    },
    dot: {
        width: 3,
        height: 3,
        borderRadius: 1.5,
        backgroundColor: theme.textSecondary,
        opacity: 0.5,
    },
    iconButton: {
        padding: 6,
        opacity: 0.5,
    },
    noteContainer: {
        flexDirection: 'row',
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 8,
        backgroundColor: 'rgba(255, 253, 203, 0.05)',
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
    },
    noteText: {
        flex: 1,
        fontSize: 13,
        color: theme.textSecondary,
        fontFamily: FONTS.regular,
        fontStyle: 'italic',
        lineHeight: 18,
    },
    setsContainer: {
        paddingVertical: 4,
        paddingBottom: 8,
    },
    setsHeaderRow: {
        flexDirection: 'row',
        paddingVertical: 8,
        paddingHorizontal: 12,
        marginBottom: 4,
    },
    colHeader: {
        fontSize: 10,
        fontFamily: FONTS.bold,
        color: theme.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    colHeaderSet: { width: 34 },
    colHeaderLift: {
        flex: 2,
        textAlign: 'left',
        paddingLeft: 6,
    },
    colHeader1RM: { flex: 1, textAlign: 'center' },
    setRowContainer: {
        paddingVertical: 6,
        paddingHorizontal: 12,
    },
    setRow: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 28,
    },
    setRowOdd: {
        backgroundColor: 'rgba(255,255,255,0.015)',
    },
    badgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 6,
        flexWrap: 'wrap',
    },
    setLift: {
        flex: 2,
        textAlign: 'left',
        paddingLeft: 6,
        fontSize: 15,
        fontFamily: FONTS.bold,
        color: theme.text,
        letterSpacing: 0.2,
    },
    setLiftWarmup: {
        color: theme.textSecondary,
    },
    setLiftDrop: {
        color: theme.info,
    },
    setOneRM: {
        flex: 1,
        textAlign: 'center',
        fontSize: 13,
        fontFamily: FONTS.semiBold,
        color: theme.textSecondary,
    },
    emptyContainer: {
        padding: 40,
        alignItems: 'center',
        marginTop: 20,
    },
    emptyIconCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: theme.surface,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
        borderWidth: 1,
        borderColor: theme.border,
    },
    emptyText: {
        color: theme.text,
        fontFamily: FONTS.bold,
        fontSize: 18,
        marginBottom: 8,
    },
    emptySubtext: {
        color: theme.textSecondary,
        fontFamily: FONTS.regular,
        fontSize: 14,
        textAlign: 'center',
    },
});

export default ExerciseHistory;