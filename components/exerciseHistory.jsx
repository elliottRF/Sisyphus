import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Switch } from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import React, { useState, useEffect, useRef } from 'react';
import { ActivityIndicator } from 'react-native';
import { fetchExerciseHistory, fetchExercises, fetchWorkoutHistoryBySession } from './db';
import { useFocusEffect, useRouter } from 'expo-router';
import { FONTS, SHADOWS } from '../constants/theme';
import { Feather, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import Body from "react-native-body-highlighter";
import ActionSheet from "react-native-actions-sheet";
import NewExercise from "./NewExercise"
import PRGraphCard from "./PRGraphCard";
import WorkoutSessionView from './WorkoutSessionView';
import { useTheme } from '../context/ThemeContext';

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
    const color = brightColor;
    const bgColor = `${brightColor}40`; // 25% opacity
    const borderColor = `${brightColor}66`; // 40% opacity

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
    let textStyle = {
        fontSize: 11,
        fontFamily: FONTS.medium,
    };

    if (type === 'W') {
        containerStyle.backgroundColor = 'rgba(253, 203, 110, 0.25)';
        textStyle.color = theme.warning;
        textStyle.fontFamily = FONTS.bold;
        textStyle.fontSize = 10;
    } else if (type === 'D') {
        containerStyle.backgroundColor = 'rgba(116, 185, 255, 0.15)';
        textStyle.color = theme.info;
        textStyle.fontFamily = FONTS.semiBold;
    } else {
        containerStyle.backgroundColor = 'rgba(255,255,255,0.05)';
        textStyle.color = theme.text;
        textStyle.fontFamily = FONTS.semiBold;
    }

    return (
        <View style={containerStyle}>
            <Text style={textStyle}>{number}</Text>
        </View>
    );
});

