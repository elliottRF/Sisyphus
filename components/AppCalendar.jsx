import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { Feather } from '@expo/vector-icons';
import { FONTS, TYPE, SPACING, RADIUS, withAlpha } from '../constants/theme';

// The app's calendar. One component for every month view (the History
// picker, the bodyweight backdate picker) so they look the same.
//
// Always six weeks tall. react-native-calendars sizes a month to its number
// of weeks by default, so a five-week month followed by a six-week one made
// the card jump while flicking through -- and the first paint inside a sheet
// measured taller still. Fixed height means the header, the weekday row and
// the grid never move; only the numbers change.
//
// Fully custom header and day cells, so the house rules apply: eyebrow with a
// data point over a bold title, quiet 34px circular buttons, no borders or
// divider lines, status colour only as an accent.

// Cell geometry. Exported so a host that animates the calendar open can size
// the container without measuring.
const ROW_HEIGHT = 44;
const HEADER_HEIGHT = 64;
const WEEKDAY_ROW_HEIGHT = 28;
const GRID_PADDING_BOTTOM = SPACING.s;
export const CALENDAR_HEIGHT = HEADER_HEIGHT + WEEKDAY_ROW_HEIGHT + ROW_HEIGHT * 6 + GRID_PADDING_BOTTOM;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// markedDates values understood here:
//   { trained: true }   -- a day with a logged workout (tinted pill)
//   { selected: true }  -- the chosen day in a picker (filled pill)
const AppCalendar = ({
    theme,
    markedDates,
    onDayPress,
    current,
    firstDay = 1,
    // (year, monthIndex 0-11) -> string shown as the eyebrow over the month title.
    eyebrow,
    testID,
}) => {
    const styles = useMemo(() => getStyles(theme), [theme]);

    // Which month the grid is showing, as "YYYY-M". The library reports a day's
    // own month in DateData, but tells a cell only its state -- and it reports
    // state 'today' for today even when today is a trailing day of the NEXT
    // month being shown to fill the last row. Without this, August's grid put a
    // bright today ring on a faded September date.
    const initialMonth = useMemo(() => {
        const d = current ? new Date(current) : new Date();
        const safe = isNaN(d.getTime()) ? new Date() : d;
        return `${safe.getFullYear()}-${safe.getMonth() + 1}`;
    }, [current]);
    const [visibleMonth, setVisibleMonth] = useState(initialMonth);

    const weekdayLabels = useMemo(
        () => Array.from({ length: 7 }, (_, i) => WEEKDAYS[(firstDay + i) % 7]),
        [firstDay]
    );

    const Header = useCallback(({ month, addMonth }) => {
        const year = month.getFullYear();
        const monthIndex = month.getMonth();
        const eyebrowText = eyebrow ? eyebrow(year, monthIndex) : ' ';
        return (
            <View>
                <View style={styles.header}>
                    <View style={styles.headerText}>
                        <Text style={styles.eyebrow} numberOfLines={1}>{eyebrowText || ' '}</Text>
                        <Text style={styles.title} numberOfLines={1}>{MONTHS[monthIndex]} {year}</Text>
                    </View>
                    <View style={styles.arrows}>
                        <TouchableOpacity
                            style={styles.arrowButton}
                            onPress={() => addMonth(-1)}
                            activeOpacity={0.6}
                            hitSlop={8}
                            accessibilityLabel="Previous month"
                        >
                            <Feather name="chevron-left" size={20} color={theme.text} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.arrowButton}
                            onPress={() => addMonth(1)}
                            activeOpacity={0.6}
                            hitSlop={8}
                            accessibilityLabel="Next month"
                        >
                            <Feather name="chevron-right" size={20} color={theme.text} />
                        </TouchableOpacity>
                    </View>
                </View>
                <View style={styles.weekdays}>
                    {weekdayLabels.map((label, i) => (
                        <Text key={i} style={styles.weekday}>{label}</Text>
                    ))}
                </View>
            </View>
        );
    }, [styles, theme, eyebrow, weekdayLabels]);

    const Day = useCallback(({ date, state, marking, onPress }) => {
        const outside = state === 'disabled' || (!!date && `${date.year}-${date.month}` !== visibleMonth);
        const today = state === 'today' && !outside;
        const trained = !outside && !!marking?.trained;
        const selected = !outside && !!marking?.selected;
        const interactive = !outside && (trained || selected || !!onDayPress);
        return (
            <TouchableOpacity
                style={styles.cell}
                onPress={() => onPress?.(date)}
                disabled={!interactive}
                activeOpacity={0.6}
                accessibilityLabel={date?.dateString}
            >
                {/* Keyed by date so a month change gets fresh native views. The
                    library keys cells by position, and Android's recycled view
                    lost its corner radius / kept a stale ring when the border
                    toggled between set and unset across months. The base pill
                    also always carries a border (transparent) so only colours
                    ever change on a view, never the presence of a border. */}
                <View
                    key={date?.dateString}
                    style={[
                        styles.pill,
                        trained && styles.pillTrained,
                        selected && styles.pillSelected,
                        today && !selected && styles.pillToday,
                    ]}
                >
                    <Text
                        style={[
                            styles.dayText,
                            outside && styles.dayTextOutside,
                            trained && styles.dayTextTrained,
                            selected && styles.dayTextSelected,
                            today && !trained && !selected && styles.dayTextToday,
                        ]}
                    >
                        {date?.day}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    }, [styles, onDayPress, visibleMonth]);

    return (
        <View style={styles.container} testID={testID}>
            <Calendar
                current={current}
                firstDay={firstDay}
                showSixWeeks
                hideExtraDays={false}
                disableMonthChange
                enableSwipeMonths
                markedDates={markedDates}
                onDayPress={onDayPress}
                onMonthChange={(m) => setVisibleMonth(`${m.year}-${m.month}`)}
                customHeader={Header}
                dayComponent={Day}
                style={styles.calendar}
                theme={calendarTheme}
            />
        </View>
    );
};

