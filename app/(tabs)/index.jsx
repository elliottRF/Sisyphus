import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Dimensions, AppState, Linking } from 'react-native'
import Animated, { FadeInDown, FadeOutDown, LinearTransition, useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useScrollToTop } from '@react-navigation/native';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
// FlatList from the sheet library is pre-wired for scroll/drag coordination.
import ActionSheet, { FlatList } from "react-native-actions-sheet";

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Body from "react-native-body-highlighter";
import { fetchRecentMuscleUsage, getPinnedExercises, pinExercise, fetchExercises, fetchExerciseWorkoutCounts, getLatestWorkoutSession } from '../../components/db';
import * as StoreReview from 'expo-store-review';
import { FONTS, RADIUS, isLightTheme, getThemedShadow, withAlpha } from '../../constants/theme';
import { computeMuscleScores, slugRecoveryPercent, SETS_CAP } from '../../utils/recovery';
import { Feather } from '@expo/vector-icons';
import PRGraphCard from '../../components/PRGraphCard';
import BodyweightGraphCard from '../../components/bodyweightGraphCard';
import MuscleRadarChart from '../../components/MuscleRadarChart';
import ReadinessCard from '../../components/ReadinessCard';
import { useTheme } from '../../context/ThemeContext';
import { AppEvents, on, off } from '../../utils/events';
import { muscleMapping, majorMuscles } from '../../constants/muscles';
import Fuse from 'fuse.js';


const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Review prompt config ───────────────────────────────────────────────────
// Ask for a Play Store rating only once the user is clearly engaged, and never
// nag: dismissing snoozes it, repeated dismissals stop it, rating ends it.
const REVIEW_MIN_WORKOUTS = 10;     // logged workouts before we ask
const REVIEW_SNOOZE_DAYS = 21;      // wait this long after a dismissal
const REVIEW_MAX_DISMISSALS = 3;    // give up after this many dismissals
const PLAY_STORE_PACKAGE = 'com.elliottr.sisyphus';

