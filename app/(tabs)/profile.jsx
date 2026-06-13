import { View, Text, ScrollView, StyleSheet, TextInput, Keyboard, FlatList, TouchableOpacity } from 'react-native'
import Animated, { LinearTransition, FadeIn } from 'react-native-reanimated';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useScrollToTop } from '@react-navigation/native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchExercises, fetchExerciseWorkoutCounts, fetchExerciseStats, getPinnedExercises, pinExercise, unpinExercise, getLatestWorkoutSession, fetchWorkoutHistoryBySession } from '../../components/db';
import ActionSheet from "react-native-actions-sheet";
import * as Haptics from 'expo-haptics';

import NewExercise from "../../components/NewExercise"

import Feather from '@expo/vector-icons/Feather';
import { FONTS, RADIUS } from '../../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '../../context/ThemeContext';
import { useRouter } from 'expo-router';
import ContextMenu from '../../components/ContextMenu';
import { muscleMapping } from '../../constants/muscles';
import { formatWeight, unitLabel } from '../../utils/units';
import { AppEvents, on, off } from '../../utils/events';
import Fuse from 'fuse.js';

// ─── Muscle group filter chips ────────────────────────────────────────────────
const MUSCLE_GROUPS = [
    { label: 'All' },
    { label: 'Chest', slugs: ['chest'] },
    { label: 'Back', slugs: ['upper-back', 'lower-back', 'trapezius'] },
    { label: 'Shoulders', slugs: ['deltoids'] },
    { label: 'Arms', slugs: ['biceps', 'triceps', 'forearm'] },
    { label: 'Legs', slugs: ['quadriceps', 'hamstring', 'gluteal', 'calves', 'adductors', 'abductors', 'tibialis'] },
    { label: 'Core', slugs: ['abs', 'obliques'] },
    { label: 'Cardio', cardio: true },
];

const exerciseSlugs = (exercise) =>
    (exercise.targetMuscle || '')
        .split(',')
        .map(m => m.trim())
        .filter(Boolean)
        .map(m => muscleMapping[m] || m.toLowerCase());

const matchesGroup = (exercise, group) => {
    if (!group || group.label === 'All') return true;
    if (group.cardio) return !!exercise.isCardio;
    const slugs = exerciseSlugs(exercise);
    return slugs.some(s => group.slugs.includes(s));
};

const groupLabelFor = (exercise) => {
    if (exercise.isCardio) return 'Cardio';
    const slugs = exerciseSlugs(exercise);
    const match = MUSCLE_GROUPS.find(g => g.slugs && slugs.some(s => g.slugs.includes(s)));
    return match?.label || null;
};

const relativeTime = (timeString) => {
    if (!timeString) return null;
    const d = new Date(timeString);
    if (isNaN(d.getTime())) return null;
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
};

