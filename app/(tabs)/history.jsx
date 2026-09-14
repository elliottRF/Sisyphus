import { View, Text, StyleSheet, SectionList, TouchableOpacity, ActivityIndicator, Modal, Pressable, Dimensions, PixelRatio, Animated as RNAnimated } from 'react-native'
import ActionSheet from 'react-native-actions-sheet';
import AppCalendar from '../../components/AppCalendar';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import Animated, {
    ZoomIn,
    ZoomOut,
    FadeIn,
    useSharedValue,
    useAnimatedStyle,
    withTiming,

} from 'react-native-reanimated';
import { useScrollToTop } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchWorkoutHistory, fetchExercises, fetchWorkoutHistoryBySession, createTemplate, getSplits, getCachedWorkoutHistory, getCachedExercises } from '../../components/db';
import { useFocusEffect, useRouter } from 'expo-router';
import * as haptics from '../../utils/haptics';
import { FONTS, RADIUS, getThemedShadow, isLightTheme, withAlpha, flattenOverlay, SPACING } from '../../constants/theme';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { customAlert } from '../../utils/customAlert';
import { kgToLbs, unitLabel } from '../../utils/units';
import { buildWorkoutDataFromSession } from '../../utils/workoutBuilders';
import { AppEvents, on, off } from '../../utils/events';
import usePinnedSection from '../../components/usePinnedSection';
import { EASING_GENTLE } from '../../components/Expandable';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ── Card geometry ────────────────────────────────────────────────────────────
//
// Every part of a session card is pinned to a height, so a card's total height
// is a pure function of how many exercises it lists. That is what lets the list
// have getItemLayout, and getItemLayout is the only way it will scroll to a
// session it has never rendered -- see the note on scrollToSession.
//
// The numbers come from measuring the cards as they were, across the whole
// history, so pinning them changes nothing anyone can see:
//
//     rows  more   was      now
//       2    no    169.00   170
//       3    no    193.33   194
//       4    no    217.67   218
//       4   yes    242.00   242
//
// Two things had to change for that to be possible. The meta line (date,
// duration, volume, sets) used to WRAP to a second line on cards with big
// numbers -- worth 21.33dp, and impossible to predict without measuring the
// text -- so it is one line now, with the last two items allowed to shrink. And
// the PR badge made the header exactly 1dp taller than a bare title, so the
// header is pinned to fit the badge either way.
//
// Snapped to whole device pixels: a height that is already pixel-aligned is
// rendered at exactly that size, so the declared and the real heights cannot
// drift apart -- which matters at 420dpi as much as at 480.
const SNAP = (dp) => PixelRatio.roundToNearestPixel(dp);
const CARD_HEADER_H = SNAP(26);
const CARD_META_H = SNAP(18);
const CARD_ROW_H = SNAP(20);
const CARD_ROW_GAP = SNAP(4);
const CARD_MORE_H = SNAP(20);
const CARD_MORE_GAP = SNAP(4);
// The parts that never vary: the card's bottom margin, its padding top and
// bottom, the gap under the header, the gap under the meta line, and the
// divider with its own gap.
const CARD_MARGIN = SNAP(14);
const CARD_CHROME = CARD_MARGIN + SNAP(18 + 18 + 7 + 12 + 1 + 12);
const SECTION_HEADER_H = SNAP(41);
// At most four exercises are listed, with a "+N more" line if there are others.
const CARD_MAX_ROWS = 4;

const cardHeight = (exerciseCount) => {
    const rows = Math.min(CARD_MAX_ROWS, Math.max(1, exerciseCount));
    const more = exerciseCount > CARD_MAX_ROWS;
    return CARD_CHROME + CARD_HEADER_H + CARD_META_H
        + rows * CARD_ROW_H + (rows - 1) * CARD_ROW_GAP
        + (more ? CARD_MORE_GAP + CARD_MORE_H : 0);
};

// The tint on a jumped-to card comes up quickly and leaves slowly: arriving is
// the part that has to catch the eye, and a glow that lingers on the way out
// reads as the card settling rather than as a second event.
const GLOW_IN = 260;
const GLOW_OUT = 620;
// Measured from the LANDING, not from the tap: a long jump can spend a second
// travelling, and a hold timed from the tap would be most of the way gone by
// the time the card was on screen.
const GLOW_HOLD = 800;

