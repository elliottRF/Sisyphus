import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, ActivityIndicator } from 'react-native';
import Svg, {
    Polygon,
    Line,
    Circle,
    G,
    Text as SvgText,
    Defs,
    LinearGradient,
    Stop,
} from 'react-native-svg';
import { FONTS, SHADOWS } from '../constants/theme';
import { fetchRecentMuscleUsage } from './db';
import { useTheme } from '../context/ThemeContext';
import { AppEvents, on, off } from '../utils/events';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_MARGIN = 32;
const CHART_SIZE = SCREEN_WIDTH - CARD_MARGIN;
const SVG_HEIGHT = CHART_SIZE * 0.82;
const CENTER_X = CHART_SIZE / 2;
const CENTER_Y = SVG_HEIGHT / 2 + 5;
const RADIUS = (SVG_HEIGHT / 2) - 42;

const muscleMapping = {
    "Chest": "Chest", "Upper Chest": "Chest", "Deltoids": "Delts", "Shoulders": "Delts",
    "Trapezius": "Back", "Traps": "Back", "Upper-Back": "Back", "Lower-Back": "Back",
    "Biceps": "Biceps", "Triceps": "Triceps", "Quadriceps": "Quads", "Quads": "Quads",
    "Hamstring": "Hams", "Hamstrings": "Hams", "Gluteal": "Glutes", "Glutes": "Glutes",
    "Abs": "Abs", "Obliques": "Abs"
};

const TimeRangeSelector = ({ selectedRange, onSelect, styles }) => {
    const ranges = ['1M', '6M', '1Y', 'ALL'];
    return (
        <View style={styles.rangeSelector}>
            {ranges.map(range => (
                <TouchableOpacity
                    key={range}
                    onPress={() => onSelect(range)}
                    style={[styles.rangeButton, selectedRange === range && styles.rangeButtonActive]}
                >
                    <Text style={[styles.rangeText, selectedRange === range && styles.rangeTextActive]}>
                        {range}
                    </Text>
                </TouchableOpacity>
            ))}
        </View>
    );
};

