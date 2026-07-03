import { View, Text, StyleSheet, SectionList, TouchableOpacity, ActivityIndicator, Modal, Pressable, Dimensions, Animated as RNAnimated } from 'react-native'
import React, { useState, useEffect, useRef, useMemo } from 'react';
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated';
import { useScrollToTop } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchWorkoutHistory, fetchExercises, fetchWorkoutHistoryBySession, createTemplate, getCachedWorkoutHistory, getCachedExercises } from '../../components/db';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { FONTS, RADIUS, getThemedShadow, isLightTheme, withAlpha } from '../../constants/theme';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { customAlert } from '../../utils/customAlert';
import { kgToLbs, unitLabel } from '../../utils/units';
import { buildWorkoutDataFromSession } from '../../utils/workoutBuilders';
import { AppEvents, on, off } from '../../utils/events';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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

const sessionVolumeKg = (exercises) =>
    exercises.reduce((sum, set) => {
        if (set.setType === 'W') return sum;
        return sum + (parseFloat(set.weight) || 0) * (parseInt(set.reps, 10) || 0);
    }, 0);

const formatVolume = (kg, useImperial) => {
    const v = Math.round(useImperial ? kgToLbs(kg) : kg);
    return `${v.toLocaleString()} ${unitLabel(useImperial)}`;
};

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

// ─── Contribution graph ───────────────────────────────────────────────────────
// GitHub-style training heatmap: one cell per day, tinted by session volume.
// Always visible under the page header; tapping a trained day opens it.

const CELL = 11;
const CELL_GAP = 3;

