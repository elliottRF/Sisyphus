import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
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
import { FONTS } from '../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_SIZE = SCREEN_WIDTH - 40;
const RADIUS = CHART_SIZE / 2 - 80;
const CENTER = CHART_SIZE / 2;

const MuscleRadarChart = ({ data, theme }) => {
    const axes = [
        'Chest',
        'Shoulders',
        'Back',
        'Biceps',
        'Triceps',
        'Quads',
        'Hams',
        'Glutes',
        'Abs',
    ];

    const numAxes = axes.length;
    const angleStep = (Math.PI * 2) / numAxes;

    const values = Object.values(data);
    const maxValue = Math.max(...values, 5);
    const weakestValue = Math.min(...values);

    const getCoordinates = (index, value) => {
        const angle = index * angleStep - Math.PI / 2;
        const r = (value / maxValue) * RADIUS;
        return {
            x: CENTER + r * Math.cos(angle),
            y: CENTER + r * Math.sin(angle),
            angle,
        };
    };

    const points = axes
        .map((axis, i) => {
            const { x, y } = getCoordinates(i, data[axis] || 0);
            return `${x},${y}`;
        })
        .join(' ');

    return (
        <View style={styles.container}>
            <Svg width={CHART_SIZE} height={CHART_SIZE}>
                <Defs>
                    <LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0%" stopColor={theme.primary} stopOpacity="0.55" />
                        <Stop offset="100%" stopColor={theme.primary} stopOpacity="0.15" />
                    </LinearGradient>
                </Defs>

                {/* Background rings */}
                {[0.25, 0.5, 0.75, 1].map((tick, i) => (
                    <Circle
                        key={i}
                        cx={CENTER}
                        cy={CENTER}
                        r={RADIUS * tick}
                        fill="none"
                        stroke={theme.border}
                        strokeDasharray="4,4"
                        opacity={0.25}
                    />
                ))}

                {/* Axis lines */}
                {axes.map((_, i) => {
                    const { x, y } = getCoordinates(i, maxValue);
                    return (
                        <Line
                            key={i}
                            x1={CENTER}
                            y1={CENTER}
                            x2={x}
                            y2={y}
                            stroke={theme.border}
                            opacity={0.4}
                        />
                    );
                })}

                {/* Data polygon */}
                <Polygon
                    points={points}
                    fill="url(#grad)"
                    stroke={theme.primary}
                    strokeWidth="2.5"
                />

                {/* Data points + values */}
                {axes.map((axis, i) => {
                    const val = data[axis] || 0;
                    const { x, y, angle } = getCoordinates(i, val);
                    const isWeakest = val === weakestValue;

                    const offset = 14;
                    const vx = x + offset * Math.cos(angle);
                    const vy = y + offset * Math.sin(angle);

                    return (
                        <G key={i}>
                            <Circle
                                cx={x}
                                cy={y}
                                r={isWeakest ? 6 : 4}
                                fill={isWeakest ? '#FF6B6B' : theme.primary}
                            />
                            <SvgText
                                x={vx}
                                y={vy}
                                fontSize="10"
                                fill={theme.text}
                                fontFamily={FONTS.bold}
                                textAnchor="middle"
                                alignmentBaseline="middle"
                            >
                                {Math.round(val * 10) / 10}
                            </SvgText>
                        </G>
                    );
                })}

                {/* Axis labels */}
                {axes.map((axis, i) => {
                    const { angle } = getCoordinates(i, maxValue);
                    const labelRadius = RADIUS + 26;
                    const x = CENTER + labelRadius * Math.cos(angle);
                    const y = CENTER + labelRadius * Math.sin(angle);

                    let textAnchor = 'middle';
                    if (Math.cos(angle) > 0.3) textAnchor = 'start';
                    else if (Math.cos(angle) < -0.3) textAnchor = 'end';

                    return (
                        <SvgText
                            key={i}
                            x={x}
                            y={y}
                            fill={theme.text}
                            fontSize="12"
                            fontFamily={FONTS.bold}
                            textAnchor={textAnchor}
                            alignmentBaseline="middle"
                        >
                            {axis}
                        </SvgText>
                    );
                })}
            </Svg>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
    },
});

export default MuscleRadarChart;
