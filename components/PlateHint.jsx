import React, { useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FONTS, RADIUS, isLightTheme, withAlpha } from '../constants/theme';
import { formatWeight, toStorageKg, unitLabel } from '../utils/units';
import { platesForWeight, flattenCombo } from '../utils/equipment';
import Expandable from './Expandable';

// What to actually load on the bar, on the exercise card itself.
//
// Working out that 34 kg on a 9 kg bar is a pair of 10s and a pair of 2.5s is
// arithmetic nobody should be doing between sets, and it is the one piece of
// information a barbell exercise needs that the app already has everything to
// compute. It lives on the card rather than behind a tap because a hint you
// have to go and find is a hint you stop using.
//
// One line, showing the next set you have not ticked. Tap it to see every
// distinct weight on the card at once, for pyramids and drop sets.

const PlateRow = ({ plates, styles, useImperial, dim }) => (
    <View style={styles.plates}>
        {plates.length === 0 ? (
            <Text style={[styles.barOnly, dim && styles.dim]}>bar only</Text>
        ) : plates.map((w, i) => (
            // Keyed by position: the same plate weight legitimately appears
            // twice in a row (two 10s a side) and both must render.
            <View key={`${w}-${i}`} style={styles.plate}>
                <Text style={[styles.plateText, dim && styles.dim]}>{formatWeight(w, useImperial, 2)}</Text>
            </View>
        ))}
    </View>
);

const PlateHint = ({ resolved, sets, theme, useImperial }) => {
    const styles = useMemo(() => getStyles(theme), [theme]);
    const [expanded, setExpanded] = useState(false);

    // Closing goes through Expandable's collapse, the same way the note on the
    // exercise card does. Unmounting the list on the state change instead let
    // it grow open and then vanish, which is the one direction people notice.
    const listRef = useRef(null);
    const closingRef = useRef(false);
    const toggleExpanded = () => {
        // A second tap mid-close would leave the list mounted at zero height:
        // Expandable ignores a collapse that is already running, so the
        // callback that unmounts it would never fire.
        if (closingRef.current) return;
        if (expanded && listRef.current?.collapse) {
            closingRef.current = true;
            listRef.current.collapse(() => {
                closingRef.current = false;
                setExpanded(false);
            });
        } else {
            setExpanded((v) => !v);
        }
    };

    // The set being loaded for is the first one not yet ticked; once the whole
    // exercise is done, the last weight that was actually used.
    //
    // set.weight is in the user's DISPLAY unit -- what they typed -- while
    // everything in utils/equipment.js is kilograms. Converting here is not
    // optional: without it a pounds user's 110.2 lb set was read as 110.2 kg,
    // and the card answered a question nobody asked with 45 + 45 + 10 a side
    // and a total of 245.
    const primaryWeight = useMemo(() => {
        if (!sets || sets.length === 0) return null;
        const kg = sets.map((s) => {
            const typed = parseFloat(s && s.weight);
            return Number.isFinite(typed) && typed > 0 ? toStorageKg(typed, useImperial) : null;
        });
        for (let i = 0; i < sets.length; i++) {
            if (kg[i] != null && !sets[i].completed) return kg[i];
        }
        for (let i = sets.length - 1; i >= 0; i--) {
            if (kg[i] != null) return kg[i];
        }
        return null;
    }, [sets, useImperial]);

    // Every distinct weight on the card, in the order the sets run.
    const allWeights = useMemo(() => {
        const seen = new Set();
        const out = [];
        for (const s of sets || []) {
            const typed = parseFloat(s && s.weight);
            if (!Number.isFinite(typed) || typed <= 0) continue;
            const n = toStorageKg(typed, useImperial);   // display unit -> kg
            const k = Math.round(n * 1000);
            if (seen.has(k)) continue;
            seen.add(k);
            out.push(n);
        }
        return out;
    }, [sets, useImperial]);

    // Always rendered once the exercise is configured, showing the empty bar
    // before anything is typed. The card must not change height when a weight
    // lands -- that is the same rule the previous/suggestion column follows.
    const primary = useMemo(() => {
        if (!resolved) return null;
        if (primaryWeight == null) {
            return { bar: resolved.bar, total: resolved.bar, combo: [], exact: true, barOnly: true };
        }
        return platesForWeight(primaryWeight, resolved);
    }, [primaryWeight, resolved]);

    if (!resolved || !primary) return null;

    const unit = unitLabel(useImperial);
    const label = resolved.perSide ? 'PER SIDE' : 'ON THE BAR';

    // The weight typed is not one the plates can build. Say so rather than
    // rounding the display, or someone loads 32.5 while the card reads 34.
    const inexact = !primary.exact && !primary.belowBar;

    return (
        <View style={styles.wrapper}>
            <TouchableOpacity
                style={styles.row}
                activeOpacity={0.6}
                onPress={toggleExpanded}
                disabled={allWeights.length < 2}
                accessibilityLabel="Plate breakdown"
            >
                <Text style={styles.label}>{label}</Text>

                {primary.belowBar ? (
                    <Text style={styles.note}>
                        under the {formatWeight(resolved.bar, useImperial, 2)} {unit} bar
                    </Text>
                ) : (
                    <>
                        <PlateRow plates={flattenCombo(primary.combo)} styles={styles} useImperial={useImperial} />
                        {inexact && (
                            <Text style={styles.note}>
                                = {formatWeight(primary.total, useImperial, 2)}
                            </Text>
                        )}
                    </>
                )}

                <Text style={styles.bar}>
                    {formatWeight(resolved.bar, useImperial, 2)} {unit} bar
                </Text>
            </TouchableOpacity>

            {expanded && (
                <Expandable ref={listRef} animateOnMount>
                    <View style={styles.allList}>
                        {allWeights.map((w) => {
                            const p = platesForWeight(w, resolved);
                            if (!p) return null;
                            return (
                                <View key={w} style={styles.allRow}>
                                    <Text style={styles.allWeight}>
                                        {formatWeight(w, useImperial, 2)}
                                    </Text>
                                    {p.belowBar ? (
                                        <Text style={styles.note}>under the bar</Text>
                                    ) : (
                                        <PlateRow plates={flattenCombo(p.combo)} styles={styles} useImperial={useImperial} dim />
                                    )}
                                    {!p.exact && !p.belowBar && (
                                        <Text style={styles.note}>= {formatWeight(p.total, useImperial, 2)}</Text>
                                    )}
                                </View>
                            );
                        })}
                    </View>
                </Expandable>
            )}
        </View>
    );
};

