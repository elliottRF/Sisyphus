import React, { useMemo } from 'react';
import { View, Text, Modal, Pressable, TouchableOpacity, StyleSheet } from 'react-native';
import { FONTS, TYPE, SPACING, RADIUS, withAlpha } from '../constants/theme';

// Picks a set's RPE — how hard it felt, 1 to 10.
//
// A picker rather than a text field: the range is ten values, a keyboard over a
// gym app between sets is the slowest possible way to enter one, and a free
// text field would need validating against a range the user cannot see.
// Tapping a number commits and closes, so recording effort is one tap.
//
// The descriptions are the standard reps-in-reserve reading of RPE, which is
// what makes the number mean the same thing week to week.
const RPE_NOTES = {
    10: 'Maximal — no reps left',
    9: '1 rep left',
    8: '2 reps left',
    7: '3 reps left',
    6: '4 reps left',
    5: 'Half effort',
    4: 'Light',
    3: 'Light',
    2: 'Very easy',
    1: 'Very easy',
};

// High to low: the values people actually record sit at the top, so they are
// under the thumb first.
const VALUES = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

const RpePicker = ({ theme, visible, value, setLabel, onSelect, onClear, onClose }) => {
    const styles = useMemo(() => getStyles(theme), [theme]);
    if (!visible) return null;

    return (
        <Modal transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
            <Pressable style={styles.scrim} onPress={onClose}>
                {/* Stops a tap inside the card falling through to the scrim. */}
                <Pressable style={styles.card} onPress={() => {}}>
                    <Text style={styles.eyebrow}>{setLabel ? `SET ${setLabel}` : 'THIS SET'}</Text>
                    <Text style={styles.title}>How hard was it?</Text>

                    <View style={styles.grid}>
                        {VALUES.map((n) => {
                            const active = value === n;
                            return (
                                <TouchableOpacity
                                    key={n}
                                    style={[styles.option, active && styles.optionActive]}
                                    onPress={() => onSelect(n)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.optionNumber, active && styles.optionNumberActive]}>{n}</Text>
                                    <Text style={[styles.optionNote, active && styles.optionNoteActive]} numberOfLines={1}>
                                        {RPE_NOTES[n]}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <View style={styles.actions}>
                        <TouchableOpacity style={styles.action} onPress={onClear} activeOpacity={0.7}>
                            <Text style={styles.actionText}>Clear</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.action} onPress={onClose} activeOpacity={0.7}>
                            <Text style={styles.actionText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
};

const getStyles = (theme) => StyleSheet.create({
    scrim: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        paddingHorizontal: SPACING.xl,
    },
    card: {
        backgroundColor: theme.surface,
        borderRadius: RADIUS.l,
        padding: SPACING.l,
    },
    eyebrow: {
        fontSize: TYPE.caption,
        fontFamily: FONTS.semiBold,
        letterSpacing: 1.2,
        color: theme.textSecondary,
        marginBottom: 2,
    },
    title: {
        fontSize: TYPE.title2,
        fontFamily: FONTS.bold,
        letterSpacing: -0.3,
        color: theme.text,
        marginBottom: SPACING.m,
    },
    grid: { gap: SPACING.xs },
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.m,
        paddingVertical: 9,
        paddingHorizontal: SPACING.m,
        borderRadius: RADIUS.m,
        backgroundColor: theme.overlayInput,
    },
    optionActive: { backgroundColor: theme.primary },
    optionNumber: {
        width: 26,
        textAlign: 'center',
        fontSize: TYPE.headline,
        fontFamily: FONTS.bold,
        color: theme.text,
    },
    optionNumberActive: { color: theme.textAlternate },
    optionNote: {
        flex: 1,
        fontSize: TYPE.footnote,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
    },
    optionNoteActive: { color: withAlpha(theme.textAlternate, 0.75) },
    actions: {
        flexDirection: 'row',
        gap: SPACING.s,
        marginTop: SPACING.m,
    },
    action: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 12,
        borderRadius: RADIUS.m,
        backgroundColor: theme.overlayInput,
    },
    actionText: {
        fontSize: TYPE.body,
        fontFamily: FONTS.semiBold,
        color: theme.primary,
    },
});

export default RpePicker;
