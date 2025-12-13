import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { FlatList } from 'react-native-gesture-handler';  // ← Gesture handler version
import React, { useState, useEffect, useRef } from 'react';
import { ActivityIndicator } from 'react-native';
import { fetchExerciseHistory, fetchExercises } from './db';
import { useFocusEffect } from 'expo-router';
import { FONTS, SHADOWS } from '../constants/theme';
import { Feather, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Body from "react-native-body-highlighter";
import ActionSheet from "react-native-actions-sheet";
import NewExercise from "./NewExercise"
import { useTheme } from '../context/ThemeContext';

const { width } = Dimensions.get('window');

const GradientOrView = ({ colors, style, theme, children }) => {
    if (theme.type === 'dynamic') {
        return <View style={[style, { backgroundColor: theme.surface }]}>{children}</View>;
    }
    return <LinearGradient colors={colors} style={style}>{children}</LinearGradient>;
};

const ExerciseHistory = (props) => {
    const { theme } = useTheme();
    const styles = getStyles(theme);
    const [workoutHistory, setWorkoutHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exercisesList, setExercises] = useState([]);
    const [formattedTargets, setFormattedTargets] = useState([]);
    const [stats, setStats] = useState({
        totalSets: 0,
        personalBest: 0,
        totalVolume: 0
    });


    const actionSheetRef = useRef(null);

    const showEditSheet = () => {


        actionSheetRef.current?.show();
    };
    const handleCloseEditSheet = () => {

        fetchExercises()
            .then(data => setExercises(data))
            .catch(err => console.error(err));


        actionSheetRef.current?.hide();
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
            // Only count sets with at least 1 rep for personal best
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

    // Safe fallback colors for Body component and Reanimated views
    const isDynamic = theme.type === 'dynamic';
    // User requested swap: "actually flipped like earlier".
    // Swapping order to: [Full Color (Target?), Light Color (Accessory?)] or vice versa.
    // Previous state: [`${theme.primary}80`, theme.primary] (Light, Dark).
    // Swapped state: [theme.primary, `${theme.primary}80`] (Dark, Light).
    const bodyColors = isDynamic
        ? ['#2DC4B6', '#2DC4B680']
        : [theme.primary, `${theme.primary}80`];
    const safeBorder = isDynamic ? '#e5e5e5' : theme.border;
    const safeSurface = isDynamic ? '#1e1e1e' : theme.surface;

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
                data={workoutHistory}
                style={styles.list}
                contentContainerStyle={styles.listContentContainer}
                keyExtractor={([session]) => session.toString()}
                ListHeaderComponent={
                    <View>
                        {/* Replaced GradientOrView with flat View for all themes as requested */}
                        <View
                            style={[styles.headerGradient, { backgroundColor: theme.surface }]}
                        >
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
                                containerStyle={{ height: '94%', backgroundColor: safeSurface }}
                                indicatorStyle={{ backgroundColor: theme.textSecondary }}
                                snapPoints={[94]}
                                initialSnapIndex={0}
                            >
                                <NewExercise exerciseID={props.exerciseID} close={handleCloseEditSheet} />
                            </ActionSheet>




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
                        </View>

                        <View style={styles.bodyContainer}>
                            <Body
                                data={formattedTargets}
                                gender="male"
                                side="front"
                                scale={1.0}
                                border={safeBorder}
                                colors={bodyColors}
                            />
                            <Body
                                data={formattedTargets}
                                gender="male"
                                side="back"
                                scale={1.0}
                                border={safeBorder}
                                colors={bodyColors}
                            />
                        </View>

                        <Text style={styles.sectionTitle}>History</Text>
                    </View>
                }
                renderItem={({ item: [session, exercises] }) => {
                    const sessionNote = exercises.find(e => e.notes)?.notes;
                    const workoutName = exercises[0].name || "Workout";

                    // Calculate display numbers
                    let workingSetCount = 0;
                    const setsWithDisplayNumbers = exercises.map(set => {
                        if (set.setType === 'N' || !set.setType) {
                            workingSetCount++;
                            return { ...set, displayNumber: workingSetCount };
                        }
                        return { ...set, displayNumber: set.setType };
                    });

                    return (
                        <View style={styles.sessionCard}>
                            <View style={styles.sessionHeader}>
                                <View>
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
                            </View>

                            {/* Session Note */}
                            {sessionNote && (
                                <View style={styles.noteContainer}>
                                    <MaterialCommunityIcons name="text" size={14} color={theme.textSecondary} style={{ marginTop: 2 }} />
                                    <Text style={styles.noteText}>{sessionNote}</Text>
                                </View>
                            )}

                            <View style={styles.setsContainer}>
                                <View style={styles.setsHeaderRow}>
                                    <Text style={[styles.colHeader, { width: 32, textAlign: 'center' }]}>Set</Text>
                                    <Text style={[styles.colHeader, { flex: 1, textAlign: 'center' }]}>kg</Text>
                                    <Text style={[styles.colHeader, { flex: 1, textAlign: 'center' }]}>Reps</Text>
                                    <Text style={[styles.colHeader, { flex: 1, textAlign: 'center' }]}>1RM</Text>
                                </View>
                                {setsWithDisplayNumbers.map((set, setIndex) => {
                                    const isPR = set.is1rmPR === 1 || set.isVolumePR === 1 || set.isWeightPR === 1;
                                    const hasBadges = isPR;

                                    return (
                                        <View key={setIndex} style={[
                                            styles.setRowContainer,
                                            setIndex % 2 === 1 && { backgroundColor: theme.surfaceVariant || 'rgba(255,255,255,0.02)' }
                                        ]}>
                                            <View style={styles.setRow}>
                                                <View style={[
                                                    styles.setBadge,
                                                    set.setType === 'W' && { backgroundColor: 'rgba(253, 203, 110, 0.15)' },
                                                    set.setType === 'D' && { backgroundColor: 'rgba(116, 185, 255, 0.15)' }
                                                ]}>
                                                    <Text style={[
                                                        styles.setNumber,
                                                        set.setType === 'W' && { color: theme.warning },
                                                        set.setType === 'D' && { color: theme.secondary }
                                                    ]}>
                                                        {set.displayNumber}
                                                    </Text>
                                                </View>

                                                <Text style={styles.setWeight}>{set.weight} kg</Text>
                                                <Text style={styles.setReps}>{set.reps}</Text>
                                                <Text style={styles.setOneRM}>{set.oneRM ? Math.round(set.oneRM) : '-'}</Text>
                                            </View>

                                            {/* PR Badges Row */}
                                            {hasBadges && (
                                                <View style={styles.badgeRow}>
                                                    {/* Indent to align with data if desired, or just flush left */}
                                                    <View style={{ width: 40 }} />
                                                    {set.is1rmPR === 1 && <PRBadge type="1RM" styles={styles} />}
                                                    {set.isVolumePR === 1 && <PRBadge type="VOL" styles={styles} />}
                                                    {set.isWeightPR === 1 && <PRBadge type="KG" styles={styles} />}
                                                </View>
                                            )}
                                        </View>
                                    );
                                })}
                            </View>
                        </View>
                    )
                }}
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
                onScrollBeginDrag={() => { }}
            />
        </View>
    );
};

const PRBadge = ({ type, styles }) => {
    // Fixed: Use MaterialCommunityIcons for Trophy
    const iconName = "trophy";
    let label = "PR";

    // Logic: Distinction in Text, Unity in Color
    if (type === '1RM') label = "1RM";
    if (type === 'VOL') label = "Vol.";
    if (type === 'KG') label = "Weight";

    const color = '#FFD700'; // Gold
    const bgColor = 'rgba(255, 215, 0, 0.15)'; // Low opacity gold
    const borderColor = 'rgba(255, 215, 0, 0.3)';

    return (
        <View style={[styles.strongBadge, { backgroundColor: bgColor, borderColor: borderColor }]}>
            <MaterialCommunityIcons name={iconName} size={10} color={color} />
            <Text style={[styles.strongBadgeText, { color: color }]}>{label}</Text>
        </View>
    );
};

const getStyles = (theme) => StyleSheet.create({
    container: {
        height: '100%',
        backgroundColor: theme.background,
    },
    dragHandleArea: {
        paddingVertical: 12,
        paddingTop: 8,
        alignItems: 'center',
        backgroundColor: theme.background,
    },
    dragHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: theme.textSecondary,
        opacity: 0.3,
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
        height: 350,
        marginTop: 24,
        marginBottom: 20,
        gap: 20,
    },
    sectionTitle: {
        fontSize: 18,
        fontFamily: FONTS.bold,
        color: theme.text,
        marginLeft: 20,
        marginTop: 16,
        marginBottom: 16,
    },
    // Updated Styles to match [session].jsx
    sessionCard: {
        marginBottom: 12,
        backgroundColor: theme.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.border,
        ...SHADOWS.small,
        overflow: 'hidden',
    },
    sessionHeader: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    sessionTitle: {
        fontSize: 15,
        fontFamily: FONTS.semiBold,
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
        paddingTop: 8,
        paddingBottom: 4,
        gap: 6,
        backgroundColor: 'rgba(255, 253, 203, 0.05)',
    },
    noteText: {
        flex: 1,
        fontSize: 11,
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
        paddingHorizontal: 16, // added back horizontal padding for header row alignment
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
    },
    colHeader: {
        fontSize: 10,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
        textTransform: 'uppercase',
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
    setBadge: {
        width: 24, // reduced from 30
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 4,
        marginRight: 8,
    },
    setNumber: {
        fontSize: 12,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
    },
    setWeight: {
        flex: 1,
        textAlign: 'center',
        fontSize: 14,
        fontFamily: FONTS.semiBold,
        color: theme.text,
    },
    setReps: {
        flex: 1,
        textAlign: 'center',
        fontSize: 14,
        fontFamily: FONTS.semiBold,
        color: theme.text,
    },
    setOneRM: {
        flex: 1,
        textAlign: 'center',
        fontSize: 12,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
    },
    prContainer: {
        width: 50,
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 4,
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
    strongBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 8,
        borderWidth: 1,
        gap: 4,
        marginRight: 6,
    },
    strongBadgeText: {
        fontSize: 10,
        fontFamily: FONTS.bold,
    },
});

export default ExerciseHistory;
