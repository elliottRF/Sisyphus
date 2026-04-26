import { View, Text, StyleSheet, Dimensions, TouchableOpacity, ActivityIndicator, TextInput, Keyboard, Pressable, Platform } from 'react-native';
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { LineGraph } from 'react-native-graph';
import { FONTS, getThemedShadow, isLightTheme, withAlpha } from '../constants/theme';
import { Feather } from '@expo/vector-icons';
import { getBodyWeightHistory, insertBodyWeight, deleteBodyWeight } from './db';
import ActionSheet from "react-native-actions-sheet";
import { LinearGradient } from 'expo-linear-gradient';
import { Calendar } from 'react-native-calendars';
import HistoryList from './HistoryList';
import { AppEvents, on, off } from '../utils/events';
import { useTheme } from '../context/ThemeContext';
import { formatWeight, unitLabel, toStorageKg } from '../utils/units';
import { customAlert } from '../utils/customAlert';
import CustomAlert from './CustomAlert';   // ← Updated import (adjust path if your project structure differs)
import Animated, { useAnimatedStyle, withTiming, Easing, FadeIn } from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRAPH_HEIGHT = 130;
const CARD_MARGIN = 32;
const CARD_PADDING = 40;
const Y_AXIS_WIDTH = 40;
const GRAPH_RIGHT_PADDING = 0;

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
        : ['transparent', 'transparent'];

    return (
        <LinearGradient colors={safeColors} style={style}>
            {children}
        </LinearGradient>
    );
};

