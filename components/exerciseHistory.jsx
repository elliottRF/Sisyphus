import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Animated } from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import Body from 'react-native-body-highlighter';

import { fetchExerciseHistory, fetchExercises, fetchWorkoutHistoryBySession, getLatestBodyWeight, getExerciseSnapshot, getCachedBodyWeight } from './db';
import { FONTS, SHADOWS } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import PRGraphCard from './PRGraphCard';
import { formatWeight, unitLabel } from '../utils/units';
import { customAlert } from '../utils/customAlert';
import { getExerciseSnapshotSync, parseStrengthRatios } from '../utils/exerciseSnapshots';
import { AppEvents, on, off } from '../utils/events';

import AsyncStorage from '@react-native-async-storage/async-storage';


// ─── Constants ────────────────────────────────────────────────────────────────

const TIER_LABELS = ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite'];
const TIER_COLORS = ['#E05555', '#E08C38', '#ffdd47', '#52B56E', '#8500b9'];

const ALL_MUSCLE_SLUGS = [
    'chest', 'quadriceps', 'triceps', 'biceps', 'hamstring',
    'upper-back', 'lower-back', 'deltoids', 'gluteal', 'forearm',
    'trapezius', 'calves', 'abs', 'adductors', 'obliques',
    'tibialis', 'abductors', 'neck', 'hands', 'feet', 'knees', 'ankles',
];

const DEFAULT_MUSCLE_TARGETS = ALL_MUSCLE_SLUGS.map(slug => ({ slug, intensity: 1 }));

const EMPTY_STATS = {
    totalSets: null, personalBest: null, totalVolume: null,
    maxDistance: null, bestPace: null,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const lightenColor = (color, percent) => {
    if (!color || typeof color !== 'string' || !color.startsWith('#')) return color;
    try {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.min(255, Math.max(0, (num >> 16) + amt));
        const G = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amt));
        const B = Math.min(255, Math.max(0, (num & 0x0000FF) + amt));
        return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
    } catch {
        return color;
    }
};

const splitMuscleString = (value) =>
    value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];

const buildFormattedTargets = (targetSlugs = [], accessorySlugs = []) => {
    const workedSlugs = new Set([...targetSlugs, ...accessorySlugs]);
    return [
        ...targetSlugs.map(slug => ({ slug: slug.trim().toLowerCase(), intensity: 3 })),
        ...accessorySlugs.map(slug => ({ slug: slug.trim().toLowerCase(), intensity: 2 })),
        ...ALL_MUSCLE_SLUGS
            .filter(slug => !workedSlugs.has(slug))
            .map(slug => ({ slug, intensity: 1 })),
    ];
};

const snapshotToExerciseRecord = (snapshot) => {
    if (!snapshot) return null;
    return {
        exerciseID: snapshot.exerciseID,
        name: snapshot.name,
        targetMuscle: snapshot.targetMuscle || '',
        accessoryMuscles: snapshot.accessoryMuscles || '',
        isCardio: snapshot.isCardio ? 1 : 0,
        isAssisted: snapshot.isAssisted ? 1 : 0,
        strengthRatios: JSON.stringify(snapshot.strengthRatios || []),
    };
};

const formatDate = (dateString) =>
    new Date(dateString).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });

// ─── Sub-components ───────────────────────────────────────────────────────────

const PRBadge = React.memo(({ type, theme }) => {
    const label = type === '1RM' ? '1RM' : type === 'VOL' ? 'Vol.' : 'Weight';
    const brightColor = lightenColor(theme.primary, 20);
    return (
        <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 6,
            paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1,
            backgroundColor: `${brightColor}25`, borderColor: `${brightColor}50`,
        }}>
            <MaterialCommunityIcons name="trophy" size={10} color={brightColor} />
            <Text style={{ fontSize: 9, fontFamily: FONTS.bold, color: brightColor }}>{label}</Text>
        </View>
    );
});

const SetNumberBadge = React.memo(({ type, number, theme }) => {
    const isWarmup = type === 'W';
    const isDrop = type === 'D';
    const bg = isWarmup ? 'rgba(253,203,110,0.2)' : isDrop ? 'rgba(116,185,255,0.15)' : theme.border;
    const color = isWarmup ? theme.warning : isDrop ? theme.info : theme.textSecondary;
    return (
        <View style={{ width: 24, height: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 6, marginRight: 10, backgroundColor: bg }}>
            <Text style={{ fontSize: isWarmup ? 10 : 11, fontFamily: FONTS.bold, color }}>{number}</Text>
        </View>
    );
});

