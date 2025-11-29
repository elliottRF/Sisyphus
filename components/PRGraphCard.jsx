import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import React, { useState, useEffect } from 'react';
import { LineChart } from 'react-native-gifted-charts';
import { COLORS, FONTS, SHADOWS } from '../constants/theme';
import { fetchExerciseProgress, unpinExercise } from './db';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';

const CARD_WIDTH = 350;

const PRGraphCard = ({ exerciseID, exerciseName, onRemove }) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showTruePRs, setShowTruePRs] = useState(false);

    useEffect(() => {
        loadData();
    }, [exerciseID]);

    const loadData = async () => {
        try {
            setLoading(true);
            const history = await fetchExerciseProgress(exerciseID);

            if (!history?.length) {
                setData([]);
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

            // Robust sorting to prevent "swirls" (backward lines)
            let chartData = Object.values(dailyMax).sort((a, b) => new Date(a.date) - new Date(b.date));

            // Add smart labels
            if (chartData.length >= 2) {
                const firstYear = new Date(chartData[0].date).getFullYear();
                const lastYear = new Date(chartData[chartData.length - 1].date).getFullYear();
                const spansMultipleYears = firstYear !== lastYear;

                const labeledIndices = new Set();

                if (spansMultipleYears) {
                    // One label per year, at the first workout of that year
                    const yearToFirstIndex = {};
                    chartData.forEach((point, i) => {
                        const y = new Date(point.date).getFullYear();
                        if (yearToFirstIndex[y] === undefined || i < yearToFirstIndex[y]) {
                            yearToFirstIndex[y] = i;
                        }
                    });
                    Object.values(yearToFirstIndex).forEach(idx => labeledIndices.add(idx));
                } else {
                    // Same year → even distribution
                    const useMonthOnly = (chartData[chartData.length - 1].date - chartData[0].date) / (1000 * 60 * 60 * 24) > 120;
                    const maxLabels = useMonthOnly ? 8 : 7;
                    const numLabels = Math.min(chartData.length, maxLabels);

                    for (let i = 0; i < numLabels; i++) {
                        const index = Math.round(i * (chartData.length - 1) / (numLabels - 1));
                        labeledIndices.add(index);
                    }

                    // Attach format info for later
                    chartData.useMonthOnly = useMonthOnly;
                }

                chartData = chartData.map((point, index) => {
                    const d = new Date(point.date);
                    const fullLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

                    let label = '';
                    if (labeledIndices.has(index)) {
                        if (spansMultipleYears) {
                            label = d.getFullYear().toString();
                        } else if (chartData.useMonthOnly) {
                            label = d.toLocaleDateString('en-US', { month: 'short' });
                        } else {
                            label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        }
                    }

                    return {
                        ...point,
                        label,
                        fullLabel,
                    };
                });
            }

            setData(chartData);
        } catch (error) {
            console.error("Error loading graph data:", error);
            setData([]);
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

    if (loading) {
        return (
            <View style={styles.container}>
                <ActivityIndicator color={COLORS.primary} />
            </View>
        );
    }

    if (data.length < 2) {
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

    // Filter data for "True 1RM" mode
    let displayData = data;
    if (showTruePRs) {
        let max = 0;
        displayData = data.filter(point => {
            if (point.value >= max) {
                max = point.value;
                return true;
            }
            return false;
        });

        // Ensure we still have enough data to show a line, or handle gracefully
        // If filtering results in < 2 points, the chart might look weird, but let's allow it for now
        // as it accurately reflects "only one PR" or similar.
    }

    // Chart Dimensions & Spacing Logic
    const chartWidth = 330;
    const initialSpacing = 20;
    const endSpacing = 40;
    const availableWidth = chartWidth - initialSpacing - endSpacing;

    // 1. Calculate total duration in days
    // Use the displayData for range calculation to ensure the graph spreads nicely
    // If displayData has < 2 points, we can't really calculate duration, so handle that.
    let timeAccurateData = [];
    let yAxisMin = 0;

    if (displayData.length >= 2) {
        const firstDate = new Date(displayData[0].date);
        const lastDate = new Date(displayData[displayData.length - 1].date);
        const totalDurationMs = lastDate - firstDate;
        const totalDays = Math.max(1, totalDurationMs / (1000 * 60 * 60 * 24));

        // 2. Determine pixels per day
        // strictly fit to width
        const pixelsPerDay = availableWidth / totalDays;

        // 3. Apply spacing to each data point
        timeAccurateData = displayData.map((point, index) => {
            if (index === displayData.length - 1) {
                return { ...point, spacing: 0 }; // Last point has no following space
            }

            const currentDate = new Date(point.date);
            const nextDate = new Date(displayData[index + 1].date);
            const diffMs = nextDate - currentDate;
            const diffDays = diffMs / (1000 * 60 * 60 * 24);

            // Calculate spacing based on time difference
            const spacing = diffDays * pixelsPerDay;

            return {
                ...point,
                spacing,
            };
        });

        // Calculate Y-axis range for better verticality
        const allValues = displayData.map(d => d.value);
        const minValue = Math.min(...allValues);
        const maxValue = Math.max(...allValues);
        // Add 10% padding below min, but don't go below 0
        yAxisMin = Math.max(0, Math.floor(minValue - (maxValue - minValue) * 0.1));
    } else if (displayData.length === 1) {
        // Single point case
        timeAccurateData = [{ ...displayData[0], spacing: 0 }];
        yAxisMin = Math.max(0, displayData[0].value - 10);
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
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                            onPress={() => setShowTruePRs(!showTruePRs)}
                            style={[styles.unpinButton, showTruePRs && { backgroundColor: COLORS.primary + '20' }]}
                        >
                            <Feather
                                name={showTruePRs ? "trending-up" : "activity"}
                                size={16}
                                color={showTruePRs ? COLORS.primary : COLORS.textSecondary}
                            />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleUnpin} style={styles.unpinButton}>
                            <Feather name="x" size={16} color={COLORS.textSecondary} />
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.chartContainer}>
                    {displayData.length > 0 ? (
                        <LineChart
                            data={timeAccurateData}
                            width={chartWidth}
                            height={250}
                            color={COLORS.primary}
                            thickness={4}
                            curved
                            curvature={0.2} // Reduce curvature to prevent loops on sharp drops
                            areaChart
                            // Dynamic Y-axis scaling
                            minValue={yAxisMin}

                            startFillColor={COLORS.primary}
                            startOpacity={0.4}
                            endFillColor={COLORS.primary}
                            endOpacity={0}
                            dataPointsColor={COLORS.primary}
                            dataPointsRadius={5}

                            // Spacing is now handled per-point in timeAccurateData
                            initialSpacing={initialSpacing}
                            endSpacing={endSpacing}

                            // Enable scroll but content fits width, this ensures touch works
                            disableScroll={false}
                            scrollAnimation={false}

                            // Clean subtle grid
                            noOfSections={5}
                            rulesType="dash"
                            dashWidth={5}
                            dashGap={7}
                            rulesColor={COLORS.border}
                            rulesThickness={1}
                            xAxisThickness={1}
                            xAxisColor={COLORS.border}
                            yAxisThickness={1}
                            yAxisColor={COLORS.border}
                            yAxisSuffix=" kg"
                            yAxisLabelWidth={58}
                            yAxisTextStyle={{ color: COLORS.textSecondary, fontSize: 11.5 }}

                            // X labels
                            textColor={COLORS.textSecondary}
                            textFontSize={11.5}
                            textShiftY={22}

                            pointerConfig={{
                                pointerStripWidth: 2,
                                pointerStripColor: COLORS.border,
                                pointerStripUptoDataPoint: true,
                                pointerColor: COLORS.secondary,
                                radius: 6,
                                activatePointersOnLongPress: false,
                                autoAdjustPointerLabelPosition: false,
                                pointerLabelWidth: 110,
                                pointerLabelHeight: 84,
                                pointerLabelComponent: (items) => (
                                    <View style={styles.pointerLabel}>
                                        <Text style={styles.pointerDate}>{items[0].fullLabel}</Text>
                                        <View style={styles.pointerValueBg}>
                                            <Text style={styles.pointerValue}>{items[0].value}kg</Text>
                                        </View>
                                    </View>
                                ),
                            }}
                        />
                    ) : (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyText}>No True 1RMs found</Text>
                        </View>
                    )}
                </View>
            </LinearGradient>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: 20,
        marginHorizontal: 10,
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
        marginBottom: 16,
    },
    title: {
        fontSize: 18,
        fontFamily: FONTS.bold,
        color: COLORS.text,
    },
    subtitle: {
        fontSize: 12,
        fontFamily: FONTS.medium,
        color: COLORS.textSecondary,
        marginTop: 2,
    },
    unpinButton: {
        padding: 8,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
    },
    chartContainer: {
        alignItems: 'center',
        marginTop: 4,
    },
    emptyState: {
        height: 250,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    emptyText: {
        fontFamily: FONTS.medium,
        color: COLORS.text,
        fontSize: 14,
    },
    emptySubText: {
        fontSize: 12,
        color: COLORS.textSecondary,
        marginTop: 4,
        textAlign: 'center',
    },
    pointerLabel: {
        height: 84,
        width: 110,
        justifyContent: 'center',
        marginTop: -30,
        marginLeft: -55,
    },
    pointerDate: {
        color: COLORS.text,
        fontSize: 11.8,
        textAlign: 'center',
        marginBottom: 4,
    },
    pointerValueBg: {
        backgroundColor: COLORS.surface,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    pointerValue: {
        color: COLORS.text,
        fontWeight: 'bold',
        textAlign: 'center',
        fontSize: 14,
    },
});

export default PRGraphCard;