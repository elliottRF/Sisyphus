import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Dimensions } from 'react-native';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { LineGraph, SelectionDot } from 'react-native-graph';
import { COLORS, FONTS, SHADOWS } from '../constants/theme';
import { fetchExerciseProgress, unpinExercise } from './db';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRAPH_HEIGHT = 220;
const CARD_PADDING = 40;
const CARD_MARGIN = 32;
const Y_AXIS_WIDTH = 40;
const GRAPH_WIDTH = SCREEN_WIDTH - CARD_MARGIN - CARD_PADDING - Y_AXIS_WIDTH;

const CustomSelectionDot = ({ isActive, color }) => (
    <View style={{
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: color,
        borderWidth: 3,
        borderColor: 'white',
        opacity: isActive ? 1 : 0.7,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 5,
    }} />
);

const TimeRangeSelector = ({ selectedRange, onSelect }) => {
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

const PRGraphCard = ({ exerciseID, exerciseName, onRemove, refreshTrigger }) => {
    const [allData, setAllData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showTruePRs, setShowTruePRs] = useState(false);
    const [timeRange, setTimeRange] = useState('ALL');
    const [selectedPoint, setSelectedPoint] = useState(null);

    // This ref prevents race condition when hiding tooltip
    const hideTimeoutRef = useRef(null);
    const isTouching = useRef(false);


    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [exerciseID])
    );

    useEffect(() => {
        if (refreshTrigger !== undefined) {
            loadData();
        }
    }, [refreshTrigger]);

    const loadData = async () => {
        try {
            setLoading(true);
            const history = await fetchExerciseProgress(exerciseID);

            if (!history?.length) {
                setAllData([]);
                return;
            }

            const dailyMax = {};
            history.forEach(entry => {
                const date = new Date(entry.time);
                const dateKey = date.toISOString().split('T')[0];

                if (!dailyMax[dateKey] || entry.oneRM > dailyMax[dateKey].value) {
                    dailyMax[dateKey] = {
                        value: Math.round(entry.oneRM),
                        date: entry.time,
                    };
                }
            });

            let sortedData = Object.values(dailyMax).sort((a, b) => new Date(a.date) - new Date(b.date));
            setAllData(sortedData);
        } catch (error) {
            console.error("Error loading graph data:", error);
            setAllData([]);
        } finally {
            setLoading(false);
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

        let filtered = [...allData];

        // Time Range Filter
        const now = new Date();
        let startDate = new Date(0);

        if (timeRange === '3M') {
            startDate = new Date();
            startDate.setMonth(now.getMonth() - 3);
        } else if (timeRange === '1Y') {
            startDate = new Date();
            startDate.setFullYear(now.getFullYear() - 1);
        }

        filtered = filtered.filter(d => new Date(d.date) >= startDate);
        if (filtered.length === 0) return { points: [], minDate: new Date(), maxDate: new Date(), yRange: [0, 100] };

        // True PR Filter
        if (showTruePRs) {
            let max = 0;
            filtered = filtered.filter(point => {
                if (point.value >= max) {
                    max = point.value;
                    return true;
                }
                return false;
            });
        }

        // Weekly/Monthly Aggregation
        const firstDate = new Date(filtered[0].date);
        const lastDate = new Date(filtered[filtered.length - 1].date);
        const totalDurationMs = lastDate - firstDate;
        const years = totalDurationMs / (1000 * 60 * 60 * 24 * 365);
        const useMonthly = years > 3;
        const intervalMs = useMonthly ? (1000 * 60 * 60 * 24 * 30) : (1000 * 60 * 60 * 24 * 7);

        const aggregatedPoints = [];
        let iteratorDate = new Date(firstDate);
        let lastValue = filtered[0].value;

        if (filtered.length < 5) {
            filtered.forEach(p => aggregatedPoints.push({ date: new Date(p.date), value: p.value }));
        } else {
            while (iteratorDate <= lastDate) {
                const bucketEnd = new Date(iteratorDate.getTime() + intervalMs);
                const pointsInBucket = filtered.filter(d => {
                    const dDate = new Date(d.date);
                    return dDate >= iteratorDate && dDate < bucketEnd;
                });

                if (pointsInBucket.length > 0) {
                    const maxPoint = pointsInBucket.reduce((p, c) => (p.value > c.value) ? p : c);
                    aggregatedPoints.push({ date: new Date(maxPoint.date), value: maxPoint.value });
                    lastValue = maxPoint.value;
                } else {
                    aggregatedPoints.push({ date: new Date(iteratorDate), value: lastValue });
                }
                iteratorDate = bucketEnd;
            }
        }

        aggregatedPoints.sort((a, b) => a.date - b.date);

        // Y-Axis Range with padding
        const values = aggregatedPoints.map(p => p.value);
        const minVal = Math.min(...values);
        const maxVal = Math.max(...values);
        const range = maxVal - minVal;
        const padding = range === 0 ? 10 : range * 0.2;

        let yMin = Math.max(0, minVal - padding);
        let yMax = maxVal + padding;
        if (yMin === yMax) yMax = yMin + 10;

        return {
            points: aggregatedPoints,
            minDate: aggregatedPoints[0]?.date || new Date(),
            maxDate: aggregatedPoints[aggregatedPoints.length - 1]?.date || new Date(),
            yRange: [yMin, yMax]
        };
    }, [allData, timeRange, showTruePRs]);

    // ── TREND CALCULATION ─────────────────────────────────────
    const trendData = useMemo(() => {
        if (points.length < 2) return { value: 0, direction: 'flat' };

        const now = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(now.getDate() - 30);

        // Find the closest point ≤ 30 days ago
        let pastPoint = null;
        for (let i = points.length - 1; i >= 0; i--) {
            if (points[i].date <= thirtyDaysAgo) {
                pastPoint = points[i];
                break;
            }
        }

        // If no point 30 days ago, use the first recorded point
        if (!pastPoint && points.length > 0) {
            pastPoint = points[0];
        }

        if (!pastPoint) return { value: 0, direction: 'flat' };

        const current = points[points.length - 1].value;
        const past = pastPoint.value;
        const diff = current - past;

        let direction = 'flat';
        if (diff > 0) direction = 'up';
        else if (diff < 0) direction = 'down';

        return {
            value: Math.abs(diff),
            rawDiff: diff,
            direction,
            label: diff === 0 ? '±0' : `${diff > 0 ? '+' : ''}${diff}`
        };
    }, [points]);




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

        if (timeRange === '3M') {
            let d = new Date(minDate);
            d.setDate(1);
            while (d <= maxDate) {
                addLabel(new Date(d), d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
                d.setMonth(d.getMonth() + 1);
            }
        } else if (timeRange === '1Y') {
            let d = new Date(minDate);
            d.setDate(1);
            while (d <= maxDate) {
                addLabel(new Date(d), d.toLocaleDateString('en-US', { month: 'short' }));
                d.setMonth(d.getMonth() + 1);
            }
        } else {
            let d = new Date(minDate);
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
        // Only update if user is actively touching the graph
        if (isTouching.current) {
            setSelectedPoint(point);
        }
    }, []);

    const onGestureStart = useCallback(() => {
        isTouching.current = true;
    }, []);

    const onGestureEnd = useCallback(() => {
        isTouching.current = false;
        // Immediately clear selection when finger lifts
        setSelectedPoint(null);
    }, []);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
            }
        };
    }, []);

    if (loading) {
        return (
            <View style={styles.container}>
                <ActivityIndicator color={COLORS.primary} style={{ marginTop: 50 }} />
            </View>
        );
    }

    if (allData.length < 2) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>{exerciseName}</Text>
                    <TouchableOpacity onPress={handleUnpin} style={styles.unpinButton}>
                        <Feather name="x" size={16} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                </View>
                <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>Not enough data yet</Text>
                    <Text style={styles.emptySubText}>Need 2+ workouts to show progress</Text>
                </View>
            </View>
        );
    }

    const currentPR = points[points.length - 1]?.value || 0;

    return (
        <View style={styles.container}>
            <LinearGradient colors={[COLORS.surface, COLORS.surface]} style={styles.content}>
                <View style={styles.header}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.title}>{exerciseName}</Text>
                        <Text style={styles.subtitle}>
                            {showTruePRs ? "True PR Progress" : "1RM History"}
                        </Text>



                        {/* TREND ARROW */}
                        {points.length >= 2 && (
                            <View style={[styles.trendBadge, {
                                backgroundColor:
                                    trendData.direction === 'up' ? 'rgba(34, 197, 94, 0.15)' :
                                        trendData.direction === 'down' ? 'rgba(239, 68, 68, 0.15)' :
                                            'rgba(100, 100, 100, 0.1)'
                            }]}>
                                <Text style={[
                                    styles.trendArrow,
                                    {
                                        color:
                                            trendData.direction === 'up' ? '#22c55e' :
                                                trendData.direction === 'down' ? '#ef4444' :
                                                    COLORS.textSecondary
                                    }
                                ]}>
                                    {trendData.direction === 'up' ? '↑' :
                                        trendData.direction === 'down' ? '↓' : '→'}
                                </Text>
                                <Text style={[
                                    styles.trendText,
                                    {
                                        color:
                                            trendData.direction === 'up' ? '#22c55e' :
                                                trendData.direction === 'down' ? '#ef4444' :
                                                    COLORS.textSecondary,
                                        fontFamily: FONTS.bold
                                    }
                                ]}>
                                    {trendData.label} kg
                                </Text>
                                <Text style={styles.trendPeriod}>· 30d</Text>
                            </View>
                        )}















                    </View>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        <TimeRangeSelector selectedRange={timeRange} onSelect={setTimeRange} />
                        <TouchableOpacity onPress={handleUnpin} style={styles.unpinButton}>
                            <Feather name="x" size={16} color={COLORS.textSecondary} />
                        </TouchableOpacity>
                    </View>
                </View>

                <TouchableOpacity
                    onPress={() => setShowTruePRs(!showTruePRs)}
                    style={[styles.modeToggle, showTruePRs && styles.modeToggleActive]}
                >
                    <Feather
                        name={showTruePRs ? "trending-up" : "activity"}
                        size={14}
                        color={showTruePRs ? COLORS.primary : COLORS.textSecondary}
                    />
                    <Text style={[styles.modeText, showTruePRs && styles.modeTextActive]}>
                        {showTruePRs ? "True PRs Only" : "All History"}
                    </Text>
                </TouchableOpacity>

                {/* Tooltip */}
                <View style={styles.tooltipContainer}>
                    {selectedPoint ? (
                        <View style={styles.activeTooltip}>
                            <Text style={styles.tooltipValue}>{selectedPoint.value} kg</Text>
                            <Text style={styles.tooltipDate}>
                                {selectedPoint.date.toLocaleDateString('en-US', {
                                    month: 'short', day: 'numeric', year: 'numeric'
                                })}
                            </Text>
                        </View>
                    ) : (
                        <View style={styles.placeholderTooltip}>
                            <Text style={styles.tooltipValue}>{currentPR} kg</Text>
                            <Text style={styles.tooltipDate}>Current PR</Text>
                        </View>
                    )}
                </View>

                <View style={styles.graphRow}>
                    <View style={styles.yAxis}>
                        <Text style={styles.yAxisText}>{yRange[1].toFixed(0)}</Text>
                        <Text style={styles.yAxisText}>{Math.round((yRange[0] + yRange[1]) / 2)}</Text>
                        <Text style={styles.yAxisText}>{yRange[0].toFixed(0)}</Text>
                    </View>

                    <View style={styles.graphCol}>
                        <LineGraph
                            points={points}
                            animated={true}
                            color={COLORS.primary}
                            gradientFillColors={[`${COLORS.primary}CC`, 'transparent']}
                            enablePanGesture={true}
                            enableIndicator={true}
                            indicatorPulsating={true}
                            SelectionDot={CustomSelectionDot}

                            // These three are REQUIRED for the fix
                            onPointSelected={onPointSelected}
                            onGestureStart={onGestureStart}
                            onGestureEnd={onGestureEnd}

                            range={{ y: { min: yRange[0], max: yRange[1] } }}
                            style={{ width: GRAPH_WIDTH, height: GRAPH_HEIGHT }}
                        />

                        <View style={styles.xAxisContainer}>
                            {axisLabels.map((label, index) => (
                                <Text
                                    key={index}
                                    style={[
                                        styles.xAxisLabel,
                                        { left: label.left }
                                    ]}
                                >
                                    {label.text}
                                </Text>
                            ))}
                        </View>
                    </View>
                </View>
            </LinearGradient>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: 20,
        marginHorizontal: 16,
        borderRadius: 24,
        backgroundColor: COLORS.surface,
        borderWidth: 1,
        borderColor: COLORS.border,
        overflow: 'hidden',
        ...SHADOWS.medium,
    },
    content: {
        padding: 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    title: {
        fontSize: 18,
        fontFamily: FONTS.bold,
        color: COLORS.text,
        marginBottom: 2,
    },
    subtitle: {
        fontSize: 12,
        fontFamily: FONTS.medium,
        color: COLORS.textSecondary,
    },
    unpinButton: {
        padding: 8,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
    },
    graphRow: {
        flexDirection: 'row',
        marginTop: 10,
        height: GRAPH_HEIGHT + 30,
    },
    yAxis: {
        width: Y_AXIS_WIDTH,
        height: GRAPH_HEIGHT,
        justifyContent: 'space-between',
        paddingRight: 8,
    },
    yAxisText: {
        color: COLORS.textSecondary,
        fontSize: 10,
        fontFamily: FONTS.medium,
    },
    graphCol: {
        flex: 1,
    },
    xAxisContainer: {
        position: 'absolute',
        top: GRAPH_HEIGHT + 8,
        left: 0,
        right: 0,
        height: 20,
    },
    xAxisLabel: {
        position: 'absolute',
        color: COLORS.textSecondary,
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
        color: COLORS.textSecondary,
        fontSize: 14,
    },
    emptySubText: {
        fontSize: 12,
        color: COLORS.textSecondary,
        marginTop: 4,
    },
    rangeSelector: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 8,
        padding: 2,
    },
    rangeButton: {
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 6,
    },
    rangeButtonActive: {
        backgroundColor: 'rgba(255,255,255,0.15)',
    },
    rangeText: {
        fontSize: 10,
        fontFamily: FONTS.bold,
        color: COLORS.textSecondary,
    },
    rangeTextActive: {
        color: COLORS.primary,
    },
    modeToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(255,255,255,0.03)',
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 20,
        marginBottom: 8,
        gap: 6,
    },
    modeToggleActive: {
        backgroundColor: 'rgba(64, 186, 173, 0.15)',
    },
    modeText: {
        fontSize: 11,
        fontFamily: FONTS.medium,
        color: COLORS.textSecondary,
    },
    modeTextActive: {
        color: COLORS.primary,
    },
    tooltipContainer: {
        height: 44,
        justifyContent: 'center',
        marginBottom: 6,
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
        color: COLORS.text,
    },
    tooltipDate: {
        fontSize: 12,
        fontFamily: FONTS.medium,
        color: COLORS.textSecondary,
        marginTop: 2,
    },
    trendBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
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
        color: COLORS.textSecondary,
        opacity: 0.8,
    },
});

export default PRGraphCard;