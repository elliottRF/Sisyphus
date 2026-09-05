import { View, Text, TextInput, Pressable, Keyboard, Platform, StyleSheet } from 'react-native';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Calendar } from 'react-native-calendars';
import { Feather } from '@expo/vector-icons';
import Reanimated, { useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import CustomAlert from './CustomAlert';
import { useTheme } from '../context/ThemeContext';
import { FONTS, TYPE, SPACING, RADIUS } from '../constants/theme';
import { formatWeight, unitLabel, toStorageKg } from '../utils/units';
import { localDateKey, instantForCalendarDay } from '../utils/time';
import { insertBodyWeight, deleteBodyWeight } from './db';
import { emit, AppEvents } from '../utils/events';

// Logging and editing a weigh-in, owned in one place.
//
// This used to live inline in bodyweightGraphCard, which meant the history list
// could only edit an entry by closing itself and handing control back to the
// card. Now that history is its own screen, both need it, and a second copy is
// exactly how the two would drift apart.
//
// Editing is a delete-then-insert because `datetime` is the primary key and the
// user can move an entry to a different day.
//
// `entry` null = logging a new weigh-in; an entry object = editing that one.
const WeightEntryModal = ({ visible, entry, prefillWeight, onClose, onSaved }) => {
    const { theme, useImperial } = useTheme();
    const styles = useMemo(() => getStyles(theme), [theme]);

    const [weight, setWeight] = useState('');
    const [logDate, setLogDate] = useState(() => localDateKey(new Date()));
    const [showCalendar, setShowCalendar] = useState(false);
    const [saving, setSaving] = useState(false);
    const inputRef = useRef(null);

    // Seed on open rather than on mount: the modal stays mounted between uses,
    // so the values have to be refreshed each time it is shown.
    useEffect(() => {
        if (!visible) return;
        if (entry) {
            setWeight(String(formatWeight(entry.weight, useImperial)));
            // The stored value is an instant; the list renders it with
            // toLocaleDateString, so the calendar has to agree on the LOCAL day
            // it falls on. Splitting the raw ISO string gives the UTC day, which
            // opens a 00:30 BST entry on the day before the one just tapped.
            setLogDate(localDateKey(new Date(entry.datetime)));
        } else {
            setWeight(prefillWeight != null ? String(prefillWeight) : '');
            setLogDate(localDateKey(new Date()));
        }
        setShowCalendar(false);
    }, [visible, entry, prefillWeight, useImperial]);

    const sanitizeDecimal = (text) => {
        let cleaned = text.replace(/[^0-9.]/g, '');
        if (cleaned.startsWith('.')) cleaned = '0' + cleaned;
        const parts = cleaned.split('.');
        if (parts.length > 2) cleaned = parts[0] + '.' + parts.slice(1).join('');
        return cleaned;
    };

    const handleSave = async () => {
        if (!weight) return;
        const value = parseFloat(weight);
        if (isNaN(value)) return;

        setSaving(true);
        try {
            const instant = instantForCalendarDay(logDate, new Date());
            if (entry) await deleteBodyWeight(entry.datetime);
            await insertBodyWeight(instant, toStorageKg(value, useImperial));

            // Refresh the caller first, then close. Closing first meant the
            // screen underneath re-rendered once on the old data before the
            // reload landed.
            await onSaved?.();
            // And tell everything else. The graph card already listens for this
            // — it only stayed in sync before because the form lived inside it
            // and called its loadData() directly. Pulling the form out took that
            // call with it, so a log from anywhere but the card went unnoticed.
            // Screens should learn about a mutation from the event, not from
            // whoever happened to host the form.
            emit(AppEvents.BODYWEIGHT_DATA_IMPORTED);
            onClose?.();
        } catch (e) {
            console.error('Weight save failed:', e);
        } finally {
            setSaving(false);
        }
    };

    const calendarStyle = useAnimatedStyle(() => ({
        height: withTiming(showCalendar ? 340 : 0, { duration: 320, easing: Easing.out(Easing.cubic) }),
        opacity: withTiming(showCalendar ? 1 : 0, { duration: 250 }),
    }));

    return (
        <CustomAlert
            visible={visible}
            title={entry ? 'Edit Weigh-In' : 'Log Body Weight'}
            iconType={null}
            onClose={onClose}
            onShow={() => {
                // Focus is deferred past the open transition, and the value is
                // selected so typing replaces the prefill rather than appending.
                const t = setTimeout(() => {
                    inputRef.current?.focus();
                    if (weight) {
                        inputRef.current?.setNativeProps({ selection: { start: 0, end: weight.length } });
                    }
                }, 200);
                return () => clearTimeout(t);
            }}
            buttons={[
                { text: 'Cancel', style: 'cancel', onPress: () => { } },
                { text: 'Save', onPress: handleSave, loading: saving },
            ]}
        >
            <View style={styles.inputWell}>
                <TextInput
                    ref={inputRef}
                    style={styles.input}
                    keyboardType="decimal-pad"
                    value={weight}
                    onChangeText={(t) => setWeight(sanitizeDecimal(t))}
                    placeholder="0.0"
                    placeholderTextColor={theme.textSecondary + '40'}
                    returnKeyType="done"
                    onSubmitEditing={handleSave}
                    multiline={Platform.OS === 'android'}
                />
                <Text style={styles.unit}>{unitLabel(useImperial)}</Text>
            </View>

            <Pressable
                style={styles.dateButton}
                onPress={() => { Keyboard.dismiss(); setShowCalendar(v => !v); }}
            >
                <Feather name="calendar" size={15} color={theme.text} />
                <Text style={styles.dateButtonText}>
                    {logDate === localDateKey(new Date()) ? 'Today' : logDate}
                </Text>
                <Feather
                    name={showCalendar ? 'chevron-up' : 'chevron-down'}
                    size={15}
                    color={theme.textSecondary}
                />
            </Pressable>

            <Reanimated.View style={[styles.calendarWrap, calendarStyle]}>
                <Calendar
                    current={logDate}
                    onDayPress={(day) => {
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
                        selectedDayTextColor: theme.textAlternate,
                        todayTextColor: theme.primary,
                        dayTextColor: theme.text,
                        arrowColor: theme.primary,
                        monthTextColor: theme.text,
                    }}
                />
            </Reanimated.View>
        </CustomAlert>
    );
};

const getStyles = (theme) => StyleSheet.create({
    inputWell: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: SPACING.s,
        backgroundColor: theme.overlayInput,
        borderRadius: RADIUS.m,
        paddingHorizontal: SPACING.l,
        paddingVertical: SPACING.m,
        marginBottom: SPACING.m,
        width: '100%',
    },
    input: {
        fontSize: 34,
        fontFamily: FONTS.bold,
        color: theme.text,
        letterSpacing: -1,
        textAlign: 'center',
        minWidth: 100,
        padding: 0,
    },
    unit: {
        fontSize: TYPE.headline,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
    },
    dateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.s,
        alignSelf: 'stretch',
        justifyContent: 'center',
        backgroundColor: theme.overlaySubtle,
        borderRadius: RADIUS.m,
        paddingVertical: SPACING.m,
        marginBottom: SPACING.m,
    },
    dateButtonText: {
        fontSize: TYPE.body,
        fontFamily: FONTS.semiBold,
        color: theme.text,
    },
    calendarWrap: {
        width: '100%',
        overflow: 'hidden',
    },
});

export default WeightEntryModal;