const FadingStatText = React.memo(({ text, style, animateInitialPlaceholder = true }) => {
    const fadeAnim = useRef(new Animated.Value(1)).current;
    const [displayText, setDisplayText] = useState(text);

    useEffect(() => {
        if (text === displayText) return;
        const isPlaceholder = displayText == null || displayText === '—';
        if (isPlaceholder && !animateInitialPlaceholder) {
            setDisplayText(text);
            return;
        }
        Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start(() => {
            setDisplayText(text);
            Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
        });
    }, [text]);

    return <Animated.Text style={[style, { opacity: fadeAnim }]}>{displayText}</Animated.Text>;
});

const StrengthLegend = React.memo(({ currentTier, theme, strengthRatios, bw }) => {
    const { useImperial } = useTheme();

    const handlePress = (index, label) => {
        // 1. Check if bodyweight is missing or zero
        if (!bw) {
            customAlert(
                'Bodyweight Missing',
                'Please log your bodyweight in your profile to calculate strength targets.',
                [{ text: 'OK', style: 'default' }]
            );
            return;
        }

        // 2. Check if strength ratios exist for the exercise
        if (!strengthRatios?.[index]) {
            customAlert(
                'Information',
                "Strength standards for this exercise haven't been added yet.",
                [{ text: 'OK', style: 'default' }]
            );
            return;
        }

        // 3. Perform calculation
        const required = (bw * strengthRatios[index]).toFixed(1);

        customAlert(
            `${label} Target`,
            `1RM of ${formatWeight(required, useImperial)}${unitLabel(useImperial)} required at ${formatWeight(bw, useImperial)}${unitLabel(useImperial)} bodyweight.`,
            [{ text: 'Got it', style: 'default' }],
            { iconType: 'confirm' }
        );
    };

    return (
        <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', rowGap: 6, columnGap: 4, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14 }}>
            {TIER_LABELS.map((label, i) => {
                const tierNum = i + 1;
                const isActive = currentTier === tierNum || (currentTier === 0 && tierNum === 1);
                const isPast = currentTier != null && currentTier !== 0 && tierNum < currentTier;
                const isFuture = currentTier == null || (currentTier === 0 ? tierNum > 1 : tierNum > currentTier);
                return (
                    <TouchableOpacity
                        key={label}
                        activeOpacity={0.7}
                        onPress={() => handlePress(i, label)}
                        style={{
                            flexDirection: 'row', alignItems: 'center', gap: 5,
                            paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1,
                            borderColor: isActive ? TIER_COLORS[i] : 'transparent',
                            backgroundColor: isActive ? `${TIER_COLORS[i]}22` : 'transparent',
                            opacity: isFuture ? 0.38 : isPast ? 0.6 : 1,
                        }}
                    >
                        <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: TIER_COLORS[i] }} />
                        <Text style={{ fontSize: 11, fontFamily: isActive ? FONTS.bold : FONTS.medium, color: isActive ? TIER_COLORS[i] : theme.textSecondary }}>
                            {label}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
});

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

const HistorySessionCard = React.memo(({ session, exercises, theme, styles, onSessionSelect, exercisesList, animationKey }) => {
    const [isLoading, setIsLoading] = useState(false);
    const { useImperial } = useTheme();
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const entranceOpacity = useRef(new Animated.Value(0)).current;
    const entranceTranslateY = useRef(new Animated.Value(18)).current;

    useEffect(() => {
        entranceOpacity.setValue(0);
        entranceTranslateY.setValue(18);
        Animated.parallel([
            Animated.timing(entranceOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
            Animated.spring(entranceTranslateY, { toValue: 0, speed: 14, bounciness: 4, useNativeDriver: true }),
        ]).start();
    }, [animationKey]);

    const handlePress = async () => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            const sessionData = await fetchWorkoutHistoryBySession(session);
            onSessionSelect(session, sessionData);
        } catch (error) {
            console.error('Error pre-fetching workout:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handlePressIn = () => Animated.spring(scaleAnim, { toValue: 0.98, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
    const handlePressOut = () => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 4 }).start();

    const sessionNote = exercises.find(e => e.notes)?.notes;
    const workoutName = exercises[0].name || 'Workout';
    const exerciseDetails = exercisesList?.find(e => e.exerciseID === exercises[0]?.exerciseID);
    const isCardio = exerciseDetails ? exerciseDetails.isCardio === 1 : exercises.some(ex => ex.distance > 0 || ex.seconds > 0);
    const isAssisted = exerciseDetails?.isAssisted === 1;

    let workingSetCount = 0;
    const setsWithDisplayNumbers = exercises.map(set => {
        if (set.setType === 'N' || !set.setType) {
            workingSetCount++;
            return { ...set, displayNumber: workingSetCount };
        }
        return { ...set, displayNumber: set.setType };
    });

    return (
        <Animated.View style={{ opacity: entranceOpacity, transform: [{ translateY: entranceTranslateY }] }}>
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
                                <Text style={styles.sessionDate}>{formatDate(exercises[0].time)}</Text>
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
                            <Text style={[styles.colHeader, styles.colHeaderLift]}>{isCardio ? 'DIST / TIME' : 'LIFT'}</Text>
                            {!isAssisted && <Text style={[styles.colHeader, styles.colHeader1RM]}>{isCardio ? 'PACE' : '1RM'}</Text>}
                        </View>

                        {(() => {
                            let workingIndex = 0;
                            return setsWithDisplayNumbers.map((set, setIndex) => {
                                const isPR = set.is1rmPR === 1 || set.isVolumePR === 1 || set.isWeightPR === 1;
                                const setType = set.setType || 'N';
                                const isWarmup = setType === 'W';
                                const isOdd = !isWarmup && workingIndex % 2 === 1;
                                if (!isWarmup) workingIndex++;

                                return (
                                    <View
                                        key={`${set.exerciseHistoryID ?? ''}-${setIndex}`}
                                        style={[
                                            styles.setRowContainer,
                                            isOdd && styles.setRowOdd,
                                            isWarmup && { backgroundColor: 'rgba(253,203,110,0.04)' },
                                        ]}
                                    >
                                        <View style={styles.setRow}>
                                            <SetNumberBadge type={setType} number={set.displayNumber} theme={theme} />
                                            <Text style={[styles.setLift, isWarmup && styles.setLiftWarmup]}>
                                                {isCardio
                                                    ? `${set.distance || 0}km / ${(set.seconds / 60).toFixed(1)} mins`
                                                    : `${isAssisted && set.weight > 0 ? '-' : ''}${formatWeight(set.weight, useImperial)} ${unitLabel(useImperial)} x ${set.reps}`
                                                }
                                            </Text>
                                            {!isAssisted && (
                                                <Text style={styles.setOneRM}>
                                                    {isCardio
                                                        ? (set.distance > 0 ? `${((set.seconds / 60) / set.distance).toFixed(1)} min/km` : '-')
                                                        : (set.oneRM ? `${Math.round(formatWeight(set.oneRM, useImperial, 0))}` : '-')
                                                    }
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
                            });
                        })()}
                    </View>
                </View>
            </AnimatedTouchableOpacity>
        </Animated.View>
    );
});

// ─── Main Component ───────────────────────────────────────────────────────────

const ExerciseHistory = (props) => {
    const { theme, gender, useImperial, isRankingsEnabled } = useTheme();
    const router = useRouter();
    const styles = useMemo(() => getStyles(theme), [theme]);

    // ── Snapshot-seeded initial state ──────────────────────────────────────────
    const [snapshot, setSnapshot] = useState(() => getExerciseSnapshotSync(props.exerciseID));
    const hasInitialSnapshot = !!snapshot;

    // ── State ──────────────────────────────────────────────────────────────────
    const [bodyWeight, setBodyWeight] = useState(() => getCachedBodyWeight());
    const [hasLoadedBodyWeight, setHasLoadedBodyWeight] = useState(!!getCachedBodyWeight());
    const [showOnlyPRs, setShowOnlyPRs] = useState(false);
    const [filterAnimKey, setFilterAnimKey] = useState(0);

    // ── Derived Snapshot Values ────────────────────────────────────────────────
    const {
        name: exerciseName = snapshot?.name ?? props.exerciseName,
        strengthRatios = snapshot?.strengthRatios ?? [],
        best1RM = snapshot?.best1RM ?? 0,
        stats = snapshot?.stats ?? EMPTY_STATS,
        groupedHistory: workoutHistory = snapshot?.groupedHistory ?? [],
        targetMuscle = snapshot?.targetMuscle ?? '',
        accessoryMuscles = snapshot?.accessoryMuscles ?? '',
        isCardio: isCardioHeader = snapshot?.isCardio ?? false,
        isAssisted: isAssistedHeader = snapshot?.isAssisted ?? false,
    } = snapshot || {};

    const formattedTargets = useMemo(() =>
        snapshot
            ? buildFormattedTargets(splitMuscleString(targetMuscle), splitMuscleString(accessoryMuscles))
            : DEFAULT_MUSCLE_TARGETS
        , [targetMuscle, accessoryMuscles]);

    // ── Derived flags ──────────────────────────────────────────────────────────
    const isDynamic = theme.type === 'dynamic';
    const safeBorder = isDynamic ? '#4d4d4d' : theme.border;
    const hasStrengthRatios = strengthRatios.length > 0;
    const hasBodyWeight = bodyWeight != null;

    // Can show the overlay immediately only if we have snapshot muscles AND:
    // - no strength ratios, OR
    // - rankings are disabled.
    const initialCanShowBodyOverlay = !!snapshot && (!strengthRatios.length || !isRankingsEnabled);

    // ── Body opacity ref ───────────────────────────────────────────────────────
    const bodyOpacity = useRef(new Animated.Value(initialCanShowBodyOverlay ? 1 : 0)).current;

    // ── Strength tier ──────────────────────────────────────────────────────────
    // Must be declared before isMuscleDataReady to avoid a Babel const→var
    // hoisting issue where the memo below would read undefined on first render.
    const strengthTier = useMemo(() => {
        if (!hasStrengthRatios || !bodyWeight?.weight || best1RM == null) return null;
        let tier = 0;
        for (let i = 0; i < strengthRatios.length; i++) {
            if (best1RM >= bodyWeight.weight * strengthRatios[i]) tier = i + 1;
        }
        return tier;
    }, [hasStrengthRatios, strengthRatios, bodyWeight, best1RM]);

    // Body data is ready once we have exercise details and have received the
    // bodyweight result (whether or not one was actually found).
    // If rankings are disabled, we don't need bodyweight to be ready.
    const isMuscleDataReady = useMemo(() =>
        !!snapshot && (!(hasStrengthRatios && isRankingsEnabled) || hasLoadedBodyWeight),
        [snapshot, hasStrengthRatios, isRankingsEnabled, hasLoadedBodyWeight]
    );

    // Track readiness with a ref to prevent "flickering" if state updates rapidly.
    // Once it becomes ready for a specific exerciseID, we keep it ready.
    const isReadyRef = useRef(false);
    const lastIDRef = useRef(props.exerciseID);

    if (lastIDRef.current !== props.exerciseID) {
        isReadyRef.current = false;
        lastIDRef.current = props.exerciseID;
    }
    if (isMuscleDataReady) {
        isReadyRef.current = true;
    }

    const stableIsReady = isReadyRef.current;

    // ── Overlay body colors ────────────────────────────────────────────────────
    // Returns null until muscle data is ready (defers the fade-in).
    // When the exercise has strength ratios but the user has no bodyweight logged,
    // falls back to theme primary colors instead of hiding the overlay entirely.
    const overlayBodyColors = useMemo(() => {
        const hasResolvedMuscles = !!targetMuscle?.trim() || !!accessoryMuscles?.trim();
        if (!hasResolvedMuscles || !stableIsReady) return null;

        if (isRankingsEnabled && hasStrengthRatios && hasBodyWeight && strengthTier !== null) {
            const color = TIER_COLORS[Math.max(0, strengthTier - 1)];
            return [theme.bodyFill, `${color}20`, color];
        }

        return isDynamic
            ? [theme.bodyFill, '#2DC4B660', '#2DC4B6']
            : [theme.bodyFill, `${theme.primary}20`, theme.primary];
    }, [targetMuscle, accessoryMuscles, stableIsReady, isRankingsEnabled, hasStrengthRatios, hasBodyWeight, strengthTier, theme, isDynamic]);

    const fallbackBodyColors = [theme.bodyFill, theme.bodyFill, theme.bodyFill];
    const resolvedBodyColors = overlayBodyColors ?? fallbackBodyColors;
    const canShowBodyOverlay = overlayBodyColors !== null;

    // ── Filtered history ───────────────────────────────────────────────────────
    const filteredWorkoutHistory = useMemo(() => {
        if (!showOnlyPRs) return workoutHistory;
        return workoutHistory
            .map(([session, exercises]) => {
                const prSets = exercises.filter(s => s.is1rmPR === 1 || s.isVolumePR === 1 || s.isWeightPR === 1);
                return prSets.length > 0 ? [session, prSets] : null;
            })
            .filter(Boolean);
    }, [workoutHistory, showOnlyPRs]);

    // ── Snapshot helper ───────────────────────────────────────────────────────
    const applySnapshot = useCallback((newSnapshot) => {
        if (!newSnapshot) return;
        setSnapshot(prev => {
            // Only update if it's a different exercise or has a newer timestamp
            if (prev?.exerciseID === newSnapshot.exerciseID && prev?.updatedAt === newSnapshot.updatedAt) {
                return prev;
            }
            return newSnapshot;
        });
    }, []);

    // ── Effects ────────────────────────────────────────────────────────────────

    // Reset + reload when navigating to a different exercise
    useEffect(() => {
        let isActive = true;
        const syncSnapshot = getExerciseSnapshotSync(props.exerciseID);
        if (syncSnapshot) {
            applySnapshot(syncSnapshot);
        } else {
            setSnapshot(null);
        }

        getExerciseSnapshot(props.exerciseID)
            .then(snapshot => { if (isActive) applySnapshot(snapshot); })
            .catch(err => console.error('Error loading exercise snapshot:', err));

        return () => { isActive = false; };
    }, [props.exerciseID, applySnapshot]);

    // Removed the redundant exercisesList sync effect

    // Fade body overlay in once colors AND muscle data are both fully resolved.
    // Gating on isMuscleDataReady prevents a double-fire (and the resulting flash)
    // that would otherwise occur when bodyweight loads after muscles are ready.
    const shouldShowOverlay = canShowBodyOverlay && stableIsReady;
    const lastToValue = useRef(initialCanShowBodyOverlay ? 1 : 0);

    useEffect(() => {
        const toValue = shouldShowOverlay ? 1 : 0;
        if (toValue === lastToValue.current) return;
        lastToValue.current = toValue;

        const instant = !isRankingsEnabled || !hasStrengthRatios;
        Animated.timing(bodyOpacity, {
            toValue,
            duration: (toValue === 1 && !instant) ? 150 : 0,
            useNativeDriver: true,
        }).start();
    }, [shouldShowOverlay, isRankingsEnabled, hasStrengthRatios]);

    // Recalculate stats from authoritative history data (if needed, though snapshot usually has them)
    // Snapshot stats are usually preferred as they are pre-computed.

    // ── Focus effects ──────────────────────────────────────────────────────────

    // Removed redundant fetchExercises call

    useFocusEffect(useCallback(() => {
        let isActive = true;
        getExerciseSnapshot(props.exerciseID)
            .then(snapshot => {
                if (!isActive) return;
                if (snapshot) {
                    applySnapshot(snapshot);
                }

                // Fallback check: If the snapshot is old (missing groupedHistory) 
                // or it indicates no data, force a fresh DB pull to be absolutely sure.
                if (!snapshot || !snapshot.groupedHistory || snapshot.groupedHistory.length === 0) {
                    getExerciseSnapshot(props.exerciseID, { preferCache: false })
                        .then(freshSnapshot => {
                            if (isActive && freshSnapshot) {
                                applySnapshot(freshSnapshot);
                            }
                        })
                        .catch(console.error);
                }
            })
            .catch(console.error);
        return () => { isActive = false; };
    }, [props.exerciseID, applySnapshot]));

    useFocusEffect(useCallback(() => {
        getLatestBodyWeight()
            .then(setBodyWeight)
            .catch(() => { })
            .finally(() => setHasLoadedBodyWeight(true));
    }, []));

    useEffect(() => {
        const handler = (newBw) => {
            if (newBw) {
                setBodyWeight(newBw);
            } else {
                getLatestBodyWeight().then(setBodyWeight);
            }
        };
        on(AppEvents.BODYWEIGHT_UPDATED, handler);
        return () => off(AppEvents.BODYWEIGHT_UPDATED, handler);
    }, []);


    // ── Handlers ───────────────────────────────────────────────────────────────

    const handleSessionSelect = (session, data) => {
        router.push({
            pathname: `/workout/${session}`,
            params: { initialData: JSON.stringify(data), readOnly: 'false' },
        });
    };

    // ── Derived display values ─────────────────────────────────────────────────

    const fmtWeight = (val) => val == null ? '—' : `${+formatWeight(val, useImperial, 1).toFixed(1)}${unitLabel(useImperial)}`;
    const fmtVolume = (val) => val == null ? '—' : `${(val / 1000).toFixed(1)}k`;
    const fmtDist = (val) => val == null ? '—' : `${val}km`;
    const fmtPace = (val) => val == null || val === Infinity ? '—' : val.toFixed(1);
    const fmtSets = (val) => val == null ? '—' : String(val);

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <View style={styles.container}>
            <FlatList
                data={filteredWorkoutHistory}
                style={styles.list}
                contentContainerStyle={styles.listContentContainer}
                keyExtractor={([session]) => session.toString()}
                removeClippedSubviews
                maxToRenderPerBatch={5}
                updateCellsBatchingPeriod={50}
                windowSize={10}
                showsVerticalScrollIndicator={false}
                ListHeaderComponent={
                    <View style={styles.headerWrapper}>

                        {/* Title */}
                        <View style={styles.titleRow}>
                            <Text style={styles.exerciseTitle}>{exerciseName}</Text>
                            <TouchableOpacity
                                onPress={() => router.push(`/exercise/new?id=${props.exerciseID}`)}
                                style={styles.editButton}
                                activeOpacity={0.7}
                            >
                                <MaterialIcons name="edit" size={20} color={theme.text} />
                            </TouchableOpacity>
                        </View>

                        {/* Stats row */}
                        <View style={styles.statsRow}>
                            {isCardioHeader ? (
                                <View style={styles.statCard}>
                                    <Feather name="map-pin" size={16} color={theme.primary} style={styles.statIcon} />
                                    <FadingStatText text={fmtDist(stats.maxDistance)} style={styles.statValue} animateInitialPlaceholder={!hasInitialSnapshot} />
                                    <Text style={styles.statLabel}>Longest Dist</Text>
                                </View>
                            ) : (
                                <View style={styles.statCard}>
                                    <Feather name="award" size={16} color={theme.primary} style={styles.statIcon} />
                                    <FadingStatText
                                        text={stats.personalBest == null ? '—' : `${isAssistedHeader && stats.personalBest > 0 ? '-' : ''}${fmtWeight(stats.personalBest)}`}
                                        style={styles.statValue}
                                        animateInitialPlaceholder={!hasInitialSnapshot}
                                    />
                                    <Text style={styles.statLabel}>Weight PR</Text>
                                </View>
                            )}

                            <View style={styles.statCard}>
                                <Feather name="layers" size={16} color={theme.primary} style={styles.statIcon} />
                                <FadingStatText text={fmtSets(stats.totalSets)} style={styles.statValue} animateInitialPlaceholder={!hasInitialSnapshot} />
                                <Text style={styles.statLabel}>Total Sets</Text>
                            </View>

                            {isCardioHeader ? (
                                <View style={styles.statCard}>
                                    <Feather name="zap" size={16} color={theme.primary} style={styles.statIcon} />
                                    <FadingStatText text={fmtPace(stats.bestPace)} style={styles.statValue} animateInitialPlaceholder={!hasInitialSnapshot} />
                                    <Text style={styles.statLabel}>Fastest Pace</Text>
                                </View>
                            ) : !isAssistedHeader && (
                                <View style={styles.statCard}>
                                    <Feather name="activity" size={16} color={theme.primary} style={styles.statIcon} />
                                    <FadingStatText text={fmtVolume(stats.totalVolume)} style={styles.statValue} animateInitialPlaceholder={!hasInitialSnapshot} />
                                    <Text style={styles.statLabel}>Volume</Text>
                                </View>
                            )}
                        </View>

                        {/* Body highlighter */}
                        {!isCardioHeader && (
                            <View style={styles.bodyWrapper}>
                                <View style={{ position: 'relative', flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', width: '100%', paddingVertical: 8, minHeight: 300 }}>

                                    {/* Base layer — always visible, no muscle colouring */}
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', width: '100%' }}>
                                        <Body data={DEFAULT_MUSCLE_TARGETS} gender={gender} side="front" scale={0.75} border={safeBorder} colors={fallbackBodyColors} defaultFill={theme.bodyFill} />
                                        <View style={styles.bodyDivider} />
                                        <Body data={DEFAULT_MUSCLE_TARGETS} gender={gender} side="back" scale={0.75} border={safeBorder} colors={fallbackBodyColors} defaultFill={theme.bodyFill} />
                                    </View>

                                    {/* Overlay layer — fades in once colours are finalised */}
                                    <Animated.View
                                        pointerEvents="none"
                                        style={{ position: 'absolute', top: 8, left: 0, right: 0, bottom: 8, flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', opacity: bodyOpacity }}
                                    >
                                        <Body data={canShowBodyOverlay ? formattedTargets : DEFAULT_MUSCLE_TARGETS} gender={gender} side="front" scale={0.75} border={safeBorder} colors={resolvedBodyColors} defaultFill={theme.bodyFill} />
                                        <View style={styles.bodyDivider} />
                                        <Body data={canShowBodyOverlay ? formattedTargets : DEFAULT_MUSCLE_TARGETS} gender={gender} side="back" scale={0.75} border={safeBorder} colors={resolvedBodyColors} defaultFill={theme.bodyFill} />
                                    </Animated.View>
                                </View>

                                {isRankingsEnabled && (
                                    <View style={{ width: '100%', borderTopWidth: 1, borderTopColor: safeBorder, opacity: isMuscleDataReady ? 1 : 0.35 }}>
                                        <StrengthLegend
                                            currentTier={hasStrengthRatios && hasBodyWeight && isMuscleDataReady ? strengthTier : null}
                                            theme={theme}
                                            strengthRatios={hasStrengthRatios ? strengthRatios : null}
                                            bw={hasBodyWeight ? bodyWeight.weight : null}
                                        />
                                    </View>
                                )}
                            </View>
                        )}

                        {!isCardioHeader && (
                            <PRGraphCard exerciseID={props.exerciseID} exerciseName={exerciseName} isCompact />
                        )}

                        {/* History header */}
                        <View style={styles.historyHeaderRow}>
                            <Text style={styles.sectionTitle}>History</Text>
                            {!isCardioHeader && (
                                <TouchableOpacity
                                    activeOpacity={0.75}
                                    onPress={() => { setShowOnlyPRs(v => !v); setFilterAnimKey(k => k + 1); }}
                                    style={[styles.prFilterPill, showOnlyPRs && { backgroundColor: theme.primary, borderColor: theme.primary }]}
                                >
                                    <MaterialCommunityIcons name="trophy" size={13} color={showOnlyPRs ? '#fff' : theme.textSecondary} />
                                    <Text style={[styles.prFilterText, showOnlyPRs && { color: '#fff', fontFamily: FONTS.bold }]}>PRs Only</Text>
                                </TouchableOpacity>
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
                        onSessionSelect={handleSessionSelect}
                        exercisesList={snapshot ? [snapshot] : []}
                        animationKey={filterAnimKey}
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
            />
        </View>
    );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const getStyles = (theme) => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    list: { flex: 1 },
    listContentContainer: { paddingBottom: 100 },
    headerWrapper: { paddingTop: 10 },
    titleRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        marginBottom: 20, position: 'relative', minHeight: 44, paddingHorizontal: 12,
    },
    exerciseTitle: {
        fontSize: 24, fontFamily: FONTS.bold, color: theme.text,
        textAlign: 'center', paddingHorizontal: 50,
    },
    editButton: {
        position: 'absolute', right: 0, padding: 10,
        backgroundColor: theme.surface, borderRadius: 12,
        borderWidth: 1, borderColor: theme.border, marginRight: 12,
        ...SHADOWS.small,
    },
    statsRow: {
        flexDirection: 'row', justifyContent: 'space-between',
        marginBottom: 24, gap: 12, paddingHorizontal: 12,
    },
    statCard: {
        flex: 1, backgroundColor: theme.surface, borderRadius: 16,
        paddingVertical: 16, paddingHorizontal: 8, alignItems: 'center',
        borderWidth: 1, borderColor: theme.border, ...SHADOWS.small,
    },
    statIcon: { marginBottom: 8, opacity: 0.8 },
    statValue: { fontSize: 18, fontFamily: FONTS.bold, color: theme.text, marginBottom: 2 },
    statLabel: {
        fontSize: 11, fontFamily: FONTS.medium, color: theme.textSecondary,
        textTransform: 'uppercase', letterSpacing: 0.5,
    },
    bodyWrapper: {
        flexDirection: 'column', alignItems: 'center',
        backgroundColor: theme.surface, borderRadius: 20,
        borderWidth: 1, borderColor: theme.border,
        marginBottom: 24, marginHorizontal: 12,
        overflow: 'hidden', ...SHADOWS.small,
    },
    bodyDivider: { width: 1, alignSelf: 'stretch', backgroundColor: theme.border, opacity: 0.5 },
    historyHeaderRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 10, marginBottom: 16, paddingHorizontal: 12,
    },
    sectionTitle: { fontSize: 20, fontFamily: FONTS.bold, color: theme.text },
    prFilterPill: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: theme.surface, paddingHorizontal: 12, paddingVertical: 7,
        borderRadius: 20, borderWidth: 1, borderColor: theme.border,
    },
    prFilterText: { fontSize: 13, fontFamily: FONTS.semiBold, color: theme.textSecondary },
    cardContainer: {},
    sessionCard: {
        marginBottom: 16, marginHorizontal: 12,
        backgroundColor: theme.surface, borderRadius: 16,
        borderWidth: 1, borderColor: theme.border,
        overflow: 'hidden', ...SHADOWS.small,
    },
    sessionHeader: {
        paddingHorizontal: 12, paddingVertical: 14,
        backgroundColor: theme.overlaySubtle,
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        borderBottomWidth: 1, borderBottomColor: theme.border,
    },
    sessionTitle: { fontSize: 16, fontFamily: FONTS.bold, color: theme.text, marginBottom: 4 },
    sessionDateContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    sessionDate: { fontSize: 12, fontFamily: FONTS.medium, color: theme.textSecondary },
    dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: theme.textSecondary, opacity: 0.5 },
    iconButton: { padding: 6, opacity: 0.5 },
    noteContainer: {
        flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, gap: 8,
        backgroundColor: theme.overlayBorder,
        borderBottomWidth: 1, borderBottomColor: theme.border,
    },
    noteText: {
        flex: 1, fontSize: 13, color: theme.textSecondary,
        fontFamily: FONTS.regular, fontStyle: 'italic', lineHeight: 18,
    },
    setsContainer: { paddingVertical: 4, paddingBottom: 8 },
    setsHeaderRow: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 12, marginBottom: 4 },
    colHeader: { fontSize: 10, fontFamily: FONTS.bold, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
    colHeaderSet: { width: 34 },
    colHeaderLift: { flex: 2, textAlign: 'left', paddingLeft: 6 },
    colHeader1RM: { flex: 1, textAlign: 'center' },
    setRowContainer: { paddingVertical: 6, paddingHorizontal: 12 },
    setRow: { flexDirection: 'row', alignItems: 'center', minHeight: 28 },
    setRowOdd: { backgroundColor: theme.overlaySubtle },
    badgeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, flexWrap: 'wrap' },
    setLift: { flex: 2, textAlign: 'left', paddingLeft: 6, fontSize: 15, fontFamily: FONTS.bold, color: theme.text, letterSpacing: 0.2 },
    setLiftWarmup: { color: theme.textSecondary },
    setOneRM: { flex: 1, textAlign: 'center', fontSize: 13, fontFamily: FONTS.semiBold, color: theme.textSecondary },
    emptyContainer: { padding: 40, alignItems: 'center', marginTop: 20 },
    emptyIconCircle: {
        width: 64, height: 64, borderRadius: 32,
        backgroundColor: theme.surface, alignItems: 'center', justifyContent: 'center',
        marginBottom: 16, borderWidth: 1, borderColor: theme.border,
    },
    emptyText: { color: theme.text, fontFamily: FONTS.bold, fontSize: 18, marginBottom: 8 },
    emptySubtext: { color: theme.textSecondary, fontFamily: FONTS.regular, fontSize: 14, textAlign: 'center' },
});

export default ExerciseHistory;