const HistorySessionCard = React.memo(({ session, exercises, theme, styles, formatDate, onSessionSelect, exercisesList }) => {
    const [isLoading, setIsLoading] = useState(false);

    const handlePress = async () => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            // Pre-fetch the data
            const sessionData = await fetchWorkoutHistoryBySession(session);
            // Open ActionSheet instead of navigating
            onSessionSelect(sessionData);
        } catch (error) {
            console.error("Error pre-fetching workout:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const sessionNote = exercises.find(e => e.notes)?.notes;
    const workoutName = exercises[0].name || "Workout";

    // Calculate display numbers matching [session].jsx
    let workingSetCount = 0;
    const setsWithDisplayNumbers = exercises.map(set => {
        let displayNumber = set.setType;
        if (set.setType === 'N' || !set.setType) {
            workingSetCount++;
            displayNumber = workingSetCount;
        }
        return { ...set, displayNumber };
    });

    // Check if cardio:
    // 1. Check prop passed directly (if available) -> This would be ideal but not always passed
    // 2. Check exercise list details (most reliable if list is populated)
    // 3. Inference from data (fallback)
    const exerciseID = exercises[0]?.exerciseID;
    const exerciseDetails = exercisesList ? exercisesList.find(e => e.exerciseID === exerciseID) : null;

    const isCardio = exerciseDetails
        ? exerciseDetails.isCardio === 1
        : exercises.some(ex => ex.distance > 0 || ex.seconds > 0);

    return (
        <TouchableOpacity
            onPress={handlePress}
            activeOpacity={0.8}
            delayPressIn={50} // slight delay to prevent accidental triggers while scrolling
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
                    {isLoading ? (
                        <ActivityIndicator size="small" color={theme.primary} style={{ marginLeft: 8 }} />
                    ) : (
                        <Feather name="chevron-right" size={20} color={theme.textSecondary} style={{ opacity: 0.5 }} />
                    )}
                </View>

                {!!sessionNote && (
                    <View style={styles.noteContainer}>
                        <MaterialCommunityIcons
                            name="comment-text-outline"
                            size={12}
                            color={theme.textSecondary}
                            style={{ marginTop: 2 }}
                        />
                        <Text style={styles.noteText}>{sessionNote}</Text>
                    </View>
                )}

                <View style={styles.setsContainer}>
                    <View style={styles.setsHeaderRow}>
                        <Text style={[styles.colHeader, styles.colHeaderSet]}>SET</Text>
                        <Text style={[styles.colHeader, styles.colHeaderLift]}>{isCardio ? "DIST / TIME" : "LIFT"}</Text>
                        <Text style={[styles.colHeader, styles.colHeader1RM]}>{isCardio ? "PACE" : "1RM"}</Text>
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
                                    isWarmup && { backgroundColor: 'rgba(253, 203, 110, 0.06)' },
                                    isDrop && { backgroundColor: 'rgba(116, 185, 255, 0.05)' },
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
                                            `${set.weight}kg × ${set.reps}`
                                        )}
                                    </Text>

                                    <Text style={styles.setOneRM}>
                                        {isCardio ? (
                                            set.distance > 0 ? `${((set.seconds / 60) / set.distance).toFixed(1)}` : '-'
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
        </TouchableOpacity>
    );
});

const ExerciseHistory = (props) => {
    const { theme, gender } = useTheme();
    // const router = useRouter();
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

    // Memoize filtered data to prevent re-computation on every render
    const filteredWorkoutHistory = React.useMemo(() => {
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

    const actionSheetRef = useRef(null);
    const sessionActionSheetRef = useRef(null);

    const showEditSheet = () => {
        actionSheetRef.current?.show();
    };

    const handleCloseEditSheet = () => {
        fetchExercises()
            .then(data => setExercises(data))
            .catch(err => console.error(err));
        actionSheetRef.current?.hide();
    };

    const handleSessionSelect = (data) => {
        setSelectedSessionData(data);
        sessionActionSheetRef.current?.show();
    };

    useEffect(() => {
        if (exercisesList) {
            const { targetMuscles, accessoryMuscles } = getExerciseMuscles(props.exerciseID, exercisesList);
            handleMuscleStrings(targetMuscles, accessoryMuscles)
        }
    }, [exercisesList]);

    const getExerciseMuscles = (exerciseID, exerciseLog) => {
        const exercise = exerciseLog.find(ex => ex.exerciseID === exerciseID);
        if (!exercise) return { targetMuscles: [], accessoryMuscles: [] };
        const targetMuscles = exercise.targetMuscle ? exercise.targetMuscle.split(',') : [];
        const accessoryMuscles = exercise.accessoryMuscles ? exercise.accessoryMuscles.split(',') : [];
        return { targetMuscles, accessoryMuscles };
    };

    const handleMuscleStrings = (targetSelected, accessorySelected) => {
        const sluggedTargets = targetSelected.map(target => ({
            slug: typeof target === 'string' ? target.toLowerCase() : '',
            intensity: 1
        }));
        const sluggedAccessories = accessorySelected.map(accessory => ({
            slug: typeof accessory === 'string' ? accessory.toLowerCase() : '',
            intensity: 2
        }));
        setFormattedTargets([...sluggedTargets, ...sluggedAccessories]);
    };

    useEffect(() => {
        fetchExercises()
            .then(data => setExercises(data))
            .catch(err => console.error(err));
    }, []);

    useFocusEffect(
        React.useCallback(() => {
            loadWorkoutHistory();
        }, [props.exerciseID])
    );

    const loadWorkoutHistory = async () => {
        try {
            const history = await fetchExerciseHistory(props.exerciseID);
            const groupedHistory = groupBySession(history);
            setWorkoutHistory(groupedHistory);
            calculateStats(history);
        } catch (error) {
            console.error("Error loading workout history:", error);
        } finally {
            setLoading(false);
        }
    };

    const calculateStats = (history) => {
        let maxWeight = 0;
        let volume = 0;

        history.forEach(entry => {
            if (entry.reps > 0 && entry.weight > maxWeight) {
                maxWeight = entry.weight;
            }
            volume += (entry.weight * entry.reps);
        });

        setStats({
            totalSets: history.length,
            personalBest: maxWeight,
            totalVolume: volume
        });
    };

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
        ? ['#2DC4B6', '#2DC4B680']
        : [theme.primary, `${theme.primary}60`];
    const safeBorder = isDynamic ? '#4d4d4dff' : theme.border;
    const safeSurface = isDynamic ? '#1e1e1e' : theme.surface;

    const currentExerciseDetails = exercisesList.find(e => e.exerciseID === props.exerciseID);
    const isCardioHeader = !!currentExerciseDetails?.isCardio;

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.primary} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <FlatList
                data={filteredWorkoutHistory}
                style={styles.list}
                contentContainerStyle={styles.listContentContainer}
                keyExtractor={([session]) => session.toString()}
                removeClippedSubviews={true}
                maxToRenderPerBatch={5}
                updateCellsBatchingPeriod={50}
                windowSize={10}
                ListHeaderComponent={
                    <View>
                        <View style={[styles.headerGradient, { backgroundColor: theme.surface }]}>
                            <View style={styles.titleRow}>
                                <Text style={styles.exerciseTitle}>{props.exerciseName}</Text>
                                <TouchableOpacity
                                    onPress={() => showEditSheet()}
                                    style={styles.editButton}
                                >
                                    <MaterialIcons
                                        name="edit"
                                        size={20}
                                        color={theme.primary}
                                    />
                                </TouchableOpacity>
                            </View>

                            <ActionSheet
                                ref={actionSheetRef}
                                enableGestureBack={true}
                                closeOnPressBack={true}
                                androidCloseOnBackPress={true}
                                containerStyle={{ height: '100%', backgroundColor: safeSurface }}
                                indicatorStyle={{ backgroundColor: theme.textSecondary }}
                                snapPoints={[100]}
                                initialSnapIndex={0}
                            >
                                <NewExercise exerciseID={props.exerciseID} close={handleCloseEditSheet} />
                            </ActionSheet>

                            {/* Conditionally render stats based on exercise type */}
                            {isCardioHeader ? (
                                <View style={[styles.statsRow, { justifyContent: 'center' }]}>
                                    <View style={styles.statItem}>
                                        <Text style={styles.statLabel}>Total Sets</Text>
                                        <Text style={styles.statValue}>{stats.totalSets}</Text>
                                    </View>
                                </View>
                            ) : (
                                <View style={styles.statsRow}>
                                    <View style={styles.statItem}>
                                        <Text style={styles.statLabel}>Personal Best</Text>
                                        <Text style={styles.statValue}>{stats.personalBest}kg</Text>
                                    </View>
                                    <View style={styles.statDivider} />
                                    <View style={styles.statItem}>
                                        <Text style={styles.statLabel}>Total Sets</Text>
                                        <Text style={styles.statValue}>{stats.totalSets}</Text>
                                    </View>
                                    <View style={styles.statDivider} />
                                    <View style={styles.statItem}>
                                        <Text style={styles.statLabel}>Volume</Text>
                                        <Text style={styles.statValue}>{(stats.totalVolume / 1000).toFixed(1)}k</Text>
                                    </View>
                                </View>
                            )}
                        </View>

                        {!isCardioHeader && (
                            <View style={styles.bodyContainer}>
                                <Body
                                    data={formattedTargets}
                                    gender={gender}
                                    side="front"
                                    scale={0.7}
                                    border={safeBorder}
                                    colors={bodyColors}
                                    defaultFill={theme.bodyFill}
                                />
                                <Body
                                    data={formattedTargets}
                                    gender={gender}
                                    side="back"
                                    scale={0.7}
                                    border={safeBorder}
                                    colors={bodyColors}
                                    defaultFill={theme.bodyFill}
                                />
                            </View>
                        )}

                        {!isCardioHeader && (
                            <>
                                <PRGraphCard
                                    exerciseID={props.exerciseID}
                                    exerciseName={props.exerciseName}
                                    isCompact={true}
                                />

                                <View style={styles.historyHeaderRow}>
                                    <Text style={styles.sectionTitle}>History</Text>
                                    <View style={styles.prFilterContainer}>
                                        <MaterialCommunityIcons
                                            name="trophy"
                                            size={14}
                                            color={showOnlyPRs ? lightenColor(theme.primary, 20) : theme.textSecondary}
                                        />
                                        <Text style={[
                                            styles.prFilterText,
                                            showOnlyPRs && { color: lightenColor(theme.primary, 20) }
                                        ]}>
                                            PRs Only
                                        </Text>
                                        <Switch
                                            value={showOnlyPRs}
                                            onValueChange={setShowOnlyPRs}
                                            trackColor={{ false: theme.border, true: `${lightenColor(theme.primary, 20)}66` }}
                                            thumbColor={showOnlyPRs ? lightenColor(theme.primary, 20) : theme.textSecondary}
                                            ios_backgroundColor={theme.border}
                                        />
                                    </View>
                                </View>
                            </>
                        )}

                        {isCardioHeader && (
                            <View style={styles.historyHeaderRow}>
                                <Text style={styles.sectionTitle}>History</Text>
                            </View>
                        )}
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
                        <Feather name="activity" size={48} color={theme.textSecondary} style={{ opacity: 0.5 }} />
                        <Text style={styles.emptyText}>No workout history yet</Text>
                        <Text style={styles.emptySubtext}>Complete a workout to see your progress</Text>
                    </View>
                }
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled={true}
                bounces={true}
                scrollEventThrottle={16}
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
                    // Optional: onEdit={...} if we want to allow editing from here
                    // Optional: onExerciseInfo={...} if we want recursion
                    />
                )}
            </ActionSheet>
        </View>
    );
};

