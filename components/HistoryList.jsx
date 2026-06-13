
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import React from 'react';
import { useScrollHandlers } from 'react-native-actions-sheet';
import { NativeViewGestureHandler } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { formatWeight, unitLabel } from '../utils/units';

const HistoryList = ({ data, theme, styles, onEdit, onDelete }) => {
    const handlers = useScrollHandlers();
    const { useImperial } = useTheme();

    return (
        <NativeViewGestureHandler simultaneousHandlers={handlers.simultaneousHandlers}>
            <ScrollView
                {...handlers}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 40 }}
            >
                {data.length === 0 ? (
                    <View style={{ alignItems: 'center', justifyContent: 'center', marginTop: 40 }}>
                        <Feather name="clipboard" size={48} color={theme.textSecondary} style={{ opacity: 0.3, marginBottom: 10 }} />
                        <Text style={{ textAlign: 'center', color: theme.textSecondary, fontFamily: FONTS.medium }}>No history entries found</Text>
                    </View>
                ) : (
                    data.map((item, index) => {
                        // Change vs the previous (older) weigh-in. Up/down isn't
                        // inherently good or bad for bodyweight, so it stays neutral.
                        const prev = data[index + 1];
                        let deltaDisplay = null;
                        if (prev) {
                            const diffKg = Number(item.weight) - Number(prev.weight);
                            const d = useImperial ? diffKg * 2.20462 : diffKg;
                            if (Math.abs(d) >= 0.05) {
                                deltaDisplay = { up: d > 0, value: Math.abs(d).toFixed(1) };
                            }
                        }

                        return (
                        <View key={item.datetime} style={[styles.historyItem, { borderBottomColor: theme.border }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                <View style={{
                                    width: 40, height: 40, borderRadius: 20,
                                    backgroundColor: theme.background,
                                    alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <Feather name="activity" size={20} color={theme.primary} />
                                </View>
                                <View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <Text style={[styles.historyDate, { color: theme.text, fontSize: 16, fontFamily: FONTS.bold, marginBottom: 0 }]}>
                                            {formatWeight(item.weight, useImperial)} <Text style={{ fontSize: 14, color: theme.textSecondary, fontFamily: FONTS.medium }}>{unitLabel(useImperial)}</Text>
                                        </Text>
                                        {deltaDisplay && (
                                            <Text style={{ fontSize: 12, fontFamily: FONTS.semiBold, color: theme.textSecondary }}>
                                                {deltaDisplay.up ? '↑' : '↓'}{deltaDisplay.value}
                                            </Text>
                                        )}
                                    </View>
                                    <Text style={[styles.historyWeight, { color: theme.textSecondary, fontSize: 13, marginTop: 2 }]}>
                                        {new Date(item.datetime).toLocaleDateString(undefined, {
                                            month: 'short', day: 'numeric', year: 'numeric'
                                        })}
                                    </Text>
                                </View>
                            </View>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                <TouchableOpacity
                                    onPress={() => onEdit(item)}
                                    style={{ padding: 8 }}
                                >
                                    <Feather name="edit-2" size={18} color={theme.textSecondary} />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => onDelete(item)}
                                    style={{ padding: 8 }}
                                >
                                    <Feather name="trash-2" size={18} color="#ef4444" />
                                </TouchableOpacity>
                            </View>
                        </View>
                        );
                    })
                )}
            </ScrollView>
        </NativeViewGestureHandler>
    );
};

export default HistoryList;
