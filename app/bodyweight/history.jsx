import { View, Text, StyleSheet, SectionList, TouchableOpacity, Pressable, ActivityIndicator } from 'react-native';
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { FONTS, TYPE, SPACING, RADIUS } from '../../constants/theme';
import { getBodyWeightHistory, deleteBodyWeight } from '../../components/db';
import { formatWeight, unitLabel } from '../../utils/units';
import { customAlert } from '../../utils/customAlert';
import * as haptics from '../../utils/haptics';
import { AppEvents, on, off } from '../../utils/events';
import ContextMenu from '../../components/ContextMenu';
import WeightEntryModal from '../../components/WeightEntryModal';

const monthLabel = (d) =>
    d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

const BodyWeightHistory = () => {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { theme, useImperial } = useTheme();
    const styles = useMemo(() => getStyles(theme), [theme]);

    const [entries, setEntries] = useState(null); // null = first load
    const [menu, setMenu] = useState(null);       // { anchor, entry }
    const [editing, setEditing] = useState(null); // entry being edited
    const [modalOpen, setModalOpen] = useState(false);

    const load = useCallback(async () => {
        try {
            setEntries(await getBodyWeightHistory());
        } catch (e) {
            console.error('Body weight history load failed:', e);
            setEntries([]);
        }
    }, []);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    // Also refresh on the mutation event, not just on focus: an entry logged or
    // edited from this screen never blurs it, so focus alone would leave the
    // list showing the state from before the save.
    useEffect(() => {
        const handler = () => load();
        on(AppEvents.BODYWEIGHT_DATA_IMPORTED, handler, 'bodyweight-history');
        return () => off(AppEvents.BODYWEIGHT_DATA_IMPORTED, handler);
    }, [load]);

    // One pass, newest first: the delta compares against the next-older entry,
    // which has to be computed across the whole list before it is split into
    // months — otherwise the first row of each month would have no delta.
    const { sections, stats } = useMemo(() => {
        if (!entries?.length) return { sections: [], stats: null };

        const desc = [...entries].sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
        const decorated = desc.map((item, i) => {
            const older = desc[i + 1];
            let delta = null;
            if (older) {
                const diffKg = Number(item.weight) - Number(older.weight);
                const shown = useImperial ? diffKg * 2.20462 : diffKg;
                if (Math.abs(shown) >= 0.05) {
                    delta = { up: shown > 0, value: Math.abs(shown).toFixed(1) };
                }
            }
            return { ...item, delta };
        });

        const grouped = new Map();
        for (const item of decorated) {
            const d = new Date(item.datetime);
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            if (!grouped.has(key)) grouped.set(key, { title: monthLabel(d), data: [] });
            grouped.get(key).data.push(item);
        }

        const weights = decorated.map(e => Number(e.weight));
        const newest = Number(decorated[0].weight);
        const oldest = Number(decorated[decorated.length - 1].weight);
        const changeKg = newest - oldest;

        return {
            sections: [...grouped.values()],
            stats: {
                current: newest,
                change: decorated.length > 1 ? changeKg : null,
                low: Math.min(...weights),
                high: Math.max(...weights),
            },
        };
    }, [entries, useImperial]);

    const openMenu = (e, entry) => {
        haptics.select();
        setMenu({ anchor: { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }, entry });
    };

    const confirmDelete = (entry) => {
        customAlert(
            'Delete Entry',
            'Are you sure you want to delete this weigh-in?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteBodyWeight(entry.datetime);
                            load();
                        } catch (err) {
                            console.error('Delete failed:', err);
                        }
                    },
                },
            ]
        );
    };

    const renderRow = ({ item }) => (
        <Pressable
            onLongPress={(e) => openMenu(e, item)}
            delayLongPress={300}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.overlaySubtle }]}
        >
            <View style={styles.rowMain}>
                <Text style={styles.weight}>
                    {formatWeight(item.weight, useImperial)}
                    <Text style={styles.weightUnit}> {unitLabel(useImperial)}</Text>
                </Text>
                <Text style={styles.rowDate}>
                    {new Date(item.datetime).toLocaleDateString(undefined, {
                        weekday: 'short', day: 'numeric', month: 'short',
                    })}
                </Text>
            </View>
            {/* Up or down is not good or bad for bodyweight, so this stays
                neutral rather than green/red. */}
            {item.delta && (
                <View style={styles.deltaPill}>
                    <Feather
                        name={item.delta.up ? 'arrow-up-right' : 'arrow-down-right'}
                        size={12}
                        color={theme.textSecondary}
                    />
                    <Text style={styles.deltaText}>{item.delta.value}</Text>
                </View>
            )}
        </Pressable>
    );

    const loading = entries === null;
    const empty = !loading && sections.length === 0;

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <View style={styles.header}>
                <View style={styles.headerText}>
                    <Text style={styles.eyebrow}>
                        {entries?.length ? `${entries.length} ${entries.length === 1 ? 'ENTRY' : 'ENTRIES'}` : 'BODY WEIGHT'}
                    </Text>
                    <Text style={styles.title}>Body Weight</Text>
                </View>
                <TouchableOpacity style={styles.iconButton} onPress={() => router.back()} activeOpacity={0.7}>
                    <Feather name="x" size={18} color={theme.text} />
                </TouchableOpacity>
            </View>

            {stats && (
                <View style={styles.statsRow}>
                    <View style={styles.stat}>
                        <Text style={styles.statValue}>{formatWeight(stats.current, useImperial)}</Text>
                        <Text style={styles.statLabel}>Current</Text>
                    </View>
                    <View style={styles.stat}>
                        <Text style={styles.statValue}>
                            {stats.change == null
                                ? '—'
                                : `${stats.change > 0 ? '+' : '−'}${formatWeight(Math.abs(stats.change), useImperial)}`}
                        </Text>
                        <Text style={styles.statLabel}>All time</Text>
                    </View>
                    <View style={styles.stat}>
                        <Text style={styles.statValue}>{formatWeight(stats.low, useImperial)}</Text>
                        <Text style={styles.statLabel}>Lowest</Text>
                    </View>
                    <View style={styles.stat}>
                        <Text style={styles.statValue}>{formatWeight(stats.high, useImperial)}</Text>
                        <Text style={styles.statLabel}>Highest</Text>
                    </View>
                </View>
            )}

            {loading ? (
                <View style={styles.centre}><ActivityIndicator size="large" color={theme.primary} /></View>
            ) : empty ? (
                <View style={styles.centre}>
                    <Feather name="trending-up" size={40} color={theme.textSecondary} style={{ opacity: 0.35 }} />
                    <Text style={styles.emptyTitle}>No weigh-ins yet</Text>
                    <Text style={styles.emptySubtitle}>Log your weight to start tracking a trend.</Text>
                </View>
            ) : (
                <SectionList
                    sections={sections}
                    keyExtractor={(item) => item.datetime}
                    renderItem={renderRow}
                    renderSectionHeader={({ section }) => (
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>{section.title}</Text>
                            <Text style={styles.sectionCount}>
                                {section.data.length} {section.data.length === 1 ? 'entry' : 'entries'}
                            </Text>
                        </View>
                    )}
                    stickySectionHeadersEnabled
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
                    initialNumToRender={14}
                    windowSize={7}
                />
            )}

            <TouchableOpacity
                style={[styles.fab, { bottom: insets.bottom + SPACING.xl }]}
                activeOpacity={0.85}
                onPress={() => { haptics.tap(); setEditing(null); setModalOpen(true); }}
            >
                <Feather name="plus" size={20} color={theme.textAlternate} />
                <Text style={styles.fabText}>Log Weight</Text>
            </TouchableOpacity>

            {menu && (
                <ContextMenu
                    anchor={menu.anchor}
                    onClose={() => setMenu(null)}
                    items={[
                        {
                            icon: 'edit-2',
                            label: 'Edit',
                            onPress: () => { setEditing(menu.entry); setModalOpen(true); },
                        },
                        {
                            icon: 'trash-2',
                            label: 'Delete',
                            destructive: true,
                            onPress: () => confirmDelete(menu.entry),
                        },
                    ]}
                />
            )}

            <WeightEntryModal
                visible={modalOpen}
                entry={editing}
                prefillWeight={stats ? formatWeight(stats.current, useImperial) : null}
                onClose={() => { setModalOpen(false); setEditing(null); }}
                onSaved={load}
            />
        </View>
    );
};