// Elapsed-time ticker for the live workout banner.
const LiveTimer = ({ startTime, style }) => {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (!startTime) return;
        const update = () => {
            const diff = Date.now() - new Date(startTime).getTime();
            setElapsed(Math.max(0, Math.floor(diff / 1000)));
        };
        // Tick only while foregrounded (don't churn every second for a day in
        // the background); resync immediately on return.
        let interval = null;
        const start = () => { if (interval) return; update(); interval = setInterval(update, 1000); };
        const stop = () => { if (interval) { clearInterval(interval); interval = null; } };
        if (AppState.currentState === 'active') start();
        const sub = AppState.addEventListener('change', s => (s === 'active' ? start() : stop()));
        return () => { sub.remove(); stop(); };
    }, [startTime]);

    const h = Math.floor(elapsed / 3600);
    const m = Math.floor((elapsed % 3600) / 60);
    const s = elapsed % 60;
    const text = h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${m}:${String(s).padStart(2, '0')}`;

    return <Text style={style}>{text}</Text>;
};


const Home = () => {
    const insets = useSafeAreaInsets();
    const { theme, gender, accessoryWeight, workoutInProgress, workoutStartTime, settingsLoaded } = useTheme();
    const styles = getStyles(theme);

    const [bodyData, setBodyData] = useState([]);
    const [pinnedExercises, setPinnedExercises] = useState([]);
    const [allExercises, setAllExercises] = useState([]);
    const [showBodyWeight, setShowBodyWeight] = useState(false);
    const [showMuscleRadar, setShowMuscleRadar] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [allMusclesSorted, setAllMusclesSorted] = useState([]);
    const [workoutCounts, setWorkoutCounts] = useState(new Map());
    const [liveWorkout, setLiveWorkout] = useState(null); // {title, done, total}
    const [showReview, setShowReview] = useState(false);

    const actionSheetRef = useRef(null);
    const router = useRouter();
    const scrollRef = useRef(null);
    const readinessCardRef = useRef(null);

    const [muscleStatsData, setMuscleStatsData] = useState({});
    const [majorMuscleList, setMajorMuscleList] = useState([]);
    const [usageData, setUsageData] = useState([]);
    // Guards against out-of-order muscle loads: on cold launch accessoryWeight
    // is the default (0.5) until prefs load, so two loads can race and the
    // slower (stale) one could land last. Only the latest request commits.
    const muscleReqRef = useRef(0);
    // One-time fade-in for the body diagram + recovery headline once real data
    // lands, so it doesn't snap from empty/default to filled on cold launch.
    const muscleFade = useSharedValue(0);
    const muscleFadeStyle = useAnimatedStyle(() => ({ opacity: muscleFade.value }));
    useEffect(() => {
        if (bodyData.length > 0) muscleFade.value = withTiming(1, { duration: 320 });
    }, [bodyData, muscleFade]);
    useScrollToTop(scrollRef);

    useEffect(() => {
        loadMuscleData();
        loadPinnedExercises();
        loadModulePrefs();
        fetchExerciseWorkoutCounts().then(setWorkoutCounts);
    }, [accessoryWeight, settingsLoaded]);

    useFocusEffect(
        React.useCallback(() => {
            loadModulePrefs();
            loadMuscleData();
            loadPinnedExercises();
            // workoutCounts (a full-table GROUP BY) is only needed by the
            // add-graph sheet, which fetches it fresh in handleAddGraph — so it
            // doesn't belong on every Home focus.

            // Live workout banner data — the Current tab persists the active
            // workout on every change, so this is fresh whenever Home focuses.
            if (workoutInProgress) {
                AsyncStorage.getItem('@currentWorkout').then(stored => {
                    if (!stored) { setLiveWorkout(null); return; }
                    try {
                        const { workout, workoutTitle } = JSON.parse(stored);
                        let done = 0;
                        let total = 0;
                        (workout || []).forEach(group => group.exercises.forEach(ex => ex.sets.forEach(set => {
                            total++;
                            if (set.completed) done++;
                        })));
                        setLiveWorkout({ title: workoutTitle || 'Workout', done, total });
                    } catch (e) {
                        setLiveWorkout(null);
                    }
                });
            } else {
                setLiveWorkout(null);
            }
        }, [accessoryWeight, workoutInProgress, settingsLoaded])
    );

    useEffect(() => {
        const handler = () => {
            loadMuscleData();
            loadPinnedExercises();
        };
        on(AppEvents.WORKOUT_COMPLETED, handler);
        on(AppEvents.WORKOUT_DATA_IMPORTED, handler);
        return () => {
            off(AppEvents.WORKOUT_COMPLETED, handler);
            off(AppEvents.WORKOUT_DATA_IMPORTED, handler);
        };
    }, [accessoryWeight, settingsLoaded]);

    // Decide whether to show the "leave a review" prompt (see config at top).
    const checkReviewPrompt = async () => {
        try {
            if (workoutInProgress) { setShowReview(false); return; }
            if (await AsyncStorage.getItem('review_done') === 'true') { setShowReview(false); return; }
            const dismissCount = parseInt(await AsyncStorage.getItem('review_dismiss_count') || '0', 10);
            if (dismissCount >= REVIEW_MAX_DISMISSALS) { setShowReview(false); return; }
            const dismissedAt = parseInt(await AsyncStorage.getItem('review_dismissed_at') || '0', 10);
            if (dismissedAt && Date.now() - dismissedAt < REVIEW_SNOOZE_DAYS * 86400000) { setShowReview(false); return; }
            const latest = await getLatestWorkoutSession();
            setShowReview((latest || 0) >= REVIEW_MIN_WORKOUTS);
        } catch (e) {
            setShowReview(false);
        }
    };

    useEffect(() => {
        if (settingsLoaded) checkReviewPrompt();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workoutInProgress, settingsLoaded]);

    const handleRateApp = async () => {
        setShowReview(false);
        try { await AsyncStorage.setItem('review_done', 'true'); } catch (e) { }

        // Prefer Google's native in-app review dialog (no leaving the app).
        try {
            if (await StoreReview.isAvailableAsync()) {
                await StoreReview.requestReview();
                return;
            }
        } catch (e) {
            // fall through to opening the store listing
        }

        // Fallback: open the Play Store listing directly.
        const market = `market://details?id=${PLAY_STORE_PACKAGE}`;
        const web = `https://play.google.com/store/apps/details?id=${PLAY_STORE_PACKAGE}`;
        try {
            const canMarket = await Linking.canOpenURL(market);
            await Linking.openURL(canMarket ? market : web);
        } catch (e) {
            try { await Linking.openURL(web); } catch (err) { }
        }
    };

    const handleDismissReview = async () => {
        setShowReview(false);
        try {
            const count = parseInt(await AsyncStorage.getItem('review_dismiss_count') || '0', 10) + 1;
            await AsyncStorage.setItem('review_dismiss_count', String(count));
            await AsyncStorage.setItem('review_dismissed_at', String(Date.now()));
        } catch (e) { }
    };

    const loadModulePrefs = async () => {
        try {
            const bwVal = await AsyncStorage.getItem('settings_showBodyWeight');
            setShowBodyWeight(bwVal === 'true');
            const mrVal = await AsyncStorage.getItem('settings_showMuscleRadar');
            setShowMuscleRadar(mrVal === 'true');
        } catch (e) {
            console.error("Failed to load module prefs", e);
        }
    };

    const loadMuscleData = async () => {
        // Don't compute with the default accessoryWeight (0.5) before prefs have
        // loaded — that's what made the body diagram briefly show stale data.
        if (!settingsLoaded) return;
        const reqId = ++muscleReqRef.current;
        try {
            const usageData = await fetchRecentMuscleUsage(5);
            if (reqId !== muscleReqRef.current) return; // superseded by a newer load
            setUsageData(usageData);
            // Shared fatigue model (utils/recovery) — also drives the
            // template readiness badges on the Current tab.
            const muscleStats = computeMuscleScores(usageData, accessoryWeight);

            const allMusclesWithPercent = majorMuscles.map(muscle => {
                const maxScore = muscle.slugs.reduce((max, slug) => {
                    const score = muscleStats[slug] ?? 0;
                    return score > max ? score : max;
                }, 0);

                const percent = Math.max(0, Math.min(100, Math.round(100 - (maxScore / SETS_CAP) * 100)));
                return { label: muscle.label, percent };
            });

            allMusclesWithPercent.sort((a, b) => a.percent - b.percent);
            setAllMusclesSorted(allMusclesWithPercent);
            setMajorMuscleList(majorMuscles);

            const ALL_MUSCLE_SLUGS = [
                'chest', 'quadriceps', 'triceps', 'biceps', 'hamstring',
                'upper-back', 'lower-back', 'deltoids', 'gluteal', 'forearm',
                'trapezius', 'calves', 'abs', 'adductors', 'obliques',
                'tibialis', 'abductors', 'neck', 'hands', 'feet', 'knees', 'ankles'
            ];

            const newBodyData = ALL_MUSCLE_SLUGS.map(slug => {
                const score = muscleStats[slug] ?? 0;
                const percent = Math.max(0, Math.min(100, Math.round(100 - (score / SETS_CAP) * 100)));

                if (percent <= 60) return { slug, intensity: 3 };
                if (percent < 80) return { slug, intensity: 2 };
                return { slug, intensity: 1 };
            });

            setBodyData(newBodyData);

        } catch (error) {
            console.error("Failed to load muscle usage data:", error);
        }
    };

    const loadPinnedExercises = async () => {
        try {
            const pinned = await getPinnedExercises();
            setPinnedExercises(pinned);
        } catch (error) {
            console.error("Error loading pinned exercises:", error);
        }
    };


    const handleAddGraph = async () => {
        if (allExercises.length === 0) {
            try {
                const exercises = await fetchExercises();
                setAllExercises(exercises);
            } catch (error) {
                console.error("Error fetching exercises:", error);
            }
        }
        fetchExerciseWorkoutCounts().then(setWorkoutCounts);
        actionSheetRef.current?.show();
    };

    const handlePinExercise = async (exercise) => {
        try {
            await pinExercise(exercise.exerciseID);
            loadPinnedExercises();
            actionSheetRef.current?.hide();
            setSearchQuery('');
        } catch (error) {
            console.error("Error pinning exercise:", error);
        }
    };

    const toggleBodyWeightGraph = async () => {
        try {
            const newState = !showBodyWeight;
            setShowBodyWeight(newState);
            await AsyncStorage.setItem('settings_showBodyWeight', String(newState));
        } catch (e) {
            console.error("Error saving body weight pref", e);
        }
    };

    const toggleMuscleRadar = async () => {
        try {
            const newState = !showMuscleRadar;
            setShowMuscleRadar(newState);
            await AsyncStorage.setItem('settings_showMuscleRadar', String(newState));
        } catch (e) {
            console.error("Error saving muscle radar pref", e);
        }
    };

    const handleBodyPartPress = (bodyPart) => {
        const slug = bodyPart?.slug;
        if (!slug) return;
        const matched = majorMuscles.find(m => m.slugs.includes(slug));
        if (matched) readinessCardRef.current?.openMuscleByLabel(matched.label);
    };

    const fuse = useMemo(() => {
        return new Fuse(allExercises, {
            keys: ['name'],
            threshold: 0.35,
            includeScore: true,
            ignoreLocation: true,
        });
    }, [allExercises]);

    const filteredExercises = useMemo(() => {
        if (!searchQuery.trim()) {
            return [...allExercises].sort((a, b) => {
                const countA = workoutCounts.get(a.exerciseID) || 0;
                const countB = workoutCounts.get(b.exerciseID) || 0;
                if (countB !== countA) return countB - countA;
                return a.name.localeCompare(b.name);
            });
        }

        const searchResults = fuse.search(searchQuery);

        return searchResults
            .sort((a, b) => {
                if (Math.abs(a.score - b.score) > 0.1) {
                    return a.score - b.score;
                }
                const countA = workoutCounts.get(a.item.exerciseID) || 0;
                const countB = workoutCounts.get(b.item.exerciseID) || 0;
                if (countB !== countA) return countB - countA;
                return a.item.name.localeCompare(b.item.name);
            })
            .map(r => r.item);
    }, [searchQuery, allExercises, fuse]);


    // ── Recovery summary: turns the muscle grid into one headline + bar ──────
    const recoverySummary = useMemo(() => {
        const fatigued = allMusclesSorted.filter(m => m.percent <= 60);
        const recovering = allMusclesSorted.filter(m => m.percent > 60 && m.percent < 80);
        const ready = allMusclesSorted.filter(m => m.percent >= 80);

        let headline;
        if (allMusclesSorted.length === 0) {
            headline = 'Log a workout to start tracking recovery.';
        } else if (fatigued.length === 0 && recovering.length === 0) {
            headline = 'Fully recovered — green light to train hard.';
        } else if (fatigued.length === 0) {
            headline = recovering.length === 1
                ? `${recovering[0].label} is still recovering — everything else is ready.`
                : `${recovering.length} groups still recovering — everything else is ready.`;
        } else if (fatigued.length === 1) {
            headline = `${fatigued[0].label} needs rest — plan around it.`;
        } else if (fatigued.length === 2) {
            headline = `${fatigued[0].label} & ${fatigued[1].label} need rest.`;
        } else {
            headline = `${fatigued[0].label}, ${fatigued[1].label} + ${fatigued.length - 2} more need rest.`;
        }

        return {
            headline,
            segments: [
                { key: 'ready', count: ready.length, color: theme.success, label: 'Ready' },
                { key: 'recovering', count: recovering.length, color: theme.warning, label: 'Recovering' },
                { key: 'fatigued', count: fatigued.length, color: theme.danger, label: 'Fatigued' },
            ].filter(s => s.count > 0),
            total: allMusclesSorted.length,
        };
    }, [allMusclesSorted, theme]);

    const isDynamic = theme.type === 'dynamic';
    const bodyColors = isDynamic
        ? [theme.bodyFill, '#2DC4B655', '#2DC4B6CC']
        : [theme.bodyFill, `${theme.primary}55`, `${theme.primary}CC`];

    const safeBorder = isDynamic ? '#4d4d4dff' : theme.border;
    const cardWidth = (SCREEN_WIDTH - 32 - 12) / 2;

    // Force both SVGs to identical width so front/back are symmetric
    const altBodyPanelWidth = Math.floor((SCREEN_WIDTH - 32 - 1) / 2); // 1px for divider
    const altBodyWidth = altBodyPanelWidth - 46; // tighter so the whole page fits one screen
    const BODY_NATURAL_WIDTH_ALT = 170;
    // The female SVG is taller AND its artwork (hair) extends above the male
    // asset's bounds, so it needs a smaller scale and almost no crop — the
    // male crop margin slices her head off.
    const isFemaleBody = gender === 'female';
    const genderScale = isFemaleBody ? 0.86 : 1;
    const altBodyScale = (altBodyWidth / BODY_NATURAL_WIDTH_ALT) * genderScale;
    const bodyCropStyle = isFemaleBody ? styles.altBodyCropFemale : styles.altBodyCrop;

    return (
        <View style={[styles.container, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
            <ScrollView
                ref={scrollRef}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollViewContent}
                keyboardShouldPersistTaps="handled"
            >
                <Animated.View entering={FadeInDown.duration(400).delay(0).springify()} style={styles.header}>
                    <View>
                        <Text style={styles.eyebrow}>
                            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}
                        </Text>
                        <Text style={styles.greeting}>Recovery</Text>
                    </View>
                    <View style={styles.headerButtons}>
                        <TouchableOpacity onPress={() => router.push('/settings')} style={styles.headerIconButton}>
                            <Feather name="settings" size={17} color={theme.textSecondary} />
                        </TouchableOpacity>
                    </View>
                </Animated.View>

                {/* ── Live workout banner ───────────────────────────────────── */}
                {workoutInProgress && workoutStartTime && (
                    <Animated.View entering={FadeInDown.duration(400).delay(40).springify()}>
                        <TouchableOpacity
                            style={styles.liveCard}
                            onPress={() => router.navigate('/current')}
                            activeOpacity={0.85}
                        >
                            <View style={styles.liveDot} />
                            <View style={{ flex: 1 }}>
                                <Text style={styles.liveEyebrow}>WORKOUT IN PROGRESS</Text>
                                <Text style={styles.liveTitle} numberOfLines={1}>
                                    {liveWorkout?.title || 'Workout'}
                                </Text>
                                {liveWorkout && liveWorkout.total > 0 && (
                                    <Text style={styles.liveMeta}>
                                        {liveWorkout.done} of {liveWorkout.total} sets done
                                    </Text>
                                )}
                            </View>
                            <View style={styles.liveRight}>
                                <LiveTimer startTime={workoutStartTime} style={styles.liveTimer} />
                                <Feather name="chevron-right" size={18} color={theme.textSecondary} />
                            </View>
                        </TouchableOpacity>
                    </Animated.View>
                )}

                {/* ── Review prompt (same slot as the live banner; mutually
                    exclusive — never shown during an active workout) ────────── */}
                {showReview && !workoutInProgress && (
                    <Animated.View entering={FadeInDown.duration(400).delay(40).springify()}>
                        <TouchableOpacity style={styles.liveCard} onPress={handleRateApp} activeOpacity={0.85}>
                            <Feather name="star" size={20} color={theme.warning} />
                            <View style={{ flex: 1 }}>
                                <Text style={styles.liveEyebrow}>ENJOYING SISYPHUS?</Text>
                                <Text style={styles.liveTitle} numberOfLines={1}>Leave a review</Text>
                                <Text style={styles.liveMeta}>A quick rating really helps the app grow.</Text>
                            </View>
                            <View style={styles.liveRight}>
                                <TouchableOpacity
                                    onPress={handleDismissReview}
                                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                                >
                                    <Feather name="x" size={18} color={theme.textSecondary} />
                                </TouchableOpacity>
                                <Feather name="chevron-right" size={18} color={theme.textSecondary} />
                            </View>
                        </TouchableOpacity>
                    </Animated.View>
                )}

                {/* ── Dual Body ──────────────────────────────────────────────── */}
                {/* 4px below the header (→16 total, matching History/Current) when
                    it's the first card; a normal gap when a banner (live workout
                    or review prompt) sits above it. */}
                <Animated.View entering={FadeInDown.duration(450).delay(80).springify()} style={{ marginTop: ((workoutInProgress && workoutStartTime) || showReview) ? 12 : 4 }}>
                        <View style={styles.altBodyCard}>
                            <View style={styles.altLegendContainer}>
                                <Text style={styles.altCardTitle}>Fatigue Status</Text>
                                <View style={{ flexDirection: 'row', gap: 16 }}>
                                    <View style={styles.altLegendItem}>
                                        <View style={[styles.altLegendDot, { backgroundColor: bodyColors[2] }]} />
                                        <Text style={styles.altLegendText}>High</Text>
                                    </View>
                                    <View style={styles.altLegendItem}>
                                        <View style={[styles.altLegendDot, { backgroundColor: bodyColors[1] }]} />
                                        <Text style={styles.altLegendText}>Low</Text>
                                    </View>
                                </View>
                            </View>

                            <Animated.View style={muscleFadeStyle}>
                            <View style={styles.altBodyContentRow}>
                                <View style={[styles.altBodyPanel, { width: altBodyPanelWidth }]}>
                                    <View style={bodyCropStyle}>
                                        <Body
                                            data={bodyData}
                                            gender={gender}
                                            side="front"
                                            scale={altBodyScale}
                                            border={safeBorder}
                                            colors={bodyColors}
                                            width={altBodyWidth}
                                            onBodyPartPress={handleBodyPartPress}
                                        />
                                    </View>
                                </View>
                                <View style={styles.altBodyDivider} />
                                <View style={[styles.altBodyPanel, { width: altBodyPanelWidth }]}>
                                    <View style={bodyCropStyle}>
                                        <Body
                                            data={bodyData}
                                            gender={gender}
                                            side="back"
                                            scale={altBodyScale}
                                            border={safeBorder}
                                            colors={bodyColors}
                                            width={altBodyWidth}
                                            onBodyPartPress={handleBodyPartPress}
                                        />
                                    </View>
                                </View>
                            </View>

                            {/* Insight footer: one sentence + the recovery split */}
                            <View style={styles.heroFooter}>
                                <Text style={styles.heroHeadline}>{recoverySummary.headline}</Text>
                                {recoverySummary.total > 0 && (
                                    <>
                                        <View style={styles.statusTrack}>
                                            {recoverySummary.segments.map(seg => (
                                                <View
                                                    key={seg.key}
                                                    style={[styles.statusSegment, { flex: seg.count, backgroundColor: seg.color }]}
                                                />
                                            ))}
                                        </View>
                                        <View style={styles.statusCountsRow}>
                                            {recoverySummary.segments.map(seg => (
                                                <View key={seg.key} style={styles.statusCountItem}>
                                                    <View style={[styles.statusDot, { backgroundColor: seg.color }]} />
                                                    <Text style={styles.statusCountText}>
                                                        <Text style={[styles.statusCountNum, { color: theme.text }]}>{seg.count}</Text>
                                                        {'  '}{seg.label}
                                                    </Text>
                                                </View>
                                            ))}
                                        </View>
                                    </>
                                )}
                            </View>
                            </Animated.View>
                        </View>

                        <ReadinessCard
                            ref={readinessCardRef}
                            allMusclesSorted={allMusclesSorted}
                            cardWidth={cardWidth}
                            usageData={usageData}
                            horizontal
                        />
                    </Animated.View>

                <Animated.View entering={FadeInDown.duration(400).delay(240).springify()} style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Progress Tracker</Text>
                </Animated.View>

                {showMuscleRadar && (
                    <Animated.View layout={LinearTransition} entering={FadeInDown.duration(400).delay(300).springify()}>
                        <MuscleRadarChart />
                    </Animated.View>
                )}
                {showBodyWeight && (
                    <Animated.View layout={LinearTransition} entering={FadeInDown.duration(400).delay(320).springify()}>
                        <BodyweightGraphCard theme={theme} />
                    </Animated.View>
                )}

                {pinnedExercises.map((exercise, index) => (
                    <Animated.View
                        key={exercise.exerciseID}
                        entering={FadeInDown.duration(400).delay(340 + index * 60).springify()}
                        exiting={FadeOutDown.duration(300)}
                        layout={LinearTransition}
                    >
                        <PRGraphCard
                            exerciseID={exercise.exerciseID}
                            exerciseName={exercise.name}
                            onRemove={loadPinnedExercises}
                        />
                    </Animated.View>
                ))}

                <Animated.View layout={LinearTransition} entering={FadeInDown.duration(400).delay(400).springify()}>
                    <TouchableOpacity onPress={handleAddGraph} style={styles.addGraphButton} activeOpacity={0.6}>
                        <Feather name="plus" size={18} color={theme.primary} />
                        <Text style={styles.addGraphText}>Add Tracker</Text>
                    </TouchableOpacity>
                </Animated.View>
            </ScrollView>

            <ActionSheet ref={actionSheetRef} gestureEnabled={true} containerStyle={styles.actionSheetContainer} indicatorStyle={styles.indicator} onClose={() => setSearchQuery('')}>
                <View style={styles.contentContainer}>
                    <View style={styles.actionSheetHeader}>
                        <Text style={styles.actionSheetTitle}>Add Module</Text>
                    </View>

                    <View style={styles.modulesContainer}>
                        <TouchableOpacity
                            style={[
                                styles.moduleCard,
                                {
                                    borderColor: showBodyWeight ? theme.primary : theme.overlayBorder,
                                    backgroundColor: showBodyWeight ? theme.overlayMedium : theme.overlaySubtle,
                                }
                            ]}
                            onPress={toggleBodyWeightGraph}
                            activeOpacity={0.8}
                        >
                            <Feather name="activity" size={28} color={showBodyWeight ? theme.primary : theme.textSecondary} />
                            <Text style={[styles.moduleText, showBodyWeight && { color: theme.primary, fontFamily: FONTS.bold }]}>Body Weight</Text>
                            {showBodyWeight && (
                                <View style={styles.checkBadge}>
                                    <Feather name="check" size={10} color="white" />
                                </View>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                styles.moduleCard,
                                {
                                    borderColor: showMuscleRadar ? theme.primary : theme.overlayBorder,
                                    backgroundColor: showMuscleRadar ? theme.overlayMedium : theme.overlaySubtle,
                                }
                            ]}
                            onPress={toggleMuscleRadar}
                            activeOpacity={0.8}
                        >
                            <Feather name="pie-chart" size={28} color={showMuscleRadar ? theme.primary : theme.textSecondary} />
                            <Text style={[styles.moduleText, showMuscleRadar && { color: theme.primary, fontFamily: FONTS.bold }]}>Muscle Balance</Text>
                            {showMuscleRadar && (
                                <View style={styles.checkBadge}>
                                    <Feather name="check" size={10} color="white" />
                                </View>
                            )}
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.subHeader}>Exercises</Text>
                    <View style={styles.searchContainer}>
                        <View style={styles.searchBar}>
                            <Feather name="search" size={20} color={theme.textSecondary} style={styles.searchIcon} />
                            <TextInput
                                style={styles.searchInput}
                                placeholder="Search exercises to pin..."
                                placeholderTextColor={theme.textSecondary}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                            />
                        </View>
                    </View>
                    <FlatList
                        data={filteredExercises}
                        keyExtractor={item => item.exerciseID.toString()}
                        showsVerticalScrollIndicator={false}
                        keyboardDismissMode="on-drag"
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={styles.exerciseCard}
                                onPress={() => handlePinExercise(item)}
                                activeOpacity={0.7}
                            >
                                <View style={styles.exerciseContent}>
                                    <View style={{ flex: 1, marginRight: 12 }}>
                                        <Text style={styles.exerciseName}>{item.name}</Text>
                                        {workoutCounts.has(item.exerciseID) && (
                                            <Text style={styles.usageCount}>
                                                {workoutCounts.get(item.exerciseID)} {workoutCounts.get(item.exerciseID) === 1 ? 'workout' : 'workouts'}
                                            </Text>
                                        )}
                                    </View>
                                    <Feather name="plus" size={20} color={theme.primary} />
                                </View>
                            </TouchableOpacity>
                        )}
                        contentContainerStyle={styles.listContent}
                        ListEmptyComponent={
                            <View style={{ padding: 20, alignItems: 'center' }}>
                                <Text style={{ color: theme.textSecondary }}>
                                    {allExercises.length === 0 ? "Loading exercises..." : "No exercises found"}
                                </Text>
                            </View>
                        }
                        keyboardShouldPersistTaps="always"
                        style={styles.list}
                    />
                </View>
            </ActionSheet>
        </View>
    );
};