const getStyles = (theme) => {
    const light = isLightTheme(theme);
    return StyleSheet.create({
        wrapper: { backgroundColor: theme.surface },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            // Wraps rather than overlaps. Six plates a side plus a corrected
            // total plus the bar label is wider than a phone, and a fixed row
            // ran them through each other. Real loads still fit on one line.
            flexWrap: 'wrap',
            paddingHorizontal: 12,
            paddingVertical: 7,
            rowGap: 4,
            columnGap: 8,
        },
        label: {
            fontSize: 10,
            fontFamily: FONTS.bold,
            letterSpacing: 1,
            color: theme.textSecondary,
        },
        plates: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
        plate: {
            paddingHorizontal: 7,
            paddingVertical: 2,
            borderRadius: RADIUS.s,
            backgroundColor: withAlpha(theme.primary, light ? 0.12 : 0.18),
        },
        plateText: {
            fontSize: 11,
            fontFamily: FONTS.bold,
            color: theme.primary,
        },
        dim: { opacity: 0.85 },
        barOnly: {
            fontSize: 11,
            fontFamily: FONTS.medium,
            color: theme.textSecondary,
        },
        note: {
            fontSize: 10,
            fontFamily: FONTS.medium,
            color: theme.textSecondary,
        },
        bar: {
            fontSize: 10,
            fontFamily: FONTS.medium,
            color: theme.textSecondary,
            // Holds the right edge on a single line, and stays right-aligned
            // on its own line when the row wraps.
            marginLeft: 'auto',
        },
        allList: {
            paddingHorizontal: 12,
            paddingBottom: 8,
            gap: 6,
        },
        allRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        allWeight: {
            width: 44,
            fontSize: 11,
            fontFamily: FONTS.semiBold,
            color: theme.text,
        },
    });
};

export default React.memo(PlateHint);
