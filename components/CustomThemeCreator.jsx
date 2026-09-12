import React, { useMemo, useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { FONTS, RADIUS, SPACING, buildCustomTheme, randomThemeInput, isValidHex, DEFAULT_CUSTOM_INPUT } from '../constants/theme';
import ColorWheel from './ColorWheel';
import Collapsible from './Collapsible';

// Custom-theme editor: pick four colours -- by wheel, by hex, or at random --
// see a live preview, save. Everything else (borders, muted text, the readable
// text on primary buttons, etc.) is derived by buildCustomTheme.
//
// It also edits an existing theme: pass `initial` (the four colours),
// `initialName` and `editing`. A saved theme is the FULL built object, but it
// keeps the four inputs it was built from under the same keys, so it can seed
// this directly with no separate record of what was originally typed.

const FIELDS = [
    { key: 'primary', label: 'Accent' },
    { key: 'background', label: 'Background' },
    { key: 'surface', label: 'Cards' },
    { key: 'text', label: 'Text' },
];

// A touch longer than the app's usual collapse, because this block is: the
// wheel is most of a screen tall, and the standard duration covers that much
// travel fast enough to read as a jump rather than a movement. Shared with the
// scroll that follows the wheel open.
const WHEEL_MS = 320;

const normalizeHex = (raw) => {
    let h = raw.trim();
    if (h && !h.startsWith('#')) h = '#' + h;
    return h;
};

const CustomThemeCreator = ({ theme, onCreate, onClose, initial, initialName, editing = false }) => {
    const [input, setInput] = useState(() => ({ ...DEFAULT_CUSTOM_INPUT, ...(initial || {}) }));
    const [name, setName] = useState(initialName || '');
    // Which colour the wheel is open on, if any.
    const [wheelField, setWheelField] = useState(null);
    // Which wheels may draw themselves. A field is added once its block has
    // finished opening -- the block opens first and the wheel fills it, see
    // ColorWheel's `ready` -- and removed only when the block has finished
    // CLOSING, so a wheel on its way out stays drawn while it shrinks instead
    // of vanishing and leaving an empty box to collapse.
    const [readyFields, setReadyFields] = useState(() => new Set());
    const grantReady = (key) => setReadyFields((prev) => new Set(prev).add(key));
    const revokeReady = (key) => setReadyFields((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
    });
    const styles = getStyles(theme);

    // Scroll the focused colour field into view so it isn't hidden behind the
    // keyboard (the lower "Cards"/"Text" rows otherwise sit under it).
    const scrollRef = useRef(null);
    const rowYRef = useRef({});
    const scrollFieldIntoView = (key) => {
        // Wait for the keyboard to start opening so the scroll lands correctly.
        setTimeout(() => {
            const y = rowYRef.current[key];
            if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
        }, 150);
    };

    // The wheel is taller than the space under the row it opens from, so the
    // view has to move as well as grow. Doing that as a scroll AFTER the growth
    // is two separate movements -- a quick expansion, a pause, then a slower
    // slide -- and it reads as jank however each one is tuned.
    //
    // So the scroll is not animated at all: it is driven by the growth. The
    // block gets taller, the content gets taller with it, and each time it does
    // the view follows by exactly as much as it now can. Nothing moves while
    // the content still fits, and once it stops fitting the page climbs in
    // lockstep with the wheel unfolding. One movement, and it ends the moment
    // the growth does.
    const followRef = useRef(null);
    const viewportRef = useRef(0);

    const followGrowth = (contentHeight) => {
        const target = followRef.current;
        if (target == null) return;
        const reachable = Math.max(0, contentHeight - viewportRef.current);
        scrollRef.current?.scrollTo({ y: Math.min(target, reachable), animated: false });
    };

    const readyTimer = useRef(null);
    const openWheel = (key) => {
        const next = wheelField === key ? null : key;
        setWheelField(next);
        if (readyTimer.current) clearTimeout(readyTimer.current);
        if (next) readyTimer.current = setTimeout(() => grantReady(next), WHEEL_MS + 20);
        // A little above the row, so it does not sit flush against the header.
        followRef.current = next ? Math.max(0, (rowYRef.current[key] ?? 0) - 12) : null;
        // Let go once the growth is over, or an unrelated layout change later
        // (the keyboard, a hex edit) would drag the page about.
        if (next) setTimeout(() => { followRef.current = null; }, WHEEL_MS + 80);
    };

    // Fall back to defaults for any field that isn't a valid hex yet, so the
    // preview never breaks while typing.
    const preview = useMemo(() => {
        const safe = {
            primary: isValidHex(input.primary) ? input.primary : DEFAULT_CUSTOM_INPUT.primary,
            background: isValidHex(input.background) ? input.background : DEFAULT_CUSTOM_INPUT.background,
            surface: isValidHex(input.surface) ? input.surface : DEFAULT_CUSTOM_INPUT.surface,
            text: isValidHex(input.text) ? input.text : DEFAULT_CUSTOM_INPUT.text,
        };
        return buildCustomTheme(safe);
    }, [input]);

    const allValid = FIELDS.every((f) => isValidHex(input[f.key]));

    const handleSave = () => {
        if (!allValid) return;
        onCreate(buildCustomTheme(input), name);
        onClose();
    };

    const setField = (key, value) => setInput((prev) => ({ ...prev, [key]: value }));

    // The Modal's own fade carries the scrim; the sheet rises into it, so it
    // arrives rather than simply being there.
    return (
        <Modal transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
            <View style={styles.scrim}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.center}>
                    <Reanimated.View
                        style={styles.sheet}
                        entering={FadeIn.duration(220).withInitialValues({ transform: [{ translateY: 18 }, { scale: 0.97 }] })}
                    >
                        <View style={styles.header}>
                            <Text style={styles.title}>{editing ? 'Edit Theme' : 'New Theme'}</Text>
                            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={10}>
                                <Feather name="x" size={18} color={theme.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView
                            ref={scrollRef}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                            contentContainerStyle={{ paddingBottom: 8 }}
                            onLayout={(e) => { viewportRef.current = e.nativeEvent.layout.height; }}
                            onContentSizeChange={(_w, h) => followGrowth(h)}
                        >
                            {/* Live preview */}
                            <View style={[styles.preview, { backgroundColor: preview.background }]}>
                                <View style={[styles.previewCard, { backgroundColor: preview.surface }]}>
                                    <Text style={[styles.previewTitle, { color: preview.text }]}>Bench Press</Text>
                                    <Text style={[styles.previewSub, { color: preview.textSecondary }]}>3 sets · 90 kg</Text>
                                    <View style={[styles.previewButton, { backgroundColor: preview.primary }]}>
                                        <Text style={[styles.previewButtonText, { color: preview.textAlternate }]}>Start Workout</Text>
                                    </View>
                                </View>
                            </View>

                            <TextInput
                                style={styles.nameInput}
                                value={name}
                                onChangeText={setName}
                                placeholder="Theme name (optional)"
                                placeholderTextColor={theme.textSecondary}
                                maxLength={24}
                            />

                            {FIELDS.map((field) => {
                                const value = input[field.key];
                                const valid = isValidHex(value);
                                const isOpen = wheelField === field.key;
                                return (
                                    <View key={field.key} onLayout={(e) => { rowYRef.current[field.key] = e.nativeEvent.layout.y; }}>
                                    <View style={styles.row}>
                                        <TouchableOpacity
                                            onPress={() => openWheel(field.key)}
                                            activeOpacity={0.7}
                                            style={[
                                                styles.swatch,
                                                { backgroundColor: valid ? value : 'transparent', borderColor: isOpen ? theme.primary : theme.border },
                                                isOpen && styles.swatchOpen,
                                            ]}
                                        >
                                            {!valid && <Feather name="alert-circle" size={14} color={theme.danger} />}
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.rowLabelWrap} onPress={() => openWheel(field.key)} activeOpacity={0.7}>
                                            <Text style={styles.rowLabel}>{field.label}</Text>
                                        </TouchableOpacity>
                                        <TextInput
                                            style={[styles.hexInput, !valid && { color: theme.danger }]}
                                            value={value}
                                            onChangeText={(t) => setInput((prev) => ({ ...prev, [field.key]: normalizeHex(t) }))}
                                            onFocus={() => scrollFieldIntoView(field.key)}
                                            placeholder="#000000"
                                            placeholderTextColor={theme.textSecondary}
                                            autoCapitalize="characters"
                                            autoCorrect={false}
                                            maxLength={7}
                                        />
                                    </View>
                                    {/* The wheel opens under the colour it edits, so there
                                        is never a question of which one is changing -- and it
                                        grows to its real height, so the rows below it travel
                                        with it rather than being shoved down a screen. The
                                        sheet is centred, so this also stops the whole dialog
                                        jumping taller the instant a swatch is tapped. */}
                                    <Collapsible
                                        open={isOpen}
                                        duration={WHEEL_MS}
                                        onClosed={() => revokeReady(field.key)}
                                    >
                                        <View style={styles.wheelWrap}>
                                            <ColorWheel
                                                theme={theme}
                                                color={valid ? value : DEFAULT_CUSTOM_INPUT[field.key]}
                                                onChange={(hex) => setField(field.key, hex)}
                                                ready={readyFields.has(field.key)}
                                            />
                                            <TouchableOpacity style={styles.wheelDone} onPress={() => setWheelField(null)} activeOpacity={0.7}>
                                                <Text style={styles.wheelDoneText}>Done</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </Collapsible>
                                    </View>
                                );
                            })}

                        </ScrollView>

                        {/* Outside the ScrollView. These used to scroll with the
                            fields, so opening a wheel pushed the save button under
                            the sheet's own edge and left it sliced in half. */}
                        <View style={styles.actions}>
                            <TouchableOpacity style={styles.randomBtn} onPress={() => setInput(randomThemeInput())} activeOpacity={0.7}>
                                <Feather name="shuffle" size={16} color={theme.primary} />
                                <Text style={styles.randomText}>Randomise</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.saveBtn, !allValid && { opacity: 0.4 }]}
                                onPress={handleSave}
                                disabled={!allValid}
                                activeOpacity={0.85}
                            >
                                <Text style={styles.saveText}>{editing ? 'Save Changes' : 'Save Theme'}</Text>
                            </TouchableOpacity>
                        </View>
                    </Reanimated.View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
};

