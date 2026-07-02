import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, ActivityIndicator, Animated } from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import Body from "react-native-body-highlighter";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import * as Haptics from 'expo-haptics';
import { fetchExerciseHistory, fetchExercises, fetchWorkoutHistoryBySession } from './db';
import { FONTS, RADIUS, isLightTheme, getThemedShadow } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import PRGraphCard from "./PRGraphCard";
import ContextMenu from './ContextMenu';
import { Stack } from 'expo-router';
import { formatWeight, formatWeightLabel, unitLabel } from '../utils/units';
import { secondsToClock } from '../utils/time';
import { getExerciseSnapshotSync, updateExerciseSnapshot, calculateSnapshotFromHistory } from '../utils/exerciseSnapshots';
import { buildWorkoutDataFromSession } from '../utils/workoutBuilders';
import { customAlert } from '../utils/customAlert';
import { AppEvents, on, off } from '../utils/events';

const relativeTime = (timestamp) => {
    if (!timestamp) return null;
    const days = Math.floor((Date.now() - timestamp) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
};



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
    const bgColor = `${brightColor}25`;

    return (
        <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 100,
            gap: 3,
            marginRight: 6,
            backgroundColor: bgColor,
        }}>
            <MaterialCommunityIcons name={iconName} size={10} color={brightColor} />
            <Text style={{ fontSize: 9, fontFamily: FONTS.bold, color: brightColor }}>{label}</Text>
        </View>
    );
});

const SetNumberBadge = React.memo(({ type, number, theme }) => {
    let containerStyle = {
        width: 24,
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 6,
        marginRight: 10,
    };
    let textStyle = {
        fontSize: 11,
        fontFamily: FONTS.bold,
    };

    if (type === 'W') {
        containerStyle.backgroundColor = 'rgba(253, 203, 110, 0.2)';
        textStyle.color = theme.warning;
        textStyle.fontSize = 10;
    } else if (type === 'D') {
        containerStyle.backgroundColor = 'rgba(116, 185, 255, 0.15)';
        textStyle.color = theme.info;
    } else {
        containerStyle.backgroundColor = theme.border;
        textStyle.color = theme.textSecondary;
    }

    return (
        <View style={containerStyle}>
            <Text style={textStyle}>{number}</Text>
        </View>
    );
});
const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

