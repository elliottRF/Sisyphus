import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { useTheme } from '../context/ThemeContext';
import { FONTS, TYPE, SPACING, RADIUS, isLightTheme, getThemedShadow } from '../constants/theme';
import { formatWeight, toStorageKg, unitLabel } from '../utils/units';
import { defaultGym } from '../utils/equipment';
import {
    PlateInventoryEditor,
    LadderEditor,
    getStyles as getEditorStyles,
} from '../components/EquipmentEditor';
import { customAlert } from '../utils/customAlert';

// What the user's gym has, once, so that tagging an exercise as "barbell" is a
// single tap rather than a form.
//
// Per-exercise profiles inherit from here and override only what differs -- the
// 9 kg preacher bar, the one machine with an odd stack. Editing this changes
// every exercise that inherits it, which is the point: buy a pair of 1.25s and
// every suggestion in the app can use them.

const Section = ({ title, hint, children, styles }) => (
    <View style={styles.section}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
        <View style={styles.card}>{children}</View>
    </View>
);

export default function GymScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { theme, useImperial, gymEquipment, updateGymEquipment } = useTheme();

    const styles = useMemo(() => getStyles(theme), [theme]);
    const editorStyles = useMemo(() => getEditorStyles(theme), [theme]);

    // Settings are loaded before anything can navigate here, but a null would
    // crash the editors, so fall back rather than trust that.
    const gym = gymEquipment || defaultGym(useImperial);
    const [barText, setBarText] = useState(null);

    const patch = (fields) => updateGymEquipment({ ...gym, ...fields });

    const resetAll = () => {
        customAlert(
            'Reset Gym Equipment',
            `Put the bar, plates and dumbbell rack back to a standard ${useImperial ? 'pounds' : 'kilos'} gym. Exercises with their own settings keep them.`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reset', style: 'destructive', onPress: () => updateGymEquipment(defaultGym(useImperial)) },
            ]
        );
    };

    const barPresets = useImperial ? [45, 35, 25, 15] : [20, 15, 10, 7];

    return (
        <View style={[styles.container, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <Feather name="chevron-left" size={28} color={theme.text} />
                </TouchableOpacity>
                <Text style={styles.title}>Your Gym</Text>
            </View>

            <ScrollView
                contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 48 }]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                <Text style={styles.intro}>
                    What is on the floor where you train. Every exercise you tag as
                    a barbell, dumbbell or machine starts from these, so suggestions
                    only ever land on weights you can actually make.
                </Text>

                <Section
                    title="Standard bar"
                    hint="The bar most of your barbell work uses. Odd bars are set on the exercise itself."
                    styles={styles}
                >
                    <View style={styles.barRow}>
                        <View style={styles.barField}>
                            <Text style={editorStyles.fieldLabel}>{unitLabel(useImperial).toUpperCase()}</Text>
                            <TextInput
                                style={styles.barValue}
                                value={barText != null ? barText : String(formatWeight(gym.bar, useImperial, 2))}
                                // Commits per keystroke rather than on blur:
                                // leaving this screen does not reliably blur a
                                // focused field, so a bar weight typed and then
                                // navigated away from was lost. Same reason the
                                // exercise editor's fields changed.
                                onChangeText={(next) => {
                                    setBarText(next);
                                    const n = parseFloat(next);
                                    if (!Number.isFinite(n) || n <= 0) return;   // junk keeps the old bar
                                    patch({ bar: toStorageKg(n, useImperial) });
                                }}
                                onFocus={() => setBarText(String(formatWeight(gym.bar, useImperial, 2)))}
                                onBlur={() => setBarText(null)}
                                keyboardType="decimal-pad"
                                maxLength={6}
                                selectTextOnFocus
                            />
                        </View>
                        <View style={styles.presets}>
                            {barPresets.map((disp) => (
                                <TouchableOpacity
                                    key={disp}
                                    style={[
                                        styles.presetChip,
                                        Math.abs(gym.bar - toStorageKg(disp, useImperial)) < 0.01 && styles.presetChipActive,
                                    ]}
                                    onPress={() => { setBarText(null); patch({ bar: toStorageKg(disp, useImperial) }); }}
                                    activeOpacity={0.7}
                                >
                                    <Text
                                        style={[
                                            styles.presetText,
                                            Math.abs(gym.bar - toStorageKg(disp, useImperial)) < 0.01 && styles.presetTextActive,
                                        ]}
                                    >
                                        {disp}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </Section>

                <Section
                    title="Plates"
                    hint="Pairs, because plates go on in twos. A suggestion is never built from plates you do not have."
                    styles={styles}
                >
                    <PlateInventoryEditor
                        hint={false}
                        plates={gym.plates || []}
                        onChange={(plates) => patch({ plates })}
                        theme={theme}
                        useImperial={useImperial}
                        styles={editorStyles}
                    />
                </Section>

                <Section
                    title="Dumbbell rack"
                    hint="Racks differ: some go up in 2s, some in 5s, most change step partway up."
                    styles={styles}
                >
                    <LadderEditor
                        hint="The rack, end to end. A dumbbell that sits outside it goes on the exercise that uses it."
                        ladder={gym.ladder}
                        onChange={(ladder) => patch({ ladder })}
                        theme={theme}
                        useImperial={useImperial}
                        styles={editorStyles}
                    />
                </Section>

                <TouchableOpacity style={styles.reset} onPress={resetAll} activeOpacity={0.7}>
                    <Text style={styles.resetText}>Reset to a standard gym</Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}

const getStyles = (theme) => {
    const light = isLightTheme(theme);
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: theme.background },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 8,
        },
        backButton: { padding: 8, marginRight: 12 },
        title: { fontSize: 22, fontFamily: FONTS.bold, letterSpacing: -0.4, color: theme.text },
        content: { paddingHorizontal: 20, paddingTop: 4 },
        intro: {
            fontSize: TYPE.footnote,
            fontFamily: FONTS.regular,
            color: theme.textSecondary,
            lineHeight: 19,
            marginBottom: SPACING.l,
        },

        section: { marginBottom: SPACING.xl },
        sectionTitle: {
            fontSize: TYPE.caption,
            fontFamily: FONTS.semiBold,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            color: theme.textSecondary,
            marginBottom: 4,
            marginLeft: 4,
        },
        sectionHint: {
            fontSize: TYPE.footnote,
            fontFamily: FONTS.regular,
            color: theme.textSecondary,
            lineHeight: 18,
            marginBottom: SPACING.s,
            marginLeft: 4,
        },
        card: {
            backgroundColor: theme.surface,
            borderRadius: RADIUS.l,
            padding: SPACING.l,
            ...(light ? getThemedShadow(theme, 'small') : null),
        },

        barRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.m },
        barField: { width: 96 },
        barValue: {
            fontSize: TYPE.title,
            fontFamily: FONTS.bold,
            color: theme.text,
            letterSpacing: -0.4,
            paddingVertical: 2,
        },
        presets: { flexDirection: 'row', gap: SPACING.xs, flex: 1, justifyContent: 'flex-end' },
        presetChip: {
            paddingHorizontal: 12,
            paddingVertical: 9,
            borderRadius: RADIUS.m,
            backgroundColor: theme.overlayInput,
        },
        presetChipActive: { backgroundColor: theme.primary },
        presetText: { fontSize: TYPE.footnote, fontFamily: FONTS.semiBold, color: theme.text },
        presetTextActive: { color: theme.textAlternate },

        reset: {
            alignItems: 'center',
            paddingVertical: 14,
            borderRadius: RADIUS.m,
            backgroundColor: theme.overlayInput,
        },
        resetText: { fontSize: TYPE.subhead, fontFamily: FONTS.semiBold, color: theme.error || '#EF4444' },
    });
};