// Only what the library still draws itself: its own container and week rows.
// Everything visible is ours.
const calendarTheme = {
    backgroundColor: 'transparent',
    calendarBackground: 'transparent',
    'stylesheet.calendar.main': {
        container: { paddingLeft: 0, paddingRight: 0, backgroundColor: 'transparent' },
        monthView: { backgroundColor: 'transparent' },
        week: {
            marginTop: 0,
            marginBottom: 0,
            flexDirection: 'row',
            justifyContent: 'space-around',
        },
        dayContainer: { flex: 1, alignItems: 'center' },
    },
};

const getStyles = (theme) => StyleSheet.create({
    container: {
        height: CALENDAR_HEIGHT,
        overflow: 'hidden',
    },
    calendar: {
        paddingLeft: 0,
        paddingRight: 0,
        backgroundColor: 'transparent',
    },
    header: {
        height: HEADER_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SPACING.xs,
    },
    headerText: {
        flex: 1,
        paddingRight: SPACING.m,
    },
    eyebrow: {
        fontSize: TYPE.caption,
        fontFamily: FONTS.semiBold,
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        color: theme.textSecondary,
        marginBottom: 2,
        minHeight: 16,
    },
    title: {
        fontSize: TYPE.title2,
        fontFamily: FONTS.bold,
        letterSpacing: -0.3,
        color: theme.text,
    },
    arrows: {
        flexDirection: 'row',
        gap: SPACING.s,
    },
    arrowButton: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: theme.overlayInput,
        alignItems: 'center',
        justifyContent: 'center',
    },
    weekdays: {
        height: WEEKDAY_ROW_HEIGHT,
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
    },
    weekday: {
        flex: 1,
        textAlign: 'center',
        fontSize: TYPE.caption,
        fontFamily: FONTS.semiBold,
        letterSpacing: 1.2,
        color: theme.textSecondary,
    },
    // Sized explicitly and stretched across the library's day container.
    // `flex: 1` here collapses to zero height (column parent with no definite
    // height), which stacked all six weeks on one row.
    cell: {
        height: ROW_HEIGHT,
        alignSelf: 'stretch',
        alignItems: 'center',
        justifyContent: 'center',
    },
    pill: {
        width: 36,
        height: 36,
        borderRadius: RADIUS.m - 2,
        borderWidth: 1.5,
        borderColor: 'transparent',
        backgroundColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
    },
    pillTrained: {
        backgroundColor: withAlpha(theme.primary, 0.16),
    },
    pillSelected: {
        backgroundColor: theme.primary,
    },
    pillToday: {
        borderColor: withAlpha(theme.primary, 0.6),
    },
    dayText: {
        fontSize: TYPE.body,
        fontFamily: FONTS.medium,
        color: theme.text,
    },
    dayTextOutside: {
        color: withAlpha(theme.text, 0.22),
    },
    dayTextTrained: {
        color: theme.primary,
        fontFamily: FONTS.bold,
    },
    dayTextSelected: {
        color: theme.textAlternate,
        fontFamily: FONTS.bold,
    },
    dayTextToday: {
        color: theme.primary,
        fontFamily: FONTS.semiBold,
    },
});

export default AppCalendar;