const HistorySessionCard = React.memo(({ session, exercises, theme, styles, formatDate, onSessionSelect, onSessionMenu, exercisesList, animationKey }) => {
    const [isLoading, setIsLoading] = useState(false);
    const { useImperial } = useTheme();

    const handlePress = async () => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            const sessionData = await fetchWorkoutHistoryBySession(session);
            onSessionSelect(session, sessionData);
        } catch (error) {
            console.error("Error pre-fetching workout:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const scaleAnim = useRef(new Animated.Value(1)).current;
    const entranceOpacity = useRef(new Animated.Value(0)).current;
    const entranceTranslateY = useRef(new Animated.Value(18)).current;

    // Replay entrance animation whenever the filter key changes (PR toggle)
    useEffect(() => {
        entranceOpacity.setValue(0);
        entranceTranslateY.setValue(18);
        Animated.parallel([
            Animated.timing(entranceOpacity, {
                toValue: 1,
                duration: 280,
                useNativeDriver: true,
            }),
            Animated.spring(entranceTranslateY, {
                toValue: 0,
                speed: 14,
                bounciness: 4,
                useNativeDriver: true,
            }),
        ]).start();
    }, [animationKey]);

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

    const sessionNote = exercises.find(e => e.notes)?.notes;
    const workoutName = exercises[0].name || "Workout";

    let workingSetCount = 0;
    const setsWithDisplayNumbers = exercises.map(set => {
        let displayNumber = set.setType;
        if (set.setType === 'N' || !set.setType) {
            workingSetCount++;
            displayNumber = workingSetCount;
        }
        return { ...set, displayNumber };
    });

    const exerciseID = exercises[0]?.exerciseID;
    const exerciseDetails = exercisesList ? exercisesList.find(e => e.exerciseID === exerciseID) : null;
    const isCardio = exerciseDetails
        ? exerciseDetails.isCardio === 1
        : exercises.some(ex => ex.distance > 0 || ex.seconds > 0);
    const isAssisted = exerciseDetails?.isAssisted === 1;

    return (
        <Animated.View
            // Composite the card (incl. its shadow) to one layer while fading,
            // else Android draws the elevation shadow as a hard grey box edge
            // during the opacity animation (the "ugly inner border" flash).
            renderToHardwareTextureAndroid
            style={{
                opacity: entranceOpacity,
                transform: [{ translateY: entranceTranslateY }],
            }}>
            <AnimatedTouchableOpacity
                activeOpacity={0.8}
                onPress={handlePress}
                onLongPress={(e) => {
                    onSessionMenu?.(e, session);
                    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
                }}
                delayLongPress={350}
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
                                <Text style={styles.sessionDate}>
                                    {formatDate(exercises[0].time)}
                                </Text>
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
                            <Text style={[styles.colHeader, styles.colHeaderLift]}>{isCardio ? "DIST / TIME" : "LIFT"}</Text>
                            {!isAssisted && <Text style={[styles.colHeader, styles.colHeader1RM]}>{isCardio ? "PACE" : "1RM"}</Text>}
                        </View>

                        {(() => {
                            let workingIndex = 0;
                            return setsWithDisplayNumbers.map((set, setIndex) => {
                                const isPR = set.is1rmPR === 1 || set.isVolumePR === 1 || set.isWeightPR === 1;
                                const setType = set.setType || 'N';
                                const isWarmup = setType === 'W';

                                const isOdd = !isWarmup && (workingIndex % 2 === 1);
                                if (!isWarmup) workingIndex++;

                                return (
                                    <View
                                        key={`${set.exerciseHistoryID ?? ''}-${setIndex}`}
                                        style={[
                                            styles.setRowContainer,
                                            isOdd && styles.setRowOdd,
                                            isWarmup && { backgroundColor: 'rgba(253, 203, 110, 0.04)' },
                                        ]}
                                    >
                                        <View style={styles.setRow}>
                                            <SetNumberBadge type={setType} number={set.displayNumber} theme={theme} />

                                            <Text
                                                style={[
                                                    styles.setLift,
                                                    isWarmup && styles.setLiftWarmup,
                                                ]}
                                            >
                                                {isCardio ? (
                                                    `${set.distance || 0}km / ${secondsToClock(set.seconds || 0)}`
                                                ) : (
                                                    `${isAssisted && set.weight > 0 ? '-' : ''}${formatWeight(set.weight, useImperial)} ${unitLabel(useImperial)} x ${set.reps}`
                                                )}
                                            </Text>

                                            {!isAssisted && (
                                                <Text style={styles.setOneRM}>
                                                    {isCardio ? (
                                                        set.distance > 0 ? `${((set.seconds / 60) / set.distance).toFixed(1)} min/km` : '-'
                                                    ) : (
                                                        set.oneRM ? `${Math.round(formatWeight(set.oneRM, useImperial, 0))}` : '-'
                                                    )}
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

// Friendlier labels than the body-highlighter slugs (e.g. "Upper-Back" → "Back").
// Keyed case-insensitively so it works for stored capitalised names or slugs.
const MUSCLE_DISPLAY_NAMES = {
    'gluteal': 'Glutes',
    'upper-back': 'Back',
    'lower-back': 'Lower Back',
    'forearm': 'Forearms',
    'hamstring': 'Hamstrings',
};
const displayMuscleName = (name) => {
    if (!name) return name;
    return MUSCLE_DISPLAY_NAMES[name.toLowerCase()] || name;
};

// Defined at module level so DEFAULT_MUSCLE_TARGETS is a stable reference
// that doesn't cause re-renders and isn't recreated per instance.
const ALL_MUSCLE_SLUGS = [
    'chest', 'quadriceps', 'triceps', 'biceps', 'hamstring',
    'upper-back', 'lower-back', 'deltoids', 'gluteal', 'forearm',
    'trapezius', 'calves', 'abs', 'adductors', 'obliques',
    'tibialis', 'abductors', 'neck', 'hands', 'feet', 'knees', 'ankles'
];

// Every muscle starts at intensity 1 (unworked). The body diagram renders
// immediately with the correct base colour scheme on mount; only the
// highlighted muscles change once exercise data loads — no full colour pop.
const DEFAULT_MUSCLE_TARGETS = ALL_MUSCLE_SLUGS.map(slug => ({ slug, intensity: 1 }));

// Build the highlighter `data` (and a content key for change-detection) from
// target/accessory slug lists. Normalizes slugs so seeded snapshot values and
// live exercise data produce identical output — no pop when they reconcile.
const buildMuscleTargets = (targetSlugs = [], accessorySlugs = []) => {
    const norm = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : '');
    const t = targetSlugs.map(norm).filter(Boolean);
    const a = accessorySlugs.map(norm).filter(Boolean);
    const worked = new Set([...t, ...a]);
    const data = [
        ...t.map(slug => ({ slug, intensity: 3 })),
        ...a.map(slug => ({ slug, intensity: 2 })),
        ...ALL_MUSCLE_SLUGS.filter(slug => !worked.has(slug)).map(slug => ({ slug, intensity: 1 })),
    ];
    const key = JSON.stringify({ t: [...t].sort(), a: [...a].sort() });
    return { data, key };
};



const ExerciseHistory = (props) => {
    const { theme, gender, useImperial } = useTheme();
    const router = useRouter();
    const styles = getStyles(theme);

    const initialSnapshot = useMemo(() => getExerciseSnapshotSync(props.exerciseID), [props.exerciseID]);
    const statsOpacity = useRef(new Animated.Value(initialSnapshot ? 1 : 0)).current;

    const [workoutHistory, setWorkoutHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exercisesList, setExercises] = useState([]);

    // Seed initial muscle targets from the snapshot so the body diagram is
    // highlighted on first paint. muscleKeyRef tracks the current content so
    // the live recompute can skip redundant re-renders (which made the
    // highlights occasionally re-draw / pop).
    const initialMuscle = useMemo(() =>
        initialSnapshot?.muscles
            ? buildMuscleTargets(initialSnapshot.muscles.target, initialSnapshot.muscles.accessory)
            : { data: DEFAULT_MUSCLE_TARGETS, key: null },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        []
    );
    const [formattedTargets, setFormattedTargets] = useState(initialMuscle.data);
    const muscleKeyRef = useRef(initialMuscle.key);

    // Seed initial stats from snapshot if available
    const [stats, setStats] = useState(() => initialSnapshot?.stats || {
        totalSets: null,
        personalBest: null,
        totalVolume: null,
        maxDistance: null,
        bestPace: null,
    });
    const [displayStats, setDisplayStats] = useState(stats);
    const [showOnlyPRs, setShowOnlyPRs] = useState(false);
    const [filterAnimKey, setFilterAnimKey] = useState(0);
    const [contextMenu, setContextMenu] = useState(null); // {x, y, session}

    const [exerciseName, setExerciseName] = useState(props.exerciseName);
    const { workoutInProgress } = useTheme();

    // ── Trend + rep records, derived once from the full history ─────────────
    // Seeded from the snapshot cache until history loads, so the header
    // never pops in after first paint.
    const trend = useMemo(() => {
        const allSets = workoutHistory.flatMap(([_, sets]) => sets);
        if (allSets.length === 0) return initialSnapshot?.header?.trend ?? null;
        const cutoff = Date.now() - 182 * 86400000; // ~6 months
        let est1RM = 0;
        let est1RMBefore = 0;
        let lastPRTime = null;

        allSets.forEach(set => {
            const reps = parseInt(set.reps, 10) || 0;
            const weight = parseFloat(set.weight) || 0;
            const t = new Date(set.time).getTime();
            if (reps > 0 && weight > 0) {
                const oneRM = reps === 1 ? weight : weight * (1 + reps / 30);
                est1RM = Math.max(est1RM, oneRM);
                if (t < cutoff) est1RMBefore = Math.max(est1RMBefore, oneRM);
            }
            if ((set.is1rmPR || set.isWeightPR || set.isVolumePR) && (!lastPRTime || t > lastPRTime)) {
                lastPRTime = t;
            }
        });

        const pct = est1RMBefore > 0 ? ((est1RM - est1RMBefore) / est1RMBefore) * 100 : null;
        return { est1RM, pct, lastPRTime };
    }, [workoutHistory, initialSnapshot]);

    // Best weight handled for at least N reps (1–10).
    const repRecords = useMemo(() => {
        const allSets = workoutHistory.flatMap(([_, sets]) => sets);
        if (allSets.length === 0) return initialSnapshot?.header?.repRecords ?? [];
        const records = [];
        for (let r = 1; r <= 10; r++) {
            let best = 0;
            allSets.forEach(set => {
                const reps = parseInt(set.reps, 10) || 0;
                const weight = parseFloat(set.weight) || 0;
                if (reps >= r && weight > best) best = weight;
            });
            if (best > 0) records.push({ reps: r, weight: best });
        }
        return records;
    }, [workoutHistory, initialSnapshot]);

    const filteredWorkoutHistory = useMemo(() => {
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

    const showEditSheet = () => {
        router.push(`/exercise/new?id=${props.exerciseID}`);
    };

    const handleSessionSelect = (session, data) => {
        router.push({
            pathname: `/workout/${session}`,
            params: {
                initialData: JSON.stringify(data),
                readOnly: 'false'
            }
        });
    };

    const handleSessionMenu = (e, session) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setContextMenu({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, session });
    };

    const menuItems = useMemo(() => {
        if (!contextMenu) return [];
        const session = contextMenu.session;
        return [
            {
                icon: 'external-link',
                label: 'Open Full Session',
                tint: true,
                onPress: async () => {
                    try {
                        const data = await fetchWorkoutHistoryBySession(session);
                        handleSessionSelect(session, data);
                    } catch (err) { console.error(err); }
                },
            },
            {
                icon: 'rotate-ccw',
                label: 'Redo Workout',
                onPress: async () => {
                    try {
                        const rows = await fetchWorkoutHistoryBySession(session);
                        if (!rows || rows.length === 0) return;
                        const payload = {
                            name: rows[0]?.name?.trim() || `Workout #${session}`,
                            data: buildWorkoutDataFromSession(rows),
                        };
                        // dismissAll first: from a stacked screen, both push AND
                        // navigate (RN7) mount a duplicate (tabs) navigator (all
                        // four tabs, lazy:false) that piles up until the app
                        // crashes. Popping to the real tabs makes navigate a
                        // plain tab switch.
                        const start = () => {
                            router.dismissAll();
                            router.navigate({ pathname: '/current', params: { template: JSON.stringify(payload) } });
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
                    } catch (err) { console.error(err); }
                },
            },
            {
                icon: 'edit-2',
                label: 'Edit Workout',
                onPress: () => router.push(`/workout/EditWorkout?session=${session}`),
            },
        ];
    }, [contextMenu, workoutInProgress]);

    useEffect(() => {
        if (exercisesList.length > 0) {
            const { targetMuscles, accessoryMuscles } = getExerciseMuscles(props.exerciseID, exercisesList);
            handleMuscleStrings(targetMuscles, accessoryMuscles);
            const currentEx = exercisesList.find(e => e.exerciseID === props.exerciseID);
            if (currentEx) {
                setExerciseName(currentEx.name);
                // Also update snapshot if we have history
                if (workoutHistory.length > 0) {
                    const history = workoutHistory.flatMap(([_, sets]) => sets);
                    const snapshot = calculateSnapshotFromHistory(props.exerciseID, history, currentEx);
                    if (snapshot) updateExerciseSnapshot(props.exerciseID, snapshot);
                }
            }
        }
    }, [exercisesList, workoutHistory]);

    const getExerciseMuscles = (exerciseID, exerciseLog) => {
        const exercise = exerciseLog.find(ex => ex.exerciseID === exerciseID);
        if (!exercise) return { targetMuscles: [], accessoryMuscles: [] };
        const targetMuscles = exercise.targetMuscle ? exercise.targetMuscle.split(',') : [];
        const accessoryMuscles = exercise.accessoryMuscles ? exercise.accessoryMuscles.split(',') : [];
        return { targetMuscles, accessoryMuscles };
    };

    const handleMuscleStrings = (targetSelected, accessorySelected) => {
        const { data, key } = buildMuscleTargets(targetSelected, accessorySelected);
        // Skip if the muscle set is unchanged — re-setting an equivalent array
        // re-renders the body diagram and makes the highlights visibly re-draw.
        if (key === muscleKeyRef.current) return;
        muscleKeyRef.current = key;
        setFormattedTargets(data);
    };

    useFocusEffect(
        useCallback(() => {
            fetchExercises()
                .then(data => setExercises(data))
                .catch(err => console.error(err));
        }, [])
    );

    useFocusEffect(
        useCallback(() => {
            loadWorkoutHistory();

            // Refresh when data changes elsewhere
            const handleRefresh = () => loadWorkoutHistory();
            on(AppEvents.WORKOUT_COMPLETED, handleRefresh, 'exercise-screen');
            on(AppEvents.WORKOUT_DATA_IMPORTED, handleRefresh, 'exercise-screen');

            return () => {
                off(AppEvents.WORKOUT_COMPLETED, handleRefresh);
                off(AppEvents.WORKOUT_DATA_IMPORTED, handleRefresh);
                // Close the session hold-menu on blur so its transparent Modal
                // can't linger over other screens and block their touches.
                setContextMenu(null);
            };
        }, [props.exerciseID])
    );

    const loadWorkoutHistory = async () => {
        // Small delay to ensure top stats (which load instantly from cache) 
        // are prioritized and the screen feels snappy.
        setTimeout(async () => {
            try {
                const history = await fetchExerciseHistory(props.exerciseID);
                const groupedHistory = groupBySession(history);
                setWorkoutHistory(groupedHistory);

                // Update snapshot for next time
                if (exercisesList.length > 0) {
                    const currentEx = exercisesList.find(e => e.exerciseID === props.exerciseID);
                    const snapshot = calculateSnapshotFromHistory(props.exerciseID, history, currentEx);
                    if (snapshot) {
                        updateExerciseSnapshot(props.exerciseID, snapshot);
                    }
                }
            } catch (error) {
                console.error("Error loading workout history:", error);
            } finally {
                setLoading(false);
            }
        }, 100);
    };

    useEffect(() => {
        const changed = JSON.stringify(displayStats) !== JSON.stringify(stats);
        if (!changed) return;

        Animated.timing(statsOpacity, {
            toValue: 0,
            duration: 150,
            useNativeDriver: true,
        }).start(() => {
            setDisplayStats(stats);

            Animated.timing(statsOpacity, {
                toValue: 1,
                duration: 250,
                useNativeDriver: true,
            }).start();
        });
    }, [stats]);

    useEffect(() => {
        if (!workoutHistory || workoutHistory.length === 0) return;

        let maxWeight = 0;
        let minWeight = Infinity;
        let volume = 0;
        let totalSetsCount = 0;
        let maxDist = 0;
        let bestP = Infinity;

        workoutHistory.forEach(([session, exercises]) => {
            exercises.forEach(entry => {
                totalSetsCount++;
                if (entry.reps > 0 && entry.weight > maxWeight) maxWeight = entry.weight;
                if (entry.reps > 0 && entry.weight < minWeight) minWeight = entry.weight;
                volume += (entry.weight * entry.reps);

                if (entry.distance > maxDist) maxDist = entry.distance;
                if (entry.distance > 0 && entry.seconds > 0) {
                    const pace = (entry.seconds / 60) / entry.distance;
                    if (pace < bestP) bestP = pace;
                }
            });
        });

        const currentEx = exercisesList.find(e => e.exerciseID === props.exerciseID);
        const isAssisted = !!currentEx?.isAssisted;

        setStats({
            totalSets: totalSetsCount,
            personalBest: isAssisted ? (minWeight === Infinity ? 0 : minWeight) : maxWeight,
            totalVolume: volume,
            maxDistance: maxDist,
            bestPace: bestP,
        });
    }, [workoutHistory, exercisesList, props.exerciseID]);

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
        ? [theme.bodyFill, '#2DC4B660', '#2DC4B6']
        : [theme.bodyFill, `${theme.primary}60`, theme.primary];
    const safeBorder = isDynamic ? '#4d4d4d' : theme.border;

    const currentExerciseDetails = exercisesList.find(e => e.exerciseID === props.exerciseID);
    const isCardioHeader = !!currentExerciseDetails?.isCardio;
    const isAssistedHeader = !!currentExerciseDetails?.isAssisted;

    // Null-safe formatters — show '—' until real data arrives
    const fmtWeight = (val) =>
        val == null
            ? ''
            : `${+formatWeight(val, useImperial, 1).toFixed(1)}${unitLabel(useImperial)}`;
    const fmtVolume = (val) =>
        val == null ? '' : `${(val / 1000).toFixed(1)}k`;
    const fmtDist = (val) =>
        val == null ? '' : `${val}km`;
    const fmtPace = (val) =>
        val == null || val === Infinity ? '' : val.toFixed(1);
    const fmtSets = (val) =>
        val == null ? '' : String(val);

    // ── Header copy: eyebrow + insight line ─────────────────────────────────
    // Both fall back to the snapshot cache so they render complete on first
    // paint and only silently correct themselves if data changed.
    const rawPrimaryMuscle = currentExerciseDetails?.targetMuscle?.split(',')[0]?.trim()
        || initialSnapshot?.header?.primaryMuscle
        || initialSnapshot?.muscles?.target?.[0]?.trim();
    const primaryMuscle = displayMuscleName(rawPrimaryMuscle);
    const workoutCount = workoutHistory.length > 0
        ? workoutHistory.length
        : (initialSnapshot?.header?.workoutCount ?? 0);
    const eyebrowText = [
        primaryMuscle,
        workoutCount > 0
            ? `${workoutCount} ${workoutCount === 1 ? 'WORKOUT' : 'WORKOUTS'}`
            : null,
    ].filter(Boolean).join(' · ').toUpperCase() || 'EXERCISE';

    let insightLine = null;
    if (trend && !isCardioHeader && !isAssistedHeader) {
        const parts = [];
        if (trend.pct != null && Math.abs(trend.pct) >= 1) {
            parts.push(`Est. 1RM ${trend.pct > 0 ? 'up' : 'down'} ${Math.abs(trend.pct).toFixed(0)}% in 6 months`);
        }
        if (trend.lastPRTime) {
            parts.push(`last PR ${relativeTime(trend.lastPRTime)}`);
        }
        if (parts.length) insightLine = parts.join(' · ');
    }

    // Cross-fade the header values exactly like the stat cards: hidden until
    // the first real values exist, dissolve when they change — never pop.
    const headerOpacity = useRef(new Animated.Value(initialSnapshot?.header ? 1 : 0)).current;
    const [displayHeader, setDisplayHeader] = useState({ eyebrow: eyebrowText, insight: insightLine, repRecords });

    useEffect(() => {
        const changed =
            displayHeader.eyebrow !== eyebrowText ||
            displayHeader.insight !== insightLine ||
            JSON.stringify(displayHeader.repRecords) !== JSON.stringify(repRecords);

        if (!changed) {
            // Nothing to swap in — reveal once data exists (cached or loaded).
            if (initialSnapshot?.header || !loading) {
                Animated.timing(headerOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
            }
            return;
        }
        Animated.timing(headerOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
            setDisplayHeader({ eyebrow: eyebrowText, insight: insightLine, repRecords });
            Animated.timing(headerOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
        });
    }, [eyebrowText, insightLine, repRecords, loading]);

    return (
        <View style={styles.container}>
            <FlatList
                data={filteredWorkoutHistory}
                style={styles.list}
                contentContainerStyle={[styles.listContentContainer]}
                keyExtractor={([session]) => session.toString()}
                removeClippedSubviews={true}
                maxToRenderPerBatch={5}
                updateCellsBatchingPeriod={50}
                windowSize={10}
                showsVerticalScrollIndicator={false}
                ListHeaderComponent={
                    <View style={styles.headerWrapper}>
                        <View style={styles.titleRow}>
                            <View style={{ flex: 1, paddingRight: 12 }}>
                                <Animated.Text style={[styles.eyebrow, { opacity: headerOpacity }]}>
                                    {displayHeader.eyebrow}
                                </Animated.Text>
                                <Text style={styles.exerciseTitle}>{exerciseName}</Text>
                                {/* Always rendered so the history load doesn't
                                    push the page down when the line appears. */}
                                <Animated.Text style={[styles.insightLine, { opacity: headerOpacity }]} numberOfLines={1}>
                                    {displayHeader.insight || ' '}
                                </Animated.Text>
                            </View>
                            <TouchableOpacity
                                onPress={showEditSheet}
                                style={styles.editButton}
                                activeOpacity={0.7}
                            >
                                <MaterialIcons name="edit" size={17} color={theme.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.statsRow}>
                            {isCardioHeader ? (
                                <View style={styles.statCard}>
                                    <Feather name="map-pin" size={16} color={theme.primary} style={styles.statIcon} />
                                    <Animated.View style={{ opacity: statsOpacity }}>
                                        <Text style={styles.statValue}>{fmtDist(displayStats.maxDistance)}</Text>
                                    </Animated.View>
                                    <Text style={styles.statLabel}>Longest Dist</Text>
                                </View>
                            ) : (
                                !isCardioHeader && (
                                    <View style={styles.statCard}>
                                        <Feather name="award" size={16} color={theme.primary} style={styles.statIcon} />
                                        <Animated.View style={{ opacity: statsOpacity }}>
                                            <Text style={styles.statValue}>
                                                {displayStats.personalBest == null
                                                    ? ''
                                                    : `${isAssistedHeader && displayStats.personalBest > 0 ? '-' : ''}${fmtWeight(displayStats.personalBest)}`
                                                }
                                            </Text>
                                        </Animated.View>
                                        <Text style={styles.statLabel}>Weight PR</Text>
                                    </View>
                                )
                            )}

                            {(isCardioHeader || isAssistedHeader) ? (
                                <View style={styles.statCard}>
                                    <Feather name="layers" size={16} color={theme.primary} style={styles.statIcon} />
                                    <Animated.View style={{ opacity: statsOpacity }}>
                                        <Text style={styles.statValue}>{fmtSets(displayStats.totalSets)}</Text>
                                    </Animated.View>
                                    <Text style={styles.statLabel}>Total Sets</Text>
                                </View>
                            ) : (
                                <View style={styles.statCard}>
                                    <Feather name="trending-up" size={16} color={theme.primary} style={styles.statIcon} />
                                    <Animated.View style={{ opacity: statsOpacity }}>
                                        <Text style={styles.statValue}>
                                            {trend ? fmtWeight(trend.est1RM) : ''}
                                        </Text>
                                    </Animated.View>
                                    <Text style={styles.statLabel}>Est. 1RM</Text>
                                </View>
                            )}

                            {isCardioHeader ? (
                                <View style={styles.statCard}>
                                    <Feather name="zap" size={16} color={theme.primary} style={styles.statIcon} />
                                    <Animated.View style={{ opacity: statsOpacity }}>
                                        <Text style={styles.statValue}>{fmtPace(displayStats.bestPace)}</Text>
                                    </Animated.View>
                                    <Text style={styles.statLabel}>Fastest Pace</Text>
                                </View>
                            ) : (
                                !isAssistedHeader && (
                                    <View style={styles.statCard}>
                                        <Feather name="activity" size={16} color={theme.primary} style={styles.statIcon} />
                                        <Animated.View style={{ opacity: statsOpacity }}>
                                            <Text style={styles.statValue}>{fmtVolume(displayStats.totalVolume)}</Text>
                                        </Animated.View>
                                        <Text style={styles.statLabel}>Volume</Text>
                                    </View>
                                )
                            )}
                        </View>

                        {!isCardioHeader && (
                            <View style={styles.bodyWrapper}>
                                <Body
                                    data={formattedTargets}
                                    gender={gender}
                                    side="front"
                                    // female SVG is slightly taller than the male one
                                    scale={gender === 'female' ? 0.7 : 0.75}
                                    border={safeBorder}
                                    colors={bodyColors}
                                    defaultFill={theme.bodyFill}
                                />
                                <View style={styles.bodyDivider} />
                                <Body
                                    data={formattedTargets}
                                    gender={gender}
                                    side="back"
                                    scale={gender === 'female' ? 0.7 : 0.75}
                                    border={safeBorder}
                                    colors={bodyColors}
                                    defaultFill={theme.bodyFill}
                                />
                            </View>
                        )}

                        {!isCardioHeader && (
                            <PRGraphCard
                                exerciseID={props.exerciseID}
                                exerciseName={exerciseName}
                                isCompact={true}
                            />
                        )}

                        {/* Rep records: best weight held for at least N reps */}
                        {!isCardioHeader && !isAssistedHeader && displayHeader.repRecords.length > 0 && (
                            <Animated.View style={[styles.repCard, { opacity: headerOpacity }]}>
                                <Text style={styles.repCardTitle}>Rep Records</Text>
                                <View style={styles.repGrid}>
                                    {[displayHeader.repRecords.slice(0, Math.ceil(displayHeader.repRecords.length / 2)), displayHeader.repRecords.slice(Math.ceil(displayHeader.repRecords.length / 2))].map((column, colIdx) => (
                                        <View key={colIdx} style={styles.repColumn}>
                                            {column.map(record => (
                                                <View key={record.reps} style={styles.repRow}>
                                                    <View style={styles.repBadge}>
                                                        <Text style={styles.repBadgeText}>{record.reps}</Text>
                                                    </View>
                                                    <Text style={styles.repWeight}>{fmtWeight(record.weight)}</Text>
                                                </View>
                                            ))}
                                        </View>
                                    ))}
                                </View>
                            </Animated.View>
                        )}

                        <View style={styles.historyHeaderRow}>
                            <Text style={styles.sectionTitle}>History</Text>
                            {!isCardioHeader && (
                                <TouchableOpacity
                                    activeOpacity={0.75}
                                    onPress={() => {
                                        const next = !showOnlyPRs;
                                        setShowOnlyPRs(next);
                                        setFilterAnimKey(k => k + 1);
                                    }}
                                    style={[
                                        styles.prFilterPill,
                                        showOnlyPRs && {
                                            backgroundColor: theme.primary,
                                            borderColor: theme.primary,
                                        },
                                    ]}
                                >
                                    <MaterialCommunityIcons
                                        name="trophy"
                                        size={13}
                                        color={showOnlyPRs ? '#fff' : theme.textSecondary}
                                    />
                                    <Text style={[
                                        styles.prFilterText,
                                        showOnlyPRs && { color: '#fff', fontFamily: FONTS.bold },
                                    ]}>
                                        PRs Only
                                    </Text>
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
                        formatDate={formatDate}
                        onSessionSelect={handleSessionSelect}
                        onSessionMenu={handleSessionMenu}
                        exercisesList={exercisesList}
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

            {contextMenu && (
                <ContextMenu
                    anchor={contextMenu}
                    items={menuItems}
                    onClose={() => setContextMenu(null)}
                />
            )}
        </View>
    );
};

const getStyles = (theme) => StyleSheet.create({
    container: {
        flex: 1,
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
        paddingBottom: 100,
    },
    headerWrapper: {
        paddingTop: 10,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 18,
        paddingHorizontal: 16,
    },
    eyebrow: {
        fontSize: 12,
        fontFamily: FONTS.semiBold,
        color: theme.textSecondary,
        letterSpacing: 1.1,
        marginBottom: 2,
    },
    exerciseTitle: {
        fontSize: 26,
        fontFamily: FONTS.bold,
        letterSpacing: -0.5,
        color: theme.text,
    },
    insightLine: {
        fontSize: 13,
        fontFamily: FONTS.regular,
        color: theme.textSecondary,
        marginTop: 4,
        lineHeight: 18,
        minHeight: 18,
    },
    editButton: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: theme.overlayInput,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 4,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 20,
        gap: 10,
        paddingHorizontal: 12,
    },
    statCard: {
        flex: 1,
        backgroundColor: theme.surface,
        borderRadius: 16,
        paddingVertical: 16,
        paddingHorizontal: 8,
        alignItems: 'center',
        ...(isLightTheme(theme) ? getThemedShadow(theme, 'small') : null),
    },
    statIcon: {
        marginBottom: 8,
        opacity: 0.8,
    },
    statValue: {
        fontSize: 18,
        fontFamily: FONTS.bold,
        color: theme.text,
        marginBottom: 2,
    },
    statLabel: {
        fontSize: 11,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    bodyWrapper: {
        flexDirection: 'row',
        justifyContent: 'space-evenly',
        alignItems: 'center',
        backgroundColor: theme.surface,
        borderRadius: 16,
        marginBottom: 20,
        marginHorizontal: 12,
        ...(isLightTheme(theme) ? getThemedShadow(theme, 'small') : null),
    },
    bodyDivider: {
        width: 1,
        height: '80%',
        backgroundColor: theme.border,
        opacity: 0.5,
    },
    historyHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 10,
        marginBottom: 16,
        paddingHorizontal: 12,
    },
    sectionTitle: {
        fontSize: 20,
        fontFamily: FONTS.bold,
        color: theme.text,
    },
    prFilterPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: theme.overlayInput,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: RADIUS.pill,
    },
    prFilterText: {
        fontSize: 13,
        fontFamily: FONTS.semiBold,
        color: theme.textSecondary,
    },
    sessionCard: {
        marginBottom: 14,
        marginHorizontal: 12,
        backgroundColor: theme.surface,
        borderRadius: 16,
        overflow: 'hidden',
        ...(isLightTheme(theme) ? getThemedShadow(theme, 'small') : null),
    },
    sessionHeader: {
        paddingHorizontal: 12,
        paddingVertical: 14,
        backgroundColor: theme.overlaySubtle,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    repCard: {
        backgroundColor: theme.surface,
        borderRadius: 16,
        marginHorizontal: 12,
        marginBottom: 20,
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 10,
        ...(isLightTheme(theme) ? getThemedShadow(theme, 'small') : null),
    },
    repCardTitle: {
        fontSize: 12,
        fontFamily: FONTS.semiBold,
        color: theme.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        marginBottom: 10,
    },
    repGrid: {
        flexDirection: 'row',
        gap: 24,
    },
    repColumn: {
        flex: 1,
    },
    repRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 7,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.border,
    },
    repBadge: {
        minWidth: 26,
        height: 21,
        borderRadius: 6,
        backgroundColor: theme.overlayInput,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 5,
    },
    repBadgeText: {
        fontSize: 11,
        fontFamily: FONTS.bold,
        color: theme.textSecondary,
    },
    repWeight: {
        fontSize: 14,
        fontFamily: FONTS.semiBold,
        color: theme.text,
        fontVariant: ['tabular-nums'],
    },
    sessionTitle: {
        fontSize: 16,
        fontFamily: FONTS.bold,
        color: theme.text,
        marginBottom: 4,
    },
    sessionDateContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    sessionDate: {
        fontSize: 12,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
    },
    dot: {
        width: 3,
        height: 3,
        borderRadius: 1.5,
        backgroundColor: theme.textSecondary,
        opacity: 0.5,
    },
    iconButton: {
        padding: 6,
        opacity: 0.5,
    },
    noteContainer: {
        flexDirection: 'row',
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 8,
        backgroundColor: theme.overlayBorder,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
    },
    noteText: {
        flex: 1,
        fontSize: 13,
        color: theme.textSecondary,
        fontFamily: FONTS.regular,
        fontStyle: 'italic',
        lineHeight: 18,
    },
    setsContainer: {
        paddingVertical: 4,
        paddingBottom: 8,
    },
    setsHeaderRow: {
        flexDirection: 'row',
        paddingVertical: 8,
        paddingHorizontal: 12,
        marginBottom: 4,
    },
    colHeader: {
        fontSize: 10,
        fontFamily: FONTS.bold,
        color: theme.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    colHeaderSet: { width: 34 },
    colHeaderLift: {
        flex: 2,
        textAlign: 'left',
        paddingLeft: 6,
    },
    colHeader1RM: { flex: 1, textAlign: 'center' },
    setRowContainer: {
        paddingVertical: 6,
        paddingHorizontal: 12,
    },
    setRow: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 28,
    },
    setRowOdd: {
        backgroundColor: theme.overlaySubtle,
    },
    badgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 6,
        flexWrap: 'wrap',
    },
    setLift: {
        flex: 2,
        textAlign: 'left',
        paddingLeft: 6,
        fontSize: 15,
        fontFamily: FONTS.bold,
        color: theme.text,
        letterSpacing: 0.2,
    },
    setLiftWarmup: {
        color: theme.textSecondary,
    },
    setLiftDrop: {
        color: theme.info,
    },
    setOneRM: {
        flex: 1,
        textAlign: 'center',
        fontSize: 13,
        fontFamily: FONTS.semiBold,
        color: theme.textSecondary,
    },
    emptyContainer: {
        padding: 40,
        alignItems: 'center',
        marginTop: 20,
    },
    emptyIconCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: theme.surface,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
        borderWidth: 1,
        borderColor: theme.border,
    },
    emptyText: {
        color: theme.text,
        fontFamily: FONTS.bold,
        fontSize: 18,
        marginBottom: 8,
    },
    emptySubtext: {
        color: theme.textSecondary,
        fontFamily: FONTS.regular,
        fontSize: 14,
        textAlign: 'center',
    },
});

export default ExerciseHistory;