const getStyles = (theme) => StyleSheet.create({
    container: {
        height: '100%',
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
        paddingBottom: 120,
    },
    headerGradient: {
        paddingTop: 20,
        paddingBottom: 24,
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
        marginBottom: 24,
        position: 'relative',
    },
    exerciseTitle: {
        fontSize: 24,
        fontFamily: FONTS.bold,
        color: theme.text,
        textAlign: 'center',
        flex: 1,
    },
    editButton: {
        padding: 8,
        backgroundColor: theme.surface,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.border,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-evenly',
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    statItem: {
        alignItems: 'center',
    },
    statLabel: {
        fontSize: 12,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    statValue: {
        fontSize: 20,
        fontFamily: FONTS.bold,
        color: theme.primary,
    },
    statDivider: {
        width: 1,
        height: 30,
        backgroundColor: theme.border,
    },
    bodyContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: 240,
        marginTop: 16,
        marginBottom: 20,
        gap: 12,
    },
    sectionTitle: {
        fontSize: 18,
        fontFamily: FONTS.bold,
        color: theme.text,
        marginLeft: 20,
    },
    historyHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 16,
        marginBottom: 16,
        paddingHorizontal: 20,
    },
    prFilterContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: theme.surface,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.border,
    },
    prFilterText: {
        fontSize: 12,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
    },
    sessionCard: {
        marginBottom: 12,
        marginHorizontal: 12,
        backgroundColor: theme.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.border,
        overflow: 'hidden',
    },
    sessionHeader: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: 'rgba(255,255,255,0.03)',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    sessionTitle: {
        fontSize: 15,
        fontFamily: FONTS.bold,
        color: theme.text,
        marginBottom: 2,
    },
    sessionDateContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    sessionDate: {
        fontSize: 11,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
    },
    dot: {
        width: 2,
        height: 2,
        borderRadius: 1,
        backgroundColor: theme.textSecondary,
        opacity: 0.5,
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
    emptyContainer: {
        padding: 40,
        alignItems: 'center',
        marginTop: 40,
    },
    emptyText: {
        color: theme.text,
        fontFamily: FONTS.bold,
        fontSize: 18,
        marginTop: 16,
        marginBottom: 8,
    },
    emptySubtext: {
        color: theme.textSecondary,
        fontFamily: FONTS.regular,
        fontSize: 14,
    },
});

export default ExerciseHistory;