const MuscleRadarChart = () => {
    const { theme, accessoryWeight } = useTheme();
    const styles = getStyles(theme);
    const [radarData, setRadarData] = useState({});
    const [timeRange, setTimeRange] = useState('1M');
    const [loading, setLoading] = useState(true);

    const isDynamic = theme.type === 'dynamic';
    const accentColor = isDynamic ? '#2DC4B6' : theme.primary;
    const textColor = isDynamic ? '#FFFFFF' : theme.text;

    const axes = ['Chest', 'Delts', 'Back', 'Biceps', 'Triceps', 'Quads', 'Hams', 'Glutes', 'Abs'];
    const angleStep = (Math.PI * 2) / axes.length;

    // --- Balance Calculation Logic ---
    const balanceScore = useMemo(() => {
        const vals = Object.values(radarData);
        const totalVolume = vals.reduce((a, b) => a + b, 0);

        if (totalVolume === 0) return 0;

        const mean = totalVolume / axes.length;
        // Calculate Standard Deviation
        const variance = vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / axes.length;
        const stdDev = Math.sqrt(variance);

        // Coefficient of Variation (CV). Lower is better.
        // We normalize it so a CV of 1.0 (or higher) is 0% balance.
        const cv = stdDev / (mean || 1);
        const score = Math.max(0, 100 - (cv * 100));

        return Math.round(score);
    }, [radarData]);

    const getScoreColor = (score) => {
        if (score >= 70) return theme.success; // Balanced
        if (score >= 50) return '#FF9800'; // Moderate
        return theme.danger; // Unbalanced
    };

    const loadData = useCallback(async (range = timeRange) => {
        try {
            setLoading(true);
            let days = range === '6M' ? 180 : range === '1Y' ? 365 : range === 'ALL' ? 3650 : 30;
            const usageData = await fetchRecentMuscleUsage(days);
            const stats = { 'Chest': 0, 'Delts': 0, 'Back': 0, 'Biceps': 0, 'Triceps': 0, 'Quads': 0, 'Hams': 0, 'Glutes': 0, 'Abs': 0 };

            usageData.forEach(ex => {
                const sets = parseInt(ex.sets, 10) || 0;
                const primary = new Set();
                if (ex.targetMuscle) ex.targetMuscle.split(',').forEach(m => {
                    const cat = muscleMapping[m.trim()];
                    if (cat) primary.add(cat);
                });
                primary.forEach(cat => stats[cat] += sets);

                if (ex.accessoryMuscles) ex.accessoryMuscles.split(',').forEach(m => {
                    const cat = muscleMapping[m.trim()];
                    if (cat && !primary.has(cat)) stats[cat] += (sets * (accessoryWeight || 0.5));
                });
            });

            const cleaned = {};
            Object.keys(stats).forEach(cat => cleaned[cat] = Math.round(stats[cat] * 10) / 10);
            setRadarData(cleaned);
        } catch (error) { console.error(error); } finally { setLoading(false); }
    }, [timeRange, accessoryWeight]);

    useEffect(() => { loadData(); }, [loadData]);

    useEffect(() => {
        const handler = () => loadData();
        on(AppEvents.REFRESH_HOME, handler);
        on(AppEvents.WORKOUT_COMPLETED, handler);
        on(AppEvents.WORKOUT_DATA_IMPORTED, handler);
        return () => {
            off(AppEvents.REFRESH_HOME, handler);
            off(AppEvents.WORKOUT_COMPLETED, handler);
            off(AppEvents.WORKOUT_DATA_IMPORTED, handler);
        };
    }, [loadData]);

    const values = Object.values(radarData);
    const maxGraphValue = Math.max(...values, 5);
    const averageVolume = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const laggingThreshold = averageVolume * 0.7;

    const getCoordinates = (index, value, extraRadius = 0) => {
        const angle = index * angleStep - Math.PI / 2;
        const r = ((value / maxGraphValue) * RADIUS) + extraRadius;
        return { x: CENTER_X + r * Math.cos(angle), y: CENTER_Y + r * Math.sin(angle), angle };
    };

    const points = axes.map((axis, i) => {
        const { x, y } = getCoordinates(i, radarData[axis] || 0);
        return `${x},${y}`;
    }).join(' ');

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.title}>Muscle Balance</Text>
                    {Object.keys(radarData).length > 0 && (
                        <View style={[styles.balanceBadge, { backgroundColor: getScoreColor(balanceScore) + '20', opacity: loading ? 0.6 : 1 }]}>
                            <Text style={[styles.balanceText, { color: getScoreColor(balanceScore) }]}>
                                {balanceScore}% Balanced
                            </Text>
                        </View>
                    )}
                </View>
                <TimeRangeSelector selectedRange={timeRange} onSelect={setTimeRange} styles={styles} />
            </View>

            {loading ? (
                <View style={{ height: SVG_HEIGHT, justifyContent: 'center', marginTop: -5 }}>
                    <ActivityIndicator color={theme.primary} />
                </View>
            ) : (
                <View style={styles.chartWrapper}>
                    <Svg width={CHART_SIZE} height={SVG_HEIGHT}>
                        <Defs>
                            <LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                                <Stop offset="0%" stopColor={accentColor} stopOpacity="0.45" />
                                <Stop offset="100%" stopColor={accentColor} stopOpacity="0.1" />
                            </LinearGradient>
                        </Defs>

                        {/* Background Grid */}
                        {[0.25, 0.5, 0.75, 1].map((t, i) => (
                            <Circle key={i} cx={CENTER_X} cy={CENTER_Y} r={RADIUS * t} fill="none" stroke={accentColor} strokeDasharray="4,4" opacity={0.15} />
                        ))}
                        {axes.map((_, i) => {
                            const maxP = getCoordinates(i, maxGraphValue);
                            return <Line key={i} x1={CENTER_X} y1={CENTER_Y} x2={maxP.x} y2={maxP.y} stroke={accentColor} opacity={0.2} />;
                        })}

                        <Polygon points={points} fill="url(#grad)" stroke={accentColor} strokeWidth="2" strokeLinejoin="round" />

                        {axes.map((axis, i) => {
                            const maxP = getCoordinates(i, maxGraphValue);
                            const val = radarData[axis] || 0;
                            const p = getCoordinates(i, val);
                            const isLagging = val < laggingThreshold && val > 0;
                            const valuePos = getCoordinates(i, val, -12);
                            const labelPos = getCoordinates(i, maxGraphValue, 16);

                            const textAnchor = Math.cos(maxP.angle) > 0.2 ? 'start' : Math.cos(maxP.angle) < -0.2 ? 'end' : 'middle';
                            const baseline = Math.sin(maxP.angle) > 0.5 ? 'hanging' : Math.sin(maxP.angle) < -0.5 ? 'baseline' : 'middle';

                            return (
                                <G key={i}>
                                    {val > 0 && (
                                        <SvgText
                                            x={valuePos.x} y={valuePos.y}
                                            fill={textColor} fontSize="9"
                                            fontFamily={FONTS.bold} textAnchor="middle"
                                            alignmentBaseline="middle" opacity={0.9}
                                        >
                                            {Math.round(val)}
                                        </SvgText>
                                    )}
                                    <SvgText
                                        x={labelPos.x} y={labelPos.y}
                                        fill={textColor} fontSize="11"
                                        fontFamily={FONTS.bold} textAnchor={textAnchor}
                                        alignmentBaseline={baseline}
                                    >
                                        {axis}
                                    </SvgText>
                                    {val > 0 && (
                                        <Circle
                                            cx={p.x} cy={p.y}
                                            r={3}
                                            fill={isLagging ? theme.danger : accentColor}
                                            stroke={theme.surface}
                                            strokeWidth={isLagging ? 1 : 0.5}
                                        />
                                    )}
                                </G>
                            );
                        })}
                    </Svg>
                </View>
            )}
        </View>
    );
};

const getStyles = (theme) => StyleSheet.create({
    container: {
        backgroundColor: theme.surface,
        marginHorizontal: 16,
        marginBottom: 20,
        borderRadius: 24,
        paddingTop: 16,
        paddingBottom: 4,
        borderWidth: 1,
        borderColor: theme.border,
        ...SHADOWS.medium,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingHorizontal: 20,
        marginBottom: 5,
    },
    title: { fontSize: 18, fontFamily: FONTS.bold, color: theme.text },
    balanceBadge: {
        marginTop: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        alignSelf: 'flex-start'
    },
    balanceText: {
        fontSize: 10,
        fontFamily: FONTS.bold,
        textTransform: 'uppercase',
        letterSpacing: 0.5
    },
    chartWrapper: { width: '100%', alignItems: 'center', marginTop: -5 },
    rangeSelector: { flexDirection: 'row', backgroundColor: theme.overlayBorder, borderRadius: 8, padding: 2 },
    rangeButton: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 },
    rangeButtonActive: { backgroundColor: theme.overlayInputFocused },
    rangeText: { fontSize: 10, fontFamily: FONTS.bold, color: theme.textSecondary },
    rangeTextActive: { color: theme.primary },
});

export default MuscleRadarChart;