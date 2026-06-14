import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Dimensions, Animated } from 'react-native';
import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { LineGraph } from 'react-native-graph';
import { FONTS, getThemedShadow, isLightTheme, withAlpha } from '../constants/theme';
import { fetchExerciseProgress, unpinExercise, fetchExercises } from './db';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { AppEvents, on, off } from '../utils/events';
import { formatWeight, unitLabel } from '../utils/units';
import { getExerciseSnapshotSync, updateExerciseSnapshot } from '../utils/exerciseSnapshots';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DEFAULT_GRAPH_HEIGHT = 130;
const COMPACT_GRAPH_HEIGHT = 130;
const CARD_PADDING = 40;
const CARD_MARGIN = 32;
const Y_AXIS_WIDTH = 40;
const GRAPH_RIGHT_PADDING = 0;

const DEBUG_INTERPOLATE = true;

// Largest "nice" number (1/2/5 × 10ⁿ) that is ≤ x. Used to round the y-axis
// bounds to tidy values with a *small* step, so snapping can't balloon the band.
const niceStep = (x) => {
    if (!(x > 0)) return 1;
    const base = Math.pow(10, Math.floor(Math.log10(x)));
    const f = x / base; // 1 ≤ f < 10
    const mult = f >= 5 ? 5 : f >= 2 ? 2 : 1;
    return mult * base;
};

export const computeGraphPoints = (history, isAssisted = false) => {
    if (!history?.length) return [];

    const dailyData = {};
    history.forEach(entry => {
        const date = new Date(entry.time);
        if (isNaN(date.getTime())) return;
        if (entry.setType === 'W') return;

        const reps = Number(entry.reps) || 0;
        if (reps <= 0) return;

        const dateKey = date.toISOString().split('T')[0];
        const oneRM = Number(entry.oneRM) || 0;
        const weight = Number(entry.weight) || 0;

        if (!dailyData[dateKey]) {
            dailyData[dateKey] = { date: entry.time, max1RM: 0, maxWeight: isAssisted ? Infinity : 0 };
        }
        if (oneRM > dailyData[dateKey].max1RM && !isAssisted) dailyData[dateKey].max1RM = Math.round(oneRM);
        // Max weight keeps its decimals (e.g. 2.5 kg plates / lb conversions);
        // only the estimated 1RM is rounded.
        if (isAssisted) {
            if (weight < dailyData[dateKey].maxWeight) dailyData[dateKey].maxWeight = weight;
        } else {
            if (weight > dailyData[dateKey].maxWeight) dailyData[dateKey].maxWeight = weight;
        }
    });

    return Object.values(dailyData)
        .filter(d => d.max1RM > 0 || (isAssisted ? d.maxWeight !== Infinity : d.maxWeight > 0))
        .sort((a, b) => new Date(a.date) - new Date(b.date));
};

// -------------

const CustomSelectionDot = ({ isActive, color, borderColor }) => (
    <View style={{
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: color,
        borderWidth: 3,
        borderColor: borderColor,
        opacity: isActive ? 1 : 0.7,
        shadowColor: borderColor,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 4,
        elevation: 5,
    }} />
);

const TimeRangeSelector = ({ selectedRange, onSelect, theme, styles }) => {
    const ranges = ['3M', '1Y', 'ALL'];
    return (
        <View style={styles.rangeSelector}>
            {ranges.map(range => (
                <TouchableOpacity
                    key={range}
                    onPress={() => onSelect(range)}
                    style={[
                        styles.rangeButton,
                        selectedRange === range && styles.rangeButtonActive
                    ]}
                >
                    <Text style={[
                        styles.rangeText,
                        selectedRange === range && styles.rangeTextActive
                    ]}>
                        {range}
                    </Text>
                </TouchableOpacity>
            ))}
        </View>
    );
};

const GradientOrView = ({ colors, style, theme, children }) => {
    if (theme?.type === 'dynamic') {
        return (
            <View style={[style, { backgroundColor: theme.surface || '#ffffff' }]}>
                {children}
            </View>
        );
    }

    const safeColors = Array.isArray(colors) && colors.every(c => !!c)
        ? colors
        : ['#transparent', '#transparent'];

    return (
        <LinearGradient colors={safeColors} style={style}>
            {children}
        </LinearGradient>
    );
};

