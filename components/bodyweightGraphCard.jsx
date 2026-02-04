import { View, Text, StyleSheet, Dimensions, TouchableOpacity, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard, Alert } from 'react-native';
import React, { useState, useMemo, useCallback, useRef } from 'react';
import { LineGraph } from 'react-native-graph';
import { FONTS, SHADOWS } from '../constants/theme';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { getBodyWeightHistory, insertBodyWeight, deleteBodyWeight } from './db';
import ActionSheet from "react-native-actions-sheet";
import { LinearGradient } from 'expo-linear-gradient';
import { Calendar } from 'react-native-calendars';
import HistoryList from './HistoryList';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRAPH_HEIGHT = 100;
const CARD_MARGIN = 32;
const CARD_PADDING = 40;
const Y_AXIS_WIDTH = 40;

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

const GradientOrView = ({ colors, style, theme, children }) => {
    if (theme.type === 'dynamic') {
        return <View style={[style, { backgroundColor: theme.surface }]}>{children}</View>;
    }
    return <LinearGradient colors={colors} style={style}>{children}</LinearGradient>;
};

const BodyweightGraphCard = ({ theme, refreshTrigger }) => {
    const styles = getStyles(theme);
    const isDynamic = theme.type === 'dynamic';
    const accentColor = isDynamic ? '#2DC4B6' : theme.primary;
    const safeSurface = isDynamic ? '#1e1e1e' : theme.surface;
    const graphWidth = SCREEN_WIDTH - CARD_MARGIN - CARD_PADDING - Y_AXIS_WIDTH;

    const [allData, setAllData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [timeRange, setTimeRange] = useState('1M');
    const [selectedPoint, setSelectedPoint] = useState(null);
    const isTouching = useRef(false);

    // Modal State
    const [modalVisible, setModalVisible] = useState(false);
    const [newWeight, setNewWeight] = useState('');
    const [saving, setSaving] = useState(false);
    const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
    const [showCalendar, setShowCalendar] = useState(false);

    // History Sheet Ref
    const historySheetRef = useRef(null);
    const [editingEntry, setEditingEntry] = useState(null);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [])
    );

    const loadData = async () => {
        try {
            setLoading(true);
            const history = await getBodyWeightHistory();
            setAllData(history);
        } catch (error) {
            console.error("Error loading body weight data:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleLogWeight = async () => {
        if (!newWeight) return;
        setSaving(true);
        try {
            const weightVal = parseFloat(newWeight);
            if (isNaN(weightVal)) {
                setSaving(false);
                return;
            }
            const now = new Date();
            const timePart = now.toISOString().split('T')[1];
            const fullIso = `${logDate}T${timePart}`;

            if (editingEntry && editingEntry.datetime.split('T')[0] !== logDate) {
                await deleteBodyWeight(editingEntry.datetime);
            }

            await insertBodyWeight(fullIso, weightVal);

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
        Alert.alert(
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
                            await loadData();
                        } catch (e) {
                            console.error(e);
                        }
                    }
                }
            ]
        );
    };

    const handleEdit = (entry) => {
        setNewWeight(entry.weight.toString());
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
            .filter(r => !isNaN(r.date.getTime()) && r.value > 20)
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

        // **FIX: Ensure the last actual data point is always included**
        const finalPoints = densePoints.length > 0 ? densePoints : parsed;
        const lastParsedPoint = parsed[parsed.length - 1];
        const lastDensePoint = finalPoints[finalPoints.length - 1];

        // If the last dense point doesn't match the last actual point, add it
        if (!lastDensePoint || Math.abs(lastDensePoint.date.getTime() - lastParsedPoint.date.getTime()) > 1000) {
            finalPoints.push(lastParsedPoint);
        }

        const values = finalPoints.map(p => p.value);
        const minVal = Math.min(...values);
        const maxVal = Math.max(...values);
        const padding = Math.max(0.5, (maxVal - minVal) * 0.1);

        return {
            points: finalPoints,
            yRange: [minVal - padding, maxVal + padding]
        };
    }, [allData, timeRange]);

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
        if (points.length < 2) return { direction: 'flat', label: '0%', period: 'all time' };
        const first = points[0];
        const last = points[points.length - 1];
        const diff = last.value - first.value;
        const percentChange = first.value > 0 ? (diff / first.value) * 100 : 0;
        return {
            direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat',
            label: `${percentChange > 0 ? '+' : ''}${percentChange.toFixed(1)}%`,
            period: timeRange.toLowerCase()
        };
    }, [points, timeRange]);

    const onPointSelected = useCallback(p => { if (isTouching.current) setSelectedPoint(p); }, []);
    const onGestureStart = useCallback(() => { isTouching.current = true; }, []);
    const onGestureEnd = useCallback(() => { isTouching.current = false; setSelectedPoint(null); }, []);

    const renderModalsAndSheets = () => (
        <>
            <Modal
                animationType="fade"
                transparent={true}
                visible={modalVisible}
                onRequestClose={() => setModalVisible(false)}
            >
                <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
                    <View style={styles.modalOverlay}>
                        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                            <KeyboardAvoidingView
                                behavior={Platform.OS === "ios" ? "padding" : "height"}
                                style={styles.modalContent}
                            >
                                <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
                                    <Text style={[styles.modalTitle, { color: theme.text }]}>Log Body Weight</Text>
                                    <View style={[styles.inputContainer, { borderColor: theme.border }]}>
                                        <TextInput
                                            style={[styles.input, { color: theme.text }]}
                                            keyboardType="numeric"
                                            value={newWeight}
                                            onChangeText={setNewWeight}
                                            autoFocus={!showCalendar}
                                        />
                                        <Text style={[styles.unitText, { color: theme.textSecondary }]}>kg</Text>
                                    </View>
                                    <TouchableOpacity
                                        style={[styles.dateButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
                                        onPress={() => { Keyboard.dismiss(); setShowCalendar(!showCalendar); }}
                                    >
                                        <Feather name="calendar" size={16} color={theme.text} />
                                        <Text style={[styles.dateButtonText, { color: theme.text }]}>
                                            {logDate === new Date().toISOString().split('T')[0] ? 'Today' : logDate}
                                        </Text>
                                    </TouchableOpacity>
                                    {showCalendar && (
                                        <View style={{ width: '100%', marginBottom: 20 }}>
                                            <Calendar
                                                current={logDate}
                                                onDayPress={day => { setLogDate(day.dateString); setShowCalendar(false); }}
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
                                        </View>
                                    )}
                                    <View style={styles.modalButtons}>
                                        <TouchableOpacity style={[styles.modalButton, { backgroundColor: theme.background }]} onPress={() => setModalVisible(false)}>
                                            <Text style={[styles.modalButtonText, { color: theme.textSecondary }]}>Cancel</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[styles.modalButton, { backgroundColor: theme.primary }]} onPress={handleLogWeight}>
                                            {saving ? <ActivityIndicator color={theme.surface} size="small" /> : <Text style={[styles.modalButtonText, { color: theme.surface }]}>Save</Text>}
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </KeyboardAvoidingView>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>

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

    if (loading) {
        return (
            <View style={styles.container}>
                <ActivityIndicator color={theme.primary} style={{ marginTop: 50 }} />
            </View>
        );
    }

    // --- RENDER EMPTY STATE ---
    if (points.length < 2) {
        return (
            <View style={styles.container}>
                <GradientOrView colors={[theme.surface, theme.surface]} style={styles.content} theme={theme}>
                    <View style={styles.header}>
                        <View>
                            <Text style={styles.title}>Body Weight</Text>
                            <Text style={styles.subtitle}>No logs yet</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity
                                style={[styles.logButton, { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }]}
                                onPress={() => historySheetRef.current?.show()}
                            >
                                <Feather name="list" size={16} color={theme.text} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.logButton}
                                onPress={() => {
                                    setEditingEntry(null);
                                    setNewWeight('');
                                    setLogDate(new Date().toISOString().split('T')[0]);
                                    setModalVisible(true);
                                }}
                            >
                                <Feather name="plus" size={16} color={theme.surface} />
                                <Text style={styles.logButtonText}>Log</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                    <View style={[styles.emptyState, { height: GRAPH_HEIGHT + 60, justifyContent: 'center', alignItems: 'center' }]}>
                        <Feather name="activity" size={40} color={theme.textSecondary} style={{ opacity: 0.2, marginBottom: 10 }} />
                        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Log weight to see your progress graph</Text>
                    </View>
                </GradientOrView>
                {renderModalsAndSheets()}
            </View>
        );
    }

    // --- RENDER FULL STATE ---
    return (
        <View style={styles.container}>
            <GradientOrView colors={[theme.surface, theme.surface]} style={styles.content} theme={theme}>
                <View style={styles.header}>
                    <View>
                        <Text style={styles.title}>Body Weight</Text>
                        <Text style={styles.subtitle}>Current: {points.at(-1)?.value.toFixed(1)} kg</Text>
                        <View style={[styles.trendBadge, { backgroundColor: trendData.direction === 'up' ? 'rgba(34, 197, 94, 0.15)' : trendData.direction === 'down' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(100, 100, 100, 0.1)' }]}>
                            <Text style={[styles.trendArrow, { color: trendData.direction === 'up' ? '#22c55e' : trendData.direction === 'down' ? '#ef4444' : theme.textSecondary }]}>
                                {trendData.direction === 'up' ? '↑' : trendData.direction === 'down' ? '↓' : '→'}
                            </Text>
                            <Text style={[styles.trendText, { color: trendData.direction === 'up' ? '#22c55e' : trendData.direction === 'down' ? '#ef4444' : theme.textSecondary, fontFamily: FONTS.bold }]}>
                                {trendData.label}
                            </Text>
                            <Text style={styles.trendPeriod}>· {trendData.period}</Text>
                        </View>
                    </View>

                    <View style={{ gap: 8, alignItems: 'flex-end' }}>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity style={[styles.logButton, { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }]} onPress={() => historySheetRef.current?.show()}>
                                <Feather name="list" size={16} color={theme.text} />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.logButton} onPress={() => { setEditingEntry(null); setNewWeight(''); setLogDate(new Date().toISOString().split('T')[0]); setModalVisible(true); }}>
                                <Feather name="plus" size={16} color={theme.surface} />
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

                <View style={styles.tooltipContainer}>
                    <View style={styles.activeTooltip}>
                        <Text style={styles.tooltipValue}>{(selectedPoint?.value ?? points.at(-1)?.value).toFixed(1)} kg</Text>
                        <Text style={styles.tooltipDate}>
                            {selectedPoint ? selectedPoint.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Current'}
                        </Text>
                    </View>
                </View>

                <View style={styles.graphRow}>
                    <View style={styles.yAxis}>
                        <Text style={styles.yAxisText}>{yRange[1].toFixed(0)}</Text>
                        <Text style={styles.yAxisText}>{((yRange[0] + yRange[1]) / 2).toFixed(0)}</Text>
                        <Text style={styles.yAxisText}>{yRange[0].toFixed(0)}</Text>
                    </View>
                    <View>
                        <LineGraph
                            points={points}
                            animated
                            color={accentColor}
                            gradientFillColors={isDynamic ? ['#2DC4B6CC', '#2DC4B600'] : [`${theme.primary}CC`, `${theme.primary}00`]}
                            enablePanGesture
                            enableIndicator
                            SelectionDot={CustomSelectionDot}
                            onPointSelected={onPointSelected}
                            onGestureStart={onGestureStart}
                            onGestureEnd={onGestureEnd}
                            range={{ y: { min: yRange[0], max: yRange[1] } }}
                            style={{ width: graphWidth, height: GRAPH_HEIGHT }}
                        />
                        <View style={[styles.xAxisRow, { width: graphWidth }]}>
                            {xAxisLabels.map((date, index) => (
                                <Text key={index} style={[styles.xAxisText, { textAlign: index === 0 ? 'left' : index === xAxisLabels.length - 1 ? 'right' : 'center' }]}>
                                    {formatXAxisDate(date)}
                                </Text>
                            ))}
                        </View>
                    </View>
                </View>
            </GradientOrView>
            {renderModalsAndSheets()}
        </View>
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
        paddingVertical: 5,
        // Match height of graph only; X-axis is separate below
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
    emptySubText: {
        fontSize: 12,
        color: theme.textSecondary,
        marginTop: 4,
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
        color: theme.surface,
        fontSize: 12,
        fontFamily: FONTS.bold,
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: '100%',
        alignItems: 'center',
    },
    modalCard: {
        width: '85%',
        padding: 24,
        borderRadius: 24,
        ...SHADOWS.medium,
        alignItems: 'center',
    },
    modalTitle: {
        fontSize: 20,
        fontFamily: FONTS.bold,
        marginBottom: 20,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        width: '100%',
        marginBottom: 24,
    },
    input: {
        flex: 1,
        fontSize: 24,
        fontFamily: FONTS.medium,
        textAlign: 'center',
    },
    unitText: {
        fontSize: 16,
        fontFamily: FONTS.medium,
        marginLeft: 8,
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
    modalButtons: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
    },
    modalButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalButtonText: {
        fontSize: 16,
        fontFamily: FONTS.bold,
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