// Where a jumped-to session lands: a third of the way down, clear of the
// pinned month label and of the page header above it.
const JUMP_VIEW_POSITION = 0.3;
// The scroll is animated, so the highlight's hold is restarted once it has
// arrived rather than when it was asked for.
const JUMP_SETTLE_MS = 350;


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

// react-native-calendars keys days as local "YYYY-MM-DD".
const calendarDateString = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ─── Weekly streak ────────────────────────────────────────────────────────────
// A week counts as trained if it holds at least one session. Weeks start on
// Monday, matching the heatmap grid. Stepping with setDate (rather than
// subtracting 7×86400000) keeps the arithmetic correct across DST changes.

const startOfWeek = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Mon = 0
    return d;
};

const weekKey = (date) => startOfWeek(date).getTime();

const computeWeeklyStreak = (workoutHistory, now = new Date()) => {
    const trained = new Set();
    workoutHistory.forEach(([, exercises]) => {
        const d = new Date(exercises[0]?.time);
        if (!isNaN(d.getTime())) trained.add(weekKey(d));
    });
    if (trained.size === 0) return { current: 0, best: 0, thisWeekTrained: false };

    const thisWeek = startOfWeek(now);
    const thisWeekTrained = trained.has(thisWeek.getTime());

    // The current week doesn't break a streak until it's over, so an untrained
    // week-so-far still counts as held while last week is trained.
    const cursor = new Date(thisWeek);
    if (!thisWeekTrained) cursor.setDate(cursor.getDate() - 7);

    let current = 0;
    while (trained.has(cursor.getTime())) {
        current++;
        cursor.setDate(cursor.getDate() - 7);
    }

    let best = 0;
    let run = 0;
    const ordered = [...trained].sort((a, b) => a - b);
    ordered.forEach((wk, i) => {
        if (i === 0) {
            run = 1;
        } else {
            const prev = new Date(ordered[i - 1]);
            prev.setDate(prev.getDate() + 7);
            run = prev.getTime() === wk ? run + 1 : 1;
        }
        best = Math.max(best, run);
    });

    return { current, best, thisWeekTrained };
};

// ─── Contribution graph ───────────────────────────────────────────────────────
// GitHub-style training heatmap: one cell per day, tinted by session volume.
// Always visible under the page header; tapping a trained day opens it.

const CELL = 11;
const CELL_GAP = 3;

const ContributionGraph = ({ workoutHistory, theme, styles, onOpenSession }) => {
    // 0 = the window ending today; each page steps back a full window.
    const [page, setPage] = useState(0);

    const streak = useMemo(() => computeWeeklyStreak(workoutHistory), [workoutHistory]);

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

            <View style={styles.streakRow}>
                <MaterialCommunityIcons
                    name="fire"
                    size={15}
                    color={streak.current > 0 ? theme.primary : theme.textSecondary}
                />
                {streak.current > 0 ? (
                    <>
                        <Text style={styles.streakText}>
                            {streak.current} week{streak.current === 1 ? '' : 's'} in a row
                        </Text>
                        {!streak.thisWeekTrained && (
                            <Text style={styles.streakHint}>· train this week to keep it</Text>
                        )}
                        {streak.best > streak.current && (
                            <Text style={styles.streakHint}>· best {streak.best}</Text>
                        )}
                    </>
                ) : (
                    <Text style={styles.streakHint}>
                        Train this week to start a streak
                    </Text>
                )}
            </View>
        </View>
    );
};

// ─── Session card ─────────────────────────────────────────────────────────────

const AnimatedTouchableOpacity = RNAnimated.createAnimatedComponent(TouchableOpacity);

