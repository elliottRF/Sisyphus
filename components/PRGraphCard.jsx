import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Dimensions } from 'react-native';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { LineGraph, SelectionDot } from 'react-native-graph';
import { COLORS, FONTS, SHADOWS } from '../constants/theme';
import { fetchExerciseProgress, unpinExercise } from './db';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRAPH_HEIGHT = 220;
// Card padding (20*2) + Margins (16*2) + Border (2)
const CARD_PADDING = 40;
const CARD_MARGIN = 32;
const Y_AXIS_WIDTH = 40; // Space for labels
const GRAPH_WIDTH = SCREEN_WIDTH - CARD_MARGIN - CARD_PADDING - Y_AXIS_WIDTH;

const CustomSelectionDot = ({ isActive, color }) => (
    <View style={{
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: color,
        borderWidth: 2,
        borderColor: 'white',
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

const PRGraphCard = ({ exerciseID, exerciseName, onRemove }) => {
    const [allData, setAllData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showTruePRs, setShowTruePRs] = useState(false);
    const [timeRange, setTimeRange] = useState('ALL');
    const [selectedPoint, setSelectedPoint] = useState(null);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [exerciseID])
    );

    const loadData = async () => {
        try {
            setLoading(true);
            const history = await fetchExerciseProgress(exerciseID);

            if (!history?.length) {
                setAllData([]);
                return;
            }

            // Group by day, take max 1RM
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

            // Flatten to array
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

    // Process Data for react-native-graph
    const { points, minDate, maxDate, yRange } = useMemo(() => {
        if (allData.length === 0) return { points: [], minDate: new Date(), maxDate: new Date(), yRange: [0, 100] };

        let filtered = [...allData];

        // 1. Time Range Filter
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

        // 2. True PR Filter
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

        // 3. Weekly Aggregation
        const firstDate = new Date(filtered[0].date);
        const lastDate = new Date(filtered[filtered.length - 1].date);
        const totalDurationMs = lastDate - firstDate;
        const years = totalDurationMs / (1000 * 60 * 60 * 24 * 365);

        const useMonthly = years > 3;
        const intervalMs = useMonthly ? (1000 * 60 * 60 * 24 * 30) : (1000 * 60 * 60 * 24 * 7);

        const aggregatedPoints = [];
        let iteratorDate = new Date(firstDate);
        let lastValue = filtered[0].value;
        const endIterator = new Date(lastDate);

        if (filtered.length < 5) {
            filtered.forEach(p => aggregatedPoints.push({ date: new Date(p.date), value: p.value }));
        } else {
            while (iteratorDate <= endIterator) {
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
                    // Gap filling
                    aggregatedPoints.push({ date: new Date(iteratorDate), value: lastValue });
                }
                iteratorDate = bucketEnd;
            }
        }

        // 4. Extend to Today
        if (aggregatedPoints.length > 0) {
            const lastPt = aggregatedPoints[aggregatedPoints.length - 1];
            const today = new Date();
            const lastPtDate = new Date(lastPt.date);
            const todayKey = today.toISOString().split('T')[0];
            const lastKey = lastPtDate.toISOString().split('T')[0];

            if (lastKey !== todayKey) {
                aggregatedPoints.push({
                    date: today,
                    value: lastPt.value
                });
            }
        }

        aggregatedPoints.sort((a, b) => a.date - b.date);

        // Y-Axis Range
        const values = aggregatedPoints.map(p => p.value);
        const minVal = Math.min(...values);
        const maxVal = Math.max(...values);

        // Add padding: Top 15%, Bottom 15% to prevent cutting off
        const range = maxVal - minVal;
        const padding = range === 0 ? 10 : range * 0.2; // 20% padding

        let yMin = minVal - padding;
        if (yMin < 0) yMin = 0;

        // If data is flat (one value), ensure we have a range
        let yMax = maxVal + padding;
        if (yMin === yMax) {
            yMax = yMin + 10;
        }

        return {
            points: aggregatedPoints,
            minDate: aggregatedPoints[0]?.date || new Date(),
            maxDate: aggregatedPoints[aggregatedPoints.length - 1]?.date || new Date(),
            yRange: [yMin, yMax]
        };

    }, [allData, timeRange, showTruePRs]);


    // Generate X-Axis Labels (Percentage Based)
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
            // Start of each month
            let d = new Date(minDate);
            d.setDate(1);
            if (d < minDate) d.setMonth(d.getMonth() + 1);

            while (d <= maxDate) {
                addLabel(new Date(d), d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
                d.setMonth(d.getMonth() + 1);
            }
        } else if (timeRange === '1Y') {
            // Start of each month
            let d = new Date(minDate);
            d.setDate(1);
            if (d < minDate) d.setMonth(d.getMonth() + 1);

            while (d <= maxDate) {
                addLabel(new Date(d), d.toLocaleDateString('en-US', { month: 'short' }));
                d.setMonth(d.getMonth() + 1);
            }
        } else {
            // Start of each year
            let d = new Date(minDate);
            d.setMonth(0, 1);
            if (d < minDate) d.setFullYear(d.getFullYear() + 1);

            while (d <= maxDate) {
                addLabel(new Date(d), d.getFullYear().toString());
                d.setFullYear(d.getFullYear() + 1);
            }
        }

        // Fallback
        if (labels.length === 0) {
            addLabel(minDate, minDate.toLocaleDateString('en-US', { month: 'short' }));
            addLabel(maxDate, maxDate.toLocaleDateString('en-US', { month: 'short' }));
        }

        return labels;
    }, [points, minDate, maxDate, timeRange]);


    const onPointSelected = useCallback((point) => {
        setSelectedPoint(point);
    }, []);

    const onGestureEnd = useCallback(() => {
        setSelectedPoint(null);
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

    return (
        <View style={styles.container}>
            <LinearGradient colors={[COLORS.surface, COLORS.surface]} style={styles.content}>
                <View style={styles.header}>
                    <View>
                        <Text style={styles.title}>{exerciseName}</Text>
                        <Text style={styles.subtitle}>
                            {showTruePRs ? "True 1RM Progress" : "1RM History"}
                        </Text>
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
                        {showTruePRs ? "Showing True PRs Only" : "Showing All History"}
                    </Text>
                </TouchableOpacity>

                {/* Tooltip Area */}
                <View style={styles.tooltipContainer}>
                    {selectedPoint ? (
                        <View style={styles.activeTooltip}>
                            <Text style={styles.tooltipValue}>{selectedPoint.value} kg</Text>
                            <Text style={styles.tooltipDate}>
                                {selectedPoint.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </Text>
                        </View>
                    ) : (
                        <View style={styles.placeholderTooltip}>
                            <Text style={styles.tooltipValue}>{points[points.length - 1]?.value} kg</Text>
                            <Text style={styles.tooltipDate}>Current 1RM</Text>
                        </View>
                    )}
                </View>

                <View style={styles.graphRow}>
                    {/* Y-Axis Labels */}
                    <View style={styles.yAxis}>
                        <Text style={styles.yAxisText}>{yRange[1].toFixed(0)}</Text>
                        <Text style={styles.yAxisText}>{Math.round((yRange[0] + yRange[1]) / 2)}</Text>
                        <Text style={styles.yAxisText}>{yRange[0].toFixed(0)}</Text>
                    </View>

                    {/* Chart & X-Axis */}
                    <View style={styles.graphCol}>
                        <LineGraph
                            points={points}
                            animated={true}
                            color={COLORS.primary}
                            gradientFillColors={[COLORS.primary, 'transparent']}
                            enablePanGesture={true}
                            onPointSelected={onPointSelected}
                            onGestureEnd={onGestureEnd}
                            indicatorPulsating
                            enableIndicator
                            SelectionDot={CustomSelectionDot}
                            range={{ y: { min: yRange[0], max: yRange[1] } }}
                            style={{ width: GRAPH_WIDTH, height: GRAPH_HEIGHT }}
                        />

                        {/* X-Axis Labels */}
                        <View style={styles.xAxisContainer}>
                            {axisLabels.map((label, index) => (
                                <Text
                                    key={index}
                                    style={[
                                        styles.xAxisLabel,
                                        { left: label.left, transform: [{ translateX: -10 }] }
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
        marginLeft: 8,
    },
    graphRow: {
        flexDirection: 'row',
        marginTop: 10,
        height: GRAPH_HEIGHT + 30, // Graph + XLabels
    },
    yAxis: {
        width: Y_AXIS_WIDTH,
        height: GRAPH_HEIGHT,
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingRight: 8,
    },
    yAxisText: {
        color: COLORS.textSecondary,
        fontSize: 10,
        fontFamily: FONTS.medium,
    },
    graphCol: {
        flex: 1,
        height: '100%',
    },
    xAxisContainer: {
        position: 'absolute',
        top: GRAPH_HEIGHT + 8, // Below graph
        left: 0,
        right: 0,
        height: 20,
    },
    xAxisLabel: {
        position: 'absolute',
        color: COLORS.textSecondary,
        fontSize: 10,
        fontFamily: FONTS.medium,
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
        backgroundColor: 'rgba(255,255,255,0.1)',
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
        backgroundColor: 'rgba(64, 186, 173, 0.1)',
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
        height: 40,
        justifyContent: 'center',
        marginBottom: 4,
    },
    activeTooltip: {
        alignItems: 'flex-start',
        paddingLeft: Y_AXIS_WIDTH, // Align with graph
    },
    placeholderTooltip: {
        alignItems: 'flex-start',
        opacity: 0.7,
        paddingLeft: Y_AXIS_WIDTH, // Align with graph
    },
    tooltipValue: {
        fontSize: 24,
        fontFamily: FONTS.bold,
        color: COLORS.text,
    },
    tooltipDate: {
        fontSize: 12,
        fontFamily: FONTS.medium,
        color: COLORS.textSecondary,
    },
});

export default PRGraphCard;