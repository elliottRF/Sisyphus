import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native'
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useScrollToTop } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchWorkoutHistory, fetchExercises, fetchWorkoutHistoryBySession } from '../components/db';
import { useFocusEffect, useRouter } from 'expo-router';
import { Calendar } from 'react-native-calendars';
import ActionSheet from "react-native-actions-sheet";
// import { COLORS, FONTS, SHADOWS } from '../constants/theme'; // Removed static
import { FONTS, SHADOWS } from '../constants/theme';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { setPreloadedData } from '../constants/preloader'; // add this import

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

const groupExercisesByName = (exercises) => {
    const grouped = {};
    const order = [];

    exercises.forEach(exercise => {
        const key = exercise.exerciseID;
        if (!grouped[key]) {
            grouped[key] = [];
            order.push(key);
        }
        grouped[key].push(exercise);
    });

    return order.map(key => grouped[key]);
};

const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
};

const formatDuration = (minutes) => {
    if (minutes === null || minutes === undefined) return 'N/A';
    if (minutes === 0) return '< 1m';
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
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

const calculateItemHeight = (entry) => {
    const [_, sets] = entry;
    const uniqueExerciseCount = new Set(sets.map(s => s.exerciseID)).size;
    const baseHeight = 16 + 32 + 45 + 13; // margin + padding + header + divider
    const summaryLines = Math.min(uniqueExerciseCount, 4);
    const itemsHeight = summaryLines * 21;
    const moreHeight = uniqueExerciseCount > 4 ? 20 : 0;
    return baseHeight + itemsHeight + moreHeight;
};

const HistoryCard = React.memo(({ session, exercises, exercisesList, theme, styles, formatDate, formatDuration, router }) => {
    const groupedExercises = groupExercisesByName(exercises);
    const duration = exercises[0].duration;
    const [isLoading, setIsLoading] = useState(false);

    const totalPRs = exercises.reduce((acc, ex) => {
        return acc + (ex.is1rmPR || 0) + (ex.isVolumePR || 0) + (ex.isWeightPR || 0);
    }, 0);

    const handleSaveAsTemplate = async () => {
        try {
            const rows = await fetchWorkoutHistoryBySession(session); // your session param

            // Group flat rows into the nested structure EditTemplate expects
            const grouped = new Map();

            rows.forEach(row => {
                if (!grouped.has(row.exerciseNum)) {
                    grouped.set(row.exerciseNum, {
                        id: `${Date.now()}_${row.exerciseNum}_${Math.random().toString(36).substr(2, 6)}`,
                        exercises: [{
                            exerciseID: row.exerciseID,
                            notes: row.notes || '',
                            sets: []
                        }]
                    });
                }

                grouped.get(row.exerciseNum).exercises[0].sets.push({
                    id: `${Date.now()}_${row.setNum}_${Math.random().toString(36).substr(2, 6)}`,
                    weight: row.weight,
                    reps: row.reps,
                    minutes: row.minutes,
                    distance: row.distance,
                    setType: row.setType || 'N',
                    completed: false,
                });
            });

            const workoutData = Array.from(grouped.values());

            setPreloadedData({
                template: { name: '', data: workoutData },
                exercises: [] // EditTemplate will fetch these itself
            });

            router.push(`/template/new?v=${Date.now()}`);

        } catch (err) {
            console.error('handleSaveAsTemplate error:', err);
            Alert.alert('Error', 'Could not load workout data.');
        }
    };

    const handleStartAsTemplate = async () => {
        if (isLoading) return;
        setIsLoading(true);

        try {
            const sessionData = await fetchWorkoutHistoryBySession(session);

            // group sets by exercise
            const grouped = {};
            const exerciseOrder = [];

            sessionData.forEach(set => {
                if (!grouped[set.exerciseID]) {
                    grouped[set.exerciseID] = [];
                    exerciseOrder.push(set.exerciseID); // preserve first-seen order
                }
                grouped[set.exerciseID].push(set);
            });

            const template = {
                name: exercises[0].name || "Repeated Workout",
                data: exerciseOrder.map(exerciseID => ({
                    id: Date.now().toString() + Math.random(),
                    exercises: [{
                        exerciseID: Number(exerciseID),
                        notes: '',
                        sets: grouped[exerciseID].map(s => ({
                            id: Date.now().toString() + Math.random(),
                            weight: s.weight?.toString() || null,
                            reps: s.reps?.toString() || null,
                            distance: s.distance?.toString() || null,
                            minutes: s.seconds
                                ? (s.seconds / 60).toFixed(1).replace(/\.0$/, '')
                                : null,
                            setType: s.setType || 'N',
                            completed: false
                        }))
                    }]
                }))
            };

            router.push({
                pathname: "/current",
                params: {
                    template: JSON.stringify(template)
                }
            });

        } catch (err) {
            console.error("Failed to repeat workout:", err);
        } finally {
            setIsLoading(false);
        }
    };






    const handlePress = async () => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            // Pre-fetch the data
            const sessionData = await fetchWorkoutHistoryBySession(session);

            // Navigate with the data
            router.push({
                pathname: `/workout/${session}`,
                params: {
                    initialData: JSON.stringify(sessionData)
                }
            });
        } catch (error) {
            console.error("Error pre-fetching workout:", error);
            // Fallback to normal navigation if fetch fails
            router.push(`/workout/${session}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <TouchableOpacity
            activeOpacity={0.7}
            onPress={handlePress}
            style={styles.cardContainer}
            disabled={isLoading}
        >
            <View style={[styles.cardContent, { backgroundColor: theme.surface }]}>
                <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.workoutName} numberOfLines={1}>{exercises[0].name}</Text>
                        <View style={styles.metaContainer}>
                            <View style={styles.metaItem}>
                                <Feather name="calendar" size={12} color={theme.textSecondary} />
                                <Text style={styles.metaText}>{formatDate(exercises[0].time)}</Text>
                            </View>
                            <View style={styles.metaDivider} />
                            <View style={styles.metaItem}>
                                <Feather name="clock" size={12} color={theme.textSecondary} />
                                <Text style={styles.metaText}>{formatDuration(duration)}</Text>
                            </View>
                        </View>
                    </View>

                    <View style={styles.badgeContainer}>
                        {totalPRs > 0 && (
                            <View style={styles.prSummaryBadge}>
                                <MaterialCommunityIcons name="trophy" size={14} color={lightenColor(theme.primary, 20)} />
                                <Text style={styles.prSummaryText}>{totalPRs} PR{totalPRs > 1 ? 's' : ''}</Text>
                            </View>
                        )}
                        <View style={styles.sessionBadge}>
                            <Text style={styles.sessionBadgeText}>#{session}</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.divider} />

                {/* Exercises List Area */}
                <View style={styles.summaryList}>
                    {groupedExercises.slice(0, 4).map((group, idx) => {
                        const exerciseName = exercisesList.find(e => e.exerciseID === group[0].exerciseID)?.name || 'Unknown Exercise';
                        const workingSets = group.filter(set => set.setType !== 'W');
                        const count = workingSets.length;
                        return (
                            <Text key={idx} style={styles.summaryText} numberOfLines={1}>
                                <Text style={styles.summaryCount}>{count} x</Text> {exerciseName}
                            </Text>
                        );
                    })}
                    {groupedExercises.length > 4 && (
                        <Text style={styles.moreText}>+ {groupedExercises.length - 4} more exercises</Text>
                    )}
                </View>

                {/* BOTTOM RIGHT BUTTON */}
                <View style={styles.footerContainer}>
                    <TouchableOpacity
                        style={styles.repeatButtonFloating}
                        onPress={handleStartAsTemplate}
                        disabled={isLoading}
                        activeOpacity={0.7}
                    >
                        <Feather name="refresh-cw" size={14} color={theme.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.templateSaveButtonFloating}
                        onPress={handleSaveAsTemplate}
                        disabled={isLoading}
                        activeOpacity={0.7}
                    >
                        <Feather name="bookmark" size={14} color={theme.primary} />
                    </TouchableOpacity>
                </View>
            </View>
        </TouchableOpacity>
    );
});


const History = () => {
    const insets = useSafeAreaInsets();
    const [workoutHistory, setWorkoutHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exercisesList, setExercises] = useState([]);
    const router = useRouter();
    const { theme } = useTheme();
    const styles = getStyles(theme);

    const scrollRef = useRef(null);
    const calendarActionSheetRef = useRef(null);
    useScrollToTop(scrollRef);

    const handleDatePress = (date) => {
        const sessionToOpen = workoutHistory.find(([_, exercises]) => {
            const dateStr = new Date(exercises[0].time).toISOString().split('T')[0];
            return dateStr === date.dateString;
        });

        if (sessionToOpen) {
            calendarActionSheetRef.current?.hide();
            setTimeout(() => {
                router.push(`/workout/${sessionToOpen[0]}`);
            }, 300);
        }
    };

    const loadWorkoutHistory = async () => {
        try {
            const history = await fetchWorkoutHistory();
            const groupedHistory = groupBySession(history);
            setWorkoutHistory(groupedHistory);
        } catch (error) {
            console.error("Error loading workout history:", error);
        } finally {
            setLoading(false);
        }
    };

    // Pre-load data on component mount (works with lazy: false to load in background)
    useEffect(() => {
        fetchExercises()
            .then(data => setExercises(data))
            .catch(err => console.error(err));
        loadWorkoutHistory();
    }, []);

    useFocusEffect(
        React.useCallback(() => {
            fetchExercises()
                .then(data => setExercises(data))
                .catch(err => console.error(err));
            loadWorkoutHistory();
        }, [])
    );

    const markedDates = useMemo(() => {
        const marked = {};
        workoutHistory.forEach(([_, exercises]) => {
            try {
                const dateStr = new Date(exercises[0].time).toISOString().split('T')[0];
                marked[dateStr] = {
                    marked: true,
                    dotColor: theme.primary,
                    customStyles: {
                        container: { backgroundColor: `${theme.primary}20`, borderRadius: 8 },
                        text: { color: theme.primary, fontWeight: 'bold' },
                    },
                };
            } catch (e) { }
        });
        return marked;
    }, [workoutHistory, theme.primary]);

    if (loading) {
        // Return blank view instead of ActivityIndicator so it loads silently in background
        return (
            <View style={[styles.container, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]} />
        );
    }

    return (
        <View style={[styles.container, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
            <View style={styles.header}>
                <Text style={styles.title}>Workout History</Text>
                <TouchableOpacity
                    style={styles.calendarButton}
                    onPress={() => calendarActionSheetRef.current?.show()}
                >
                    <Feather name="calendar" size={24} color={theme.text} />
                </TouchableOpacity>
            </View>
            <FlatList
                ref={scrollRef}
                data={workoutHistory}
                style={styles.list}
                contentContainerStyle={styles.listContentContainer}
                keyExtractor={([session]) => session}
                renderItem={({ item: [session, exercises] }) => (
                    <HistoryCard
                        session={session}
                        exercises={exercises}
                        exercisesList={exercisesList}
                        theme={theme}
                        styles={styles}
                        formatDate={formatDate}
                        formatDuration={formatDuration}
                        router={router}
                    />
                )}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <View style={styles.emptyIconContainer}>
                            <MaterialCommunityIcons name="clipboard-text-outline" size={48} color={theme.primary} />
                        </View>
                        <Text style={styles.emptyTitle}>No Workouts Found</Text>
                        <Text style={styles.emptySubtitle}>
                            Finish a workout and your history will appear here.
                        </Text>
                    </View>
                }
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={10}
                removeClippedSubviews={true}
            />

            <ActionSheet
                ref={calendarActionSheetRef}
                containerStyle={styles.actionSheetContainer}
                indicatorStyle={styles.indicator}
                gestureEnabled={true}
            >
                <View style={styles.calendarContainer}>
                    <Calendar
                        theme={{
                            backgroundColor: theme.surface,
                            calendarBackground: theme.surface,
                            textSectionTitleColor: theme.textSecondary,
                            selectedDayBackgroundColor: theme.primary,
                            selectedDayTextColor: theme.surface,
                            todayTextColor: theme.primary,
                            dayTextColor: theme.text,
                            textDisabledColor: `${theme.text}40`,
                            dotColor: theme.primary,
                            selectedDotColor: theme.surface,
                            arrowColor: theme.primary,
                            disabledArrowColor: `${theme.text}20`,
                            monthTextColor: theme.text,
                            indicatorColor: theme.primary,
                            textDayFontFamily: FONTS.medium,
                            textMonthFontFamily: FONTS.bold,
                            textDayHeaderFontFamily: FONTS.semiBold,
                            textDayFontSize: 14,
                            textMonthFontSize: 18,
                            textDayHeaderFontSize: 12
                        }}
                        markedDates={markedDates}
                        onDayPress={handleDatePress}
                        markingType={'custom'}
                    />
                </View>
            </ActionSheet>
        </View>
    );
};

const getStyles = (theme) => StyleSheet.create({
    badgeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    prSummaryBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: `${lightenColor(theme.primary, 20)}40`, // 25% opacity
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 4,
        borderWidth: 1,
        borderColor: `${lightenColor(theme.primary, 20)}66`, // 40% opacity
    },
    prSummaryText: {
        fontSize: 12,
        fontFamily: FONTS.bold,
        color: lightenColor(theme.primary, 20),
    },
    container: {
        flex: 1,
        backgroundColor: theme.background,
    },
    title: {
        fontSize: 28,
        fontFamily: FONTS.bold,
        color: theme.text,

    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingHorizontal: 16,
        paddingTop: 20,
        paddingBottom: 10,
    },
    calendarButton: {
        padding: 10,
        backgroundColor: theme.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.border,
        ...SHADOWS.small,
    },
    list: {
        flex: 1,
        width: '100%',
    },
    listContentContainer: {
        paddingBottom: 100,
        paddingHorizontal: 16,
    },
    cardContainer: {
        marginBottom: 16,
        borderRadius: 16,
        backgroundColor: theme.surface,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: theme.border,
        ...SHADOWS.small,
    },

    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    workoutName: {
        fontSize: 18,
        fontFamily: FONTS.bold,
        color: theme.text,
        marginBottom: 6,
    },
    metaContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    metaItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    metaText: {
        fontSize: 12,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
    },
    metaDivider: {
        width: 1,
        height: 12,
        backgroundColor: theme.border,
    },
    sessionBadge: {
        backgroundColor: theme.overlayBorder,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    sessionBadgeText: {
        fontSize: 12,
        fontFamily: FONTS.bold,
        color: theme.textSecondary,
    },
    divider: {
        height: 1,
        backgroundColor: theme.border,
        marginBottom: 12,
        opacity: 0.5,
    },

    summaryText: {
        fontSize: 14,
        fontFamily: FONTS.regular,
        color: theme.textSecondary,
    },
    summaryCount: {
        color: theme.primary,
        fontFamily: FONTS.semiBold,
    },
    moreText: {
        fontSize: 12,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
        marginTop: 4,
        fontStyle: 'italic',
    },
    actionSheetContainer: {
        backgroundColor: theme.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingBottom: 40,
    },
    indicator: {
        backgroundColor: theme.textSecondary,
        width: 40,
    },
    calendarContainer: {
        padding: 10,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
        paddingTop: 100,
    },
    emptyIconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: `${theme.primary}15`,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    emptyTitle: {
        fontSize: 20,
        fontFamily: FONTS.bold,
        color: theme.text,
        marginBottom: 8,
        textAlign: 'center',
    },
    emptySubtitle: {
        fontSize: 16,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
        textAlign: 'center',
        lineHeight: 24,
    },
    cardContent: {
        padding: 16,
        borderRadius: 12,
        position: 'relative', // Ensures absolute children stay within the card
        minHeight: 140,      // Adjust based on your design
    },
    footerContainer: {
        flexDirection: 'row',
        justifyContent: 'flex-end', // Pushes the button to the right
        alignItems: 'center',
        marginTop: 10,              // Space between list and button
    },
    summaryContainer: {
        position: 'relative', // Context for the absolute button
        marginTop: 12,
    },
    summaryList: {
        paddingRight: 80, // Add padding so text doesn't overlap the button
        gap: 4,

    },
    repeatButtonFloating: {
        position: 'absolute',
        right: 0,
        bottom: 0, // Pins it to the same line as the last piece of text
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: `${theme.primary}20`,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
    },
    templateButtonText: {
        marginLeft: 6,
        fontWeight: '600',
        fontSize: 12,
        color: theme.primary,
    },
    footerContainer: {
        position: 'absolute',
        right: 12,
        bottom: 12,
        flexDirection: 'row',
        gap: 8,
    },

    repeatButtonFloating: {
        padding: 8,
        borderRadius: 10,
        backgroundColor: `${theme.primary}15`,
    },

    templateSaveButtonFloating: {
        padding: 8,
        borderRadius: 10,
        backgroundColor: `${theme.secondary}15`,
    },
});

export default History;