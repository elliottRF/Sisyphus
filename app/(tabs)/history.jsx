import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, Animated } from 'react-native'
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useScrollToTop } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchWorkoutHistory, fetchExercises, fetchWorkoutHistoryBySession } from '../../components/db';
import { useFocusEffect, useRouter } from 'expo-router';
import { Calendar } from 'react-native-calendars';
import ActionSheet from "react-native-actions-sheet";
import { FONTS, SHADOWS } from '../../constants/theme';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

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

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

const HistoryCard = React.memo(({ session, exercises, exercisesList, theme, styles, formatDate, formatDuration, router }) => {
    const groupedExercises = groupExercisesByName(exercises);
    const duration = exercises[0].duration;
    const [isLoading, setIsLoading] = useState(false);

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

    const totalPRs = exercises.reduce((acc, ex) => {
        return acc + (ex.is1rmPR || 0) + (ex.isVolumePR || 0) + (ex.isWeightPR || 0);
    }, 0);

    const handlePress = async () => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            const sessionData = await fetchWorkoutHistoryBySession(session);
            router.push({
                pathname: `/workout/${session}`,
                params: { initialData: JSON.stringify(sessionData) }
            });
        } catch (error) {
            console.error("Error pre-fetching workout:", error);
            router.push(`/workout/${session}`);
        } finally {
            setIsLoading(false);
            // Ensure card scales back up when Returning to the page even if interaction was interrupted
            Animated.spring(scaleAnim, {
                toValue: 1,
                useNativeDriver: true,
                speed: 20,
                bounciness: 4,
            }).start();
        }
    };

    return (
        <AnimatedTouchableOpacity
            activeOpacity={0.8}
            onPress={handlePress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            style={[styles.cardContainer, { transform: [{ scale: scaleAnim }] }]}
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

                <View style={styles.summaryList}>
                    {groupedExercises.slice(0, 4).map((group, idx) => {
                        const exerciseObjFromList = exercisesList.find(e => e.exerciseID === group[0].exerciseID);
                        const exerciseName = exerciseObjFromList?.name || 'Unknown Exercise';
                        const workingSets = group.filter(set => set.setType !== 'W');
                        const count = workingSets.length;

                        const hasMuscles = exerciseObjFromList && (
                            (exerciseObjFromList.targetMuscle && exerciseObjFromList.targetMuscle.trim() !== '') ||
                            (exerciseObjFromList.accessoryMuscles && exerciseObjFromList.accessoryMuscles.trim() !== '')
                        );

                        return (
                            <View key={idx} style={styles.summaryRow}>
                                <Text style={[styles.summaryText, { flexShrink: 1 }]} numberOfLines={1}>
                                    <Text style={styles.summaryCount}>{count} x</Text> {exerciseName}
                                </Text>
                                {!hasMuscles && exerciseObjFromList && !exerciseObjFromList.isCardio && (
                                    <TouchableOpacity
                                        onPress={() => router.push(`/exercise/new?id=${group[0].exerciseID}`)}
                                        style={styles.missingMuscleIcon}
                                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    >
                                        <Feather name="help-circle" size={14} color={theme.textSecondary} />
                                    </TouchableOpacity>
                                )}
                            </View>
                        );
                    })}
                    {groupedExercises.length > 4 && (
                        <Text style={styles.moreText}>+ {groupedExercises.length - 4} more exercises</Text>
                    )}
                </View>
            </View>
        </AnimatedTouchableOpacity>
    );
});


const History = () => {
    const insets = useSafeAreaInsets();
    const [workoutHistory, setWorkoutHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exercisesList, setExercises] = useState([]);
    const router = useRouter();
    const { theme } = useTheme();




    const isDynamic = theme.type === 'dynamic';

    // Only used for ActionSheet/Calendar — PlatformColor crashes there
    const safePrimary = isDynamic ? '#2DC4B6' : theme.primary;
    const safeSurface = isDynamic ? '#1e1e1e' : theme.surface;
    const safeText = isDynamic ? '#FFFFFF' : theme.text;
    const safeTextSecondary = isDynamic ? '#9E9E9E' : theme.textSecondary;
    const safeBorder = isDynamic ? 'rgba(255,255,255,0.1)' : theme.border;
    const safePrimaryFaint = isDynamic ? 'rgba(45, 196, 182, 0.12)' : `${theme.primary}20`;







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
                    dotColor: safePrimary,
                    customStyles: {
                        container: { backgroundColor: safePrimaryFaint, borderRadius: 8 },
                        text: { color: safePrimary, fontWeight: 'bold' },
                    },
                };
            } catch (e) { }
        });
        return marked;
    }, [workoutHistory, safePrimary, safePrimaryFaint]);

    if (loading) {
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
                containerStyle={{ ...styles.actionSheetContainer, backgroundColor: safeSurface }}
                indicatorStyle={{ ...styles.indicator, backgroundColor: safeTextSecondary }}
                gestureEnabled={true}
            >
                <View style={[styles.calendarContainer, { backgroundColor: safeSurface }]}>
                    <Calendar
                        theme={{
                            backgroundColor: safeSurface,
                            calendarBackground: safeSurface,
                            textSectionTitleColor: safeTextSecondary,
                            selectedDayBackgroundColor: safePrimary,
                            selectedDayTextColor: safeSurface,
                            todayTextColor: safePrimary,
                            dayTextColor: safeText,
                            textDisabledColor: `${safeText}40`,
                            dotColor: safePrimary,
                            selectedDotColor: safeSurface,
                            arrowColor: safePrimary,
                            disabledArrowColor: `${safeText}20`,
                            monthTextColor: safeText,
                            indicatorColor: safePrimary,
                            textDayFontFamily: FONTS.medium,
                            textMonthFontFamily: FONTS.bold,
                            textDayHeaderFontFamily: FONTS.semiBold,
                            textDayFontSize: 14,
                            textMonthFontSize: 18,
                            textDayHeaderFontSize: 12,
                            scrollEnabled: false,
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
        backgroundColor: `${lightenColor(theme.primary, 20)}40`,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 4,
        borderWidth: 1,
        borderColor: `${lightenColor(theme.primary, 20)}66`,
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
    cardContent: {
        padding: 16,
        borderRadius: 12,
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
    summaryList: {
        gap: 4,
    },
    summaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    missingMuscleIcon: {
        marginLeft: 6,
        padding: 2,
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
        height: 380
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
});

export default History;