const HistoryCard = React.memo(({ highlighted = false, session, exercises, exercisesList, theme, styles, glowTint, router, useImperial, onShowMenu, exiting = false, onExitDone }) => {
    const groupedExercises = groupExercisesByName(exercises);
    const duration = exercises[0].duration;
    const [isLoading, setIsLoading] = useState(false);

    const scaleAnim = useRef(new RNAnimated.Value(1)).current;

    // New cards just appear (the list is primed from cache before navigation),
    // so there's no entrance animation — only the delete collapse below.

    // Exit: collapse this card's height + fade, then tell the parent to commit
    // the removal. Only the flagged (deleted) card animates — never the
    // scroll-recycled cells — so list performance is untouched.
    // The tint fades rather than switching, and it is a shared value rather
    // than an RNAnimated one because backgroundColor cannot take RN's native
    // driver -- this way the fade runs on the UI thread instead of competing
    // with whatever JS is doing, which during a long jump is a great deal.
    //
    // A card that mounts already flagged (the common case -- a long jump
    // renders it for the first time when it is nearly on screen) starts at 0
    // and animates up, so it fades in as it arrives rather than appearing lit.
    // The glow is a separate layer that fades in over the card, NOT the card's
    // own backgroundColor. Painting the background from an animated style meant
    // every one of ~650 cards carried an animated node whose only job, almost
    // always, was to paint a static colour -- and Reanimated's
    // synchronouslyUpdateUIProps fails routinely for cells a virtualized list
    // is creating and destroying mid-scroll. When it failed, the card was left
    // holding whatever colour that node last had, which is how a batch of
    // sessions ended up visibly tinted while their neighbours were correct.
    //
    // Now the fill is static (see cardContent) and the overlay is mounted only
    // while a card is actually lit, so an update that never lands can only cost
    // a glow -- and React unmounts the layer when the hold ends regardless of
    // what the UI thread did.
    const glow = useSharedValue(0);
    const [glowMounted, setGlowMounted] = useState(highlighted);
    useEffect(() => {
        if (highlighted) {
            setGlowMounted(true);
            glow.value = withTiming(1, { duration: GLOW_IN, easing: EASING_GENTLE });
            return undefined;
        }
        glow.value = withTiming(0, { duration: GLOW_OUT, easing: EASING_GENTLE });
        // A JS timer rather than withTiming's completion callback: the unmount
        // has to happen even when the UI thread dropped the update that would
        // have completed the animation.
        const t = setTimeout(() => setGlowMounted(false), GLOW_OUT + 60);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [highlighted]);

    // Opacity, not backgroundColor: the tint is already flattened against the
    // card's surface, so fading it in reads identically to interpolating the
    // background did -- without the card's own fill depending on it.
    const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));

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
        haptics.commit();
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
                <View style={styles.cardContent}>
                    {glowMounted && (
                        <Animated.View
                            pointerEvents="none"
                            style={[styles.cardGlow, { backgroundColor: glowTint }, glowStyle]}
                        />
                    )}
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
                                <View style={[styles.metaItem, styles.metaItemFlexible]}>
                                    <Feather name="bar-chart-2" size={12} color={theme.textSecondary} />
                                    <Text style={styles.metaText} numberOfLines={1}>{formatVolume(volumeKg, useImperial)}</Text>
                                </View>
                            </>
                        )}
                        <View style={styles.metaDivider} />
                        <View style={[styles.metaItem, styles.metaItemFlexible]}>
                            <Text style={styles.metaText} numberOfLines={1}>{workingSets.length} sets</Text>
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

    // Memoised because `styles` is handed to the React.memo'd HistoryCard (and
    // to ContributionGraph). Rebuilding it each render gave every card a new
    // prop identity, so the memo never held and every visible session card
    // re-rendered on any state change here — opening the menu, the calendar,
    // a card animating out.
    const styles = useMemo(() => getStyles(theme), [theme]);
    // Flattened once here rather than per card: the colour a jumped-to card
    // fades to. See the note in HistoryCard for why it is flattened at all.
    const glowTint = useMemo(
        () => flattenOverlay(withAlpha(theme.primary, 0.16), theme.surface),
        [theme],
    );

    const scrollRef = useRef(null);
    useScrollToTop(scrollRef);
    const calendarActionSheetRef = useRef(null);

    // Marks every trained day. Keys are built from local date parts (not
    // toISOString, which is UTC and can shift a late-evening session onto the
    // wrong day) so the calendar agrees with the heatmap above it.
    const { markedDates, workoutsByMonth } = useMemo(() => {
        const marked = {};
        const byMonth = {};
        workoutHistory.forEach(([, exercises]) => {
            const d = new Date(exercises[0]?.time);
            if (isNaN(d.getTime())) return;
            marked[calendarDateString(d)] = { trained: true };
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            byMonth[key] = (byMonth[key] || 0) + 1;
        });
        return { markedDates: marked, workoutsByMonth: byMonth };
    }, [workoutHistory]);

    // Eyebrow over the calendar's month title: the month's own data point.
    const monthEyebrow = React.useCallback((year, monthIndex) => {
        const n = workoutsByMonth[`${year}-${monthIndex}`] || 0;
        if (n === 0) return 'NO WORKOUTS';
        return `${n} WORKOUT${n === 1 ? '' : 'S'}`;
    }, [workoutsByMonth]);

    // handleDatePress is declared before scrollToSession (it has to be, the
    // calendar sheet is built further up), so it reaches it through a ref.
    const scrollToSessionRef = useRef(() => {});

    const handleDatePress = (day) => {
        const match = workoutHistory.find(([, exercises]) => {
            const d = new Date(exercises[0]?.time);
            return !isNaN(d.getTime()) && calendarDateString(d) === day.dateString;
        });
        if (!match) return;
        calendarActionSheetRef.current?.hide();
        // Let the sheet finish closing before scrolling, so the transitions
        // don't interrupt each other.
        setTimeout(() => scrollToSessionRef.current(match[0]), 300);
    };

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
    // The whole history goes into the list. It used to be capped to the three
    // most recent months behind a "Show earlier workouts" button, on the belief
    // that VirtualizedList ignored its window and progressively mounted every
    // cell at idle. Re-measured on SDK 57 / RN 0.86 against 646 sessions with
    // the cap removed: 12 cards mounted at rest, unchanged after a minute idle,
    // peaking at 33 after sixty hard flings, 910 -> 1367 native views. It
    // virtualizes correctly, so the cap was buying nothing and cost the user a
    // button between them and their own history.
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

    // Where every cell in the list begins and how tall it is, worked out once
    // per data load. A section contributes a header, then its rows, then a
    // footer that renders nothing.
    //
    // This is what makes a jump to an unrendered session possible; it also means
    // the scroll bar is honest from the first frame, instead of the content
    // growing as you scroll through it.
    const getItemLayout = useMemo(() => {
        const cells = [];
        let offset = 0;
        const push = (length) => {
            cells.push({ length, offset, index: cells.length });
            offset += length;
        };
        for (const section of sections) {
            push(SECTION_HEADER_H);
            for (const [, exercises] of section.data) {
                // The card lists one row per distinct exercise, in first-seen
                // order -- the same count groupExercisesByName arrives at.
                const ids = new Set();
                for (const e of exercises) ids.add(e.exerciseID);
                push(cardHeight(ids.size));
            }
            push(0);
        }
        const past = { length: 0, offset, index: cells.length };
        return (_data, index) => cells[index] ?? past;
    }, [sections]);

    // The month label, pinned above the list rather than by it. See
    // components/usePinnedSection, and the note on the SectionList below for
    // why the list cannot be allowed to stick its own headers.
    const { pinned, viewabilityConfigCallbackPairs } = usePinnedSection(sections);

    // ── Jumping to a session ─────────────────────────────────────────────────
    // One scrollToLocation and it is there, at any distance, because the list
    // has getItemLayout -- see the card geometry at the top of the file for what
    // it took to be able to give it one.
    //
    // Without it this was not possible at all. VirtualizedList clamps its tail
    // spacer to the highest cell it has measured, on purpose, "to prevent the
    // user for hyperscrolling into un-measured area because otherwise content
    // will likely jump around as it renders in above the viewport" -- so the
    // list would not scroll past what it had already rendered, and
    // scrollToLocation past that point did not scroll at all. A jump had to ride
    // the edge, measuring as it went, which only advanced as fast as the cards
    // rendered: about FIFTY A SECOND. A two-year jump (582 cells) took 9.4
    // seconds, and with any sane budget it just gave up partway and left the
    // list somewhere wrong.
    const [highlight, setHighlight] = useState(null);
    const jumpTarget = useRef(null);
    const jumpTimer = useRef(null);
    const settleTimer = useRef(null);

    const endJump = React.useCallback(() => {
        jumpTarget.current = null;
        for (const t of [jumpTimer, settleTimer]) {
            if (t.current) {
                clearTimeout(t.current);
                t.current = null;
            }
        }
    }, []);

    // One last reposition after the loop goes quiet. The hop that finally lands
    // is asked for while the list is still settling from the hop before it, so
    // it can come to rest lower than the third of the way down it aimed for --
    // measured landing a graph jump at 58% instead of 30%. By the time this
    // fires everything around the target is measured and the answer is exact,
    // and it is animated, so if the first landing was already right this does
    // nothing visible.
    const armSettle = React.useCallback((run) => {
        if (settleTimer.current) clearTimeout(settleTimer.current);
        settleTimer.current = setTimeout(() => {
            settleTimer.current = null;
            run(true);
        }, JUMP_SETTLE_MS);
    }, []);

    const runJump = React.useCallback((isSettle = false) => {
        const t = jumpTarget.current;
        if (!t) return;
        if (!isSettle) armSettle(runJump);
        try {
            scrollRef.current?.scrollToLocation({
                sectionIndex: t.sectionIndex,
                // +1 because a section's cells are [header, ...rows, footer]
                // and scrollToLocation counts from the header.
                itemIndex: t.itemIndex + 1,
                viewPosition: JUMP_VIEW_POSITION,
                animated: true,
            });
        } catch {
            // The flash still identifies the card once it is scrolled to.
            endJump();
            return;
        }
        // A new object for the same session: same card stays lit, but the hold
        // restarts from here, which is after the animated scroll has arrived.
        if (isSettle) setHighlight((h) => (h ? { session: h.session } : h));
    }, [endJump, armSettle]);

    const scrollToSession = React.useCallback((session) => {
        if (!session) return;
        for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
            const itemIndex = sections[sectionIndex].data.findIndex(([id]) => id === session);
            if (itemIndex < 0) continue;
            endJump();
            setHighlight({ session });
            jumpTarget.current = { sectionIndex, itemIndex };
            runJump();
            return;
        }
    }, [sections, runJump, endJump]);

    scrollToSessionRef.current = scrollToSession;

    // HistoryCard is memoised and the list is virtualized, so both need telling
    // when either of these changes.
    const listExtraData = useMemo(() => ({ exitingSessions, highlight }), [exitingSessions, highlight]);

    // Held lit, then faded out. The hold restarts whenever the settle pass
    // below re-stamps the highlight, so it runs from where the card came to
    // rest rather than from the tap -- which is what lets it be this short
    // without a long jump's glow being half over on arrival.
    useEffect(() => {
        if (!highlight) return undefined;
        const t = setTimeout(() => setHighlight(null), GLOW_HOLD);
        return () => clearTimeout(t);
    }, [highlight]);

    useEffect(() => endJump, [endJump]);

    // ── Context menu actions ─────────────────────────────────────────────────
    const sessionDisplayName = (menu) =>
        menu.exercises[0]?.name?.trim() || `Workout #${menu.session}`;

    const handleRedo = () => {
        const menu = contextMenu;
        closeMenu();
        if (!menu) return;

        const start = () => {
            // navigate, NOT push: pushing a tab route mounts a duplicate (tabs)
            // navigator, tab bar and all, that piles up until the app crashes —
            // navigate reuses the existing tabs and switches to it.
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

        const name = sessionDisplayName(menu);
        const save = async (splitId) => {
            try {
                await createTemplate(name, buildWorkoutDataFromSession(menu.exercises), splitId);
                haptics.success();
                customAlert("Template Saved", `"${name}" was added to your templates.`, [{ text: "OK" }]);
            } catch (e) {
                console.error("Error saving template from session:", e);
                customAlert("Error", "Could not save this workout as a template.", [{ text: "OK" }]);
            }
        };

        // Ask which split to file it under, the same choice the template editor
        // offers. Skipped when there is only one split, since there is nothing
        // to decide and an extra tap would just be in the way.
        try {
            const splits = await getSplits();
            if (splits.length > 1) {
                customAlert(
                    "Save to which split?",
                    name,
                    [
                        ...splits.map(split => ({ text: split.name, style: 'plain', onPress: () => save(split.id) })),
                        { text: "Cancel", style: "cancel" },
                    ]
                );
                return;
            }
            await save(splits[0]?.id ?? null);
        } catch (e) {
            // Reading splits is not worth failing the save over — createTemplate
            // files an unassigned template into the first split anyway.
            console.error("Error reading splits:", e);
            await save(null);
        }
    };

    // Anchor the menu at the press point, clamped on-screen like a context menu.
    const MENU_WIDTH = 230;
    const MENU_HEIGHT = 152;
    const menuPosition = contextMenu ? {
        left: Math.min(Math.max(16, contextMenu.x - MENU_WIDTH / 2), SCREEN_WIDTH - MENU_WIDTH - 16),
        top: Math.min(Math.max(insets.top + 16, contextMenu.y - 20), SCREEN_HEIGHT - MENU_HEIGHT - 60),
    } : null;

    // One entrance for the whole screen. A tab mounts lazily, so it is switched
    // to and then paints nothing for a frame or two; whatever appears next must
    // arrive together. Animating only part of a screen (the list but not the
    // header, the cards but not the activity card) makes the rest pop into an
    // empty page, which is what this fixes. Mount-only, so returning to an
    // already-mounted tab stays instant.
    return (
        <View style={[styles.container, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
            <Animated.View entering={FadeIn.duration(280)} style={{ flex: 1 }}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.eyebrow}>
                        {workoutHistory.length > 0
                            ? `${workoutHistory.length} ${workoutHistory.length === 1 ? 'WORKOUT' : 'WORKOUTS'} LOGGED`
                            : 'TRAINING LOG'}
                    </Text>
                    <Text style={styles.title}>History</Text>
                </View>
                <TouchableOpacity
                    style={styles.calendarButton}
                    onPress={() => calendarActionSheetRef.current?.show()}
                    accessibilityLabel="Open calendar"
                >
                    <Feather name="calendar" size={22} color={theme.text} />
                </TouchableOpacity>
            </View>
            <View style={{ flex: 1 }}>
            {pinned && (
                <View style={styles.pinnedHeader} pointerEvents="none">
                    <Text style={styles.sectionHeaderTitle}>{pinned.title}</Text>
                    <Text style={styles.sectionHeaderCount}>
                        {pinned.count} {pinned.count === 1 ? 'workout' : 'workouts'}
                    </Text>
                </View>
            )}
            <SectionList
                ref={scrollRef}
                sections={sections}
                style={styles.list}
                contentContainerStyle={styles.listContentContainer}
                showsVerticalScrollIndicator={false}
                // ── Must stay false ──────────────────────────────────────
                // A stuck section header reports its STUCK position as its
                // layout offset, and VirtualizedList caches that as the cell's
                // offset in the content. Measured at the bottom of the list:
                // the two headers that had been stuck were both recorded at
                // offset 0 instead of 225 and 1626. The leading spacer is sized
                // from those offsets, so the content height flipped between
                // 9881 and 11507 — and because the scroll is clamped to the
                // content at the bottom, the scroll position flipped with it,
                // which changed the render window, which changed the content
                // height again. A closed loop: six cards remounted 180 times in
                // three seconds and the page visibly juddered up and down.
                //
                // It only bites where the scroll is clamped, which is why it
                // was the very bottom of the list that shook. With this false
                // the same offsets come back correct and the content height
                // climbs once and settles: 142 samples across the full 646
                // sessions, not one decrease.
                //
                // The month label is pinned above the list instead — see
                // usePinnedSection. getItemLayout would also override the bad
                // offsets, but only with exact heights, and these cards are
                // text-sized (194.3 / 217.7 / 242 / 243dp) so any table of
                // heights would drift a dp per card and re-open the same loop.
                stickySectionHeadersEnabled={false}
                getItemLayout={getItemLayout}
                viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs}
                // A long jump rides the list forward for up to a second or so.
                // If the user grabs the list in the meantime the jump has to
                // let go, or it would keep yanking them onward.
                onScrollBeginDrag={endJump}
                // Tolerates a non-array item on purpose. Passing
                // onViewableItemsChanged (rather than the callback pairs below)
                // makes VirtualizedSectionList run every viewable cell through
                // this, SECTION HEADERS INCLUDED, and a section is a plain
                // object — destructuring one throws "iterator method is not
                // callable" and took the app down on the first scroll while
                // this was being built.
                keyExtractor={(item, index) => (Array.isArray(item) ? item[0] : `section-${index}`)}
                extraData={listExtraData}
                ListHeaderComponent={
                    <ContributionGraph
                        workoutHistory={workoutHistory}
                        theme={theme}
                        styles={styles}
                        onOpenSession={scrollToSession}
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
                        highlighted={session === highlight?.session}
                        glowTint={glowTint}
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
                // NOTE: must stay false. It was originally false because
                // clipping and sticky section headers fought over child view
                // indices on Android (addViewAt crash); the sticky headers are
                // gone now, but the list already holds a bounded ~33 cards at
                // its worst, so there is nothing to win and a crash to lose.
                removeClippedSubviews={false}
            />
            </View>

            <ActionSheet
                ref={calendarActionSheetRef}
                containerStyle={styles.actionSheetContainer}
                indicatorStyle={styles.indicator}
                gestureEnabled={true}
            >
                <View style={styles.calendarContainer}>
                    <AppCalendar
                        theme={theme}
                        markedDates={markedDates}
                        onDayPress={handleDatePress}
                        eyebrow={monthEyebrow}
                    />
                </View>
            </ActionSheet>

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
            </Animated.View>
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
    calendarButton: {
        padding: 10,
        backgroundColor: theme.surface,
        borderRadius: RADIUS.m,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.border,
        ...getThemedShadow(theme, 'small'),
    },
    actionSheetContainer: {
        backgroundColor: theme.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
    },
    indicator: {
        backgroundColor: theme.overlayInputFocused,
        width: 36,
    },
    calendarContainer: {
        paddingHorizontal: SPACING.l,
        paddingTop: SPACING.s,
        paddingBottom: SPACING.l,
        backgroundColor: theme.surface,
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
    streakRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 12,
        paddingTop: 10,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.border,
    },
    streakText: {
        fontSize: 12,
        fontFamily: FONTS.semiBold,
        color: theme.text,
    },
    streakHint: {
        fontSize: 11,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
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
        // Pinned, like the cards, so getItemLayout can account for it. The 1px
        // upward overlap that used to be here was covering a seam the list's
        // own sticky headers left; they are gone.
        height: SECTION_HEADER_H,
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
    // Sits exactly where a stuck section header sat, over the top of the list,
    // opaque so the cards pass underneath it. Same metrics as sectionHeader
    // plus the list's own horizontal padding, so the in-list header slides
    // under it without shifting sideways.
    pinnedHeader: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 2,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: theme.background,
        paddingTop: 15,
        paddingBottom: 8,
        paddingHorizontal: 20,
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
        // The card's own fill, so it never depends on the glow's animated style
        // landing. Reanimated's synchronouslyUpdateUIProps fails routinely for
        // cells this list is creating and destroying mid-scroll, and when it
        // did, the card was left with no backgroundColor at all and showed the
        // page through. The animated style still overrides this while a card is
        // lit; a dropped update now costs a glow, not the card.
        backgroundColor: theme.surface,
    },
    // Sits under the card's content and over its fill, clipped to the same
    // radius. Absolute so it costs no layout.
    cardGlow: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: 16,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        // Tall enough for the PR badge, which is 1dp taller than a bare title.
        // Pinning it means a card's height does not depend on having a PR.
        height: CARD_HEADER_H,
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
        // One line, always. Wrapping was worth 21.33dp and could not be
        // predicted without measuring the text. The gap is 6 rather than 8 to
        // buy back the width that costs: the widest real row measures about
        // 282dp against 292 available, so the shrink below stays inert.
        flexWrap: 'nowrap',
        gap: 6,
        height: CARD_META_H,
        marginBottom: 12,
    },
    metaItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    // Only the last two give way if a row ever does run out of room, and they
    // ellipsize rather than wrap.
    metaItemFlexible: {
        flexShrink: 1,
        minWidth: 0,
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
        gap: CARD_ROW_GAP,
    },
    summaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        height: CARD_ROW_H,
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
        // lineHeight rather than padding, so the one line sits centred in a box
        // of exactly the height getItemLayout is told about. No marginTop: it
        // is a child of summaryList, whose gap already separates it from the
        // last row -- adding one put 8dp there and 4 in the arithmetic.
        height: CARD_MORE_H,
        lineHeight: CARD_MORE_H,
        fontStyle: 'italic',
    },

    // ── Context menu ──────────────────────────────────────────────────────────
    contextMenu: {
        position: 'absolute',
        width: 230,
        backgroundColor: theme.surfaceElevated || theme.surface,
        borderRadius: 14,
        overflow: 'hidden',
        // Deliberately heavier than a card: this floats over the page.
        boxShadow: '0px 10px 28px rgba(0, 0, 0, 0.22)',
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