const PRGraphCard = ({ exerciseID, exerciseName, onRemove, isCompact = false, onReady }) => {
    const { theme, useImperial } = useTheme();
    const router = useRouter();
    const styles = getStyles(theme, isCompact);

    const graphWidth = isCompact
        ? SCREEN_WIDTH - 24 - 24 - Y_AXIS_WIDTH - GRAPH_RIGHT_PADDING
        : SCREEN_WIDTH - CARD_MARGIN - CARD_PADDING - Y_AXIS_WIDTH - GRAPH_RIGHT_PADDING;
    const graphHeight = isCompact ? COMPACT_GRAPH_HEIGHT : DEFAULT_GRAPH_HEIGHT;

    // Stale-while-revalidate: paint instantly from the persisted snapshot
    // (warmed into memory at app launch), then loadData() recomputes in the
    // background and writes the fresh points back.
    const initialData = useMemo(() => {
        return getExerciseSnapshotSync(exerciseID)?.graphPoints ?? null;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const [allData, setAllData] = useState(initialData ?? []);
    const [loading, setLoading] = useState(!initialData);
    const [graphMode, setGraphMode] = useState('history');
    const [timeRange, setTimeRange] = useState('ALL');
    const [selectedPoint, setSelectedPoint] = useState(null);
    const [isAssisted, setIsAssisted] = useState(false);

    const isTouching = useRef(false);
    // Visible immediately when we already have data at mount; otherwise the
    // chart fades in once loaded.
    const graphOpacity = useRef(new Animated.Value(initialData ? 1 : 0)).current;

    const allDataRef = useRef(allData);
    allDataRef.current = allData;

    // Stacked navigation can leave many of these cards mounted on blurred
    // screens. Events mark them dirty instead of reloading them all at once;
    // the reload happens when (if) the screen is focused again.
    const isFocusedRef = useRef(true);
    const dirtyRef = useRef(false);

    useFocusEffect(
        useCallback(() => {
            isFocusedRef.current = true;
            if (dirtyRef.current) {
                dirtyRef.current = false;
                loadData();
            }
            return () => { isFocusedRef.current = false; };
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [exerciseID])
    );

    useEffect(() => {
        loadData();
        const handler = () => {
            if (isFocusedRef.current) {
                loadData();
            } else {
                dirtyRef.current = true;
            }
        };
        on(AppEvents.REFRESH_HOME, handler);
        on(AppEvents.WORKOUT_COMPLETED, handler);
        on(AppEvents.WORKOUT_DATA_IMPORTED, handler);
        return () => {
            off(AppEvents.REFRESH_HOME, handler);
            off(AppEvents.WORKOUT_COMPLETED, handler);
            off(AppEvents.WORKOUT_DATA_IMPORTED, handler);
        };
    }, [exerciseID]);

    const downsample = (arr, maxPoints) => {
        if (arr.length <= maxPoints) return arr;
        const result = [];
        const step = (arr.length - 1) / (maxPoints - 1);
        for (let i = 0; i < maxPoints; i++) {
            result.push(arr[Math.round(i * step)]);
        }
        return result;
    };

    const loadData = async () => {
        try {
            // Only show the loading placeholder when there's nothing on
            // screen yet — refreshes happen silently behind existing data.
            if (allDataRef.current.length === 0) setLoading(true);

            const exercises = await fetchExercises();
            const exercise = exercises.find(e => e.exerciseID === exerciseID);
            const assisted = !!exercise?.isAssisted;
            setIsAssisted(assisted);
            if (assisted) setGraphMode('maxWeight');

            const history = await fetchExerciseProgress(exerciseID);
            const computed = computeGraphPoints(history, assisted);
            updateExerciseSnapshot(exerciseID, { graphPoints: computed });
            setAllData(computed);
        } catch (error) {
            console.error("Error loading graph data:", error);
        } finally {
            setLoading(false);
            onReady?.();
        }
    };

    const handleUnpin = async () => {
        try {
            await unpinExercise(exerciseID);
            onRemove?.(exerciseID);
        } catch (error) {
            console.error("Error unpinning exercise:", error);
        }
    };

    const { points, minDate, maxDate, yRange } = useMemo(() => {
        if (allData.length === 0) return { points: [], minDate: new Date(), maxDate: new Date(), yRange: [0, 100] };

        let filtered = allData.map(item => ({
            date: new Date(item.date),
            max1RM: Number(item.max1RM) || 0,
            maxWeight: Number(item.maxWeight) === 0 ? 0 : Number(item.maxWeight) // ensure 0 parses to 0
        })).filter(item => !isNaN(item.date.getTime()) && (item.max1RM > 0 || (isAssisted ? item.maxWeight >= 0 : item.maxWeight > 0)));

        if (filtered.length === 0) return { points: [], minDate: new Date(), maxDate: new Date(), yRange: [0, 100] };

        const now = new Date();

        let processed = [];
        const useValue = (p) => graphMode === 'maxWeight' ? p.maxWeight : p.max1RM;
        let tempProcessed = filtered.map(p => ({ date: p.date, value: useValue(p) }))
            .filter(p => isAssisted ? (p.value !== null && p.value !== undefined && p.value !== Infinity && p.value >= 0) : p.value > 0);

        // Keep EVERY point (same dates/count across modes) and carry a running
        // best instead of filtering down to PR points. Equal point counts are
        // what let react-native-graph animate the line between mode switches —
        // filtering produced different-length arrays, so some switches animated
        // and others snapped.
        if (graphMode === 'truePR') {
            let maxVal = 0;
            processed = tempProcessed.map(p => {
                if (p.value > maxVal) maxVal = p.value;
                return { date: p.date, value: maxVal };
            });
        } else if (graphMode === 'maxWeight') {
            let bestVal = isAssisted ? Infinity : 0;
            processed = tempProcessed.map(p => {
                if (isAssisted ? p.value < bestVal : p.value > bestVal) bestVal = p.value;
                return { date: p.date, value: (isAssisted && bestVal === Infinity) ? p.value : bestVal };
            });
        } else {
            processed = tempProcessed;
        }

        processed = processed
            .filter(p => p && p.date && !isNaN(p.date.getTime()) && typeof p.value === 'number' && !isNaN(p.value) && isFinite(p.value))
            .sort((a, b) => a.date - b.date);

        if (processed.length === 0) return { points: [], minDate: new Date(), maxDate: new Date(), yRange: [0, 100] };

        if (DEBUG_INTERPOLATE && processed.length >= 2) {
            const interpolated = [];
            const oneDay = 24 * 60 * 60 * 1000;
            const start = processed[0].date;
            const lastActual = processed[processed.length - 1];

            for (let d = start.getTime(); d <= lastActual.date.getTime(); d += oneDay) {
                const currentDate = new Date(d);
                const exactMatch = processed.find(p => Math.abs(p.date.getTime() - d) < oneDay / 2);

                if (exactMatch) {
                    interpolated.push({ date: currentDate, value: exactMatch.value });
                } else {
                    const nextIndex = processed.findIndex(p => p.date.getTime() > d);
                    if (nextIndex > 0) {
                        const prevPt = processed[nextIndex - 1];
                        const nextPt = processed[nextIndex];
                        const ratio = (d - prevPt.date.getTime()) / (nextPt.date.getTime() - prevPt.date.getTime());
                        interpolated.push({
                            date: currentDate,
                            value: prevPt.value + (nextPt.value - prevPt.value) * ratio,
                        });
                    }
                }
            }

            if (now.getTime() > lastActual.date.getTime()) {
                for (let d = lastActual.date.getTime() + oneDay; d < now.getTime(); d += oneDay) {
                    interpolated.push({ date: new Date(d), value: lastActual.value });
                }
                interpolated.push({ date: now, value: lastActual.value });
            } else {
                const lastInterp = interpolated[interpolated.length - 1];
                if (!lastInterp || Math.abs(lastInterp.date.getTime() - lastActual.date.getTime()) > 1000) {
                    interpolated.push(lastActual);
                }
            }

            let startDate = new Date(0);
            if (timeRange === '3M') {
                startDate = new Date(); startDate.setMonth(now.getMonth() - 3);
            } else if (timeRange === '1Y') {
                startDate = new Date(); startDate.setFullYear(now.getFullYear() - 1);
            }
            let timeFiltered = interpolated.filter(p => p.date >= startDate);
            if (timeFiltered.length === 0 && interpolated.length > 0) {
                const lastVal = interpolated[interpolated.length - 1].value;
                timeFiltered = [
                    { date: startDate, value: lastVal },
                    { date: now, value: lastVal }
                ];
            }

            const maxPts = timeRange === '3M' ? Infinity : 200;
            processed = downsample(timeFiltered, maxPts);
        } else if (!DEBUG_INTERPOLATE && processed.length >= 5) {
            const firstDate = processed[0].date;
            const lastActualDate = processed[processed.length - 1].date;
            const lastDate = now > lastActualDate ? now : lastActualDate;
            const totalDurationMs = lastDate - firstDate;
            const years = totalDurationMs / (1000 * 60 * 60 * 24 * 365);

            let intervalMs;
            if (timeRange === '3M') {
                intervalMs = 1000 * 60 * 60 * 24 * 3;
            } else if (years > 3) {
                intervalMs = 1000 * 60 * 60 * 24 * 30;
            } else {
                intervalMs = 1000 * 60 * 60 * 24 * 7;
            }

            const aggregated = [];
            let iteratorDate = new Date(firstDate);
            let lastValue = processed[0].value;

            while (iteratorDate <= lastDate) {
                const bucketEnd = new Date(iteratorDate.getTime() + intervalMs);
                const inBucket = processed.filter(p => p.date >= iteratorDate && p.date < bucketEnd);

                if (inBucket.length > 0) {
                    const max = inBucket.reduce((a, b) => (a.value > b.value ? a : b));
                    aggregated.push({ date: max.date, value: max.value });
                    lastValue = max.value;
                } else {
                    aggregated.push({ date: new Date(iteratorDate), value: lastValue });
                }
                iteratorDate = bucketEnd;
            }
            processed = aggregated;
        }

        if (!DEBUG_INTERPOLATE) {
            let startDate = new Date(0);
            if (timeRange === '3M') {
                startDate = new Date(); startDate.setMonth(now.getMonth() - 3);
            } else if (timeRange === '1Y') {
                startDate = new Date(); startDate.setFullYear(now.getFullYear() - 1);
            }
            let timeFiltered = processed.filter(p => p.date >= startDate);
            if (timeFiltered.length === 0 && processed.length > 0) {
                const lastVal = processed[processed.length - 1].value;
                timeFiltered = [
                    { date: startDate, value: lastVal },
                    { date: now, value: lastVal }
                ];
            }
            processed = timeFiltered;
        }

        // Convert kg values to the user's preferred unit for display
        const displayPoints = processed.map(p => ({
            ...p,
            value: useImperial ? parseFloat((p.value * 2.20462).toFixed(1)) : p.value
        }));

        const displayValues = displayPoints.map(p => p.value).filter(v => !isNaN(v) && isFinite(v));
        if (displayValues.length === 0) return { points: [], minDate: new Date(), maxDate: new Date(), yRange: [0, 100] };

        const minVal = Math.min(...displayValues);
        const maxVal = Math.max(...displayValues);
        const rawRange = maxVal - minVal;

        let yMin, yMax;

        if (rawRange < 0.5) {
            // Essentially flat — show a small symmetric band so the line sits
            // mid-chart instead of being stretched to fill noise.
            const pad = Math.max(1, Math.abs(maxVal) * 0.05);
            yMin = minVal - pad;
            yMax = maxVal + pad;
        } else {
            // Tight 10% padding so the line fills ~80% of the height, then snap
            // the bounds to a small "nice" step (≤ the padding) for clean axis
            // labels without re-inflating the band.
            const pad = rawRange * 0.1;
            const step = niceStep(pad);
            yMin = Math.floor((minVal - pad) / step) * step;
            yMax = Math.ceil((maxVal + pad) / step) * step;
        }

        yMin = Math.max(0, yMin);

        return {
            points: displayPoints,
            minDate: displayPoints[0].date,
            maxDate: displayPoints[displayPoints.length - 1].date,
            yRange: [yMin, yMax]
        };
    }, [allData, timeRange, graphMode, useImperial]);

    useEffect(() => {
        if (!loading && points && points.length > 0) {
            Animated.timing(graphOpacity, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
            }).start();
        } else if (loading) {
            graphOpacity.setValue(0);
        }
        // Keyed on `loading` only: range/mode switches recompute points without
        // toggling loading, so they don't trigger this fade-in.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading]);

    // Crossfade the line when the time range changes. Range switches change the
    // point count, so react-native-graph can't morph between them — it snaps.
    // Hiding before paint (useLayoutEffect) then fading in masks the snap.
    // Mode switches keep opacity at 1 so their line morph stays visible.
    const isFirstRangeRef = useRef(true);
    useLayoutEffect(() => {
        if (isFirstRangeRef.current) {
            isFirstRangeRef.current = false;
            return;
        }
        graphOpacity.setValue(0);
        Animated.timing(graphOpacity, {
            toValue: 1,
            duration: 260,
            useNativeDriver: true,
        }).start();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timeRange]);

    const trendData = useMemo(() => {
        if (points.length < 2) return { direction: 'flat', label: '0%', delta: `0 ${unitLabel(useImperial)}`, period: 'all time' };

        const now = new Date();
        let pastDate = new Date(0);
        let periodLabel = 'all time';

        if (timeRange === '3M') {
            pastDate = new Date();
            pastDate.setMonth(now.getMonth() - 3);
            periodLabel = '3m';
        } else if (timeRange === '1Y') {
            pastDate = new Date();
            pastDate.setFullYear(now.getFullYear() - 1);
            periodLabel = '1y';
        }

        let pastPoint = null;
        for (let i = points.length - 1; i >= 0; i--) {
            if (points[i].date <= pastDate) { pastPoint = points[i]; break; }
        }

        if (!pastPoint) {
            pastPoint = points[0];
            periodLabel = 'since start';
        }

        const current = points[points.length - 1].value;
        const past = pastPoint.value;
        const diff = current - past;
        const percentChange = past > 0 ? (diff / past) * 100 : 0;
        const formattedPercent = percentChange === 0 ? '0%' : `${percentChange > 0 ? '+' : ''}${percentChange.toFixed(1)}%`;
        const deltaLabel = Math.abs(diff) < 0.05
            ? `0 ${unitLabel(useImperial)}`
            : `${diff > 0 ? '+' : '−'}${Math.abs(diff).toFixed(1)} ${unitLabel(useImperial)}`;

        return {
            direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat',
            label: formattedPercent,
            delta: deltaLabel,
            period: periodLabel
        };
    }, [points, timeRange, isAssisted, useImperial]);

    const axisLabels = useMemo(() => {
        if (!points.length) return [];
        const labels = [];
        const totalTime = maxDate.getTime() - minDate.getTime();
        if (totalTime <= 0) return [];

        const addLabel = (date, text) => {
            const percent = ((date.getTime() - minDate.getTime()) / totalTime) * 100;
            if (percent >= 0 && percent <= 100) {
                labels.push({ text, left: `${percent}%` });
            }
        };

        let d = new Date(minDate);
        if (timeRange === '3M') {
            d.setDate(1);
            while (d <= maxDate) {
                addLabel(new Date(d), d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
                d.setMonth(d.getMonth() + 1);
            }
        } else if (timeRange === '1Y') {
            d.setDate(1);
            while (d <= maxDate) {
                addLabel(new Date(d), d.toLocaleDateString('en-US', { month: 'short' }));
                d.setMonth(d.getMonth() + 1);
            }
        } else {
            d.setMonth(0, 1);
            while (d <= maxDate) {
                addLabel(new Date(d), d.getFullYear().toString());
                d.setFullYear(d.getFullYear() + 1);
            }
        }

        if (labels.length === 0) {
            addLabel(minDate, minDate.toLocaleDateString('en-US', { month: 'short' }));
            addLabel(maxDate, maxDate.toLocaleDateString('en-US', { month: 'short' }));
        }

        return labels;
    }, [points, minDate, maxDate, timeRange]);

    const onPointSelected = useCallback((point) => {
        if (!isTouching.current) return;
        setSelectedPoint(prev => {
            if (!prev && !point) return null;
            if (!prev || !point) return point;
            if (prev.date.getTime() === point.date.getTime() && prev.value === point.value) return prev;
            return point;
        });
    }, []);

    const onGestureStart = useCallback(() => { isTouching.current = true; }, []);
    const onGestureEnd = useCallback(() => { isTouching.current = false; setSelectedPoint(null); }, []);

    const { graphColor, maxWeightColor, gradientFill, maxWeightGradient } = useMemo(() => {
        const primary = theme.type === 'dynamic' ? '#2DC4B6' : theme.primary;
        const secondary = theme.type === 'dynamic' ? '#A29BFE' : theme.secondary;
        return {
            graphColor: primary,
            maxWeightColor: secondary,
            gradientFill: [`${primary}CC`, `${primary}00`],
            maxWeightGradient: [`${secondary}CC`, `${secondary}00`]
        };
    }, [theme]);

    // if (loading) {
    //     return (
    //         <View style={styles.container}>
    //             <ActivityIndicator color={theme.primary} style={{ marginTop: 50 }} />
    //         </View>
    //     );
    // }

    const hasEnoughData = allData.length >= 2 && points.length >= 2;
    const currentValue = points[points.length - 1]?.value || 0;

    const renderModeButton = (mode) => (
        <TouchableOpacity
            key={mode.key}
            onPress={() => setGraphMode(mode.key)}
            style={[styles.modeButton, graphMode === mode.key && styles.modeButtonActive]}
        >
            <MaterialCommunityIcons
                name={mode.icon}
                size={14}
                color={graphMode === mode.key ? theme.primary : theme.textSecondary}
            />
            <Text style={[
                styles.modeButtonText,
                graphMode === mode.key && styles.modeButtonTextActive
            ]}>
                {mode.label}
            </Text>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <GradientOrView
                colors={[theme.surface, theme.surface]}
                style={styles.content}
                theme={theme}
            >
                {!isCompact && (() => {
                    // Progress is good when up (or down for assisted). Colour the
                    // trend accordingly; grey when flat.
                    const goodDirection = isAssisted ? 'down' : 'up';
                    const trendColor = trendData.direction === 'flat'
                        ? theme.textSecondary
                        : trendData.direction === goodDirection ? theme.success : theme.danger;
                    return (
                    <View style={styles.header}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                            <TouchableOpacity
                                onPress={() => router.push(`/exercise/${exerciseID}?name=${encodeURIComponent(exerciseName)}`)}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.eyebrow} numberOfLines={1}>{exerciseName}</Text>
                            </TouchableOpacity>

                            <View style={styles.heroRow}>
                                <Text style={styles.heroValue}>
                                    {hasEnoughData ? currentValue.toFixed(1) : '—'}
                                </Text>
                                {hasEnoughData && <Text style={styles.heroUnit}>{unitLabel(useImperial)}</Text>}
                            </View>

                            <View style={styles.subLine}>
                                {hasEnoughData && points.length >= 2 ? (
                                    <View style={[styles.trendBadge, { alignSelf: 'flex-start', backgroundColor: withAlpha(trendColor, isLightTheme(theme) ? 0.12 : 0.18) }]}>
                                        <Text style={[styles.trendArrow, { color: trendColor }]}>
                                            {trendData.direction === 'up' ? '↑' : trendData.direction === 'down' ? '↓' : '→'}
                                        </Text>
                                        <Text style={[styles.trendText, { color: trendColor, fontFamily: FONTS.bold }]}>
                                            {trendData.delta}
                                        </Text>
                                        <Text style={styles.trendPeriod}>· {trendData.period}</Text>
                                    </View>
                                ) : (
                                    <Text style={styles.subLineText}>
                                        {graphMode === 'maxWeight' ? 'Heaviest lift' : graphMode === 'truePR' ? 'Top 1RM' : 'Estimated 1RM'}
                                    </Text>
                                )}
                            </View>
                        </View>

                        <View style={{ alignItems: 'flex-end', gap: 8 }}>
                            {onRemove && (
                                <TouchableOpacity onPress={handleUnpin} style={styles.unpinButtonQuiet}>
                                    <Feather name="x" size={15} color={theme.textSecondary} />
                                </TouchableOpacity>
                            )}
                            <TimeRangeSelector selectedRange={timeRange} onSelect={setTimeRange} theme={theme} styles={styles} />
                        </View>
                    </View>
                    );
                })()}

                {isCompact && (() => {
                    // Progress is good when up (down for assisted); grey when flat.
                    const goodDirection = isAssisted ? 'down' : 'up';
                    const trendColor = trendData.direction === 'flat'
                        ? theme.textSecondary
                        : trendData.direction === goodDirection ? theme.success : theme.danger;
                    return (
                    // No exercise name (the page is already titled) and no cycling
                    // mode icon (the segmented toggle below owns mode) — just the
                    // range selector and the trend.
                    <View style={styles.compactHeader}>
                        <TimeRangeSelector selectedRange={timeRange} onSelect={setTimeRange} theme={theme} styles={styles} />
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            {hasEnoughData && points.length >= 2 && (
                                <View style={[styles.trendBadge, { backgroundColor: withAlpha(trendColor, isLightTheme(theme) ? 0.12 : 0.18) }]}>
                                    <Text style={[styles.trendArrow, { color: trendColor }]}>
                                        {trendData.direction === 'up' ? '↑' : trendData.direction === 'down' ? '↓' : '→'}
                                    </Text>
                                    <Text style={[styles.trendText, { color: trendColor, fontFamily: FONTS.bold }]}>
                                        {trendData.delta}
                                    </Text>
                                </View>
                            )}
                            {onRemove && (
                                <TouchableOpacity onPress={handleUnpin} style={styles.unpinButtonQuiet}>
                                    <Feather name="x" size={14} color={theme.textSecondary} />
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                    );
                })()}

                {!isAssisted && (
                    <View style={[styles.modeToggleContainer, isCompact && { marginBottom: 8 }]}>
                        {/* 1RM and Top 1RM share the same underlying data, so
                            they sit together in a lightly-tinted box; Max Wt
                            (a different metric) is set apart. */}
                        <View style={styles.modeGroup}>
                            {renderModeButton({ key: 'history', label: '1RM', icon: 'chart-timeline-variant' })}
                            {renderModeButton({ key: 'truePR', label: 'Top 1RM', icon: 'trending-up' })}
                        </View>
                        {renderModeButton({ key: 'maxWeight', label: 'Max Wt', icon: 'weight' })}
                    </View>
                )}

                {hasEnoughData ? (
                    <>
                        <View style={[styles.tooltipContainer, isCompact && { height: 44, marginBottom: 4 }]}>
                            {selectedPoint?.date ? (
                                <View style={styles.activeTooltip}>
                                    <Text style={[styles.tooltipValue, isCompact && { fontSize: 20 }]}>{selectedPoint.value.toFixed(1)} {unitLabel(useImperial)}</Text>
                                    <Text style={styles.tooltipDate}>
                                        {selectedPoint.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </Text>
                                </View>
                            ) : isCompact ? (
                                // Compact has no header hero, so the idle tooltip
                                // shows the current value for the active mode.
                                <View style={styles.placeholderTooltip}>
                                    <Text style={[styles.tooltipValue, { fontSize: 20 }]}>{currentValue.toFixed(1)} {unitLabel(useImperial)}</Text>
                                    <Text style={styles.tooltipDate}>
                                        {graphMode === 'maxWeight' ? 'Heaviest lift' : graphMode === 'truePR' ? 'Top 1RM' : 'Latest 1RM'}
                                    </Text>
                                </View>
                            ) : (
                                // Full mode: the header hero already shows the value,
                                // so the idle scrub readout is just a hint.
                                <View style={styles.activeTooltip}>
                                    <Text style={styles.tooltipHint}>Drag the graph to explore</Text>
                                </View>
                            )}
                        </View>

                        <View style={[styles.graphRow, { height: graphHeight + 30 }]}>
                            <View style={[styles.yAxis, { height: graphHeight }]}>
                                {(() => {
                                    const diff = yRange[1] - yRange[0];
                                    const precision = diff < 3 ? 1 : 0;
                                    return (
                                        <>
                                            <Text style={[styles.yAxisText, { transform: [{ translateY: -6 }] }]}>{yRange[1].toFixed(precision)}</Text>
                                            <Text style={styles.yAxisText}>{((yRange[0] + yRange[1]) / 2).toFixed(precision)}</Text>
                                            <Text style={[styles.yAxisText, { transform: [{ translateY: 6 }] }]}>{yRange[0].toFixed(precision)}</Text>
                                        </>
                                    );
                                })()}
                            </View>

                            <View style={styles.graphCol}>
                                <View pointerEvents="none" style={[StyleSheet.absoluteFill, { height: graphHeight }]}>
                                    {[0, 0.5, 1].map(fraction => (
                                        <View
                                            key={fraction}
                                            style={{
                                                position: 'absolute',
                                                top: fraction * (graphHeight - 1),
                                                left: 10,
                                                right: 10,
                                                height: 1,
                                                backgroundColor: isLightTheme(theme) ? theme.overlayBorder : 'rgba(255,255,255,0.06)',
                                            }}
                                        />
                                    ))}
                                </View>

                                <Animated.View style={{ opacity: graphOpacity }}>
                                    <LineGraph
                                        points={points}
                                        animated={true}
                                        color={graphMode === 'maxWeight' ? maxWeightColor : graphColor}
                                        gradientFillColors={graphMode === 'maxWeight' ? maxWeightGradient : gradientFill}
                                        enablePanGesture={true}
                                        onPointSelected={onPointSelected}
                                        onGestureStart={onGestureStart}
                                        onGestureEnd={onGestureEnd}
                                        enableIndicator
                                        range={{ y: { min: yRange[0], max: yRange[1] } }}
                                        style={{ width: graphWidth, height: graphHeight }}
                                    />
                                </Animated.View>

                                <View style={[styles.xAxisContainer, { top: graphHeight + 8 }]}>
                                    {axisLabels.map((label, index) => (
                                        <Text key={index} style={[styles.xAxisLabel, { left: label.left }]}>
                                            {label.text}
                                        </Text>
                                    ))}
                                </View>
                            </View>
                        </View>
                    </>
                ) : loading ? (
                    // Same height as the loaded tooltip + graph block, so the
                    // card never changes size when data arrives (it used to
                    // render collapsed during slow loads, then jolt open).
                    <View style={styles.graphPlaceholder}>
                        <ActivityIndicator size="small" color={theme.primary} />
                    </View>
                ) : (
                    <View style={[styles.emptyState, styles.graphPlaceholder]}>
                        <Feather name="bar-chart-2" size={isCompact ? 32 : 48} color={theme.textSecondary} style={{ opacity: 0.3, marginBottom: 12 }} />
                        <Text style={styles.emptyText}>Not enough data for this period</Text>
                        <Text style={styles.emptySubText}>Need 2+ workouts to show progress</Text>
                    </View>
                )}
            </GradientOrView>
        </View>
    );
};

const getStyles = (theme, isCompact) => StyleSheet.create({
    container: {
        marginBottom: isCompact ? 12 : 16,
        marginHorizontal: isCompact ? 12 : 16,
        borderRadius: 16,
        backgroundColor: theme.surface,
        overflow: 'hidden',
        ...(isLightTheme(theme) ? getThemedShadow(theme, 'small') : null),
    },
    content: {
        padding: isCompact ? 12 : 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    compactHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    title: {
        fontSize: 18,
        fontFamily: FONTS.bold,
        color: theme.text,
        marginBottom: 2,
    },
    subtitle: {
        fontSize: 12,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
    },
    eyebrow: {
        fontSize: 12,
        fontFamily: FONTS.semiBold,
        color: theme.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        marginBottom: 4,
    },
    heroRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 4,
    },
    heroValue: {
        fontSize: 30,
        fontFamily: FONTS.bold,
        letterSpacing: -0.8,
        color: theme.text,
        fontVariant: ['tabular-nums'],
    },
    heroUnit: {
        fontSize: 15,
        fontFamily: FONTS.semiBold,
        color: theme.textSecondary,
    },
    subLine: {
        minHeight: 24,
        justifyContent: 'center',
        marginTop: 4,
    },
    subLineText: {
        fontSize: 12.5,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
    },
    tooltipHint: {
        fontSize: 12.5,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
        opacity: 0.6,
    },
    unpinButton: {
        padding: 8,
        backgroundColor: isLightTheme(theme) ? theme.overlaySubtle : theme.overlayBorder,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: isLightTheme(theme) ? theme.overlayBorder : 'transparent',
    },
    unpinButtonQuiet: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: theme.overlayInput,
        alignItems: 'center',
        justifyContent: 'center',
    },
    graphRow: {
        flexDirection: 'row',
        marginTop: 10,
        height: (isCompact ? COMPACT_GRAPH_HEIGHT : DEFAULT_GRAPH_HEIGHT) + 30,
    },
    yAxis: {
        width: Y_AXIS_WIDTH,
        height: isCompact ? COMPACT_GRAPH_HEIGHT : DEFAULT_GRAPH_HEIGHT,
        justifyContent: 'space-between',
        paddingRight: 8,
        overflow: 'visible',
    },
    yAxisText: {
        color: theme.textSecondary,
        fontSize: 10,
        fontFamily: FONTS.medium,
    },
    graphCol: {
        flex: 1,
        paddingRight: GRAPH_RIGHT_PADDING,
    },
    xAxisContainer: {
        position: 'absolute',
        top: (isCompact ? COMPACT_GRAPH_HEIGHT : DEFAULT_GRAPH_HEIGHT) + 8,
        left: 0,
        right: 0,
        height: 20,
    },
    xAxisLabel: {
        position: 'absolute',
        color: theme.textSecondary,
        fontSize: 10,
        fontFamily: FONTS.medium,
        transform: [{ translateX: -12 }],
    },
    emptyState: {
        height: 220,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyText: {
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
        fontSize: 14,
    },
    emptySubText: {
        fontSize: 12,
        color: theme.textSecondary,
        marginTop: 4,
    },
    rangeSelector: {
        flexDirection: 'row',
        backgroundColor: theme.overlayInput,
        borderRadius: 9,
        padding: 2,
    },
    rangeButton: {
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 6,
    },
    rangeButtonActive: {
        backgroundColor: isLightTheme(theme) ? withAlpha(theme.primary, 0.12) : theme.overlayInputFocused,
    },
    rangeText: {
        fontSize: 10,
        fontFamily: FONTS.bold,
        color: theme.textSecondary,
    },
    rangeTextActive: {
        color: theme.primary,
    },
    modeToggleContainer: {
        flexDirection: 'row',
        backgroundColor: theme.overlayInput,
        borderRadius: 12,
        padding: 4,
        gap: 6,
        marginBottom: 16,
    },
    // Connects 1RM + Top 1RM into one box (they share the same data). Neutral
    // gray rather than the theme colour so it reads as a grouping, not a state.
    modeGroup: {
        flex: 2,
        flexDirection: 'row',
        borderRadius: 9,
        overflow: 'hidden',
        backgroundColor: withAlpha(theme.textSecondary, isLightTheme(theme) ? 0.08 : 0.12),
    },
    modeButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 5,
        borderRadius: 10,
        gap: 8,
    },
    modeButtonActive: {
        backgroundColor: isLightTheme(theme) ? theme.surface : (theme.surfaceElevated || theme.overlayInputFocused),
    },
    modeButtonText: {
        fontSize: 12,
        fontFamily: FONTS.bold,
        color: theme.textSecondary,
    },
    modeButtonTextActive: {
        color: theme.primary,
    },
    tooltipContainer: {
        height: 44,
        justifyContent: 'center',
        marginBottom: 6,
    },
    // Mirrors tooltipContainer + graphRow so loading/empty/loaded states all
    // occupy identical space.
    graphPlaceholder: {
        height: 44 + (isCompact ? 4 : 6) + (isCompact ? COMPACT_GRAPH_HEIGHT : DEFAULT_GRAPH_HEIGHT) + 30,
        alignItems: 'center',
        justifyContent: 'center',
    },
    activeTooltip: {
        paddingLeft: Y_AXIS_WIDTH,
    },
    placeholderTooltip: {
        paddingLeft: Y_AXIS_WIDTH,
        opacity: 0.7,
    },
    tooltipValue: {
        fontSize: 26,
        fontFamily: FONTS.bold,
        color: theme.text,
    },
    tooltipDate: {
        fontSize: 12,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
        marginTop: 2,
    },
    trendBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: 100,
        gap: 4,
    },
    trendArrow: {
        fontSize: 13,
        fontWeight: '800',
        marginTop: -1,
    },
    trendText: {
        fontSize: 12,
    },
    trendPeriod: {
        fontSize: 10,
        color: theme.textSecondary,
        opacity: 0.8,
    },
});

export default PRGraphCard;
