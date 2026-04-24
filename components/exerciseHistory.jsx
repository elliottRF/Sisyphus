import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, ActivityIndicator, Animated, Alert } from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import Body from "react-native-body-highlighter";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { fetchExerciseHistory, fetchExercises, fetchWorkoutHistoryBySession, getLatestBodyWeight, getExerciseSnapshot } from './db';
import { FONTS, SHADOWS } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import PRGraphCard from "./PRGraphCard";
import { Stack } from 'expo-router';
import { formatWeight, formatWeightLabel, unitLabel } from '../utils/units';
import { customAlert } from '../utils/customAlert';
import { getExerciseSnapshotSync, parseStrengthRatios } from '../utils/exerciseSnapshots';



const { width } = Dimensions.get('window');

const TIER_LABELS = ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite'];
const TIER_COLORS = ['#E05555', '#E08C38', '#ffdd47', '#52B56E', '#8500b9'];

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
    const borderColor = `${brightColor}50`;

    return (
        <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 6,
            borderWidth: 1,
            gap: 4,
            marginRight: 6,
            backgroundColor: bgColor,
            borderColor: borderColor
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

const StrengthLegend = React.memo(({ currentTier, theme, strengthRatios, bw }) => {
    const { useImperial } = useTheme();

    const handlePress = (index, label) => {
        if (!strengthRatios || strengthRatios[index] === undefined) {
            customAlert(
                "Information",
                "Strength standards for this exercise haven't been added yet.",
                [{ text: "OK", style: "default" }]
            );
            return;
        }

        const ratio = strengthRatios[index];
        const requiredWeight = (bw * ratio).toFixed(1);

        customAlert(
            `${label} Target`,
            `1RM of ${formatWeight(requiredWeight, useImperial)}${unitLabel(useImperial)} required at ${formatWeight(bw, useImperial)}${unitLabel(useImperial)} bodyweight.`,
            [{ text: "Got it", style: "default" }],
            { iconType: 'confirm' }
        );
    };

    return (
        <View style={{
            flexDirection: 'row',
            justifyContent: 'center',
            flexWrap: 'wrap',
            rowGap: 6,
            columnGap: 4,
            paddingHorizontal: 20,
            paddingTop: 10,
            paddingBottom: 14,
        }}>
            {TIER_LABELS.map((label, i) => {
                const tierNum = i + 1;

                // Active if match found
                const isActive = currentTier === tierNum || (currentTier === 0 && tierNum === 1);

                // Only mark as past if we actually have a valid currentTier
                const isPast = currentTier !== null && currentTier !== 0 && tierNum < currentTier;

                // If currentTier is null, everything is treated as 'future' (dimmed)
                const isFuture = currentTier === null || (currentTier === 0 ? tierNum > 1 : tierNum > currentTier);

                return (
                    <TouchableOpacity
                        key={label}
                        activeOpacity={0.7}
                        onPress={() => handlePress(i, label)}
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 5,
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            borderRadius: 20,
                            borderWidth: 1,
                            borderColor: isActive ? TIER_COLORS[i] : 'transparent',
                            backgroundColor: isActive ? `${TIER_COLORS[i]}22` : 'transparent',
                            opacity: isFuture ? 0.38 : isPast ? 0.6 : 1,
                        }}
                    >
                        <View style={{
                            width: 7,
                            height: 7,
                            borderRadius: 3.5,
                            backgroundColor: TIER_COLORS[i],
                        }} />
                        <Text style={{
                            fontSize: 11,
                            fontFamily: isActive ? FONTS.bold : FONTS.medium,
                            color: isActive ? TIER_COLORS[i] : theme.textSecondary,
                        }}>
                            {label}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
});

const HistorySessionCard = React.memo(({ session, exercises, theme, styles, formatDate, onSessionSelect, exercisesList, animationKey }) => {
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
        <Animated.View style={{
            opacity: entranceOpacity,
            transform: [{ translateY: entranceTranslateY }],
        }}>
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
                                                    `${set.distance || 0}km / ${(set.seconds / 60).toFixed(1)} mins`
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

const ALL_MUSCLE_SLUGS = [
    'chest', 'quadriceps', 'triceps', 'biceps', 'hamstring',
    'upper-back', 'lower-back', 'deltoids', 'gluteal', 'forearm',
    'trapezius', 'calves', 'abs', 'adductors', 'obliques',
    'tibialis', 'abductors', 'neck', 'hands', 'feet', 'knees', 'ankles'
];

const DEFAULT_MUSCLE_TARGETS = ALL_MUSCLE_SLUGS.map(slug => ({ slug, intensity: 1 }));
const EMPTY_STATS = {
    totalSets: null,
    personalBest: null,
    totalVolume: null,
    maxDistance: null,
    bestPace: null,
};

const splitMuscleString = (value) =>
    value
        ? value.split(',').map(muscle => muscle.trim()).filter(Boolean)
        : [];

const buildFormattedTargets = (targetSelected = [], accessorySelected = []) => {
    const workedSlugs = new Set();

    const targetIntensity = 3;

    const sluggedTargets = targetSelected.map(target => {
        const slug = typeof target === 'string' ? target.trim().toLowerCase() : '';
        workedSlugs.add(slug);
        return { slug, intensity: targetIntensity, key: slug };
    });

    const sluggedAccessories = accessorySelected.map(accessory => {
        const slug = typeof accessory === 'string' ? accessory.trim().toLowerCase() : '';
        workedSlugs.add(slug);
        return { slug, intensity: 2, key: slug };
    });

    const unworked = ALL_MUSCLE_SLUGS
        .filter(slug => !workedSlugs.has(slug))
        .map(slug => ({ slug, intensity: 1 }));

    return [...sluggedTargets, ...sluggedAccessories, ...unworked];
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


const FadingStatText = React.memo(({ text, style, animateInitialPlaceholder = true }) => {
    const fadeAnim = useRef(new Animated.Value(1)).current;
    const [displayText, setDisplayText] = useState(text);

    useEffect(() => {
        if (text !== displayText) {
            const isInitialPlaceholder = displayText == null || displayText === '—' || displayText === 'â€”';
            if (isInitialPlaceholder && !animateInitialPlaceholder) {
                setDisplayText(text);
                fadeAnim.setValue(1);
                return;
            }

            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 150,
                useNativeDriver: true,
            }).start(() => {
                setDisplayText(text);
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 250,
                    useNativeDriver: true,
                }).start();
            });
        }
    }, [text]);

    return (
        <Animated.Text style={[style, { opacity: fadeAnim }]}>
            {displayText}
        </Animated.Text>
    );
});

const ExerciseHistory = (props) => {
    const { theme, gender, useImperial } = useTheme();
    const router = useRouter();
    const styles = getStyles(theme);
    const initialSnapshot = getExerciseSnapshotSync(props.exerciseID);
    const hasInitialSnapshot = !!initialSnapshot;
    const initialSnapshotExercise = snapshotToExerciseRecord(initialSnapshot);
    const initialSnapshotHasStrengthRatios = !!initialSnapshot?.strengthRatios?.length;
    const initialCanShowBodyOverlay = !!initialSnapshotExercise && !initialSnapshotHasStrengthRatios;

    const [workoutHistory, setWorkoutHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exercisesList, setExercises] = useState(initialSnapshotExercise ? [initialSnapshotExercise] : []);
    const [formattedTargets, setFormattedTargets] = useState(() => initialSnapshotExercise
        ? buildFormattedTargets(
            splitMuscleString(initialSnapshotExercise.targetMuscle),
            splitMuscleString(initialSnapshotExercise.accessoryMuscles)
        )
        : DEFAULT_MUSCLE_TARGETS);
    const [bodyWeight, setBodyWeight] = useState(null);
    const [strengthRatios, setStrengthRatios] = useState(initialSnapshot?.strengthRatios || []);
    const [best1RM, setBest1RM] = useState(initialSnapshot?.best1RM ?? null);
    const [hasLoadedHistory, setHasLoadedHistory] = useState(false);
    const [hasLoadedBodyWeight, setHasLoadedBodyWeight] = useState(false);

    const bodyOpacity = useRef(new Animated.Value(initialCanShowBodyOverlay ? 1 : 0)).current;

    const [stats, setStats] = useState(initialSnapshot?.stats || EMPTY_STATS);
    const [showOnlyPRs, setShowOnlyPRs] = useState(false);
    const [filterAnimKey, setFilterAnimKey] = useState(0);

    const [exerciseName, setExerciseName] = useState(initialSnapshot?.name || props.exerciseName);

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

    const hasStrengthRatios = !!strengthRatios?.length;
    const hasBodyWeight = bodyWeight != null;

    // FIX 1: strengthTier MUST be declared before isMuscleDataReady.
    // Previously isMuscleDataReady referenced strengthTier before its declaration;
    // Babel hoists const→var so it evaluated to undefined, making the ready-check
    // fire a render too early and causing the body highlighter color flash.
    const strengthTier = useMemo(() => {
        if (!hasStrengthRatios || !bodyWeight?.weight || best1RM == null) return null;
        const bw = bodyWeight.weight;
        let tier = 0;
        for (let i = 0; i < strengthRatios.length; i++) {
            if (best1RM >= bw * strengthRatios[i]) tier = i + 1;
        }
        return tier;
    }, [hasStrengthRatios, strengthRatios, bodyWeight, best1RM]);

    // FIX 1 cont.: now strengthTier is a real value (not hoisted-undefined) when
    // this memo runs, so the body only becomes "ready" once all three inputs exist.
    const isMuscleDataReady = useMemo(() => {
        return (
            exercisesList.length > 0 &&
            (
                !hasStrengthRatios ||
                (strengthTier !== null && bodyWeight?.weight != null)
            )
        );
    }, [exercisesList, hasStrengthRatios, strengthTier, bodyWeight]);

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

    const applySnapshot = useCallback((snapshot) => {
        if (!snapshot) return;

        setExerciseName(snapshot.name || props.exerciseName);
        setStrengthRatios(Array.isArray(snapshot.strengthRatios) ? snapshot.strengthRatios : []);
        setBest1RM(snapshot.best1RM ?? 0);
        setStats(snapshot.stats || EMPTY_STATS);
        const snapshotExercise = snapshotToExerciseRecord(snapshot);

        setExercises(prev => {
            const rest = (prev || []).filter(ex => ex.exerciseID !== snapshot.exerciseID);
            return [snapshotExercise, ...rest];
        });
        setFormattedTargets(buildFormattedTargets(
            splitMuscleString(snapshot.targetMuscle),
            splitMuscleString(snapshot.accessoryMuscles),
            !!snapshot.strengthRatios?.length
        ));
    }, [props.exerciseName]);

    useEffect(() => {
        let isActive = true;
        const syncSnapshot = getExerciseSnapshotSync(props.exerciseID);

        if (syncSnapshot) {
            applySnapshot(syncSnapshot);
        } else {
            setExerciseName(props.exerciseName);
            setStrengthRatios([]);
            setBest1RM(null);
            setStats(EMPTY_STATS);
            setExercises([]);
            setFormattedTargets(DEFAULT_MUSCLE_TARGETS);
        }
        setHasLoadedHistory(false);
        setHasLoadedBodyWeight(false);
        bodyOpacity.setValue(initialCanShowBodyOverlay ? 1 : 0);

        getExerciseSnapshot(props.exerciseID)
            .then(snapshot => {
                if (isActive) applySnapshot(snapshot);
            })
            .catch(error => console.error('Error loading cached exercise snapshot:', error));

        return () => {
            isActive = false;
        };
    }, [props.exerciseID, applySnapshot]);

    useEffect(() => {
        if (exercisesList.length === 0) return;

        const current = exercisesList.find(e => e.exerciseID === props.exerciseID);
        if (!current) return;

        setExerciseName(current.name);
        setStrengthRatios(parseStrengthRatios(current.strengthRatios));
    }, [exercisesList]);

    useEffect(() => {
        if (!isMuscleDataReady) return;

        const { targetMuscles, accessoryMuscles } =
            getExerciseMuscles(props.exerciseID, exercisesList);

        handleMuscleStrings(targetMuscles, accessoryMuscles, strengthTier);
    }, [isMuscleDataReady, strengthTier, exercisesList]);


    const hasResolvedMuscles = exercisesList.some(exercise =>
        exercise.exerciseID === props.exerciseID && (
            !!exercise.targetMuscle?.trim() || !!exercise.accessoryMuscles?.trim()
        )
    );

    const canResolveStrengthColor = !hasStrengthRatios || (
        hasLoadedHistory &&
        hasLoadedBodyWeight &&
        strengthTier !== null &&
        bodyWeight?.weight != null
    );

    const overlayBodyColors = useMemo(() => {
        if (!hasResolvedMuscles) return null;
        if (!canResolveStrengthColor) return null;

        if (hasStrengthRatios && strengthTier !== null) {
            return [
                theme.bodyFill,
                TIER_COLORS[Math.max(0, strengthTier - 1)] + '60',
                TIER_COLORS[Math.max(0, strengthTier - 1)]
            ];
        }

        return isDynamic
            ? [theme.bodyFill, '#2DC4B660', '#2DC4B6']
            : [theme.bodyFill, theme.primary + '60', theme.primary];
    }, [hasResolvedMuscles, canResolveStrengthColor, hasStrengthRatios, strengthTier, theme, isDynamic]);

    const isStrengthReady = !hasStrengthRatios || (
        strengthTier !== null && bodyWeight?.weight != null
    );

    const canShowBodyOverlay =
        hasResolvedMuscles &&
        !!overlayBodyColors &&
        isStrengthReady;


    useEffect(() => {
        if (canShowBodyOverlay) {
            Animated.timing(bodyOpacity, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
            }).start();
        } else {
            bodyOpacity.setValue(0);
        }
    }, [canShowBodyOverlay]);


    const getExerciseMuscles = (exerciseID, exerciseLog) => {
        const exercise = exerciseLog.find(ex => ex.exerciseID === exerciseID);
        if (!exercise) return { targetMuscles: [], accessoryMuscles: [] };
        const targetMuscles = exercise.targetMuscle ? exercise.targetMuscle.split(',') : [];
        const accessoryMuscles = exercise.accessoryMuscles ? exercise.accessoryMuscles.split(',') : [];
        return { targetMuscles, accessoryMuscles };
    };

    const handleMuscleStrings = (targetSelected, accessorySelected, tier = null) => {
        setFormattedTargets(buildFormattedTargets(targetSelected, accessorySelected, hasStrengthRatios, tier));
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
        }, [props.exerciseID])
    );

    useFocusEffect(
        useCallback(() => {
            getLatestBodyWeight()
                .then(bw => {
                    setBodyWeight(bw);
                    console.log("Latest body weight:", bw);
                })
                .catch(() => { })
                .finally(() => setHasLoadedBodyWeight(true));
        }, [])
    );

    const loadWorkoutHistory = async () => {
        try {
            const history = await fetchExerciseHistory(props.exerciseID);
            const groupedHistory = groupBySession(history);
            setWorkoutHistory(groupedHistory);
            const nextBest1RM = history.reduce((max, entry) => {
                const value = Number(entry.oneRM) || 0;
                return value > max ? value : max;
            }, 0);
            setBest1RM(nextBest1RM);
        } catch (error) {
            console.error("Error loading workout history:", error);
        } finally {
            setHasLoadedHistory(true);
            setLoading(false);
        }
    };

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

    const bodyColors = useMemo(() => {
        if (hasStrengthRatios && strengthTier !== null) {
            const activeTierIdx = Math.max(0, strengthTier - 1);
            const activeColor = TIER_COLORS[activeTierIdx];

            return [
                theme.bodyFill,
                `${activeColor}60`,
                ...TIER_COLORS
            ];
        }

        return isDynamic
            ? [theme.bodyFill, '#2DC4B660', '#2DC4B6']
            : [theme.bodyFill, `${theme.primary}60`, theme.primary];
    }, [hasStrengthRatios, strengthTier, theme, isDynamic]);

    const safeBorder = isDynamic ? '#4d4d4d' : theme.border;
    const fallbackBodyColors = [theme.bodyFill, theme.bodyFill, theme.bodyFill];
    const resolvedBodyColors = overlayBodyColors || fallbackBodyColors;

    const currentExerciseDetails = exercisesList.find(e => e.exerciseID === props.exerciseID);
    const isCardioHeader = !!currentExerciseDetails?.isCardio;
    const isAssistedHeader = !!currentExerciseDetails?.isAssisted;

    const isBodyReady = useMemo(() => {
        if (exercisesList.length === 0) return false;

        const isBodyReady = exercisesList.length > 0 && formattedTargets.length > 0;

        return true;
    }, [exercisesList, hasStrengthRatios, strengthTier, bodyWeight]);

    const fmtWeight = (val) =>
        val == null
            ? '—'
            : `${+formatWeight(val, useImperial, 1).toFixed(1)}${unitLabel(useImperial)}`;
    const fmtVolume = (val) =>
        val == null ? '—' : `${(val / 1000).toFixed(1)}k`;
    const fmtDist = (val) =>
        val == null ? '—' : `${val}km`;
    const fmtPace = (val) =>
        val == null || val === Infinity ? '—' : val.toFixed(1);
    const fmtSets = (val) =>
        val == null ? '—' : String(val);

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
                            <Text style={styles.exerciseTitle}>{exerciseName}</Text>
                            <TouchableOpacity
                                onPress={showEditSheet}
                                style={styles.editButton}
                                activeOpacity={0.7}
                            >
                                <MaterialIcons name="edit" size={20} color={theme.text} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.statsRow}>
                            {isCardioHeader ? (
                                <View style={styles.statCard}>
                                    <Feather name="map-pin" size={16} color={theme.primary} style={styles.statIcon} />
                                    <FadingStatText text={fmtDist(stats.maxDistance)} style={styles.statValue} animateInitialPlaceholder={!hasInitialSnapshot} />
                                    <Text style={styles.statLabel}>Longest Dist</Text>
                                </View>
                            ) : (
                                !isCardioHeader && (
                                    <View style={styles.statCard}>
                                        <Feather name="award" size={16} color={theme.primary} style={styles.statIcon} />
                                        <FadingStatText
                                            text={stats.personalBest == null
                                                ? '—'
                                                : `${isAssistedHeader && stats.personalBest > 0 ? '-' : ''}${fmtWeight(stats.personalBest)}`
                                            }
                                            style={styles.statValue}
                                            animateInitialPlaceholder={!hasInitialSnapshot}
                                        />
                                        <Text style={styles.statLabel}>Weight PR</Text>
                                    </View>
                                )
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
                            ) : (
                                !isAssistedHeader && (
                                    <View style={styles.statCard}>
                                        <Feather name="activity" size={16} color={theme.primary} style={styles.statIcon} />
                                        <FadingStatText text={fmtVolume(stats.totalVolume)} style={styles.statValue} animateInitialPlaceholder={!hasInitialSnapshot} />
                                        <Text style={styles.statLabel}>Volume</Text>
                                    </View>
                                )
                            )}
                        </View>

                        {!isCardioHeader && (
                            // FIX 2 cont.: bodyWrapper is now a column so the legend always
                            // sits below the body pair without flexWrap hacks.
                            <View style={styles.bodyWrapper}>

                                {/* Body always rendered — opacity animated 0→1 once colours are
                                    finalised. No mount/unmount swap means no layout jump and no
                                    Body-internal colour transition on first paint. */}
                                <View
                                    style={{
                                        position: 'relative',
                                        flexDirection: 'row',
                                        justifyContent: 'space-evenly',
                                        alignItems: 'center',
                                        width: '100%',
                                        paddingVertical: 8,
                                        minHeight: 300,
                                    }}
                                >
                                    <View
                                        style={{
                                            flexDirection: 'row',
                                            justifyContent: 'space-evenly',
                                            alignItems: 'center',
                                            width: '100%',
                                        }}
                                    >
                                        <Body
                                            data={DEFAULT_MUSCLE_TARGETS}
                                            gender={gender}
                                            side="front"
                                            scale={0.75}
                                            border={safeBorder}
                                            colors={fallbackBodyColors}
                                            defaultFill={theme.bodyFill}
                                        />

                                        <View style={styles.bodyDivider} />

                                        <Body
                                            data={DEFAULT_MUSCLE_TARGETS}
                                            gender={gender}
                                            side="back"
                                            scale={0.75}
                                            border={safeBorder}
                                            colors={fallbackBodyColors}
                                            defaultFill={theme.bodyFill}
                                        />
                                    </View>

                                    <Animated.View
                                        pointerEvents="none"
                                        style={{
                                            position: 'absolute',
                                            top: 8,
                                            left: 0,
                                            right: 0,
                                            bottom: 8,
                                            flexDirection: 'row',
                                            justifyContent: 'space-evenly',
                                            alignItems: 'center',
                                            opacity: bodyOpacity,
                                        }}
                                    >
                                        <Body
                                            data={canShowBodyOverlay ? formattedTargets : DEFAULT_MUSCLE_TARGETS}
                                            gender={gender}
                                            side="front"
                                            scale={0.75}
                                            border={safeBorder}
                                            colors={resolvedBodyColors}
                                            defaultFill={theme.bodyFill}
                                        />

                                        <View style={styles.bodyDivider} />

                                        <Body
                                            data={canShowBodyOverlay ? formattedTargets : DEFAULT_MUSCLE_TARGETS}
                                            gender={gender}
                                            side="back"
                                            scale={0.75}
                                            border={safeBorder}
                                            colors={resolvedBodyColors}
                                            defaultFill={theme.bodyFill}
                                        />
                                    </Animated.View>
                                </View>

                                <View style={{
                                    width: '100%',
                                    borderTopWidth: 1,
                                    borderTopColor: safeBorder,
                                    opacity: isMuscleDataReady ? 1 : 0.35,
                                }}>
                                    <StrengthLegend
                                        currentTier={
                                            hasStrengthRatios && hasBodyWeight && isMuscleDataReady
                                                ? strengthTier
                                                : null
                                        }
                                        theme={theme}
                                        strengthRatios={hasStrengthRatios ? strengthRatios : null}
                                        bw={hasBodyWeight ? bodyWeight.weight : null}
                                    />
                                </View>
                            </View>
                        )}

                        {!isCardioHeader && (
                            <PRGraphCard
                                exerciseID={props.exerciseID}
                                exerciseName={exerciseName}
                                isCompact={true}
                            />
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
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
        position: 'relative',
        minHeight: 44,
        paddingHorizontal: 12,
    },
    exerciseTitle: {
        fontSize: 24,
        fontFamily: FONTS.bold,
        color: theme.text,
        textAlign: 'center',
        paddingHorizontal: 50,
    },
    editButton: {
        position: 'absolute',
        right: 0,
        padding: 10,
        backgroundColor: theme.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.border,
        marginRight: 12,
        ...SHADOWS.small,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 24,
        gap: 12,
        paddingHorizontal: 12,
    },
    statCard: {
        flex: 1,
        backgroundColor: theme.surface,
        borderRadius: 16,
        paddingVertical: 16,
        paddingHorizontal: 8,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.border,
        ...SHADOWS.small,
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
    // FIX 2 cont.: column layout so Body pair and StrengthLegend stack cleanly
    // without needing flexWrap tricks.
    bodyWrapper: {
        flexDirection: 'column',
        alignItems: 'center',
        backgroundColor: theme.surface,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: theme.border,
        marginBottom: 24,
        marginHorizontal: 12,
        overflow: 'hidden',
        ...SHADOWS.small,
    },
    bodyDivider: {
        width: 1,
        alignSelf: 'stretch',
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
        backgroundColor: theme.surface,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: theme.border,
    },
    prFilterText: {
        fontSize: 13,
        fontFamily: FONTS.semiBold,
        color: theme.textSecondary,
    },
    sessionCard: {
        marginBottom: 16,
        marginHorizontal: 12,
        backgroundColor: theme.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.border,
        overflow: 'hidden',
        ...SHADOWS.small,
    },
    sessionHeader: {
        paddingHorizontal: 12,
        paddingVertical: 14,
        backgroundColor: theme.overlaySubtle,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
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