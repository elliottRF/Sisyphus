import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { FONTS, TYPE, SPACING, RADIUS, isLightTheme, withAlpha } from '../constants/theme';
import { formatWeight, toStorageKg, unitLabel } from '../utils/units';
import { EQUIPMENT, EQUIPMENT_LABELS, resolveEquipment } from '../utils/equipment';

// Editors for what a gym actually has.
//
// Everything here talks to the caller in KILOGRAMS and shows the user their own
// unit, the same boundary the rest of the app keeps. A number typed as "45" by
// someone working in pounds is 20.41 kg on the way out and reads back as 45.
//
// The pieces are separate exports because the gym-wide profile (Settings) and a
// single exercise's override (the exercise editor) need the same plate rack and
// the same dumbbell ladder, and two editors that were nearly the same would
// drift apart within a release.

// Display helpers. Two decimals so a 1.25 kg plate survives the round trip, but
// trailing zeros are dropped -- "20", not "20.00".
const show = (kg, useImperial) => {
    if (kg == null || !Number.isFinite(kg)) return '';
    return String(formatWeight(kg, useImperial, 2));
};

const parseInput = (text, useImperial) => {
    const t = String(text).trim();
    if (!t) return null;
    const n = parseFloat(t);
    if (!Number.isFinite(n) || n < 0) return null;
    return toStorageKg(n, useImperial);
};