const getStyles = (theme) => {
    const lightTheme = isLightTheme(theme);
    // Cards separate from the canvas by surface colour (dark) or a soft
    // diffuse shadow (light) — never by visible borders.
    const cardShadow = lightTheme ? getThemedShadow(theme, 'small') : null;

    return StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.background
    },
    scrollViewContent: {
        paddingBottom: 100
    },
    header: {
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start'
    },
    headerButtons: {
        flexDirection: 'row',
        gap: 10
    },
    headerIconButton: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: theme.overlayInput,
        alignItems: 'center',
        justifyContent: 'center',
    },
    eyebrow: {
        fontSize: 12,
        fontFamily: FONTS.semiBold,
        color: theme.textSecondary,
        letterSpacing: 1.1,
        marginBottom: 2,
    },
    greeting: {
        fontSize: 32,
        fontFamily: FONTS.bold,
        letterSpacing: -0.6,
        color: theme.text
    },

    // ── Live workout banner ───────────────────────────────────────────────────
    liveCard: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 16,
        marginTop: 4,
        backgroundColor: withAlpha(theme.primary, lightTheme ? 0.08 : 0.14),
        borderRadius: RADIUS.l,
        paddingVertical: 13,
        paddingHorizontal: 16,
        gap: 12,
    },
    liveDot: {
        width: 9,
        height: 9,
        borderRadius: 4.5,
        backgroundColor: theme.success,
    },
    liveEyebrow: {
        fontSize: 10.5,
        fontFamily: FONTS.semiBold,
        color: theme.primary,
        letterSpacing: 1,
        marginBottom: 2,
    },
    liveTitle: {
        fontSize: 16,
        fontFamily: FONTS.bold,
        letterSpacing: -0.2,
        color: theme.text,
    },
    liveMeta: {
        fontSize: 12,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
        marginTop: 1,
    },
    liveRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    liveTimer: {
        fontSize: 19,
        fontFamily: FONTS.bold,
        letterSpacing: -0.3,
        color: theme.primary,
        fontVariant: ['tabular-nums'],
    },

    // ── Body card ─────────────────────────────────────────────────────────────
    altBodyCard: {
        marginHorizontal: 16,
        marginBottom: 12,
        backgroundColor: theme.surface,
        borderRadius: RADIUS.l,
        ...cardShadow,
        overflow: 'hidden',
    },
    altBodyContentRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    altBodyPanel: {
        alignItems: 'center',
        paddingTop: 0,
        paddingBottom: 0,
        overflow: 'hidden',
    },
    altBodyCrop: {
        marginVertical: -16,
    },
    altBodyCropFemale: {
        marginVertical: -2,
    },
    altBodyDivider: {
        width: 1,
        height: 220,
        backgroundColor: theme.border,
        opacity: 0.3,
    },
    altLegendContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 16,
        paddingHorizontal: 20,
        marginBottom: -8,
    },
    altCardTitle: {
        fontSize: 12,
        fontFamily: FONTS.semiBold,
        color: theme.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
    },
    altLegendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    altLegendDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    altLegendText: {
        fontSize: 11,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
        letterSpacing: 0.2,
    },

    // ── Hero insight footer ───────────────────────────────────────────────────
    heroFooter: {
        paddingHorizontal: 18,
        paddingTop: 4,
        paddingBottom: 14,
        gap: 9,
    },
    heroHeadline: {
        fontSize: 15,
        fontFamily: FONTS.semiBold,
        letterSpacing: -0.2,
        lineHeight: 20,
        color: theme.text,
    },
    statusTrack: {
        flexDirection: 'row',
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
        gap: 3,
    },
    statusSegment: {
        height: '100%',
        borderRadius: 3,
    },
    statusCountsRow: {
        flexDirection: 'row',
        gap: 16,
    },
    statusCountItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    statusDot: {
        width: 7,
        height: 7,
        borderRadius: 3.5,
    },
    statusCountText: {
        fontSize: 12,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
    },
    statusCountNum: {
        fontFamily: FONTS.bold,
        fontSize: 13,
    },



    // ── Rest ──────────────────────────────────────────────────────────────────
    sectionHeader: {
        paddingHorizontal: 20,
        marginTop: 16,
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 22,
        fontFamily: FONTS.bold,
        letterSpacing: -0.4,
        color: theme.text
    },
    addGraphButton: {
        marginHorizontal: 16,
        marginBottom: 30,
        borderRadius: RADIUS.l,
        backgroundColor: theme.surface,
        ...cardShadow,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 15,
        gap: 7,
    },
    addGraphText: {
        fontSize: 16,
        fontFamily: FONTS.semiBold,
        color: theme.primary
    },
    actionSheetContainer: {
        // Sheet-coloured (not transparent) so the bottom safe-area strip under
        // the Android gesture bar isn't a gap showing the backdrop. Hardcoded
        // for the dynamic theme since the sheet container can't take a
        // PlatformColor.
        backgroundColor: theme.type === 'dynamic' ? '#1e1e1e' : theme.surface,
        height: '100%'
    },
    indicator: {
        backgroundColor: theme.overlayInputFocused,
        width: 36,
    },
    contentContainer: {
        height: '100%',
        backgroundColor: theme.surface,
        borderTopLeftRadius: RADIUS.l,
        borderTopRightRadius: RADIUS.l,
        overflow: 'hidden',
    },
    searchContainer: {
        paddingHorizontal: 16,
        paddingBottom: 12,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.overlayInput,
        borderRadius: RADIUS.m,
        paddingHorizontal: 12,
        height: 40,
    },
    searchIcon: {
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        color: theme.text,
        fontFamily: FONTS.regular,
        fontSize: 16,
    },
    listContent: {
        padding: 16,
        paddingTop: 4,
        paddingBottom: 40,
    },
    exerciseCard: {
        backgroundColor: theme.overlaySubtle,
        borderRadius: RADIUS.m,
        marginBottom: 8,
        paddingVertical: 14,
        paddingHorizontal: 16,
    },
    exerciseContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    exerciseName: {
        color: theme.text,
        fontSize: 16,
        fontFamily: FONTS.semiBold,
    },
    usageCount: {
        fontSize: 13,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
        marginTop: 2,
    },
    actionSheetHeader: {
        padding: 20,
        paddingBottom: 10,
    },
    actionSheetTitle: {
        fontSize: 20,
        fontFamily: FONTS.bold,
        color: theme.text,
    },
    subHeader: {
        fontSize: 16,
        fontFamily: FONTS.semiBold,
        color: theme.text,
        marginLeft: 16,
        marginTop: 10,
        marginBottom: 10,
    },
    modulesContainer: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        gap: 16,
        marginBottom: 20,
    },
    moduleCard: {
        flex: 1,
        height: 104,
        borderRadius: RADIUS.l,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
    },
    moduleText: {
        fontSize: 14,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
    },
    checkBadge: {
        position: 'absolute',
        top: 10,
        right: 10,
        backgroundColor: theme.primary,
        width: 18,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
    },
    readinessContent: {
        flex: 1,
    },
    compactGroup: {
        flexDirection: 'column',
        marginBottom: 6,
        gap: 5,
    },
    muscleTagsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 4,
    },
    compactBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        alignSelf: 'flex-start',
        height: 20,
        justifyContent: 'center',
    },
    compactBadgeText: {
        fontSize: 10,
        fontFamily: FONTS.bold,
        letterSpacing: 0.5,
    },
    muscleTag: {
        backgroundColor: theme.overlayInputFocused,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: theme.border,
    },
    compactTagText: {
        fontSize: 13,
        fontFamily: FONTS.semiBold,
    },
    emptyReadyText: {
        fontSize: 13,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
        fontStyle: 'italic',
    },
    });
};

export default Home;