const ContributionGraph = ({ workoutHistory, theme, styles, onOpenSession }) => {
    // 0 = the window ending today; each page steps back a full window.
    const [page, setPage] = useState(0);

    const { dayMap, maxVolume, earliestTime } = useMemo(() => {
        const map = new Map();
        let max = 0;
        let earliestTime = null;
        workoutHistory.forEach(([session, exercises]) => {
            const d = new Date(exercises[0].time);
            if (isNaN(d.getTime())) return;
            if (earliestTime === null || d.getTime() < earliestTime) earliestTime = d.getTime();
            const key = dayKey(d);
            const volume = sessionVolumeKg(exercises);
            const existing = map.get(key);
            if (existing) {
                existing.volume += volume;
            } else {
                map.set(key, { volume, session });
            }
            max = Math.max(max, map.get(key).volume);
        });
        return { dayMap: map, maxVolume: max, earliestTime };
    }, [workoutHistory]);

    const { columns, monthLabels, rangeLabel, canGoBack, canGoForward } = useMemo(() => {
        const available = SCREEN_WIDTH - 32 - 28; // list padding + card padding
        const weeks = Math.min(26, Math.max(8, Math.floor((available + CELL_GAP) / (CELL + CELL_GAP))));

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const mondayIndex = (today.getDay() + 6) % 7; // Mon = 0

        // Pages tile exactly on the Monday grid of the current window.
        const start = new Date(today);
        start.setDate(start.getDate() - ((weeks - 1) * 7 + mondayIndex) - page * weeks * 7);

        const columns = [];
        const monthLabels = [];
        let lastLabelMonth = -1;
        let lastLabelCol = -10;
        let lastVisibleDay = start;

        for (let col = 0; col < weeks; col++) {
            const days = [];
            for (let row = 0; row < 7; row++) {
                const d = new Date(start);
                d.setDate(start.getDate() + col * 7 + row);
                if (d > today) {
                    days.push(null);
                } else {
                    days.push(d);
                    lastVisibleDay = d;
                }
            }
            const firstDay = days[0];
            if (firstDay && firstDay.getMonth() !== lastLabelMonth && col - lastLabelCol >= 3) {
                monthLabels.push({
                    col,
                    label: firstDay.toLocaleDateString('en-US', { month: 'short' }),
                });
                lastLabelMonth = firstDay.getMonth();
                lastLabelCol = col;
            }
            columns.push(days);
        }

        const fmt = (d, withYear) => d.toLocaleDateString('en-US', withYear ? { month: 'short', year: 'numeric' } : { month: 'short' });
        const sameYear = start.getFullYear() === lastVisibleDay.getFullYear();
        const rangeLabel = `${fmt(start, !sameYear)} – ${fmt(lastVisibleDay, true)}`;

        return {
            columns,
            monthLabels,
            rangeLabel,
            canGoBack: earliestTime !== null && start.getTime() > earliestTime,
            canGoForward: page > 0,
        };
    }, [page, earliestTime]);

    const cellColor = (date) => {
        if (!date) return 'transparent';
        const entry = dayMap.get(dayKey(date));
        if (!entry || entry.volume <= 0) return theme.overlayInput;
        const ratio = maxVolume > 0 ? entry.volume / maxVolume : 1;
        if (ratio <= 0.25) return withAlpha(theme.primary, 0.30);
        if (ratio <= 0.5) return withAlpha(theme.primary, 0.55);
        if (ratio <= 0.75) return withAlpha(theme.primary, 0.80);
        return theme.primary;
    };

    return (
        <View style={styles.graphCard}>
            <View style={styles.graphHeader}>
                <Text style={styles.graphTitle}>Activity</Text>
                <View style={styles.graphNav}>
                    <Text style={styles.graphRangeText}>{rangeLabel}</Text>
                    <TouchableOpacity
                        onPress={() => canGoBack && setPage(p => p + 1)}
                        disabled={!canGoBack}
                        style={[styles.graphNavButton, !canGoBack && styles.graphNavButtonDisabled]}
                        hitSlop={6}
                    >
                        <Feather name="chevron-left" size={16} color={canGoBack ? theme.text : theme.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => canGoForward && setPage(p => p - 1)}
                        disabled={!canGoForward}
                        style={[styles.graphNavButton, !canGoForward && styles.graphNavButtonDisabled]}
                        hitSlop={6}
                    >
                        <Feather name="chevron-right" size={16} color={canGoForward ? theme.text : theme.textSecondary} />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.graphMonthRow}>
                {monthLabels.map(({ col, label }) => (
                    <Text
                        key={`${col}-${label}`}
                        style={[styles.graphMonthLabel, { left: col * (CELL + CELL_GAP) }]}
                    >
                        {label}
                    </Text>
                ))}
            </View>

            <View style={styles.graphGrid}>
                {columns.map((days, col) => (
                    <View key={col} style={styles.graphColumn}>
                        {days.map((date, row) => {
                            const entry = date ? dayMap.get(dayKey(date)) : null;
                            const cell = (
                                <View
                                    key={row}
                                    style={[styles.graphCell, { backgroundColor: cellColor(date) }]}
                                />
                            );
                            if (!entry) return cell;
                            return (
                                <Pressable
                                    key={row}
                                    onPress={() => onOpenSession(entry.session)}
                                    hitSlop={2}
                                >
                                    <View style={[styles.graphCell, { backgroundColor: cellColor(date) }]} />
                                </Pressable>
                            );
                        })}
                    </View>
                ))}
            </View>
        </View>
    );
};

// ─── Session card ─────────────────────────────────────────────────────────────

const AnimatedTouchableOpacity = RNAnimated.createAnimatedComponent(TouchableOpacity);