const BodyweightGraphCard = ({ theme }) => {
    const styles = getStyles(theme);
    const isDynamic = theme.type === 'dynamic';
    const accentColor = isDynamic ? '#2DC4B6' : theme.primary;
    const safeSurface = isDynamic ? '#1e1e1e' : theme.surface;
    const graphWidth = SCREEN_WIDTH - CARD_MARGIN - CARD_PADDING - Y_AXIS_WIDTH - GRAPH_RIGHT_PADDING;
    const { useImperial } = useTheme();

    const [allData, setAllData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [timeRange, setTimeRange] = useState('1M');
    const [selectedPoint, setSelectedPoint] = useState(null);
    const isTouching = useRef(false);

    // Modal State (now powered by CustomAlert)
    const [modalVisible, setModalVisible] = useState(false);
    const [newWeight, setNewWeight] = useState('');
    const [saving, setSaving] = useState(false);
    const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
    const [showCalendar, setShowCalendar] = useState(false);

    // History Sheet Ref
    const historySheetRef = useRef(null);
    const inputRef = useRef(null);
    const [editingEntry, setEditingEntry] = useState(null);

    const loadData = async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const history = await getBodyWeightHistory();
            setAllData(history);
        } catch (error) {
            console.error("Error loading body weight data:", error);
        } finally {
            if (!silent) setLoading(false);
        }
    };

    // Load on mount
    useEffect(() => { loadData(); }, []);

    // Subscribe to targeted refresh events
    useEffect(() => {
        const handler = () => loadData();
        on(AppEvents.REFRESH_HOME, handler);
        on(AppEvents.BODYWEIGHT_DATA_IMPORTED, handler);
        return () => {
            off(AppEvents.REFRESH_HOME, handler);
            off(AppEvents.BODYWEIGHT_DATA_IMPORTED, handler);
        };
    }, []);

    // Remove auto-focus useEffect as it's now handled by CustomAlert.onShow

    const handleLogWeight = async () => {
        if (!newWeight) return;
        setSaving(true);
        try {
            const weightVal = parseFloat(newWeight);
            if (isNaN(weightVal)) {
                setSaving(false);
                return;
            }
            const weightKg = toStorageKg(weightVal, useImperial);
            const now = new Date();
            const timePart = now.toISOString().split('T')[1];
            const fullIso = `${logDate}T${timePart}`;

            if (editingEntry) {
                await deleteBodyWeight(editingEntry.datetime);
            }

            await insertBodyWeight(fullIso, weightKg);

            setModalVisible(false);
            setNewWeight('');
            setLogDate(new Date().toISOString().split('T')[0]);
            setEditingEntry(null);
            setShowCalendar(false);
            loadData();
        } catch (e) {
            console.error(e);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (entry) => {
        customAlert(
            "Delete Entry",
            "Are you sure you want to delete this weight log?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await deleteBodyWeight(entry.datetime);
                            await loadData(true);
                        } catch (e) {
                            console.error(e);
                        }
                    }
                }
            ]
        );
    };

    const handleEdit = (entry) => {
        setNewWeight(formatWeight(entry.weight, useImperial).toString());
        setLogDate(entry.datetime.split('T')[0]);
        setEditingEntry(entry);
        historySheetRef.current?.hide();
        setModalVisible(true);
    };

    const { points, yRange } = useMemo(() => {
        if (!allData || allData.length < 2) {
            return { points: [], yRange: [0, 100] };
        }

        const now = new Date();
        let startDate = new Date(0);

        if (timeRange === '1M') {
            startDate = new Date();
            startDate.setMonth(now.getMonth() - 1);
        } else if (timeRange === '3M') {
            startDate = new Date();
            startDate.setMonth(now.getMonth() - 3);
        } else if (timeRange === '1Y') {
            startDate = new Date();
            startDate.setFullYear(now.getFullYear() - 1);
        }

        const parsed = allData
            .map(r => ({
                date: new Date(r.datetime),
                value: Number(r.weight)
            }))
            .filter(r => !isNaN(r.date.getTime()) && r.value > 3)
            .sort((a, b) => a.date - b.date)
            .filter(p => p.date >= startDate);

        if (parsed.length === 0) return { points: [], yRange: [0, 100] };

        const densePoints = [];
        const start = parsed[0].date;
        const end = parsed[parsed.length - 1].date;
        const oneDay = 24 * 60 * 60 * 1000;

        for (let d = start.getTime(); d <= end.getTime(); d += oneDay) {
            const currentDate = new Date(d);
            const exactMatch = parsed.find(p => Math.abs(p.date.getTime() - d) < (oneDay / 2));

            if (exactMatch) {
                densePoints.push({ date: currentDate, value: exactMatch.value });
            } else {
                const nextIndex = parsed.findIndex(p => p.date.getTime() > d);
                if (nextIndex !== -1 && nextIndex > 0) {
                    const prevPoint = parsed[nextIndex - 1];
                    const nextPt = parsed[nextIndex];
                    const ratio = (d - prevPoint.date.getTime()) / (nextPt.date.getTime() - prevPoint.date.getTime());
                    densePoints.push({
                        date: currentDate,
                        value: prevPoint.value + (nextPt.value - prevPoint.value) * ratio
                    });
                }
            }
        }

        const finalPoints = densePoints.length > 0 ? densePoints : parsed;
        const lastParsedPoint = parsed[parsed.length - 1];
        const lastDensePoint = finalPoints[finalPoints.length - 1];
        if (!lastDensePoint || Math.abs(lastDensePoint.date.getTime() - lastParsedPoint.date.getTime()) > 1000) {
            finalPoints.push(lastParsedPoint);
        }

        const displayFinalPoints = finalPoints.map(p => ({
            ...p,
            value: useImperial ? parseFloat((p.value * 2.20462).toFixed(1)) : p.value
        }));

        const values = displayFinalPoints.map(p => p.value);
        const minVal = Math.min(...values);
        const maxVal = Math.max(...values);
        const rawRange = maxVal - minVal;

        let minY, maxY;

        if (rawRange > 6) {
            const padding = rawRange * 0.1;
            minY = Math.floor((minVal - padding) / 5) * 5;
            maxY = Math.ceil((maxVal + padding) / 5) * 5;

            while ((maxY - minY) % 10 !== 0) {
                if (Math.abs(maxY - maxVal) < Math.abs(minVal - minY)) {
                    maxY += 5;
                } else {
                    minY -= 5;
                }
            }
        } else {
            const padding = Math.max(0.6, rawRange * 0.15);
            minY = minVal - padding;
            maxY = maxVal + padding;
        }

        return {
            points: displayFinalPoints,
            yRange: [minY, maxY]
        };
    }, [allData, timeRange, useImperial]);

    const durationDays = useMemo(() => {
        if (!points || points.length < 2) return 0;
        return (points[points.length - 1].date.getTime() - points[0].date.getTime()) / (1000 * 60 * 60 * 24);
    }, [points]);

    const xAxisLabels = useMemo(() => {
        if (!points || points.length < 2) return [];
        const count = 4;
        const labels = [];
        for (let i = 0; i < count; i++) {
            const index = Math.floor((points.length - 1) * (i / (count - 1)));
            labels.push(points[index].date);
        }
        return labels;
    }, [points]);

    const formatXAxisDate = (date) => {
        if (durationDays > 180) {
            return `${date.toLocaleDateString('en-US', { month: 'short' })} '${date.getFullYear().toString().slice(-2)}`;
        }
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const trendData = useMemo(() => {
        if (points.length < 2) {
            return { direction: 'flat', label: '0%', period: 'all time' };
        }

        const first = points[0];
        const last = points[points.length - 1];

        const diff = last.value - first.value;
        const percentChange = first.value > 0 ? (diff / first.value) * 100 : 0;

        const EPSILON = 0.01;
        const isFlat = Math.abs(percentChange) < EPSILON;

        return {
            direction: isFlat ? 'flat' : diff > 0 ? 'up' : 'down',
            label: isFlat ? '0%' : `${percentChange > 0 ? '+' : ''}${percentChange.toFixed(1)}%`,
            period: timeRange.toLowerCase()
        };
    }, [points, timeRange]);

    const onPointSelected = useCallback(p => { if (isTouching.current) setSelectedPoint(p); }, []);
    const onGestureStart = useCallback(() => { isTouching.current = true; }, []);
    const onGestureEnd = useCallback(() => { isTouching.current = false; setSelectedPoint(null); }, []);

    const sanitizeDecimal = (text) => {
        let cleaned = text.replace(/[^0-9.]/g, '');
        if (cleaned.startsWith('.')) cleaned = '0' + cleaned;
        const parts = cleaned.split('.');
        if (parts.length > 2) cleaned = parts[0] + '.' + parts.slice(1).join('');
        return cleaned;
    };

    const sanitizeInteger = (text) => text.replace(/[^0-9]/g, '');


    const renderModalsAndSheets = () => (
        <>
            <CustomAlert
                visible={modalVisible}
                title="Log Body Weight"
                iconType={null}
                onClose={() => setModalVisible(false)}
                onShow={() => {
                    // Double-focus "hammer" pattern ensures focus works even if interrupted by transitions
                    const focus = () => {
                        if (inputRef.current) {
                            inputRef.current.focus();
                            // Only select text if we're editing an existing entry
                            if (editingEntry && newWeight) {
                                inputRef.current.setNativeProps({
                                    selection: { start: 0, end: newWeight.length }
                                });
                            }
                        }
                    };
                    const t1 = setTimeout(focus, 200);
                    return () => { clearTimeout(t1); };
                }}
                buttons={[
                    { text: "Cancel", style: "cancel", onPress: () => { } },
                    { text: "Save", onPress: handleLogWeight, loading: saving },
                ]}
            >
                <View style={[styles.inputContainer, { borderColor: theme.border }]}>
                    <TextInput
                        ref={inputRef}
                        style={[styles.input, { color: theme.text }]}
                        keyboardType="decimal-pad"
                        value={newWeight}
                        onChangeText={(text) => setNewWeight(sanitizeDecimal(text))}
                        placeholder="0.0"
                        placeholderTextColor={theme.textSecondary + '40'}
                        returnKeyType="done"
                        onSubmitEditing={handleLogWeight}
                        multiline={Platform.OS === 'android'}
                    />
                    <Text style={[styles.unitText, { color: theme.textSecondary }]}>{unitLabel(useImperial)}</Text>
                </View>

                <Pressable
                    style={[styles.dateButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
                    onPress={() => { Keyboard.dismiss(); setShowCalendar(!showCalendar); }}
                >
                    <Feather name="calendar" size={16} color={theme.text} />
                    <Text style={[styles.dateButtonText, { color: theme.text }]}>
                        {logDate === new Date().toISOString().split('T')[0] ? 'Today' : logDate}
                    </Text>
                </Pressable>

                {/* Smooth animated calendar */}
                <Animated.View
                    style={[
                        { width: '100%', marginBottom: 20, overflow: 'hidden' },
                        useAnimatedStyle(() => ({
                            height: withTiming(showCalendar ? 340 : 0, { duration: 320, easing: Easing.out(Easing.cubic) }),
                            opacity: withTiming(showCalendar ? 1 : 0, { duration: 250 }),
                        }))
                    ]}
                >
                    <Calendar
                        current={logDate}
                        onDayPress={day => {
                            setLogDate(day.dateString);
                            setShowCalendar(false);
                            setTimeout(() => {
                                inputRef.current?.focus();
                                inputRef.current?.setNativeProps({ selection: { start: 0, end: 0 } });
                            }, 180);
                        }}
                        markedDates={{ [logDate]: { selected: true, selectedColor: theme.primary } }}
                        theme={{
                            backgroundColor: theme.surface,
                            calendarBackground: theme.surface,
                            textSectionTitleColor: theme.textSecondary,
                            selectedDayBackgroundColor: theme.primary,
                            selectedDayTextColor: theme.surface,
                            todayTextColor: theme.primary,
                            dayTextColor: theme.text,
                            arrowColor: theme.primary,
                            monthTextColor: theme.text,
                        }}
                    />
                </Animated.View>
            </CustomAlert>

            <ActionSheet
                ref={historySheetRef}
                enableGestureBack={true}
                containerStyle={{ height: '100%', backgroundColor: safeSurface }}
                indicatorStyle={{ backgroundColor: theme.textSecondary }}
                snapPoints={[100]}
            >
                <View style={{ flex: 1, paddingHorizontal: 20 }}>
                    <View style={[styles.historyHeader, { borderBottomColor: 'transparent', paddingHorizontal: 0 }]}>
                        <Text style={[styles.modalTitle, { marginBottom: 0, color: theme.text }]}>History</Text>
                        <TouchableOpacity onPress={() => historySheetRef.current?.hide()}>
                            <View style={{ padding: 4, backgroundColor: theme.background, borderRadius: 50 }}>
                                <Feather name="x" size={20} color={theme.textSecondary} />
                            </View>
                        </TouchableOpacity>
                    </View>
                    <HistoryList
                        data={[...allData].sort((a, b) => new Date(b.datetime) - new Date(a.datetime))}
                        theme={theme}
                        styles={styles}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                    />
                </View>
            </ActionSheet>
        </>
    );

    return (
        <Animated.View entering={FadeIn.duration(400)} style={styles.container}>

            <GradientOrView colors={[theme.surface, theme.surface]} style={styles.content} theme={theme}>
                <View style={styles.header}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.title}>Body Weight</Text>
                        <Text style={styles.subtitle}>
                            {allData.length > 0 && points.length >= 1
                                ? `Current: ${points.at(-1)?.value.toFixed(1)} ${unitLabel(useImperial)}`
                                : 'No logs for this period'}
                        </Text>

                        {allData.length >= 2 && points.length >= 2 && (
                            <View style={[
                                styles.trendBadge,
                                { backgroundColor: `${theme.secondary}30` }
                            ]}>
                                <Text style={[
                                    styles.trendArrow,
                                    { color: theme.secondary }
                                ]}>
                                    {trendData.direction === 'up' ? '↑' : trendData.direction === 'down' ? '↓' : '→'}
                                </Text>

                                <Text style={[
                                    styles.trendText,
                                    {
                                        color: theme.secondary,
                                        fontFamily: FONTS.bold
                                    }
                                ]}>
                                    {trendData.label}
                                </Text>

                                <Text style={styles.trendPeriod}>
                                    · {trendData.period}
                                </Text>
                            </View>
                        )}
                    </View>

                    <View style={{ gap: 8, alignItems: 'flex-end' }}>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity style={[styles.logButton, { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }]} onPress={() => historySheetRef.current?.show()}>
                                <Feather name="list" size={16} color={theme.text} />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.logButton} onPress={() => {
                                setEditingEntry(null);
                                setNewWeight('');
                                setLogDate(new Date().toISOString().split('T')[0]);
                                setModalVisible(true);
                            }}>
                                <Feather name="plus" size={16} color={theme.textAlternate} />
                                <Text style={styles.logButtonText}>Log</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={styles.rangeSelector}>
                            {['1M', '3M', '1Y', 'ALL'].map(r => (
                                <TouchableOpacity key={r} onPress={() => setTimeRange(r)} style={[styles.rangeButton, timeRange === r && styles.rangeButtonActive]}>
                                    <Text style={[styles.rangeText, timeRange === r && styles.rangeTextActive]}>{r}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </View>

                {points.length < 2 ? (
                    <View style={[styles.emptyState, { height: GRAPH_HEIGHT + 60, justifyContent: 'center', alignItems: 'center' }]}>
                        <Feather name="activity" size={40} color={theme.textSecondary} style={{ opacity: 0.2, marginBottom: 10 }} />
                        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                            {allData.length === 0 ? 'Log weight to see your progress graph' : 'No logs found for this period'}
                        </Text>
                    </View>
                ) : (
                    <>
                        <View style={styles.tooltipContainer}>
                            <View style={styles.activeTooltip}>
                                <Text style={styles.tooltipValue}>{(selectedPoint?.value ?? points.at(-1)?.value).toFixed(1)} {unitLabel(useImperial)}</Text>
                                <Text style={styles.tooltipDate}>
                                    {selectedPoint ? selectedPoint.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Current'}
                                </Text>
                            </View>
                        </View>

                        <View style={styles.graphRow}>
                            <View style={styles.yAxis}>
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
                            <View style={{ paddingRight: GRAPH_RIGHT_PADDING }}>
                                <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: GRAPH_HEIGHT }}>
                                    {[0, 0.5, 1].map(fraction => (
                                        <View
                                            key={fraction}
                                            style={{
                                                position: 'absolute',
                                                top: fraction * (GRAPH_HEIGHT - 1),
                                                left: 10,
                                                right: 10,
                                                height: 1,
                                                backgroundColor: isLightTheme(theme) ? theme.overlayBorder : 'rgba(255,255,255,0.06)',
                                            }}
                                        />
                                    ))}
                                </View>
                                <Animated.View entering={FadeIn.duration(500).delay(300)}>
                                    <LineGraph
                                        points={points}
                                        animated={true}
                                        color={accentColor}
                                        gradientFillColors={isDynamic ? ['#2DC4B6CC', '#2DC4B600'] : [`${theme.primary}CC`, `${theme.primary}00`]}
                                        enablePanGesture={true}
                                        enableIndicator
                                        onPointSelected={onPointSelected}
                                        onGestureStart={onGestureStart}
                                        onGestureEnd={onGestureEnd}
                                        range={{ y: { min: yRange[0], max: yRange[1] } }}
                                        style={{ width: graphWidth, height: GRAPH_HEIGHT }}
                                    />
                                </Animated.View>
                                <View style={[styles.xAxisRow, { width: graphWidth }]}>
                                    {xAxisLabels.map((date, index) => (
                                        <Text key={index} style={[styles.xAxisText, { textAlign: index === 0 ? 'left' : index === xAxisLabels.length - 1 ? 'right' : 'center' }]}>
                                            {formatXAxisDate(date)}
                                        </Text>
                                    ))}
                                </View>
                            </View>
                        </View>
                    </>
                )}
            </GradientOrView>
            {renderModalsAndSheets()}
        </Animated.View>
    );
};

const getStyles = (theme) => StyleSheet.create({
    container: {
        marginBottom: 20,
        marginHorizontal: 16,
        borderRadius: 24,
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
        overflow: 'hidden',
        ...getThemedShadow(theme, 'medium'),
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
        color: theme.text,
        marginBottom: 2,
    },
    subtitle: {
        fontSize: 12,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
    },
    tooltipContainer: {
        height: 44,
        justifyContent: 'center',
        marginBottom: 6,
    },
    activeTooltip: {
        paddingLeft: Y_AXIS_WIDTH,
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
    rangeSelector: {
        flexDirection: 'row',
        backgroundColor: isLightTheme(theme) ? theme.overlaySubtle : theme.overlayBorder,
        borderRadius: 8,
        padding: 2,
        borderWidth: 1,
        borderColor: isLightTheme(theme) ? theme.overlayBorder : 'transparent',
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
    graphRow: {
        flexDirection: 'row',
        marginTop: 10,
    },
    yAxis: {
        width: Y_AXIS_WIDTH,
        justifyContent: 'space-between',
        paddingRight: 8,
        overflow: 'visible',
        height: GRAPH_HEIGHT,
    },
    yAxisText: {
        fontSize: 10,
        color: theme.textSecondary,
        fontFamily: FONTS.medium,
    },
    xAxisRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 8,
        paddingHorizontal: 2,
    },
    xAxisText: {
        fontSize: 10,
        color: theme.textSecondary,
        fontFamily: FONTS.medium,
        width: 60,
    },
    emptyState: {
        height: 260,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 14,
        color: theme.textSecondary,
        marginTop: 8,
        fontFamily: FONTS.medium,
    },
    trendBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 4,
        marginTop: 4,
        alignSelf: 'flex-start'
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
    logButton: {
        backgroundColor: theme.primary,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 12,
        gap: 4,
        marginBottom: 8,
    },
    logButtonText: {
        color: theme.textAlternate,
        fontSize: 12,
        fontFamily: FONTS.bold,
    },
    // Modal Styles (still used by children inside CustomAlert)
    modalTitle: {
        fontSize: 20,
        fontFamily: FONTS.bold,
        marginBottom: 20,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        width: '100%',
        marginBottom: 24,
        position: 'relative',
    },
    input: {
        flex: 1,
        fontSize: 24,
        fontFamily: FONTS.bold, // Switched to bold to match exerciseEditable
        textAlign: 'center',
        textAlignVertical: 'center',
        padding: 0,
        margin: 0,
        includeFontPadding: false,
        height: 60, // Increased height for easier centering with multiline
    },
    unitText: {
        fontSize: 16,
        fontFamily: FONTS.medium,
        position: 'absolute',
        right: 16,
    },
    dateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 20,
        gap: 8,
    },
    dateButtonText: {
        fontFamily: FONTS.medium,
        fontSize: 14,
    },
    // History Styles
    historyHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        width: '100%',
    },
    historyItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 16,
        borderBottomWidth: 1,
    },
    historyDate: {
        fontSize: 16,
        fontFamily: FONTS.medium,
        marginBottom: 4,
    },
    historyWeight: {
        fontSize: 14,
        fontFamily: FONTS.regular,
    }
});

export default BodyweightGraphCard;