const Profile = () => {
    const insets = useSafeAreaInsets();
    const { theme, useImperial } = useTheme();
    const styles = getStyles(theme);

    const scrollRef = useRef(null);
    useScrollToTop(scrollRef);
    const [searchQuery, setSearchQuery] = useState('');
    const [exercises, setExercises] = useState([]);
    const [workoutCounts, setWorkoutCounts] = useState(new Map());
    const [exerciseStats, setExerciseStats] = useState(new Map());
    const [pinnedIds, setPinnedIds] = useState(new Set());
    const [activeGroup, setActiveGroup] = useState('All');
    const [contextMenu, setContextMenu] = useState(null); // {x, y, exercise}
    const [lastSessionIDs, setLastSessionIDs] = useState([]);
    const [extraRecents, setExtraRecents] = useState(0);

    // New ref for create exercise action sheet
    const createExerciseActionSheetRef = useRef(null);
    const router = useRouter();

    const isNavigatingForward = useRef(false);

    const loadData = () => {
        const fetchLastSessionIDs = async () => {
            const latest = await getLatestWorkoutSession();
            if (!latest) return [];
            const rows = await fetchWorkoutHistoryBySession(latest);
            const ids = [];
            const seen = new Set();
            (rows || []).forEach(row => {
                if (!seen.has(row.exerciseID)) {
                    seen.add(row.exerciseID);
                    ids.push(row.exerciseID);
                }
            });
            return ids;
        };

        Promise.all([fetchExercises(), fetchExerciseWorkoutCounts(), fetchExerciseStats(), getPinnedExercises(), fetchLastSessionIDs()])
            .then(([data, counts, stats, pinned, sessionIDs]) => {
                setExercises(data);
                setWorkoutCounts(counts);
                setExerciseStats(stats);
                setPinnedIds(new Set(pinned.map(p => p.exerciseID)));
                setLastSessionIDs(sessionIDs);
            })
            .catch(err => console.error(err));
    };

    useEffect(() => {
        loadData();

        // Refresh in the background when a workout finishes, so the Recents
        // list is already correct when this tab is next focused (no stale
        // list flashing to the new one).
        const handler = () => loadData();
        on(AppEvents.WORKOUT_COMPLETED, handler);
        on(AppEvents.WORKOUT_DATA_IMPORTED, handler);
        return () => {
            off(AppEvents.WORKOUT_COMPLETED, handler);
            off(AppEvents.WORKOUT_DATA_IMPORTED, handler);
        };
    }, []);

    useFocusEffect(
        React.useCallback(() => {
            loadData();

            return () => {
                // Dismiss the hold-menu on blur — its transparent Modal would
                // otherwise persist over other screens and block their touches.
                setContextMenu(null);
                if (!isNavigatingForward.current) {
                    setSearchQuery('');
                    setExtraRecents(0);
                }
                isNavigatingForward.current = false;
            };
        }, [])
    );

    const openCreateExerciseSheet = () => {
        isNavigatingForward.current = true;
        router.push('/exercise/new');
    };

    const handleCloseCreateExerciseSheet = () => {
        createExerciseActionSheetRef.current?.hide();
        loadData();
    };

    const fuse = useMemo(() => {
        return new Fuse(exercises, {
            keys: ['name'],
            threshold: 0.35,
            includeScore: true,
            ignoreLocation: true,
            minMatchCharLength: 2,
        });
    }, [exercises]);

    const sortedAndFilteredExercises = useMemo(() => {
        const group = MUSCLE_GROUPS.find(g => g.label === activeGroup);
        const inGroup = (ex) => matchesGroup(ex, group);

        if (!searchQuery.trim()) {
            return exercises
                .filter(inGroup)
                .sort((a, b) =>
                    (workoutCounts.get(b.exerciseID) ?? 0) - (workoutCounts.get(a.exerciseID) ?? 0)
                );
        }

        const searchResults = fuse.search(searchQuery);

        return searchResults
            .filter(r => inGroup(r.item))
            .sort((a, b) => {
                // A significantly better fuzzy match wins; otherwise usage breaks ties.
                if (Math.abs(a.score - b.score) > 0.2) {
                    return a.score - b.score;
                }
                const countA = workoutCounts.get(a.item.exerciseID) ?? 0;
                const countB = workoutCounts.get(b.item.exerciseID) ?? 0;
                return countB - countA;
            })
            .map(r => r.item);
    }, [searchQuery, exercises, workoutCounts, fuse, activeGroup]);

    // Recents: the last session's exercises (in session order) first, then
    // everything else by most recently trained.
    const recentExercises = useMemo(() => {
        const byId = new Map(exercises.map(e => [e.exerciseID, e]));
        const head = lastSessionIDs.map(id => byId.get(id)).filter(Boolean);
        const headSet = new Set(lastSessionIDs);
        const rest = exercises
            .filter(ex => !headSet.has(ex.exerciseID) && exerciseStats.get(ex.exerciseID)?.lastTime)
            .sort((a, b) =>
                new Date(exerciseStats.get(b.exerciseID).lastTime) - new Date(exerciseStats.get(a.exerciseID).lastTime)
            );
        return [...head, ...rest];
    }, [exercises, exerciseStats, lastSessionIDs]);

    // Show the whole last session by default; "Show more" extends past it.
    const visibleRecentsCount = (lastSessionIDs.length > 0 ? lastSessionIDs.length : 5) + extraRecents;

    // Recents only make sense on the unfiltered view.
    const showRecents = !searchQuery.trim() && activeGroup === 'All' && recentExercises.length > 0;

    // No pre-fetching: the exercise page paints instantly from the snapshot
    // cache and revalidates itself in the background.
    const showExerciseInfo = (item) => {
        isNavigatingForward.current = true;
        router.push(`/exercise/${item.exerciseID}?name=${encodeURIComponent(item.name)}`);
    };

    // ── Hold menu ────────────────────────────────────────────────────────────
    const handleLongPressRow = (e, exercise) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setContextMenu({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, exercise });
    };

    const contextMenuItems = useMemo(() => {
        if (!contextMenu) return [];
        const { exercise } = contextMenu;
        const isPinned = pinnedIds.has(exercise.exerciseID);
        return [
            {
                icon: 'trending-up',
                label: 'View Progress',
                tint: true,
                onPress: () => showExerciseInfo(exercise),
            },
            {
                icon: isPinned ? 'bookmark' : 'home',
                label: isPinned ? 'Unpin from Home' : 'Pin to Home',
                onPress: async () => {
                    try {
                        if (isPinned) {
                            await unpinExercise(exercise.exerciseID);
                        } else {
                            await pinExercise(exercise.exerciseID);
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        }
                        const pinned = await getPinnedExercises();
                        setPinnedIds(new Set(pinned.map(p => p.exerciseID)));
                    } catch (err) {
                        console.error("Error toggling pin:", err);
                    }
                },
            },
            {
                icon: 'edit-2',
                label: 'Edit Exercise',
                onPress: () => {
                    isNavigatingForward.current = true;
                    router.push(`/exercise/new?id=${exercise.exerciseID}`);
                },
            },
        ];
    }, [contextMenu, pinnedIds]);

    const renderExerciseRow = (item) => {
        const stats = exerciseStats.get(item.exerciseID);
        const hasMuscles = (item.targetMuscle && item.targetMuscle.trim() !== '') ||
            (item.accessoryMuscles && item.accessoryMuscles.trim() !== '');

        // Subtitle: group · recency — usage counts live in the section
        // ordering instead of cluttering every row.
        const subtitleParts = [];
        const groupLabel = groupLabelFor(item);
        if (groupLabel) subtitleParts.push(groupLabel);
        const recency = relativeTime(stats?.lastTime);
        subtitleParts.push(recency ? `trained ${recency}` : 'not trained yet');

        // Right side: best working-set weight (lowest for assisted).
        const prKg = item.isCardio ? null : (item.isAssisted ? stats?.minWeight : stats?.maxWeight);
        const isPinned = pinnedIds.has(item.exerciseID);

        return (
            <TouchableOpacity
                style={styles.exerciseCard}
                onPress={() => showExerciseInfo(item)}
                onLongPress={(e) => handleLongPressRow(e, item)}
                delayLongPress={350}
                activeOpacity={0.7}
            >
                <View style={styles.exerciseContent}>
                    <View style={styles.exerciseLeft}>
                        <View style={styles.exerciseNameRow}>
                            <Text style={styles.exerciseName} numberOfLines={1} ellipsizeMode="tail">
                                {item.name}
                            </Text>
                            {isPinned && (
                                <Feather name="bookmark" size={12} color={theme.primary} style={styles.pinnedIcon} />
                            )}
                        </View>
                        <Text style={styles.exerciseSubtitle} numberOfLines={1}>
                            {subtitleParts.join(' · ')}
                        </Text>
                    </View>
                    <View style={styles.exerciseRight}>
                        {!hasMuscles && !item.isCardio && (
                            <TouchableOpacity
                                onPress={() => {
                                    isNavigatingForward.current = true;
                                    router.push(`/exercise/new?id=${item.exerciseID}`);
                                }}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                                <Feather name="help-circle" size={18} color={theme.textSecondary} />
                            </TouchableOpacity>
                        )}
                        {prKg != null && (
                            <View style={styles.prBlock}>
                                <Text style={styles.prValue}>
                                    {formatWeight(prKg, useImperial, 1)} {unitLabel(useImperial)}
                                </Text>
                                <Text style={styles.prLabel}>BEST</Text>
                            </View>
                        )}
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    // Safe Colors for Reanimated / Linear Gradient fallbacks
    const isDynamic = theme.type === 'dynamic';
    const safeBackground = isDynamic ? '#121212' : theme.background;

    // Helper for Button Gradient
    const ButtonBackground = ({ children, style }) => {
        if (isDynamic) {
            return (
                <View style={[style, { backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }]}>
                    {children}
                </View>
            );
        }
        return (
            <LinearGradient
                colors={[theme.primary, theme.secondary]}
                style={style}
            >
                {children}
            </LinearGradient>
        );
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.eyebrow}>
                        {exercises.length > 0 ? `${exercises.length} IN YOUR LIBRARY` : 'EXERCISE LIBRARY'}
                    </Text>
                    <Text style={styles.title}>Exercises</Text>
                </View>
            </View>

            <View style={styles.searchContainer}>
                <View style={styles.searchBar}>
                    <Feather name="search" size={20} color={theme.textSecondary} style={styles.searchIcon} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search exercises..."
                        placeholderTextColor={theme.textSecondary}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        returnKeyType="done"
                        onSubmitEditing={Keyboard.dismiss}

                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity
                            onPress={() => setSearchQuery('')}
                            style={styles.clearButton}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <Feather name="x" size={20} color={theme.textSecondary} />
                        </TouchableOpacity>
                    )}
                </View>
                <TouchableOpacity
                    style={styles.addButton}
                    onPress={openCreateExerciseSheet}
                >
                    <ButtonBackground style={styles.addButtonGradient}>
                        <Feather name="plus" size={24} color={theme.textAlternate} />
                    </ButtonBackground>
                </TouchableOpacity>
            </View>

            {/* Muscle group chips */}
            <View>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipRow}
                    keyboardShouldPersistTaps="always"
                >
                    {MUSCLE_GROUPS.map(group => {
                        const isActive = activeGroup === group.label;
                        return (
                            <TouchableOpacity
                                key={group.label}
                                style={[styles.chip, isActive && styles.chipActive]}
                                onPress={() => {
                                    Haptics.selectionAsync();
                                    setActiveGroup(group.label);
                                }}
                                activeOpacity={0.7}
                            >
                                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                                    {group.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            <FlatList
                ref={scrollRef}
                data={sortedAndFilteredExercises}
                keyExtractor={(item) => item.exerciseID.toString()}
                renderItem={({ item }) => renderExerciseRow(item)}
                keyboardShouldPersistTaps="always"
                contentContainerStyle={styles.list}
                showsVerticalScrollIndicator={false}
                keyboardDismissMode="on-drag"
                ListHeaderComponent={
                    !searchQuery.trim() ? (
                        <View>
                            {showRecents && (
                                <>
                                    <Text style={styles.listSectionLabel}>Recent</Text>
                                    {recentExercises.slice(0, visibleRecentsCount).map(item => (
                                        <Animated.View
                                            key={`recent-${item.exerciseID}`}
                                            layout={LinearTransition.duration(300)}
                                            entering={FadeIn.duration(250)}
                                        >
                                            {renderExerciseRow(item)}
                                        </Animated.View>
                                    ))}
                                    {visibleRecentsCount < recentExercises.length && (
                                        <TouchableOpacity
                                            style={styles.showMoreButton}
                                            onPress={() => setExtraRecents(v => v + 5)}
                                            activeOpacity={0.6}
                                        >
                                            <Feather name="chevron-down" size={15} color={theme.primary} />
                                            <Text style={styles.showMoreText}>Show more</Text>
                                        </TouchableOpacity>
                                    )}
                                </>
                            )}
                            <Text style={[styles.listSectionLabel, showRecents && { marginTop: 18 }]}>
                                Most Used
                            </Text>
                        </View>
                    ) : null
                }
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyStateText}>
                            {exercises.length === 0 ? 'Loading exercises...' : 'No exercises match'}
                        </Text>
                    </View>
                }
            />

            {contextMenu && (
                <ContextMenu
                    anchor={contextMenu}
                    items={contextMenuItems}
                    onClose={() => setContextMenu(null)}
                />
            )}

            {/* New Create Exercise ActionSheet */}
            <ActionSheet
                ref={createExerciseActionSheetRef}
                containerStyle={[styles.actionSheetContainer, { backgroundColor: safeBackground }]}
            >
                <View style={styles.closeIconContainerUpperPosition}>
                    <TouchableOpacity onPress={handleCloseCreateExerciseSheet} style={styles.closeIcon}>
                        <Feather name="x" size={24} color="#fff" />
                    </TouchableOpacity>
                </View>

                <NewExercise close={handleCloseCreateExerciseSheet} />
            </ActionSheet>
        </View>
    )
}

const getStyles = (theme) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.background,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 12,
    },
    eyebrow: {
        fontSize: 12,
        fontFamily: FONTS.semiBold,
        color: theme.textSecondary,
        letterSpacing: 1.1,
        marginBottom: 2,
    },
    title: {
        fontSize: 32,
        fontFamily: FONTS.bold,
        letterSpacing: -0.6,
        color: theme.text,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        marginBottom: 10,
    },
    searchBar: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.overlayInput,
        borderRadius: RADIUS.m,
        paddingHorizontal: 12,
        height: 42,
        marginRight: 10,
    },
    searchIcon: {
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        color: theme.text,
        fontFamily: FONTS.regular,
        fontSize: 16,
        height: '100%',
    },
    clearButton: {
        padding: 4,
        marginLeft: 8,
    },
    addButton: {
        borderRadius: RADIUS.m,
        overflow: 'hidden',
    },
    addButtonGradient: {
        width: 42,
        height: 42,
        borderRadius: RADIUS.m,
        justifyContent: 'center',
        alignItems: 'center',
    },

    // ── Chips ─────────────────────────────────────────────────────────────────
    chipRow: {
        paddingHorizontal: 16,
        paddingBottom: 12,
        gap: 7,
    },
    chip: {
        paddingHorizontal: 13,
        height: 31,
        borderRadius: RADIUS.pill,
        backgroundColor: theme.overlayInput,
        alignItems: 'center',
        justifyContent: 'center',
    },
    chipActive: {
        backgroundColor: theme.primary,
    },
    chipText: {
        fontSize: 13,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
    },
    chipTextActive: {
        color: theme.textAlternate,
        fontFamily: FONTS.semiBold,
    },

    // ── Rows ──────────────────────────────────────────────────────────────────
    list: {
        paddingHorizontal: 16,
        paddingBottom: 100,
    },
    listSectionLabel: {
        fontSize: 12,
        fontFamily: FONTS.semiBold,
        color: theme.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 8,
        marginLeft: 4,
    },
    showMoreButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        paddingVertical: 9,
        marginBottom: 2,
    },
    showMoreText: {
        fontSize: 13,
        fontFamily: FONTS.semiBold,
        color: theme.primary,
    },
    exerciseCard: {
        backgroundColor: theme.surface,
        borderRadius: RADIUS.m,
        marginBottom: 8,
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    exerciseContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    exerciseLeft: {
        flex: 1,
        marginRight: 10,
    },
    exerciseNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    exerciseName: {
        color: theme.text,
        fontSize: 16,
        fontFamily: FONTS.semiBold,
        flexShrink: 1,
    },
    pinnedIcon: {
        marginLeft: 6,
    },
    exerciseSubtitle: {
        color: theme.textSecondary,
        fontSize: 12.5,
        fontFamily: FONTS.regular,
        marginTop: 2,
    },
    exerciseRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
    },
    prBlock: {
        alignItems: 'flex-end',
        minWidth: 56,
    },
    prValue: {
        color: theme.text,
        fontFamily: FONTS.bold,
        fontSize: 15,
        letterSpacing: -0.2,
    },
    prLabel: {
        color: theme.textSecondary,
        fontFamily: FONTS.semiBold,
        fontSize: 9,
        letterSpacing: 0.8,
        marginTop: 1,
    },
    emptyState: {
        paddingTop: 60,
        alignItems: 'center',
    },
    emptyStateText: {
        color: theme.textSecondary,
        fontFamily: FONTS.medium,
        fontSize: 14,
    },

    actionSheetContainer: {
        height: '100%',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
    },
    closeIconContainerUpperPosition: {
        position: 'absolute',
        top: 16,
        right: 16,
        zIndex: 1,
    },
    closeIcon: {
        backgroundColor: theme.surface,
        padding: 8,
        borderRadius: 20,
    },
});

export default Profile
