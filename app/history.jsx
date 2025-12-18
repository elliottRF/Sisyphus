import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native'
import React, { useState, useEffect, useRef } from 'react';
import { useScrollToTop } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchWorkoutHistory, fetchExercises } from '../components/db';
import { useFocusEffect, useRouter } from 'expo-router';
// import { COLORS, FONTS, SHADOWS } from '../constants/theme'; // Removed static
import { FONTS, SHADOWS } from '../constants/theme';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

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

const History = () => {
    const [workoutHistory, setWorkoutHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exercisesList, setExercises] = useState([]);
    const router = useRouter();
    const { theme } = useTheme(); // Use Theme Hook
    const styles = getStyles(theme);

    const scrollRef = useRef(null);
    useScrollToTop(scrollRef);

    useFocusEffect(
        React.useCallback(() => {
            fetchExercises()
                .then(data => setExercises(data))
                .catch(err => console.error(err));
            loadWorkoutHistory();
        }, [])
    );

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
        if (hrs > 0) return `${hrs}h ${mins}m`;
        return `${mins}m`;
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
                <ActivityIndicator size="large" color={theme.primary} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
            <Text style={styles.title}>Workout History</Text>
            <FlatList
                ref={scrollRef}
                data={workoutHistory}
                style={styles.list}
                contentContainerStyle={styles.listContentContainer}
                keyExtractor={([session]) => session}
                renderItem={({ item: [session, exercises] }) => {
                    const groupedExercises = groupExercisesByName(exercises);
                    const duration = exercises[0].duration;

                    const totalPRs = exercises.reduce((acc, ex) => {
                        return acc + (ex.is1rmPR || 0) + (ex.isVolumePR || 0) + (ex.isWeightPR || 0);
                    }, 0);

                    return (
                        <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => router.push(`/workout/${session}`)}
                            style={styles.cardContainer}
                        >
                            <View
                                style={[styles.cardContent, { backgroundColor: theme.surface }]}
                            >
                                <View style={styles.cardHeader}>
                                    <View>
                                        <Text style={styles.workoutName}>{exercises[0].name}</Text>
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
                                                {/* FIXED: Using Theme Color for PRs */}
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
                                        const exerciseName = exercisesList.find(e => e.exerciseID === group[0].exerciseID)?.name || 'Unknown Exercise';
                                        const workingSets = group.filter(set => set.setType !== 'W');
                                        const count = workingSets.length;
                                        // Only show if count > 0? No, show even if just warmups maybe? No, user wants working set counts.

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
                            </View>
                        </TouchableOpacity>
                    );
                }}
            />
        </SafeAreaView>
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
        padding: 20,
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
        backgroundColor: 'rgba(255,255,255,0.05)',
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
});

export default History;