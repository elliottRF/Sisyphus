import React, { useMemo, useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { FONTS, RADIUS, buildCustomTheme, randomThemeInput, isValidHex, DEFAULT_CUSTOM_INPUT } from '../constants/theme';

// Simple custom-theme creator: pick four colours (or randomise), see a live
// preview, save. Everything else (borders, muted text, the readable text on
// primary buttons, etc.) is derived by buildCustomTheme.

const FIELDS = [
    { key: 'primary', label: 'Accent' },
    { key: 'background', label: 'Background' },
    { key: 'surface', label: 'Cards' },
    { key: 'text', label: 'Text' },
];

const normalizeHex = (raw) => {
    let h = raw.trim();
    if (h && !h.startsWith('#')) h = '#' + h;
    return h;
};

const CustomThemeCreator = ({ theme, onCreate, onClose }) => {
    const [input, setInput] = useState(DEFAULT_CUSTOM_INPUT);
    const [name, setName] = useState('');
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

    return (
        <Modal transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
            <View style={styles.scrim}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.center}>
                    <View style={styles.sheet}>
                        <View style={styles.header}>
                            <Text style={styles.title}>New Theme</Text>
                            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={10}>
                                <Feather name="x" size={18} color={theme.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 48 }}>
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
                                return (
                                    <View
                                        key={field.key}
                                        style={styles.row}
                                        onLayout={(e) => { rowYRef.current[field.key] = e.nativeEvent.layout.y; }}
                                    >
                                        <View style={[styles.swatch, { backgroundColor: valid ? value : 'transparent', borderColor: theme.border }]}>
                                            {!valid && <Feather name="alert-circle" size={14} color={theme.danger} />}
                                        </View>
                                        <Text style={styles.rowLabel}>{field.label}</Text>
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
                                );
                            })}

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
                                <Text style={styles.saveText}>Save Theme</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
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
    rowLabel: { flex: 1, fontSize: 15, fontFamily: FONTS.medium, color: theme.text },
    hexInput: {
        width: 110, height: 40, borderRadius: RADIUS.s,
        backgroundColor: theme.overlayInput, paddingHorizontal: 12,
        color: theme.text, fontFamily: FONTS.semiBold, fontSize: 15,
        textAlign: 'center', textTransform: 'uppercase',
    },
    randomBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
        paddingVertical: 12, marginTop: 6, borderRadius: RADIUS.m,
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