// ── A small labelled number field ───────────────────────────────────────────
// Keeps its own text while focused so a half-typed "1." is not parsed to 1 and
// rewritten under the user's fingers; commits on blur.
const NumberField = ({ label, valueKg, onCommit, useImperial, styles, theme, width, allowBlank }) => {
    const [text, setText] = useState(null);
    const display = text != null ? text : show(valueKg, useImperial);

    return (
        <View style={[styles.field, width ? { width } : null]}>
            {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
            <TextInput
                style={styles.fieldInput}
                value={display}
                onChangeText={setText}
                onFocus={() => setText(show(valueKg, useImperial))}
                onBlur={() => {
                    const parsed = parseInput(text, useImperial);
                    setText(null);
                    if (parsed == null && !allowBlank) return;   // reject junk, keep what was there
                    onCommit(parsed);
                }}
                keyboardType="decimal-pad"
                placeholder="-"
                placeholderTextColor={theme.textSecondary}
                maxLength={7}
                selectTextOnFocus
            />
        </View>
    );
};

// ── Plate rack ──────────────────────────────────────────────────────────────
export const PlateInventoryEditor = ({ plates, onChange, theme, useImperial, styles: outer }) => {
    const own = useStyles(theme);
    const styles = outer || own;
    const [draft, setDraft] = useState('');

    const setCount = (i, delta) => {
        const next = plates.map((p, idx) => (
            idx === i ? { ...p, count: Math.max(1, Math.min(20, p.count + delta)) } : p
        ));
        onChange(next);
    };

    const remove = (i) => onChange(plates.filter((_, idx) => idx !== i));

    const add = () => {
        const kg = parseInput(draft, useImperial);
        setDraft('');
        if (kg == null || kg <= 0) return;
        if (plates.some((p) => Math.abs(p.w - kg) < 1e-6)) return;   // already have it
        onChange([...plates, { w: kg, count: 4 }].sort((a, b) => b.w - a.w));
    };

    return (
        <View>
            <Text style={styles.hint}>
                How many PAIRS of each you can get to. Suggestions never ask for
                plates you do not have.
            </Text>

            {plates.map((p, i) => (
                <View key={`${p.w}-${i}`} style={styles.plateRow}>
                    <Text style={styles.plateWeight}>
                        {show(p.w, useImperial)} <Text style={styles.plateUnit}>{unitLabel(useImperial)}</Text>
                    </Text>
                    <View style={styles.stepper}>
                        <TouchableOpacity onPress={() => setCount(i, -1)} style={styles.stepperButton} hitSlop={8} activeOpacity={0.6}>
                            <Feather name="minus" size={15} color={theme.textSecondary} />
                        </TouchableOpacity>
                        <Text style={styles.stepperValue}>{p.count}</Text>
                        <TouchableOpacity onPress={() => setCount(i, +1)} style={styles.stepperButton} hitSlop={8} activeOpacity={0.6}>
                            <Feather name="plus" size={15} color={theme.textSecondary} />
                        </TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={() => remove(i)} style={styles.removeButton} hitSlop={8} activeOpacity={0.6}>
                        <Feather name="x" size={15} color={theme.textSecondary} />
                    </TouchableOpacity>
                </View>
            ))}

            <View style={styles.addRow}>
                <TextInput
                    style={styles.addInput}
                    value={draft}
                    onChangeText={setDraft}
                    onSubmitEditing={add}
                    placeholder={`Add a plate (${unitLabel(useImperial)})`}
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="decimal-pad"
                    maxLength={7}
                    returnKeyType="done"
                />
                <TouchableOpacity onPress={add} style={styles.addButton} activeOpacity={0.8}>
                    <Feather name="plus" size={16} color={theme.textAlternate} />
                </TouchableOpacity>
            </View>
        </View>
    );
};

// ── Dumbbell ladder ─────────────────────────────────────────────────────────
export const LadderEditor = ({ ladder, onChange, theme, useImperial, styles: outer }) => {
    const own = useStyles(theme);
    const styles = outer || own;
    const l = ladder || { min: 2.5, max: 40, step: 2.5 };

    const patch = (key) => (kg) => {
        if (kg == null) return;
        onChange({ ...l, [key]: kg });
    };

    return (
        <View>
            <Text style={styles.hint}>
                The rack, end to end. Gaps at the top (a jump from 30 to 35) go in
                the extras below.
            </Text>
            <View style={styles.fieldRow}>
                <NumberField label="LIGHTEST" valueKg={l.min} onCommit={patch('min')} useImperial={useImperial} styles={styles} theme={theme} />
                <NumberField label="HEAVIEST" valueKg={l.max} onCommit={patch('max')} useImperial={useImperial} styles={styles} theme={theme} />
                <NumberField label="STEP" valueKg={l.step} onCommit={patch('step')} useImperial={useImperial} styles={styles} theme={theme} />
            </View>
        </View>
    );
};

// ── A free list of weights (stack pins, add-on magnets, odd dumbbells) ──────
export const WeightListEditor = ({ values, onChange, theme, useImperial, placeholder, styles: outer }) => {
    const own = useStyles(theme);
    const styles = outer || own;
    const [draft, setDraft] = useState('');

    const add = () => {
        const kg = parseInput(draft, useImperial);
        setDraft('');
        if (kg == null || kg <= 0) return;
        if (values.some((v) => Math.abs(v - kg) < 1e-6)) return;
        onChange([...values, kg].sort((a, b) => a - b));
    };

    return (
        <View>
            <View style={styles.chipWrap}>
                {values.map((v, i) => (
                    <TouchableOpacity
                        key={`${v}-${i}`}
                        style={styles.chip}
                        onPress={() => onChange(values.filter((_, idx) => idx !== i))}
                        activeOpacity={0.6}
                    >
                        <Text style={styles.chipText}>{show(v, useImperial)}</Text>
                        <Feather name="x" size={11} color={theme.textSecondary} />
                    </TouchableOpacity>
                ))}
                {values.length === 0 && <Text style={styles.hint}>Nothing added yet.</Text>}
            </View>

            <View style={styles.addRow}>
                <TextInput
                    style={styles.addInput}
                    value={draft}
                    onChangeText={setDraft}
                    onSubmitEditing={add}
                    placeholder={placeholder || `Add a weight (${unitLabel(useImperial)})`}
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="decimal-pad"
                    maxLength={7}
                    returnKeyType="done"
                />
                <TouchableOpacity onPress={add} style={styles.addButton} activeOpacity={0.8}>
                    <Feather name="plus" size={16} color={theme.textAlternate} />
                </TouchableOpacity>
            </View>
        </View>
    );
};

// Fills a stack from a range, because typing eleven pin weights by hand is how
// a feature goes unused. Appends rather than replaces, so an odd stack can be
// generated and then corrected.
const StackGenerator = ({ onGenerate, theme, useImperial, styles }) => {
    const [first, setFirst] = useState('');
    const [step, setStep] = useState('');
    const [count, setCount] = useState('');

    const run = () => {
        const a = parseInput(first, useImperial);
        const s = parseInput(step, useImperial);
        const n = parseInt(count, 10);
        if (a == null || s == null || s <= 0 || !Number.isFinite(n) || n < 1) return;
        const out = [];
        for (let i = 0; i < Math.min(60, n); i++) out.push(a + i * s);
        onGenerate(out);
        setFirst(''); setStep(''); setCount('');
    };

    return (
        <View style={styles.generator}>
            <Text style={styles.hint}>
                Most stacks are evenly spaced. Fill one in from its first plate.
            </Text>
            <View style={styles.fieldRow}>
                <View style={styles.field}>
                    <Text style={styles.fieldLabel}>FIRST</Text>
                    <TextInput style={styles.fieldInput} value={first} onChangeText={setFirst}
                        keyboardType="decimal-pad" placeholder="-" placeholderTextColor={theme.textSecondary} maxLength={7} />
                </View>
                <View style={styles.field}>
                    <Text style={styles.fieldLabel}>STEP</Text>
                    <TextInput style={styles.fieldInput} value={step} onChangeText={setStep}
                        keyboardType="decimal-pad" placeholder="-" placeholderTextColor={theme.textSecondary} maxLength={7} />
                </View>
                <View style={styles.field}>
                    <Text style={styles.fieldLabel}>PLATES</Text>
                    <TextInput style={styles.fieldInput} value={count} onChangeText={setCount}
                        keyboardType="number-pad" placeholder="-" placeholderTextColor={theme.textSecondary} maxLength={2} />
                </View>
            </View>
            <TouchableOpacity style={styles.generateButton} onPress={run} activeOpacity={0.8}>
                <Text style={styles.generateText}>Fill the stack</Text>
            </TouchableOpacity>
        </View>
    );
};

// ── Type picker ─────────────────────────────────────────────────────────────
const TYPES = [EQUIPMENT.NONE, EQUIPMENT.BARBELL, EQUIPMENT.DUMBBELL, EQUIPMENT.STACK];

const TypePicker = ({ value, onChange, theme, styles }) => (
    <View style={styles.typeRow}>
        {TYPES.map((t) => {
            const active = value === t;
            return (
                <TouchableOpacity
                    key={t}
                    style={[styles.typeButton, active && styles.typeButtonActive]}
                    onPress={() => onChange(t)}
                    activeOpacity={0.8}
                >
                    <Text style={[styles.typeText, active && styles.typeTextActive]} numberOfLines={2}>
                        {EQUIPMENT_LABELS[t]}
                    </Text>
                </TouchableOpacity>
            );
        })}
    </View>
);

// A row that reads as a sentence and toggles: "Use my gym's plates".
const InheritToggle = ({ label, on, onToggle, theme, styles }) => (
    <TouchableOpacity style={styles.toggleRow} onPress={onToggle} activeOpacity={0.7}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Feather
            name={on ? 'check-circle' : 'circle'}
            size={20}
            color={on ? theme.primary : theme.textSecondary}
        />
    </TouchableOpacity>
);

// ── The per-exercise editor ─────────────────────────────────────────────────
//
// `value` is a config object (or null). `onChange` gets the next one. The
// caller owns persistence -- this never writes to the database, so the exercise
// screen can save equipment in the same action as everything else.
export const EquipmentEditor = ({ value, onChange, theme, useImperial, gym }) => {
    const styles = useStyles(theme);
    const cfg = value;
    const type = (cfg && cfg.type) || EQUIPMENT.NONE;

    const setType = useCallback((t) => {
        if (t === EQUIPMENT.NONE) return onChange(null);
        if (t === EQUIPMENT.BARBELL) return onChange({ type: t, bar: null, plates: null, perSide: true });
        if (t === EQUIPMENT.DUMBBELL) return onChange({ type: t, ladder: null, extra: [], pair: false });
        return onChange({ type: t, stack: [], addOns: [] });
    }, [onChange]);

    const patch = useCallback((fields) => onChange({ ...cfg, ...fields }), [cfg, onChange]);

    // What the current settings can actually produce, shown back to the user.
    // This is the whole point of the screen, so it should not be a leap of
    // faith: they see the numbers before they leave.
    const preview = useMemo(() => {
        const resolved = resolveEquipment(cfg, gym);
        if (!resolved || resolved.values.length === 0) return null;
        const v = resolved.values;
        const sample = v.length <= 8 ? v : [v[0], v[1], v[2], v[3], v[Math.floor(v.length / 2)], v[v.length - 2], v[v.length - 1]];
        // A sample rather than the whole set: seeing the first few, the middle
        // and the top is enough to spot a wrong bar or a missed plate, and a
        // 253-value list is not readable anyway.
        const text = sample.map((x) => show(x, useImperial)).join('  ·  ');
        return { count: v.length, text: v.length > 8 ? `${text}` : text, sampled: v.length > 8 };
    }, [cfg, gym, useImperial]);

    return (
        <View>
            <TypePicker value={type} onChange={setType} theme={theme} styles={styles} />

            {type === EQUIPMENT.NONE && (
                <Text style={styles.hint}>
                    Suggestions round to the nearest {useImperial ? '5 lb' : '2.5 kg'}, as they
                    always have. Pick what this exercise uses and they will land on
                    weights your gym can actually make.
                </Text>
            )}

            {type === EQUIPMENT.BARBELL && (
                <View style={styles.section}>
                    <View style={styles.fieldRow}>
                        <NumberField
                            label={`BAR (${unitLabel(useImperial).toUpperCase()})`}
                            valueKg={cfg.bar != null ? cfg.bar : (gym && gym.bar)}
                            onCommit={(kg) => patch({ bar: kg })}
                            useImperial={useImperial}
                            styles={styles}
                            theme={theme}
                            width={110}
                        />
                        <View style={styles.barPresets}>
                            {(useImperial ? [45, 35, 25, 15] : [20, 15, 10, 7]).map((disp) => (
                                <TouchableOpacity
                                    key={disp}
                                    style={styles.presetChip}
                                    onPress={() => patch({ bar: toStorageKg(disp, useImperial) })}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.presetText}>{disp}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                    <Text style={styles.hint}>
                        The empty bar. An EZ or preacher bar is often 7-10 {unitLabel(useImperial)},
                        not the 20 an Olympic bar weighs.
                    </Text>

                    <InheritToggle
                        label="Loads in pairs, one plate each side"
                        on={cfg.perSide !== false}
                        onToggle={() => patch({ perSide: cfg.perSide === false })}
                        theme={theme}
                        styles={styles}
                    />

                    <InheritToggle
                        label="Use my gym's plates"
                        on={cfg.plates == null}
                        onToggle={() => patch({ plates: cfg.plates == null ? (gym && gym.plates ? gym.plates : []) : null })}
                        theme={theme}
                        styles={styles}
                    />
                    {cfg.plates != null && (
                        <PlateInventoryEditor
                            plates={cfg.plates}
                            onChange={(plates) => patch({ plates })}
                            theme={theme}
                            useImperial={useImperial}
                            styles={styles}
                        />
                    )}
                </View>
            )}

            {type === EQUIPMENT.DUMBBELL && (
                <View style={styles.section}>
                    <InheritToggle
                        label="Use my gym's rack"
                        on={cfg.ladder == null}
                        onToggle={() => patch({ ladder: cfg.ladder == null ? (gym && gym.ladder ? { ...gym.ladder } : { min: 2.5, max: 40, step: 2.5 }) : null })}
                        theme={theme}
                        styles={styles}
                    />
                    {cfg.ladder != null && (
                        <LadderEditor
                            ladder={cfg.ladder}
                            onChange={(ladder) => patch({ ladder })}
                            theme={theme}
                            useImperial={useImperial}
                            styles={styles}
                        />
                    )}

                    <Text style={styles.sectionLabel}>EXTRAS</Text>
                    <WeightListEditor
                        values={cfg.extra || []}
                        onChange={(extra) => patch({ extra })}
                        theme={theme}
                        useImperial={useImperial}
                        placeholder={`Odd dumbbell (${unitLabel(useImperial)})`}
                        styles={styles}
                    />

                    <InheritToggle
                        label="I log both dumbbells added together"
                        on={cfg.pair === true}
                        onToggle={() => patch({ pair: cfg.pair !== true })}
                        theme={theme}
                        styles={styles}
                    />
                </View>
            )}

            {type === EQUIPMENT.STACK && (
                <View style={styles.section}>
                    <Text style={styles.sectionLabel}>PIN WEIGHTS</Text>
                    <WeightListEditor
                        values={cfg.stack || []}
                        onChange={(stack) => patch({ stack })}
                        theme={theme}
                        useImperial={useImperial}
                        placeholder={`Add a pin (${unitLabel(useImperial)})`}
                        styles={styles}
                    />
                    <StackGenerator
                        onGenerate={(vals) => patch({
                            stack: Array.from(new Set([...(cfg.stack || []), ...vals].map((v) => Math.round(v * 1000))))
                                .map((k) => k / 1000)
                                .sort((a, b) => a - b),
                        })}
                        theme={theme}
                        useImperial={useImperial}
                        styles={styles}
                    />

                    <Text style={styles.sectionLabel}>ADD-ONS</Text>
                    <Text style={styles.hint}>
                        Magnets or half-pins that sit on top of any plate. Every
                        combination of them counts as a real weight.
                    </Text>
                    <WeightListEditor
                        values={cfg.addOns || []}
                        onChange={(addOns) => patch({ addOns: addOns.slice(0, 3) })}
                        theme={theme}
                        useImperial={useImperial}
                        placeholder={`Add a magnet (${unitLabel(useImperial)})`}
                        styles={styles}
                    />
                </View>
            )}

            {preview && (
                <View style={styles.preview}>
                    <Text style={styles.previewLabel}>
                        {preview.count} WEIGHTS AVAILABLE{preview.sampled ? ', INCLUDING' : ''}
                    </Text>
                    <Text style={styles.previewText} numberOfLines={2}>
                        {preview.text}
                    </Text>
                </View>
            )}
        </View>
    );
};

// ── Styles ──────────────────────────────────────────────────────────────────
const useStyles = (theme) => useMemo(() => getStyles(theme), [theme]);

export const getStyles = (theme) => {
    const light = isLightTheme(theme);
    const tile = theme.overlayInput;
    return StyleSheet.create({
        section: { marginTop: SPACING.s },
        sectionLabel: {
            fontSize: TYPE.caption,
            fontFamily: FONTS.semiBold,
            letterSpacing: 1.2,
            color: theme.textSecondary,
            marginTop: SPACING.m,
            marginBottom: SPACING.xs,
        },
        hint: {
            fontSize: TYPE.footnote,
            fontFamily: FONTS.regular,
            color: theme.textSecondary,
            lineHeight: 17,
            marginBottom: SPACING.s,
        },

        // Type picker
        typeRow: { flexDirection: 'row', gap: SPACING.xs },
        typeButton: {
            flex: 1,
            paddingVertical: 10,
            paddingHorizontal: 4,
            borderRadius: RADIUS.m,
            backgroundColor: tile,
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 52,
        },
        typeButtonActive: { backgroundColor: theme.primary },
        typeText: {
            fontSize: 11,
            fontFamily: FONTS.semiBold,
            color: theme.text,
            textAlign: 'center',
        },
        typeTextActive: { color: theme.textAlternate },

        // Number fields
        fieldRow: { flexDirection: 'row', gap: SPACING.s, alignItems: 'flex-end' },
        field: { flex: 1 },
        fieldLabel: {
            fontSize: 10,
            fontFamily: FONTS.bold,
            letterSpacing: 1,
            color: theme.textSecondary,
            marginBottom: 4,
        },
        fieldInput: {
            backgroundColor: tile,
            borderRadius: RADIUS.m,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: TYPE.body,
            fontFamily: FONTS.semiBold,
            color: theme.text,
            // Android draws a transparent border here for the same reason the
            // calendar tiles do: a recycled background drawable otherwise keeps
            // a stale edge.
            borderWidth: 1,
            borderColor: 'transparent',
        },

        barPresets: { flexDirection: 'row', gap: SPACING.xs, flex: 1, justifyContent: 'flex-end' },
        presetChip: {
            paddingHorizontal: 10,
            paddingVertical: 9,
            borderRadius: RADIUS.m,
            backgroundColor: tile,
        },
        presetText: { fontSize: TYPE.footnote, fontFamily: FONTS.semiBold, color: theme.text },

        // Plate rack
        plateRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACING.s,
            paddingVertical: 6,
        },
        plateWeight: { flex: 1, fontSize: TYPE.body, fontFamily: FONTS.semiBold, color: theme.text },
        plateUnit: { fontSize: TYPE.footnote, fontFamily: FONTS.regular, color: theme.textSecondary },
        stepper: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: tile,
            borderRadius: RADIUS.m,
        },
        stepperButton: { paddingHorizontal: 12, paddingVertical: 7 },
        stepperValue: {
            minWidth: 22,
            textAlign: 'center',
            fontSize: TYPE.footnote,
            fontFamily: FONTS.bold,
            color: theme.text,
        },
        removeButton: { padding: 6 },

        // Add row
        addRow: { flexDirection: 'row', gap: SPACING.s, marginTop: SPACING.s },
        addInput: {
            flex: 1,
            backgroundColor: tile,
            borderRadius: RADIUS.m,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: TYPE.footnote,
            fontFamily: FONTS.medium,
            color: theme.text,
            borderWidth: 1,
            borderColor: 'transparent',
        },
        addButton: {
            width: 42,
            borderRadius: RADIUS.m,
            backgroundColor: theme.primary,
            alignItems: 'center',
            justifyContent: 'center',
        },

        // Chips
        chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, alignItems: 'center' },
        chip: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: RADIUS.pill,
            backgroundColor: tile,
        },
        chipText: { fontSize: TYPE.footnote, fontFamily: FONTS.semiBold, color: theme.text },

        // Toggles
        toggleRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 11,
            gap: SPACING.m,
        },
        toggleLabel: { flex: 1, fontSize: TYPE.subhead, fontFamily: FONTS.medium, color: theme.text },

        // Stack generator
        generator: { marginTop: SPACING.m },
        generateButton: {
            marginTop: SPACING.s,
            paddingVertical: 11,
            borderRadius: RADIUS.m,
            backgroundColor: tile,
            alignItems: 'center',
        },
        generateText: { fontSize: TYPE.footnote, fontFamily: FONTS.semiBold, color: theme.primary },

        // Preview
        preview: {
            marginTop: SPACING.m,
            padding: SPACING.m,
            borderRadius: RADIUS.m,
            backgroundColor: withAlpha(theme.primary, light ? 0.08 : 0.12),
        },
        previewLabel: {
            fontSize: 10,
            fontFamily: FONTS.bold,
            letterSpacing: 1.2,
            color: theme.primary,
            marginBottom: 4,
        },
        previewText: {
            fontSize: TYPE.footnote,
            fontFamily: FONTS.medium,
            color: theme.text,
            lineHeight: 18,
        },
    });
};

export default EquipmentEditor;