const getStyles = (theme) => StyleSheet.create({
    scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    center: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
    sheet: {
        backgroundColor: theme.surface,
        borderRadius: RADIUS.l,
        padding: 18,
        maxHeight: '88%',
    },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    title: { fontSize: 20, fontFamily: FONTS.bold, letterSpacing: -0.4, color: theme.text },
    closeBtn: {
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: theme.overlayInput, alignItems: 'center', justifyContent: 'center',
    },
    preview: { borderRadius: RADIUS.m, padding: 16, marginBottom: 16 },
    previewCard: { borderRadius: RADIUS.m, padding: 14 },
    previewTitle: { fontSize: 16, fontFamily: FONTS.bold },
    previewSub: { fontSize: 13, fontFamily: FONTS.medium, marginTop: 2, marginBottom: 12 },
    previewButton: { borderRadius: RADIUS.m, paddingVertical: 11, alignItems: 'center' },
    previewButtonText: { fontSize: 15, fontFamily: FONTS.bold },
    nameInput: {
        backgroundColor: theme.overlayInput, borderRadius: RADIUS.m,
        paddingHorizontal: 14, height: 44, marginBottom: 14,
        color: theme.text, fontFamily: FONTS.medium, fontSize: 15,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
    swatch: { width: 34, height: 34, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    rowLabelWrap: { flex: 1 },
    rowLabel: { fontSize: 15, fontFamily: FONTS.medium, color: theme.text },
    swatchOpen: { borderWidth: 2 },
    wheelWrap: {
        backgroundColor: theme.overlaySubtle,
        borderRadius: RADIUS.m,
        padding: SPACING.l,
        marginBottom: SPACING.m,
        alignItems: 'center',
        gap: SPACING.m,
    },
    wheelDone: {
        alignSelf: 'stretch',
        alignItems: 'center',
        paddingVertical: 10,
        borderRadius: RADIUS.m,
        backgroundColor: theme.overlayInput,
    },
    wheelDoneText: { fontSize: 15, fontFamily: FONTS.semiBold, color: theme.primary },
    hexInput: {
        width: 110, height: 40, borderRadius: RADIUS.s,
        backgroundColor: theme.overlayInput, paddingHorizontal: 12,
        color: theme.text, fontFamily: FONTS.semiBold, fontSize: 15,
        textAlign: 'center', textTransform: 'uppercase',
    },
    // The pinned footer. A hairline above it so the fields read as scrolling
    // underneath rather than stopping short.
    actions: {
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.border,
    },
    randomBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
        paddingVertical: 12, borderRadius: RADIUS.m,
        backgroundColor: theme.overlayInput,
    },
    randomText: { fontSize: 15, fontFamily: FONTS.semiBold, color: theme.primary },
    saveBtn: {
        backgroundColor: theme.primary, borderRadius: RADIUS.m,
        paddingVertical: 14, alignItems: 'center', marginTop: 10, marginBottom: 4,
    },
    saveText: { fontSize: 16, fontFamily: FONTS.bold, color: theme.textAlternate },
});

export default CustomThemeCreator;
