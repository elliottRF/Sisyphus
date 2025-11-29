import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import React, { useState, useEffect } from 'react';
import { LineChart } from 'react-native-gifted-charts';
import { COLORS, FONTS, SHADOWS } from '../constants/theme';
import { fetchExerciseProgress, unpinExercise } from './db';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';

const PRGraphCard = ({ exerciseID, exerciseName, onRemove }) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, [exerciseID]);

    const loadData = async () => {
        try {
            const history = await fetchExerciseProgress(exerciseID);

            // Process data for chart
            // We want to show the max 1RM per day to avoid clutter if multiple sets/workouts in one day
            const dailyMax = {};
            history.forEach(entry => {
                const date = new Date(entry.time).toLocaleDateString();
                if (!dailyMax[date] || entry.oneRM > dailyMax[date].value) {
                    dailyMax[date] = {
                        value: entry.oneRM,
                        label: new Date(entry.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                        dataPointText: entry.oneRM.toString(),
                    };
                }
            });

            const chartData = Object.values(dailyMax);
            setData(chartData);
        } catch (error) {
            console.error("Error loading graph data:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleUnpin = async () => {
        try {
            await unpinExercise(exerciseID);
            if (onRemove) onRemove(exerciseID);
        } catch (error) {
            console.error("Error unpinning exercise:", error);
        }
    };

    if (loading) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', height: 200 }]}>
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
                    <Text style={styles.emptyText}>Not enough data to show progress.</Text>
                    <Text style={styles.emptySubText}>Complete at least 2 workouts with this exercise.</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={[COLORS.surface, COLORS.surface]}
                style={styles.content}
            >
                <View style={styles.header}>
                    <View>
                        <Text style={styles.title}>{exerciseName}</Text>
                        <Text style={styles.subtitle}>Estimated 1RM Progress</Text>
                    </View>
                    <TouchableOpacity onPress={handleUnpin} style={styles.unpinButton}>
                        <Feather name="x" size={16} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                </View>

                <View style={styles.chartContainer}>
                    <LineChart
                        data={data}
                        color={COLORS.primary}
                        thickness={3}
                        dataPointsColor={COLORS.secondary}
                        dataPointsRadius={4}
                        textColor={COLORS.textSecondary}
                        textFontSize={10}
                        hideRules
                        hideYAxisText
                        hideAxesAndRules
                        curved
                        areaChart
                        startFillColor={COLORS.primary}
                        endFillColor={'transparent'}
                        startOpacity={0.2}
                        endOpacity={0}
                        initialSpacing={10}
                        endSpacing={10}
                        width={280}
                        height={150}
                        spacing={40}
                        pointerConfig={{
                            pointerStripHeight: 160,
                            pointerStripColor: COLORS.border,
                            pointerStripWidth: 2,
                            pointerColor: COLORS.secondary,
                            radius: 6,
                            pointerLabelWidth: 100,
                            pointerLabelHeight: 90,
                            activatePointersOnLongPress: true,
                            autoAdjustPointerLabelPosition: false,
                            pointerLabelComponent: items => {
                                return (
                                    <View
                                        style={{
                                            height: 90,
                                            width: 100,
                                            justifyContent: 'center',
                                            marginTop: -30,
                                            marginLeft: -40,
                                        }}>
                                        <Text style={{ color: COLORS.text, fontSize: 14, marginBottom: 6, textAlign: 'center' }}>
                                            {items[0].label}
                                        </Text>
                                        <View style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border }}>
                                            <Text style={{ fontWeight: 'bold', textAlign: 'center', color: COLORS.text }}>
                                                {items[0].value}kg
                                            </Text>
                                        </View>
                                    </View>
                                );
                            },
                        }}
                    />
                </View>
            </LinearGradient>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: 20,
        borderRadius: 24,
        backgroundColor: COLORS.surface,
        ...SHADOWS.medium,
        marginHorizontal: 10,
        borderWidth: 1,
        borderColor: COLORS.border,
        overflow: 'hidden',
    },
    content: {
        padding: 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 20,
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
        marginLeft: -20, // Offset for chart padding
    },
    emptyState: {
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
        height: 150,
    },
    emptyText: {
        color: COLORS.text,
        fontFamily: FONTS.medium,
        marginBottom: 4,
    },
    emptySubText: {
        color: COLORS.textSecondary,
        fontSize: 12,
        fontFamily: FONTS.regular,
    }
});

export default PRGraphCard;