const HistoryCard = React.memo(({ session, exercises, exercisesList, theme, styles, router, useImperial, onShowMenu, exiting = false, onExitDone }) => {
    const groupedExercises = groupExercisesByName(exercises);
    const duration = exercises[0].duration;
    const [isLoading, setIsLoading] = useState(false);

    const scaleAnim = useRef(new RNAnimated.Value(1)).current;

    // New cards just appear (the list is primed from cache before navigation),
    // so there's no entrance animation — only the delete collapse below.

    // Exit: collapse this card's height + fade, then tell the parent to commit
    // the removal. Only the flagged (deleted) card animates — never the
    // scroll-recycled cells — so list performance is untouched.
    const exitProgress = useRef(new RNAnimated.Value(0)).current;
    const measuredHeightRef = useRef(0);
    const [collapsing, setCollapsing] = useState(false);

    useEffect(() => {
        if (!exiting) return;
        if (measuredHeightRef.current <= 0) {
            onExitDone?.(session);
            return;
        }
        setCollapsing(true);
        RNAnimated.timing(exitProgress, {
            toValue: 1,
            duration: 280,
            useNativeDriver: false, // animating height (a layout prop)
        }).start(({ finished }) => { if (finished) onExitDone?.(session); });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [exiting]);

    const handlePressIn = () => {
        RNAnimated.spring(scaleAnim, {
            toValue: 0.98,
            useNativeDriver: true,
            speed: 20,
            bounciness: 4,
        }).start();
    };

    const handlePressOut = () => {
        RNAnimated.spring(scaleAnim, {
            toValue: 1,
            useNativeDriver: true,
            speed: 20,
            bounciness: 4,
        }).start();
    };

    const totalPRs = exercises.reduce((acc, ex) => {
        return acc + (ex.is1rmPR || 0) + (ex.isVolumePR || 0) + (ex.isWeightPR || 0);
    }, 0);

    // Session stats
    const workingSets = exercises.filter(set => set.setType !== 'W');
    const volumeKg = sessionVolumeKg(exercises);

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
            // Ensure card scales back up when returning to the page even if interaction was interrupted
            RNAnimated.spring(scaleAnim, {
                toValue: 1,
                useNativeDriver: true,
                speed: 20,
                bounciness: 4,
            }).start();
        }
    };

    const handleLongPress = (e) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onShowMenu({
            x: e.nativeEvent.pageX,
            y: e.nativeEvent.pageY,
            session,
            exercises,
        });
        // Release the press-scale since the menu takes over.
        RNAnimated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
    };

    // Only the deleting card animates: collapse its height + fade via
    // exitProgress. Every other card renders statically.
    const wrapperStyle = collapsing
        ? {
            height: exitProgress.interpolate({ inputRange: [0, 1], outputRange: [measuredHeightRef.current, 0] }),
            opacity: exitProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
            overflow: 'hidden',
        }
        : null;

    // NOTE: scroll-recycled cells never animate — only the `exiting` (deleted)
    // card does — so list performance is untouched.
    return (
        <RNAnimated.View
            onLayout={(e) => { if (!collapsing) measuredHeightRef.current = e.nativeEvent.layout.height; }}
            // Only while collapsing — keeps Android from drawing the card shadow
            // as a hard grey box edge during the collapse, without permanently
            // rasterizing every scrolled card.
            renderToHardwareTextureAndroid={collapsing}
            style={wrapperStyle}
        >
            <AnimatedTouchableOpacity
                activeOpacity={0.8}
                onPress={handlePress}
                onLongPress={handleLongPress}
                delayLongPress={350}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                style={[styles.cardContainer, { transform: [{ scale: scaleAnim }] }]}
                disabled={isLoading}
            >
                <View style={[styles.cardContent, { backgroundColor: theme.surface }]}>
                    <View style={styles.cardHeader}>
                        <Text style={[styles.workoutName, { flex: 1, marginRight: 10 }]} numberOfLines={1}>
                            {exercises[0].name}
                        </Text>
                        {totalPRs > 0 && (
                            <View style={styles.prSummaryBadge}>
                                <MaterialCommunityIcons name="trophy" size={14} color={lightenColor(theme.primary, 20)} />
                                <Text style={styles.prSummaryText}>{totalPRs} PR{totalPRs > 1 ? 's' : ''}</Text>
                            </View>
                        )}
                    </View>

                    {/* Full-width so it never wraps early because of the badge */}
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
                        {volumeKg > 0 && (
                            <>
                                <View style={styles.metaDivider} />
                                <View style={styles.metaItem}>
                                    <Feather name="bar-chart-2" size={12} color={theme.textSecondary} />
                                    <Text style={styles.metaText}>{formatVolume(volumeKg, useImperial)}</Text>
                                </View>
                            </>
                        )}
                        <View style={styles.metaDivider} />
                        <View style={styles.metaItem}>
                            <Text style={styles.metaText}>{workingSets.length} sets</Text>
                        </View>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.summaryList}>
                        {groupedExercises.slice(0, 4).map((group, idx) => {
                            const exerciseObjFromList = exercisesList.find(e => e.exerciseID === group[0].exerciseID);
                            const exerciseName = exerciseObjFromList?.name || 'Unknown Exercise';
                            const workingSetsInGroup = group.filter(set => set.setType !== 'W');
                            const count = workingSetsInGroup.length;
                            const hasPR = group.some(set => set.is1rmPR || set.isVolumePR || set.isWeightPR);

                            const hasMuscles = exerciseObjFromList && (
                                (exerciseObjFromList.targetMuscle && exerciseObjFromList.targetMuscle.trim() !== '') ||
                                (exerciseObjFromList.accessoryMuscles && exerciseObjFromList.accessoryMuscles.trim() !== '')
                            );

                            return (
                                <View key={idx} style={styles.summaryRow}>
                                    <Text
                                        style={[styles.summaryText, hasPR && styles.summaryTextPR, { flexShrink: 1 }]}
                                        numberOfLines={1}
                                    >
                                        <Text style={styles.summaryCount}>{count} x</Text> {exerciseName}
                                    </Text>
                                    {hasPR && (
                                        <MaterialCommunityIcons
                                            name="trophy"
                                            size={12}
                                            color={lightenColor(theme.primary, 20)}
                                            style={styles.summaryPRIcon}
                                        />
                                    )}
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
        </RNAnimated.View>
    );
});


const History = () => {
    const insets = useSafeAreaInsets();
    // Seed the first paint from the in-memory cache. History can be cold-mounted
    // when navigated to from the post-workout summary; seeding here means the
    // existing list (and the just-finished session, which insertWorkoutHistory
    // pushes into the cache before navigating) renders instantly — no spinner,
    // no flash. The fresh fetch below just reconciles.
    const seededHistory = React.useMemo(() => groupBySession(getCachedWorkoutHistory() || []), []);
    const [workoutHistory, setWorkoutHistory] = useState(seededHistory);
    // Only spin on a genuine first-ever load (no cache warmed yet at boot).
    const [loading, setLoading] = useState(() => getCachedWorkoutHistory() == null);
    const [exercisesList, setExercises] = useState(() => getCachedExercises() || []);
    const [contextMenu, setContextMenu] = useState(null); // {x, y, session, exercises}
    const [menuClosing, setMenuClosing] = useState(false);

    // Baseline = the sessions present at the previous load. Used only to detect
    // removals (so a deleted card can collapse-animate). New cards just appear —
    // the list is primed from the cache before navigation, so no entrance anim.
    const knownSessionsRef = useRef(
        getCachedWorkoutHistory() == null ? null : new Set(seededHistory.map(([s]) => s))
    );
    // Whether this tab is visible — removal animations only run then; refreshes
    // that arrive while covered commit directly (frozen trees can't animate).
    const isFocusedRef = useRef(false);

    // Removal animation: sessions mid-exit, and the post-exit list to commit.
    const [exitingSessions, setExitingSessions] = useState(() => new Set());
    const pendingDataRef = useRef(null);
    const handleExitDone = React.useCallback((session) => {
        setExitingSessions(prev => {
            if (!prev.has(session)) return prev;
            const next = new Set(prev);
            next.delete(session);
            if (next.size === 0 && pendingDataRef.current) {
                setWorkoutHistory(pendingDataRef.current);
                pendingDataRef.current = null;
            }
            return next;
        });
    }, []);

    // Two-step close: unmount the menu view first so its exit animation can
    // play, then tear down the modal. Closing the modal directly would cut
    // the menu off with no animation.
    const closeMenu = () => {
        if (!contextMenu || menuClosing) return;
        setMenuClosing(true);
        setTimeout(() => {
            setContextMenu(null);
            setMenuClosing(false);
        }, 140);
    };
    const router = useRouter();
    const { theme, useImperial, workoutInProgress } = useTheme();

    const styles = getStyles(theme);

    const scrollRef = useRef(null);
    useScrollToTop(scrollRef);

    const loadWorkoutHistory = async () => {
        try {
            const history = await fetchWorkoutHistory();
            const groupedHistory = groupBySession(history);
            const ids = new Set(groupedHistory.map(([session]) => session));
            const prev = knownSessionsRef.current;

            // First load with no warmed cache (boot prime missed): just
            // establish the baseline and commit — nothing is "new" yet.
            if (prev === null) {
                knownSessionsRef.current = ids;
                setWorkoutHistory(groupedHistory);
                return;
            }

            // Session(s) removed (e.g. deleted): keep the current list so those
            // cards stay mounted, flag them to collapse+fade, and commit the new
            // list once their exit finishes. (List virtualization won't animate
            // a plain row removal.) ONLY when this tab is actually visible —
            // deletes land while it's covered/frozen (EditWorkout is the only
            // delete UI), and starting the exit machinery on a frozen tree
            // can't run its animations or commit, which left the list wedged
            // mid-swap and churning views. Covered tab → commit directly.
            const removedIds = [...prev].filter(id => !ids.has(id));
            if (removedIds.length > 0 && isFocusedRef.current) {
                pendingDataRef.current = groupedHistory;
                knownSessionsRef.current = ids;
                setExitingSessions(new Set(removedIds));
                return; // don't replace the list yet — animate first
            }

            // New cards just appear (no entrance animation). A plain reload
            // commits the data. Also clear any wedged exit state so a pending
            // (never-animated) swap can't hold the committed list hostage.
            knownSessionsRef.current = ids;
            pendingDataRef.current = null;
            setExitingSessions(prevExiting => (prevExiting.size ? new Set() : prevExiting));
            setWorkoutHistory(groupedHistory);
        } catch (error) {
            console.error("Error loading workout history:", error);
        } finally {
            setLoading(false);
        }
    };

    const loadAll = () => {
        fetchExercises()
            .then(data => setExercises(data))
            .catch(err => console.error(err));
        loadWorkoutHistory();
    };

    useEffect(() => {
        loadAll();

        // A data mutation refreshes the list immediately, even while this tab
        // is covered (e.g. by the post-workout summary): the covered tab is
        // frozen (freezeOnBlur), so the re-render is deferred until it's next
        // shown — meaning the new session is already in the list when the tab
        // repaints, instead of visibly popping in after the user lands on it.
        // The summary's count-up is protected by WORKOUT_COMPLETED itself
        // being emitted on a delay after a finish.
        const refresh = () => loadAll();
        on(AppEvents.WORKOUT_COMPLETED, refresh, 'history-tab');
        on(AppEvents.WORKOUT_DATA_IMPORTED, refresh, 'history-tab');
        return () => {
            off(AppEvents.WORKOUT_COMPLETED, refresh);
            off(AppEvents.WORKOUT_DATA_IMPORTED, refresh);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useFocusEffect(
        React.useCallback(() => {
            isFocusedRef.current = true;
            return () => {
                isFocusedRef.current = false;
                // Dismiss any open hold-menu on blur. Its transparent Modal
                // renders above everything app-wide, so if it survives a tab
                // switch it silently swallows touches on other screens.
                setContextMenu(null);
                setMenuClosing(false);
            };
        }, [])
    );

    // ── Month sections ───────────────────────────────────────────────────────
    const sections = useMemo(() => {
        const map = new Map();
        workoutHistory.forEach(item => {
            const d = new Date(item[1][0].time);
            const key = isNaN(d.getTime()) ? 'unknown' : `${d.getFullYear()}-${d.getMonth()}`;
            if (!map.has(key)) {
                map.set(key, {
                    title: isNaN(d.getTime())
                        ? 'UNKNOWN DATE'
                        : d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase(),
                    data: [],
                });
            }
            map.get(key).data.push(item);
        });
        return [...map.values()];
    }, [workoutHistory]);

    const handleOpenSession = (session) => {
        router.push(`/workout/${session}`);
    };

    // ── Context menu actions ─────────────────────────────────────────────────
    const sessionDisplayName = (menu) =>
        menu.exercises[0]?.name?.trim() || `Workout #${menu.session}`;

    const handleRedo = () => {
        const menu = contextMenu;
        closeMenu();
        if (!menu) return;

        const start = () => {
            // navigate, NOT push: pushing a tab route mounts a duplicate (tabs)
            // navigator (all four tabs, lazy:false) that piles up until the app
            // crashes — navigate reuses the existing tabs and switches to it.
            router.navigate({
                pathname: '/current',
                params: {
                    template: JSON.stringify({
                        name: sessionDisplayName(menu),
                        data: buildWorkoutDataFromSession(menu.exercises),
                    }),
                },
            });
        };

        if (workoutInProgress) {
            customAlert(
                "Replace current workout?",
                "You have a workout in progress. Redoing this session will replace it.",
                [
                    { text: "Cancel", style: "cancel" },
                    { text: "Replace", onPress: start, style: "destructive" },
                ]
            );
        } else {
            start();
        }
    };

    const handleEdit = () => {
        const menu = contextMenu;
        closeMenu();
        if (!menu) return;
        router.push(`/workout/EditWorkout?session=${menu.session}`);
    };

    const handleSaveTemplate = async () => {
        const menu = contextMenu;
        closeMenu();
        if (!menu) return;
        try {
            await createTemplate(sessionDisplayName(menu), buildWorkoutDataFromSession(menu.exercises));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            customAlert("Template Saved", `"${sessionDisplayName(menu)}" was added to your templates.`, [{ text: "OK" }]);
        } catch (e) {
            console.error("Error saving template from session:", e);
            customAlert("Error", "Could not save this workout as a template.", [{ text: "OK" }]);
        }
    };

    // Anchor the menu at the press point, clamped on-screen like a context menu.
    const MENU_WIDTH = 230;
    const MENU_HEIGHT = 152;
    const menuPosition = contextMenu ? {
        left: Math.min(Math.max(16, contextMenu.x - MENU_WIDTH / 2), SCREEN_WIDTH - MENU_WIDTH - 16),
        top: Math.min(Math.max(insets.top + 16, contextMenu.y - 20), SCREEN_HEIGHT - MENU_HEIGHT - 60),
    } : null;

    return (
        <View style={[styles.container, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.eyebrow}>
                        {workoutHistory.length > 0
                            ? `${workoutHistory.length} ${workoutHistory.length === 1 ? 'WORKOUT' : 'WORKOUTS'} LOGGED`
                            : 'TRAINING LOG'}
                    </Text>
                    <Text style={styles.title}>History</Text>
                </View>
            </View>
            <SectionList
                ref={scrollRef}
                sections={sections}
                style={styles.list}
                contentContainerStyle={styles.listContentContainer}
                showsVerticalScrollIndicator={false}
                stickySectionHeadersEnabled={true}
                keyExtractor={([session]) => session}
                extraData={exitingSessions}
                ListHeaderComponent={
                    <ContributionGraph
                        workoutHistory={workoutHistory}
                        theme={theme}
                        styles={styles}
                        onOpenSession={handleOpenSession}
                    />
                }
                renderSectionHeader={({ section }) => (
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionHeaderTitle}>{section.title}</Text>
                        <Text style={styles.sectionHeaderCount}>
                            {section.data.length} {section.data.length === 1 ? 'workout' : 'workouts'}
                        </Text>
                    </View>
                )}
                renderItem={({ item: [session, exercises] }) => (
                    <HistoryCard
                        session={session}
                        exercises={exercises}
                        exercisesList={exercisesList}
                        theme={theme}
                        styles={styles}
                        router={router}
                        useImperial={useImperial}
                        onShowMenu={setContextMenu}
                        exiting={exitingSessions.has(session)}
                        onExitDone={handleExitDone}
                    />
                )}
                ListEmptyComponent={
                    loading ? (
                        <View style={{ flex: 1, paddingVertical: 100, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background }}>
                            <ActivityIndicator size="large" color={theme.primary} />
                        </View>
                    ) : (
                        <View style={styles.emptyContainer}>
                            <View style={styles.emptyIconContainer}>
                                <MaterialCommunityIcons name="clipboard-text-outline" size={48} color={theme.primary} />
                            </View>
                            <Text style={styles.emptyTitle}>No Workouts Found</Text>
                            <Text style={styles.emptySubtitle}>
                                Finish a workout and your history will appear here.
                            </Text>
                        </View>
                    )
                }
                initialNumToRender={8}
                maxToRenderPerBatch={8}
                updateCellsBatchingPeriod={50}
                windowSize={7}
                // NOTE: must stay false — clipping + sticky section headers
                // fight over child view indices on Android (addViewAt crash).
                removeClippedSubviews={false}
            />

            {/* ── Hold context menu ──────────────────────────────────────────── */}
            {contextMenu && (
                <Modal transparent animationType="none" statusBarTranslucent onRequestClose={closeMenu}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu}>
                        {!menuClosing && (
                        <Animated.View
                            entering={ZoomIn.duration(140)}
                            exiting={ZoomOut.duration(120)}
                            style={[styles.contextMenu, menuPosition]}
                        >
                            <TouchableOpacity style={styles.contextMenuRow} onPress={handleRedo} activeOpacity={0.6}>
                                <Feather name="rotate-ccw" size={17} color={theme.primary} />
                                <Text style={styles.contextMenuText}>Redo Workout</Text>
                            </TouchableOpacity>
                            <View style={styles.contextMenuDivider} />
                            <TouchableOpacity style={styles.contextMenuRow} onPress={handleEdit} activeOpacity={0.6}>
                                <Feather name="edit-2" size={16} color={theme.text} />
                                <Text style={styles.contextMenuText}>Edit Workout</Text>
                            </TouchableOpacity>
                            <View style={styles.contextMenuDivider} />
                            <TouchableOpacity style={styles.contextMenuRow} onPress={handleSaveTemplate} activeOpacity={0.6}>
                                <Feather name="bookmark" size={16} color={theme.text} />
                                <Text style={styles.contextMenuText}>Save as Template</Text>
                            </TouchableOpacity>
                        </Animated.View>
                        )}
                    </Pressable>
                </Modal>
            )}
        </View>
    );
};

const getStyles = (theme) => {
    const lightTheme = isLightTheme(theme);
    const cardShadow = lightTheme ? getThemedShadow(theme, 'small') : null;

    return StyleSheet.create({
    badgeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    prSummaryBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: withAlpha(theme.primary, lightTheme ? 0.12 : 0.20),
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: RADIUS.pill,
        gap: 4,
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
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 12,
    },
    list: {
        flex: 1,
        width: '100%',
        backgroundColor: theme.background,
    },
    listContentContainer: {
        paddingTop: 4,
        paddingBottom: 100,
        paddingHorizontal: 16,
    },

    // ── Contribution graph ────────────────────────────────────────────────────
    graphCard: {
        backgroundColor: theme.surface,
        borderRadius: 16,
        padding: 14,
        marginBottom: 8,
        ...cardShadow,
    },
    graphHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    graphTitle: {
        fontSize: 12,
        fontFamily: FONTS.semiBold,
        color: theme.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
    },
    graphNav: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    graphRangeText: {
        fontSize: 11,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
        marginRight: 4,
    },
    graphNavButton: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: theme.overlayInput,
        alignItems: 'center',
        justifyContent: 'center',
    },
    graphNavButtonDisabled: {
        opacity: 0.4,
    },
    graphMonthRow: {
        height: 14,
        marginBottom: 2,
    },
    graphMonthLabel: {
        position: 'absolute',
        fontSize: 10,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
    },
    graphGrid: {
        flexDirection: 'row',
        gap: CELL_GAP,
    },
    graphColumn: {
        gap: CELL_GAP,
    },
    graphCell: {
        width: CELL,
        height: CELL,
        borderRadius: 3,
    },

    // ── Month sections ────────────────────────────────────────────────────────
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: theme.background,
        // Overlap 1px upward: sticky headers can leave a subpixel seam at
        // their top edge while scrolling, letting content peek through.
        marginTop: -1,
        paddingTop: 15,
        paddingBottom: 8,
        paddingHorizontal: 4,
    },
    sectionHeaderTitle: {
        fontSize: 13,
        fontFamily: FONTS.bold,
        color: theme.text,
        letterSpacing: 0.8,
    },
    sectionHeaderCount: {
        fontSize: 12,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
    },

    // ── Session card ──────────────────────────────────────────────────────────
    cardContainer: {
        marginBottom: 14,
        borderRadius: 16,
        backgroundColor: theme.surface,
        overflow: 'hidden',
        ...cardShadow,
    },
    cardContent: {
        padding: 18,
        borderRadius: 16,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 7,
    },
    workoutName: {
        fontSize: 17,
        fontFamily: FONTS.bold,
        letterSpacing: -0.2,
        color: theme.text,
    },
    metaContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        rowGap: 4,
        marginBottom: 12,
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
    summaryTextPR: {
        fontFamily: FONTS.semiBold,
        color: theme.text,
    },
    summaryPRIcon: {
        marginLeft: 5,
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

    // ── Context menu ──────────────────────────────────────────────────────────
    contextMenu: {
        position: 'absolute',
        width: 230,
        backgroundColor: theme.surfaceElevated || theme.surface,
        borderRadius: 14,
        overflow: 'hidden',
        ...getThemedShadow(theme, 'medium'),
        elevation: 12,
    },
    contextMenuRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    contextMenuText: {
        fontSize: 15,
        fontFamily: FONTS.medium,
        color: theme.text,
    },
    contextMenuDivider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: theme.border,
    },

    // ── Empty state ───────────────────────────────────────────────────────────
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
};

export default History;