const getStyles = (theme) => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    header: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: SPACING.l,
        paddingTop: SPACING.m,
        paddingBottom: SPACING.l,
    },
    headerText: { flex: 1 },
    eyebrow: {
        fontSize: TYPE.caption,
        fontFamily: FONTS.semiBold,
        color: theme.textSecondary,
        letterSpacing: 1.2,
        marginBottom: SPACING.xs,
    },
    title: {
        fontSize: TYPE.largeTitle,
        fontFamily: FONTS.bold,
        color: theme.text,
        letterSpacing: -0.6,
    },
    iconButton: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: theme.overlayInput,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: SPACING.xs,
    },
    statsRow: {
        flexDirection: 'row',
        gap: SPACING.s,
        paddingHorizontal: SPACING.l,
        marginBottom: SPACING.l,
    },
    stat: {
        flex: 1,
        backgroundColor: theme.overlayInput,
        borderRadius: RADIUS.m,
        paddingVertical: SPACING.m,
        paddingHorizontal: SPACING.s,
        alignItems: 'center',
    },
    statValue: {
        fontSize: TYPE.headline,
        fontFamily: FONTS.bold,
        color: theme.text,
        letterSpacing: -0.3,
    },
    statLabel: {
        fontSize: TYPE.caption2,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
        marginTop: 2,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        paddingHorizontal: SPACING.l,
        paddingTop: SPACING.l,
        paddingBottom: SPACING.s,
        backgroundColor: theme.background,
    },
    sectionTitle: {
        fontSize: TYPE.caption,
        fontFamily: FONTS.semiBold,
        color: theme.textSecondary,
        letterSpacing: 1.2,
        textTransform: 'uppercase',
    },
    sectionCount: {
        fontSize: TYPE.caption,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginHorizontal: SPACING.l,
        paddingVertical: SPACING.m,
        paddingHorizontal: SPACING.l,
        marginBottom: SPACING.s,
        backgroundColor: theme.surface,
        borderRadius: RADIUS.l,
    },
    rowMain: { flex: 1 },
    weight: {
        fontSize: TYPE.title2,
        fontFamily: FONTS.bold,
        color: theme.text,
        letterSpacing: -0.4,
    },
    weightUnit: {
        fontSize: TYPE.subhead,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
    },
    rowDate: {
        fontSize: TYPE.footnote,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
        marginTop: 2,
    },
    deltaPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: theme.overlayInput,
        borderRadius: RADIUS.pill,
        paddingHorizontal: SPACING.s,
        paddingVertical: 4,
    },
    deltaText: {
        fontSize: TYPE.caption,
        fontFamily: FONTS.semiBold,
        color: theme.textSecondary,
    },
    centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.s },
    emptyTitle: {
        fontSize: TYPE.headline,
        fontFamily: FONTS.semiBold,
        color: theme.text,
        marginTop: SPACING.s,
    },
    emptySubtitle: {
        fontSize: TYPE.subhead,
        fontFamily: FONTS.regular,
        color: theme.textSecondary,
        textAlign: 'center',
        paddingHorizontal: SPACING.xxl,
    },
    fab: {
        position: 'absolute',
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.s,
        backgroundColor: theme.primary,
        borderRadius: RADIUS.pill,
        paddingHorizontal: SPACING.xl,
        paddingVertical: SPACING.m,
    },
    fabText: {
        fontSize: TYPE.body,
        fontFamily: FONTS.bold,
        color: theme.textAlternate,
    },
});

export default BodyWeightHistory;
