import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Dimensions, Pressable, Keyboard, TextInput } from 'react-native'
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withSpring,
    withSequence,
    runOnJS,
    FadeIn,
    ZoomIn,
    Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';

import { FONTS, RADIUS, getThemedShadow, isLightTheme, isLightColor, withAlpha } from '../constants/theme'
import { Feather, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchLastWorkoutSets, fetchLifetimePRs } from './db';
import { useTheme } from '../context/ThemeContext';
import { formatWeight, loadLabel, unitLabel } from '../utils/units';
import { secondsToClock, minutesToClock, clockDigitsToDisplay, clockDigitsToMinutes } from '../utils/time';
import * as haptics from '../utils/haptics';
import {
    getPRType,
    useWorkoutSuggestions,
} from './suggestions';
import { on, AppEvents } from '../utils/events';
import { setWillBeSaved } from '../utils/workoutEntries';
import CustomAlert from './CustomAlert';
import RpePicker from './RpePicker';
import Expandable from './Expandable';
import PlateHint from './PlateHint';
import { isPlateLoaded, resolveEquipmentCached } from '../utils/equipment';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = -100;

// This card no longer uses LinearTransition anywhere. Adding or removing a set
// animates real layout height (components/Expandable.jsx), which carries the
// rest of the card, the cards below and the page footer along with it. A
// layout transition animates a frame after the change has landed, so mixing
// the two left the footer a frame behind; without one it simply jumped.

// Session caches: the reorderable list force-remounts cells after a drag,
// which resets component state. These warm-start remounted cards so the
// previous/PR columns render their values immediately instead of flashing
// "-" while the data refetches.
const prevSetsCache = new Map();
const lifetimePRsCache = new Map();

// Each card refetches fresh data on mount, so these only seed the first paint —
// but seeds captured before a finish/import would flash stale previous sets or
// PR targets on the next workout's cards. Drop them when history changes.
const clearCardCaches = () => { prevSetsCache.clear(); lifetimePRsCache.clear(); };
on(AppEvents.WORKOUT_COMPLETED, clearCardCaches, 'exercise-card-caches');
on(AppEvents.WORKOUT_DATA_IMPORTED, clearCardCaches, 'exercise-card-caches');

const lightenColor = (color, percent) => {
    if (!color || typeof color !== 'string' || !color.startsWith('#')) return color;
    try {
        const num = parseInt(color.replace("#", ""), 16),
            amt = Math.round(2.55 * percent),
            R = (num >> 16) + amt,
            G = (num >> 8 & 0x00FF) + amt,
            B = (num & 0x0000FF) + amt;
        return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 + (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
    } catch (e) {
        return color;
    }
};

// Pure, so they live at module scope: the set-field handlers below are
// useCallbacks, and a helper redefined every render would have to be listed as
// a dependency of each of them, rebuilding the very identities we're keeping
// stable.
const sanitizeDecimal = (text) => {
    let cleaned = text.replace(/[^0-9.]/g, '');
    if (cleaned.startsWith('.')) cleaned = '0' + cleaned;
    const parts = cleaned.split('.');
    if (parts.length > 2) cleaned = parts[0] + '.' + parts.slice(1).join('');
    return cleaned;
};

const sanitizeInteger = (text) => text.replace(/[^0-9]/g, '');

// rowMeta is keyed on the set-type sequence, which encodes the set count too,
// so it can't fall out of step with the sets it's rendered against. This is
// belt-and-braces for the one place where being wrong would be a render crash
// rather than a wrong number, in a path that only a real device exercises.
const EMPTY_ROW_META = {
    displayNumber: '',
    columnText: '-',
    fillData: null,
    computedSuggestion: null,
    isLifetimePRSuggestion: false,
};


// Compact Scrollable Input
// `clock` turns the field into a digit-fill time input: digits push in from the
// right (1,1 → "00:11"; another 1 → "01:11"; five 1s → "01:11:11"), the value
// committed upward is (fractional) minutes, and leaving the field re-renders it
// normalized — so an over-typed "09:99" repairs itself to "10:39" on blur.
const ScrollableInput = ({ value, onChangeText, placeholder, keyboardType, maxLength, style, placeholderTextColor, editable = true, theme, styles, clock = false }) => {
    const [isFocused, setIsFocused] = useState(false);
    // Digit stack for clock mode: the digits typed so far, seeded from the
    // committed value when editing starts (minus padding zeros, so appending
    // to "00:05" behaves like the user had typed "5").
    const [clockDigits, setClockDigits] = useState('');
    const inputRef = useRef(null);

    useEffect(() => {
        const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
            if (isFocused) {
                inputRef.current?.blur();
                setIsFocused(false);
            }
        });
        return () => keyboardDidHideListener.remove();
    }, [isFocused]);

    const handlePress = () => {
        if (editable) {
            if (clock) {
                setClockDigits(minutesToClock(value).replace(/\D/g, '').replace(/^0+/, ''));
            }
            setIsFocused(true);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    };

    const handleClockChange = (text) => {
        const shown = clockDigitsToDisplay(clockDigits);
        let digits;
        if (shown && shown.startsWith(text)) {
            // Deletion from the end. Deleting a colon (or a padding zero the
            // user never typed) still pops one real digit off the stack.
            const removed = shown.slice(text.length).replace(/\D/g, '').length || 1;
            digits = clockDigits.slice(0, Math.max(0, clockDigits.length - removed));
        } else if (text.startsWith(shown)) {
            // Appended at the end — push the new digits onto the stack.
            digits = (clockDigits + text.slice(shown.length).replace(/\D/g, '')).slice(0, 7);
        } else {
            // Replacement (select-all then type, paste, mid-string edit).
            digits = text.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 7);
        }
        setClockDigits(digits);
        const mins = clockDigitsToMinutes(digits);
        onChangeText(mins === null ? '' : String(mins));
    };

    // Once hours appear ("01:11:11") the value outgrows the column at the
    // normal size, so drop the font a notch instead of wrapping — multiline
    // must STAY on for Android (it's the long-standing remedy for a centered
    // single-line input parking the cursor at the far right after a delete).
    const clockText = clock ? (isFocused ? clockDigitsToDisplay(clockDigits) : minutesToClock(value)) : null;
    const clockCompact = clock && (clockText?.length ?? 0) > 5;

    return (
        <Pressable
            style={[style, isFocused && styles.inputFocused, !editable && styles.inputDisabled]}
            onPress={handlePress}
        >
            {isFocused ? (
                <TextInput
                    ref={inputRef}
                    style={[
                        styles.textInputInternal,
                        {
                            color: editable ? theme.text : theme.textSecondary,
                            width: '100%',
                            height: '100%',
                        },
                        clockCompact && { fontSize: 13 },
                    ]}
                    value={clock ? clockText : (value || "")}
                    onChangeText={clock ? handleClockChange : onChangeText}
                    placeholder={placeholder}
                    placeholderTextColor={placeholderTextColor}
                    keyboardType="numeric"
                    maxLength={maxLength}
                    editable={editable}
                    onBlur={() => setIsFocused(false)}
                    selectTextOnFocus
                    autoFocus
                    multiline={Platform.OS === 'android'}
                    blurOnSubmit={true}
                    selectionColor={theme.primary}
                    cursorColor={theme.primary}
                    underlineColorAndroid="transparent"
                />
            ) : (
                <Text
                    style={[
                        styles.textInputInternal,
                        { color: editable ? theme.text : theme.textSecondary },
                        clockCompact && { fontSize: 13 },
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="clip"
                >
                    {(clock ? clockText : value) || placeholder}
                </Text>
            )}
        </Pressable>
    );
};

const SwipeableSetRow = ({ children, onDelete, index, simultaneousHandlers, isExerciseDragging, completed }) => {
    const { theme } = useTheme();
    const styles = useMemo(() => getStyles(theme), [theme]);
    const translateX = useSharedValue(0);

    // Crossing the delete threshold buzzes once, so you know the row will go
    // when you let go rather than finding out afterwards. armedRef lives on the
    // JS thread; the gesture callbacks run on the UI thread, hence runOnJS.
    const swipeArmedRef = useRef(false);
    const setSwipeArmed = (armed) => {
        if (swipeArmedRef.current === armed) return;
        swipeArmedRef.current = armed;
        if (armed) haptics.tap();
    };

    const pan = Gesture.Pan()
        .activeOffsetX([-10, 10])
        .failOffsetY([-5, 5])
        .onUpdate((event) => {
            if (isExerciseDragging) return;
            translateX.value = Math.min(event.translationX, 0);
            runOnJS(setSwipeArmed)(translateX.value < SWIPE_THRESHOLD);
        })
        .onEnd(() => {
            runOnJS(setSwipeArmed)(false);
            if (translateX.value < SWIPE_THRESHOLD) {
                translateX.value = withTiming(-SCREEN_WIDTH, { duration: 300 }, (finished) => {
                    if (finished) runOnJS(onDelete)();
                });
            } else {
                translateX.value = withSpring(0);
            }
        });

    const rStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    const rIconStyle = useAnimatedStyle(() => {
        const opacity = withTiming(translateX.value < -20 ? 1 : 0);
        const scale = withSpring(translateX.value < -40 ? 1 : 0.5);
        return { opacity, transform: [{ scale }] };
    });

    const rRedBoxStyle = useAnimatedStyle(() => ({
        width: -translateX.value,
    }));

    return (
        <Animated.View style={[styles.swipeableContainer]}>
            <View style={styles.deleteBackground}>
                <Animated.View style={[styles.deleteActionRegion, rRedBoxStyle]}>
                    <Animated.View style={[styles.deleteIconContainer, rIconStyle]}>
                        <Feather name="trash-2" size={18} color={theme.text} />
                    </Animated.View>
                </Animated.View>
            </View>
            <GestureDetector gesture={pan}>
                <Animated.View style={[styles.rowForeground, rStyle]}>
                    {children}
                </Animated.View>
            </GestureDetector>
        </Animated.View>
    );
};

// ─── SetRowBody ───────────────────────────────────────────────────────────────
const SetRowBody = React.memo(({
    set, index, displayNumber,
    isTemplate, hidePrevious,
    columnText, fillData,
    showSuggestion, computedSuggestion,
    isLifetimePRSuggestion, brightColor,
    isCardio, theme, styles,
    onFillFromPrevious,
    onToggleSetType, onToggleSetComplete,
    onWeightChange, onRepsChange,
    onDistanceChange, onMinutesChange,
    showRpe, onRpePress,
    fillAllToken,
}) => {
    const fillFlash = useSharedValue(0);

    const flashOverlayStyle = useAnimatedStyle(() => ({
        opacity: fillFlash.value,
    }));

    // Mount guard: the reorderable list remounts cells after a drag, which would
    // replay all `entering` animations. Suppress them on (re)mount; only animate
    // genuine state changes that happen after mount.
    const hasMountedRef = useRef(false);
    useEffect(() => { hasMountedRef.current = true; }, []);

    // Previous/suggestion text: dissolve to the new value when it actually
    // changes. No animation on mount/remount, and none when the value is equal
    // (e.g. reordering in "previous" mode, where history doesn't depend on order).
    const cellTextOpacity = useSharedValue(1);
    const [displayedText, setDisplayedText] = useState(columnText);
    // The last value the effect below decided to animate TO.
    const displayedTextRef = useRef(columnText);
    // The current prop, written during render rather than in an effect: the
    // fade-out's completion callback arrives through runOnJS and can land
    // between a render and that render's effects, so this is the only value
    // the callback can trust to be current.
    const columnTextRef = useRef(columnText);
    columnTextRef.current = columnText;

    // Commit the LATEST text, not the one captured when the fade started.
    const commitLatest = useCallback(() => {
        setDisplayedText(columnTextRef.current);
    }, []);

    // PR mode made the ordering here matter. A warm-up's suggestion is the
    // warm-up from the base session shown UN-incremented, so it is
    // character-for-character the text it replaces, and the column goes
    //
    //     "50 × 11"  →  "-"  (suggestions still loading)  →  "50 × 11"
    //
    // With the swap committing a captured value, that there-and-back stranded
    // the cell: the fade-out completed and wrote "-", then the effect for the
    // new value saw columnText === displayedTextRef.current and returned, so
    // nothing ever wrote the real text back and the row showed "-" for the
    // rest of the workout. Toggling PR mode off and on cleared it only because
    // the cache then serves synchronously and there is no "-" in between.
    // Working sets escaped because their suggestion differs from their
    // previous (82 × 7 → 82 × 8).
    useEffect(() => {
        if (columnText === displayedTextRef.current) {
            // Already animating to this value — but a swap that was in flight
            // when it was decided may since have committed an older one, and
            // no later change will correct it. Put the truth back.
            if (displayedText !== columnText) setDisplayedText(columnText);
            return;
        }
        displayedTextRef.current = columnText;
        if (columnText === displayedText) {
            // Changed back before a pending swap committed — just restore.
            cellTextOpacity.value = withTiming(1, { duration: 160 });
            return;
        }
        cellTextOpacity.value = withTiming(0, { duration: 110 }, (finished) => {
            if (finished) runOnJS(commitLatest)();
        });
    }, [columnText, displayedText, cellTextOpacity, commitLatest]);

    // Fade back in only after the swapped text has been committed by React —
    // sequencing the fade-in off the animation clock instead would briefly
    // show the old value again while the runOnJS swap is still in flight.
    useEffect(() => {
        if (displayedText === displayedTextRef.current) {
            cellTextOpacity.value = withTiming(1, { duration: 160 });
        }
    }, [displayedText, cellTextOpacity]);

    const cellTextStyle = useAnimatedStyle(() => ({
        opacity: cellTextOpacity.value,
    }));

    const triggerFlash = () => {
        fillFlash.value = withSequence(
            withTiming(1, { duration: 80 }),
            withTiming(0, { duration: 420 }),
        );
    };

    const handleFillPress = () => {
        if (!fillData || set.completed) return;
        triggerFlash();
        onFillFromPrevious(index, fillData);
    };

    // Flash this row when the "fill all" header button is tapped — but only if
    // it was actually filled (has a suggestion and isn't ticked), matching
    // fillAllSuggested. Skips the initial mount.
    const fillAllTokenRef = useRef(fillAllToken);
    useEffect(() => {
        if (fillAllToken === fillAllTokenRef.current) return;
        fillAllTokenRef.current = fillAllToken;
        if (!fillData || set.completed) return;
        triggerFlash();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fillAllToken]);

    return (
        <View style={styles.setRow}>
            {/* No `exiting` on this: deleting a card runs exit animations for
                every descendant, and rapid deletes interrupt them — Reanimated
                then retains the detached views forever (see the set-row
                wrapper below). Un-ticking now clears instantly. */}
            {set.completed && (
                <Animated.View
                    style={styles.completedBackground}
                    entering={hasMountedRef.current ? FadeIn.duration(180) : undefined}
                />
            )}

            {/* Fill-tap flash overlay */}
            <Animated.View
                style={[StyleSheet.absoluteFill, styles.fillFlashOverlay, flashOverlayStyle]}
                pointerEvents="none"
            />

            {/* SET column */}
            <View style={styles.colSet}>
                <TouchableOpacity
                    onPress={() => onToggleSetType(index)}
                    style={[
                        styles.setNumberBadge,
                        set.setType === 'W' && styles.badgeWarmup,
                        set.setType === 'D' && styles.badgeDrop,
                    ]}
                >
                    <Text style={[
                        styles.setNumberText,
                        set.setType === 'W' && styles.textWarmup,
                        set.setType === 'D' && styles.textDrop,
                    ]}>
                        {displayNumber}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* PREVIOUS / SUGGESTION column */}
            {(!isTemplate && !hidePrevious) ? (
                <Pressable
                    style={styles.colPrev}
                    onPress={handleFillPress}
                    disabled={!fillData || set.completed}
                >
                    <View style={styles.prevContentWrapper}>
                        <Animated.View style={[cellTextStyle, styles.prevTextContainer]}>
                            {isLifetimePRSuggestion ? (
                                // PR target: soft gradient sheen, sparkle, and
                                // a solid micro "PR" tag — a goal, not a chip.
                                <LinearGradient
                                    colors={[
                                        withAlpha(brightColor, isLightTheme(theme) ? 0.16 : 0.22),
                                        withAlpha(brightColor, isLightTheme(theme) ? 0.04 : 0.05),
                                    ]}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={styles.prTargetPill}
                                >
                                    <MaterialCommunityIcons
                                        name="star-four-points"
                                        size={10}
                                        color={brightColor}
                                    />
                                    <Text
                                        style={[styles.prTargetText, { color: brightColor }]}
                                        numberOfLines={1}
                                    >
                                        {displayedText}
                                    </Text>
                                    <View style={[styles.prTargetBadge, { backgroundColor: brightColor }]}>
                                        {/* Judged against brightColor, not theme.primary:
                                            this badge is filled with a lightened accent, so
                                            a pale theme needs black text here. */}
                                        <Text style={[styles.prTargetBadgeText, { color: isLightColor(brightColor) ? '#000000' : '#FFFFFF' }]}>PR</Text>
                                    </View>
                                </LinearGradient>
                            ) : showSuggestion && fillData && displayedText !== '-' ? (
                                // Any fillable suggestion (computed or warmup):
                                // same capsule family as the PR target, but
                                // quiet — neutral well + "aim higher" arrow.
                                <View style={styles.suggestionPill}>
                                    <Feather name="arrow-up-right" size={10} color={theme.textSecondary} />
                                    <Text style={styles.suggestionPillText} numberOfLines={1}>
                                        {displayedText}
                                    </Text>
                                </View>
                            ) : (
                                // Nothing to suggest/fill — plain quiet text.
                                <Text style={styles.prevText} numberOfLines={1}>
                                    {displayedText}
                                </Text>
                            )}
                        </Animated.View>
                    </View>
                </Pressable>
            ) : (
                <View style={{ flex: 1 }} />
            )}

            {/* RPE column. A tap target rather than an input: the range is ten
                values, and a numeric keyboard between sets is slower than a
                picker and needs validating against a range nobody can see.

                Sits LEFT of the weight and reps boxes, not beside the tick.
                On the right it was the neighbour of the one control reached
                for after every set, and opening a modal by accident mid-
                workout is a worse failure than any saving in travel. */}
            {showRpe && (
                <View style={styles.colRpe}>
                    <TouchableOpacity
                        style={[styles.rpeCell, set.rpe != null && styles.rpeCellSet]}
                        onPress={() => onRpePress(index)}
                        hitSlop={{ top: 12, bottom: 12, left: 11, right: 11 }}
                        activeOpacity={0.6}
                        accessibilityLabel={set.rpe != null ? `Effort ${set.rpe} of 10` : 'Record effort'}
                    >
                        <Text style={[styles.rpeText, set.rpe != null && styles.rpeTextSet]}>
                            {set.rpe != null ? String(set.rpe) : '–'}
                        </Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* WEIGHT / DIST column */}
            <View style={styles.colKg}>
                <ScrollableInput
                    style={styles.inputContainer}
                    value={isCardio ? set.distance?.toString() : set.weight?.toString()}
                    onChangeText={(text) => isCardio ? onDistanceChange(text, index) : onWeightChange(text, index)}
                    placeholder="-"
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="numeric"
                    maxLength={6}
                    editable={!set.completed}
                    theme={theme}
                    styles={styles}
                />
            </View>

            {/* REPS / TIME column */}
            <View style={styles.colReps}>
                <ScrollableInput
                    style={styles.inputContainer}
                    value={isCardio ? set.minutes?.toString() : set.reps?.toString()}
                    onChangeText={(text) => isCardio ? onMinutesChange(text, index) : onRepsChange(text, index)}
                    placeholder={isCardio ? ":" : "-"}
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="numeric"
                    maxLength={isCardio ? 9 : 4}
                    clock={isCardio}
                    editable={!set.completed}
                    theme={theme}
                    styles={styles}
                />
            </View>

            {/* CHECK column */}
            {!isTemplate && (
                <View style={styles.colCheck}>
                    <TouchableOpacity
                        style={[styles.checkButton, set.completed && styles.checkButtonCompleted]}
                        onPress={() => onToggleSetComplete(index)}
                        hitSlop={{ top: 20, bottom: 20, left: 5, right: 20 }}
                    >
                        <Animated.View
                            key={`check-${set.id}-${set.completed}`}
                            entering={set.completed && hasMountedRef.current ? ZoomIn.duration(200).easing(Easing.out(Easing.back(1.5))) : undefined}
                        >
                            <Feather name="check" size={14} color={set.completed ? '#fff' : theme.textSecondary} />
                        </Animated.View>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
});

const ExerciseEditable = ({
    exercise,
    exerciseName,
    updateCurrentWorkout,
    exerciseID,
    workoutID,
    onOpenDetails,
    simultaneousHandlers,
    onSetComplete,
    isCardio,
    isAssisted,
    // The exercises.equipment blob, straight from the DB row. Null on
    // every exercise nobody has configured, which is all of them until
    // the user says otherwise.
    equipment = null,
    // Only the live workout loads a bar. An old session being edited and
    // a template being written are not standing at the rack.
    showPlates = false,
    isTemplate = false,
    hidePrevious = false,
    muscleOccurrenceIndex = 1,
    PRMODE = false,
    // A Map, by card id, of "describe your next unticked set". Each card puts
    // its own in so the workout can carry the rest notification into the next
    // exercise once this one has no sets left -- only the card that owns a set
    // can name it with the suggestions it computed.
    describers,
    onReorderStart,
    onReorderEnd,
    reorderFingerY
}) => {
    const { theme, useImperial, repRangeMin, repRangeMax, trackRPE, gymEquipment, prLookbackDays } = useTheme();
    // What this exercise's equipment can actually make. Drives both the
    // suggestion rounding and the plate breakdown, so they can never
    // disagree about what is loadable.
    const resolvedEquipment = useMemo(
        () => resolveEquipmentCached(equipment, gymEquipment),
        [equipment, gymEquipment]
    );
    const styles = useMemo(() => getStyles(theme), [theme]);
    // The parent's callback is keyed by id/name rather than closing over this
    // card, so wrap it here instead of passing an inline arrow to Pressable.
    // This also stops the press event being handed over as the first argument.
    const handleOpenDetails = useCallback(
        () => onOpenDetails?.(exerciseID, exerciseName),
        [onOpenDetails, exerciseID, exerciseName]
    );
    // An existing note starts expanded so it's read, not missed.
    const [isNoteVisible, setIsNoteVisible] = useState(() => !!(exercise.notes && exercise.notes.length > 0));
    const [previousSets, setPreviousSets] = useState(() => prevSetsCache.get(exerciseID) ?? []);
    const [showDeleteAlert, setShowDeleteAlert] = useState(false);
    // Bumped when the "fill all suggestions" header is tapped, so each filled
    // set row replays its tap-fill flash.
    const [fillAllToken, setFillAllToken] = useState(0);

    // The reorderable list remounts cells after a drag; suppress entering
    // animations on (re)mount so reordering doesn't make content flash.
    const hasMountedRef = useRef(false);
    useEffect(() => { hasMountedRef.current = true; }, []);

    // Hold-to-reorder: a pan that activates after a stationary hold on the
    // header. It hands the screen the absolute finger position (start +
    // every move) so the reorder overlay can place the held row directly
    // under the finger. Scroll wins if the finger moves before the hold
    // completes; quick taps fall through to onPress.
    const reorderPan = useMemo(() => {
        if (!onReorderStart || !onReorderEnd) return null;
        return Gesture.Pan()
            .activateAfterLongPress(250)
            .maxPointers(1)
            .shouldCancelWhenOutside(false)
            .onStart((e) => {
                'worklet';
                if (reorderFingerY) reorderFingerY.value = e.absoluteY;
                runOnJS(onReorderStart)(workoutID, e.absoluteY);
            })
            .onUpdate((e) => {
                'worklet';
                if (reorderFingerY) reorderFingerY.value = e.absoluteY;
            })
            .onFinalize(() => {
                'worklet';
                runOnJS(onReorderEnd)();
            });
    }, [onReorderStart, onReorderEnd, reorderFingerY, workoutID]);

    const brightColor = useMemo(() => lightenColor(theme.primary, 20), [theme.primary]);

    useEffect(() => {
        if (isTemplate || hidePrevious) return;
        const loadPreviousData = async () => {
            try {
                const prevSets = await fetchLastWorkoutSets(exerciseID);
                prevSetsCache.set(exerciseID, prevSets);
                setPreviousSets(prevSets);
            } catch (error) {
                console.error("Error loading previous sets:", error);
            }
        };
        loadPreviousData();
    }, [exerciseID, isTemplate, hidePrevious]);

    const [lifetimePRs, setLifetimePRs] = useState(() => lifetimePRsCache.get(exerciseID) ?? null);

    useEffect(() => {
        if (!PRMODE || isAssisted) return;
        if (isTemplate || hidePrevious || isCardio) return;
        const loadPRs = async () => {
            try {
                const prs = await fetchLifetimePRs(exerciseID);
                lifetimePRsCache.set(exerciseID, prs);
                setLifetimePRs(prs);
            } catch (e) { console.error(e); }
        };
        loadPRs();
    }, [exerciseID, PRMODE, isAssisted]);

    // Every mutation below writes through updateCurrentWorkout's functional
    // form, so none of them needs to close over the current sets — which is
    // what lets them be useCallbacks keyed only on this card's identity, and
    // therefore stay stable while the user types. The two that DO need to read
    // the current sets (a tap has to know whether the row is already
    // completed) read them through a ref instead: depending on exercise.sets
    // would rebuild every handler on every keystroke, which is exactly the
    // memo defeat this is undoing.
    const exerciseId = exercise.id;
    const setsRef = useRef(exercise.sets);
    setsRef.current = exercise.sets;

    const handleWeightChange = useCallback((text, setIndex) => {
        const sanitized = sanitizeDecimal(text);
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.map(e => e.id === exerciseId ? { ...e, sets: e.sets.map((s, i) => i === setIndex ? { ...s, weight: sanitized } : s) } : e) } : w));
    }, [updateCurrentWorkout, workoutID, exerciseId]);
    const handleRepsChange = useCallback((text, setIndex) => {
        const sanitized = sanitizeInteger(text);
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.map(e => e.id === exerciseId ? { ...e, sets: e.sets.map((s, i) => i === setIndex ? { ...s, reps: sanitized } : s) } : e) } : w));
    }, [updateCurrentWorkout, workoutID, exerciseId]);
    // The RPE column is off in a template (effort is a record, not a plan) and
    // can be hidden entirely in settings -- it is a sixth column on a row used
    // one-handed between sets, and not everyone tracks it.
    const showRpe = trackRPE && !isTemplate;

    // Which set's picker is open, by index; null when none is.
    const [rpeFor, setRpeFor] = useState(null);
    const setRpe = useCallback((setIndex, value) => {
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.map(e => e.id === exerciseId ? { ...e, sets: e.sets.map((s, i) => i === setIndex ? { ...s, rpe: value } : s) } : e) } : w));
    }, [updateCurrentWorkout, workoutID, exerciseId]);

    const handleDistanceChange = useCallback((text, setIndex) => {
        const sanitized = sanitizeDecimal(text);
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.map(e => e.id === exerciseId ? { ...e, sets: e.sets.map((s, i) => i === setIndex ? { ...s, distance: sanitized } : s) } : e) } : w));
    }, [updateCurrentWorkout, workoutID, exerciseId]);
    const handleMinutesChange = useCallback((text, setIndex) => {
        // Arrives from the clock field already parsed to (fractional) minutes —
        // may carry a decimal (12.5 === 12:30), so no integer sanitizing here.
        const value = text === '' || text == null ? null : String(text);
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.map(e => e.id === exerciseId ? { ...e, sets: e.sets.map((s, i) => i === setIndex ? { ...s, minutes: value } : s) } : e) } : w));
    }, [updateCurrentWorkout, workoutID, exerciseId]);

    // What the suggestion column is currently showing, filled in during render
    // further down -- both of these are declared below this point, and reading
    // them through a ref at call time is what lets describeNextSet see them
    // without naming them as dependencies. It is handed to the memoised set
    // rows, and the note above rowMeta explains why their props must stay put.
    const suggestionViewRef = useRef({ rowMeta: null, showSuggestion: false });

    // What the rest notification should say you are resting FOR: the first set
    // after `completedIndex` that is not already ticked. Pass -1 to ask for the
    // first unticked set in the card at all, which is how the workout asks the
    // NEXT exercise to describe itself once this one is finished.
    //
    // Name and load kept APART, because the notification puts them on
    // separate lines. Joined into one string they shared the title with the
    // countdown, and a long exercise name pushed the numbers off the end --
    // losing exactly the part you cannot infer.
    const describeNextSet = useCallback((completedIndex) => {
        const sets = setsRef.current || [];
        const offset = sets.slice(completedIndex + 1).findIndex((s) => !s.completed);
        if (offset < 0 || !exerciseName) return null;
        const nextIndex = completedIndex + 1 + offset;
        const next = sets[nextIndex];
        if (isCardio) return { name: exerciseName, load: '' };

        const quantify = (weight, reps) => loadLabel(weight, reps, useImperial);

        // In PR mode the suggestion is the plan, and the row it belongs to is
        // usually still empty -- the number is shown beside the row rather than
        // typed into it. So rest towards the suggestion, and say what it is:
        // unlabelled it would read as something the user had already entered,
        // which is the one thing it is not.
        const { rowMeta: currentRowMeta, showSuggestion: prModeOn } = suggestionViewRef.current;
        if (prModeOn) {
            const meta = currentRowMeta?.[nextIndex];
            const suggested = meta?.computedSuggestion;
            if (suggested) {
                // "+" carries the same meaning as in the card: a weight
                // increase asks for at least this many, and more if they come.
                const reps = suggested.isWeightIncrease ? `${suggested.reps}+` : `${suggested.reps}`;
                const load = quantify(formatWeight(suggested.weight, useImperial), reps);
                if (load) {
                    const label = meta.isLifetimePRSuggestion ? 'PR target' : 'Target';
                    return { name: exerciseName, load: `${label} · ${load}` };
                }
            } else if (next.setType === 'W' && meta?.fillData) {
                // A warm-up suggestion is last session's warm-up, not a target.
                const load = quantify(formatWeight(meta.fillData.weight, useImperial), meta.fillData.reps);
                if (load) return { name: exerciseName, load: `Warm-up · ${load}` };
            }
        }

        // Otherwise the row as it stands, which is prefilled from the template
        // or a tapped suggestion, so it is the number you are about to lift.
        // A row with neither is named but not quantified.
        return { name: exerciseName, load: quantify(next.weight, next.reps) };
    }, [exerciseName, isCardio, useImperial]);

    // Tick the last set of an exercise and the rest that follows is for the
    // next exercise, not this one. Only the card that owns a set can name it
    // with the suggestions it computed, so each lends the workout the function
    // rather than the answer -- see handleSetComplete in app/(tabs)/current.jsx.
    useEffect(() => {
        if (!describers) return;
        const registry = describers.current;
        registry.set(exerciseId, describeNextSet);
        return () => {
            if (registry.get(exerciseId) === describeNextSet) registry.delete(exerciseId);
        };
    }, [describers, exerciseId, describeNextSet]);

    const toggleSetComplete = useCallback((setIndex) => {
        if (isTemplate) return;
        const set = setsRef.current[setIndex];
        if (!set.completed) {
            Keyboard.dismiss();
            haptics.tap();
            if (onSetComplete) onSetComplete(describeNextSet(setIndex), exerciseId);
        }
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.map(e => e.id === exerciseId ? { ...e, sets: e.sets.map((s, i) => i === setIndex ? { ...s, completed: !s.completed } : s) } : e) } : w));
    }, [isTemplate, onSetComplete, describeNextSet, updateCurrentWorkout, workoutID, exerciseId]);

    const toggleSetType = useCallback((setIndex) => {
        haptics.select();
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.map(e => e.id === exerciseId ? { ...e, sets: e.sets.map((s, i) => { if (i === setIndex) { const t = s.setType || 'N'; const n = t === 'N' ? 'W' : t === 'W' ? 'D' : 'N'; return { ...s, setType: n }; } return s; }) } : e) } : w));
    }, [updateCurrentWorkout, workoutID, exerciseId]);
    // Grows in on open and shrinks away on close, so the rest of the card
    // doesn't jump by the note's height.
    const noteRef = useRef(null);
    const toggleNote = () => {
        if (isNoteVisible && noteRef.current?.collapse) noteRef.current.collapse(() => setIsNoteVisible(false));
        else setIsNoteVisible(v => !v);
    };
    const handleNoteChange = (text) => {
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.map(e => e.id === exercise.id ? { ...e, notes: text } : e) } : w));
    };
    const addNewSet = () => {
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.map(e => e.id === exercise.id ? { ...e, sets: [...e.sets, { id: Date.now().toString() + Math.random().toString(36).substr(2, 9), weight: null, reps: null, distance: null, minutes: null, completed: false, setType: 'N', rpe: null }] } : e) } : w));
    };
    const deleteSet = (setId, fallbackIndex) => {
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.map(e => e.id === exercise.id ? {
            ...e,
            // By id where there is one: a collapse callback fires ~200ms after
            // the swipe, by which time a second deletion may have shifted the
            // indices. Older sets without an id fall back to position.
            sets: setId != null ? e.sets.filter(sset => sset.id !== setId) : e.sets.filter((_, i) => i !== fallbackIndex),
        } : e) } : w));
    };

    // Each row owns a height animation (see components/Expandable.jsx). Shrink
    // the row to nothing first, then drop it from state: the card, the cards
    // below it and the page footer all move up with the real layout instead of
    // jumping the moment the row disappears.
    const rowRefs = useRef({});
    const requestDeleteSet = (setIndex, setId) => {
        const row = setId != null ? rowRefs.current[setId] : null;
        if (row?.collapse) {
            row.collapse(() => {
                delete rowRefs.current[setId];
                deleteSet(setId, setIndex);
            });
        } else {
            deleteSet(setId, setIndex);
        }
    };
    const deleteExercise = () => {
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.filter(ex => ex.id !== exercise.id) } : w).filter(w => w.exercises.length > 0));
    };

    // Delete animation: fade + shrink the card, then remove it from state.
    // The list's itemLayoutAnimation then slides the remaining cards up to
    // close the gap, so it doesn't just pop away.
    const deleteAnim = useSharedValue(0);
    const animatedDeleteStyle = useAnimatedStyle(() => {
        if (deleteAnim.value === 0) return {};
        const f = 1 - deleteAnim.value;
        return {
            opacity: f,
            transform: [{ scale: 0.94 + 0.06 * f }],
        };
    });
    // Fade and shrink the card while its real height collapses, then remove it.
    // The height is what matters: it carries the cards below and the page's
    // Add Exercise / Finish Workout footer up with it, rather than letting them
    // snap into the gap once the card is gone.
    const cardRef = useRef(null);
    const handleConfirmDelete = () => {
        deleteAnim.value = withTiming(1, { duration: 200 });
        if (cardRef.current?.collapse) cardRef.current.collapse(deleteExercise);
        else deleteExercise();
    };

    const fillFromPrevious = useCallback((setIndex, fillData) => {
        if (!fillData) return;
        const currentSet = setsRef.current[setIndex];
        if (currentSet.completed) return;
        haptics.commit();
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? {
            ...w,
            exercises: w.exercises.map(e => e.id === exerciseId ? {
                ...e,
                sets: e.sets.map((s, i) => i === setIndex ? {
                    ...s,
                    ...(isCardio
                        ? {
                            distance: fillData.distance?.toString() || s.distance,
                            minutes: fillData.minutes?.toString() || s.minutes,
                        }
                        : {
                            // fillData weights are storage kg → fill in the user's
                            // display unit (was filling kg even when set to lbs).
                            weight: fillData.weight != null ? formatWeight(fillData.weight, useImperial).toString() : s.weight,
                            reps: fillData.reps?.toString() || s.reps,
                        }
                    )
                } : s)
            } : e)
        } : w));
    }, [updateCurrentWorkout, workoutID, exerciseId, isCardio, useImperial]);

    const { prevWarmups, prevWorking } = React.useMemo(() => ({
        prevWarmups: previousSets.filter(s => s.setType === 'W'),
        prevWorking: previousSets.filter(s => s.setType !== 'W'),
    }), [previousSets]);

    const showSuggestion = PRMODE && !isTemplate && !hidePrevious && !isCardio && !isAssisted;

    const { working: workingSuggestions, warmups: suggestedWarmups } = useWorkoutSuggestions({
        showSuggestion,
        exerciseID,
        repRangeMin,
        repRangeMax,
        isAssisted,
        muscleOccurrenceIndex,
        useImperial,
        equipment,
        gym: gymEquipment,
        lookbackDays: prLookbackDays,
    });

    // When PR mode turns on, grow this card so there's a row for every
    // suggestion: append blank warm-up rows until they match the suggested
    // warm-ups, and blank working rows until they match the suggested working
    // sets. Runs once per activation (the ref resets when PR mode turns off);
    // rows are only ever added, never removed, and existing/ticked sets are
    // untouched. New warm-ups slot in after the last existing warm-up; new
    // working sets append to the end.
    const prAutoFillDoneRef = useRef(false);
    useEffect(() => {
        if (!showSuggestion) { prAutoFillDoneRef.current = false; return; }
        if (prAutoFillDoneRef.current) return;
        // Wait until suggestions have actually loaded for this exercise.
        if (suggestedWarmups.length === 0 && workingSuggestions.length === 0) return;

        prAutoFillDoneRef.current = true;

        const warmCount = exercise.sets.filter(s => s.setType === 'W').length;
        const workCount = exercise.sets.filter(s => s.setType !== 'W').length;
        const addWarm = Math.max(0, suggestedWarmups.length - warmCount);
        const addWork = Math.max(0, workingSuggestions.length - workCount);
        if (addWarm === 0 && addWork === 0) return;

        const blankSet = (setType) => ({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            weight: null, reps: null, distance: null, minutes: null, completed: false, setType,
        });
        const newWarm = Array.from({ length: addWarm }, () => blankSet('W'));
        const newWork = Array.from({ length: addWork }, () => blankSet('N'));

        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? {
            ...w,
            exercises: w.exercises.map(e => {
                if (e.id !== exercise.id) return e;
                let lastWarmIdx = -1;
                e.sets.forEach((s, i) => { if (s.setType === 'W') lastWarmIdx = i; });
                const insertAt = lastWarmIdx + 1;
                return {
                    ...e,
                    sets: [
                        ...e.sets.slice(0, insertAt),
                        ...newWarm,
                        ...e.sets.slice(insertAt),
                        ...newWork,
                    ],
                };
            }),
        } : w));
    }, [showSuggestion, suggestedWarmups, workingSuggestions, exercise.sets, exercise.id, workoutID, updateCurrentWorkout]);

    // Tapping the suggestion column header fills every NOT-completed set in this
    // card with its suggestion (working sets → the computed suggestion, warm-ups
    // → the un-incremented warm-up from the same session the suggestions are
    // drawn from — never the previous workout's, matching the column display).
    // Ticked sets are left alone.
    const fillAllSuggested = () => {
        if (!showSuggestion) return;
        let warmupIdx = 0;
        let workingIdx = 0;
        const fills = exercise.sets.map((set) => {
            if (set.setType === 'W') {
                const warm = suggestedWarmups[warmupIdx++];
                // reps || null: a weight-only warm-up leaves the reps field alone.
                return warm ? { weight: warm.weight, reps: warm.reps || null } : null;
            }
            const computed = workingSuggestions[workingIdx++];
            return computed ? { weight: computed.weight, reps: computed.reps } : null;
        });
        if (!fills.some(Boolean)) return;
        haptics.commit();
        // Bump the token so every filled row plays the same tap flash.
        setFillAllToken(t => t + 1);
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? {
            ...w,
            exercises: w.exercises.map(e => e.id === exercise.id ? {
                ...e,
                sets: e.sets.map((s, i) => {
                    if (s.completed) return s; // never overwrite a ticked set
                    const f = fills[i];
                    if (!f) return s;
                    return {
                        // fill values are storage kg → fill in the user's display
                        // unit (was filling kg even when set to lbs).
                        ...s,
                        weight: f.weight != null ? formatWeight(f.weight, useImperial).toString() : s.weight,
                        reps: f.reps != null ? f.reps.toString() : s.reps,
                    };
                }),
            } : e),
        } : w));
    };

    const headerKey = showSuggestion ? 'suggest' : 'prev';

    // Set progress for the header: "2/4" while working, a check when done.
    // Same predicate the page header and the save use: a set ticked while
    // still empty is not written to history, so counting it here would have
    // this card disagree with the header directly above it.
    const setsDone = exercise.sets.filter(setWillBeSaved).length;
    const showSetProgress = !isTemplate && !hidePrevious && exercise.sets.length > 0;
    const allSetsDone = showSetProgress && setsDone === exercise.sets.length;

    // ── Per-row derivation ────────────────────────────────────────────────────
    // This used to run inline in the set-rendering reduce, which meant a fresh
    // `fillData` object per row on every render. SetRowBody is React.memo'd, so
    // that one prop compared unequal every time and the memo never prevented a
    // single render: one keystroke re-rendered every set row in the card.
    //
    // The dependency that makes this work is `setTypeKey` rather than
    // `exercise.sets`. Everything below is positional — which previous set a
    // row lines up with, which suggestion it consumes, what number it displays
    // — and all of that is decided by the SEQUENCE OF SET TYPES, nothing else.
    // Weight, reps and completed are read by the row itself, not here. So the
    // derivation only genuinely changes when a set is added, removed, or has
    // its type cycled, and keying on the sets array instead would recompute
    // (and hand back new objects) on every character typed, leaving the memo
    // just as defeated as it was.
    //
    // Comma-joined rather than concatenated: the app only ever writes N/W/D,
    // but setType comes back out of a TEXT column, and a longer value would
    // otherwise let two different sequences produce the same key.
    const setTypeKey = exercise.sets.map(s => s.setType || 'N').join(',');

    const rowMeta = useMemo(() => {
        const sets = setsRef.current;
        let prevWarmupIndex = 0;
        let prevWorkingIndex = 0;
        let suggestWorkingIndex = 0;
        let suggestWarmupIndex = 0;
        let normalSetCount = 0;

        return sets.map((set) => {
            let displayNumber;
            if (set.setType === 'W') displayNumber = 'W';
            else if (set.setType === 'D') displayNumber = 'D';
            else {
                // A running tally rather than the old per-row backwards scan
                // (which made the numbering O(n²) in the set count), counting
                // the same rows it did: only N/untyped sets, so a value that
                // is somehow neither N, W nor D still gets a number without
                // shifting the ones after it.
                displayNumber = normalSetCount + 1;
                if (!set.setType || set.setType === 'N') normalSetCount++;
            }

            const prevSet = set.setType === 'W'
                ? prevWarmups[prevWarmupIndex++]
                : prevWorking[prevWorkingIndex++];

            let prevSetText = '-';
            if (prevSet) {
                prevSetText = isCardio
                    ? `${prevSet.distance || 0}km / ${secondsToClock(prevSet.seconds || 0)}`
                    : `${formatWeight(prevSet.weight, useImperial)} × ${prevSet.reps}`;
            }

            let suggestionText = '-';
            let computedSuggestion = null;
            let fillData = null;

            if (showSuggestion) {
                if (set.setType === 'W') {
                    // Warm-up suggestion = the warm-up from the same session
                    // the working suggestions come from, shown un-incremented.
                    // No fallback to the previous workout's warm-ups — mixing
                    // sessions is misleading; if the base session has none,
                    // the row shows "-".
                    const warm = suggestedWarmups[suggestWarmupIndex++];
                    if (warm) {
                        // A weight-only warm-up (reps 0) shows just the
                        // weight and leaves the reps field alone on fill.
                        suggestionText = warm.reps > 0
                            ? `${formatWeight(warm.weight, useImperial)} × ${warm.reps}`
                            : `${formatWeight(warm.weight, useImperial)}`;
                        fillData = { weight: warm.weight || 0, reps: warm.reps || null };
                    }
                } else {
                    const computed = workingSuggestions[suggestWorkingIndex++];
                    if (computed) {
                        // "min+" on a weight increase: do at least the min reps, push for more.
                        const repsLabel = computed.isWeightIncrease ? `${computed.reps}+` : `${computed.reps}`;
                        suggestionText = `${formatWeight(computed.weight, useImperial)} × ${repsLabel}`;
                        computedSuggestion = computed;
                        fillData = { weight: computed.weight, reps: computed.reps };
                    }
                }
            } else if (prevSet) {
                fillData = isCardio
                    ? {
                        distance: prevSet.distance || 0,
                        // Exact fractional minutes so seconds survive the fill.
                        minutes: prevSet.seconds ? prevSet.seconds / 60 : 0,
                    }
                    : { weight: prevSet.weight || 0, reps: prevSet.reps || 0 };
            }

            const isLifetimePRSuggestion =
                showSuggestion &&
                lifetimePRs !== null &&
                getPRType(computedSuggestion, lifetimePRs, isCardio) !== null;

            return {
                displayNumber,
                columnText: showSuggestion ? suggestionText : prevSetText,
                fillData,
                computedSuggestion,
                isLifetimePRSuggestion,
            };
        });
        // setTypeKey stands in for exercise.sets — see the note above.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setTypeKey, prevWarmups, prevWorking, showSuggestion, suggestedWarmups,
        workingSuggestions, isCardio, useImperial, lifetimePRs]);
    suggestionViewRef.current = { rowMeta, showSuggestion };

    const headerLeftContent = (
        <>
            <View style={styles.dragHandle}>
                <MaterialIcons name="drag-indicator" size={20} color={theme.textSecondary} />
            </View>
            <TouchableOpacity
                onPress={handleOpenDetails}
                style={{ flex: 1 }}
            >
                <Text style={styles.exerciseName} numberOfLines={1}>{exerciseName}</Text>
            </TouchableOpacity>
        </>
    );

    return (
        // No `layout` transitions inside this card any more. They animated a
        // view's frame AFTER a layout change landed, which is a frame behind
        // when the height itself is being animated -- and left the page footer
        // either lagging or jumping. Heights animate directly instead.
        <Expandable ref={cardRef}>
        <Animated.View style={[styles.container, animatedDeleteStyle]}>
            {/* Header */}
            <View style={styles.header}>
                {reorderPan ? (
                    <GestureDetector gesture={reorderPan}>
                        <View style={styles.headerLeft} collapsable={false}>
                            {headerLeftContent}
                        </View>
                    </GestureDetector>
                ) : (
                    <View style={styles.headerLeft}>
                        {headerLeftContent}
                    </View>
                )}

                <View style={styles.headerActions}>
                    {showSetProgress && (
                        allSetsDone ? (
                            <Animated.View entering={hasMountedRef.current ? ZoomIn.duration(220).easing(Easing.out(Easing.back(1.5))) : undefined}>
                                <MaterialCommunityIcons name="check-circle" size={17} color={theme.success} />
                            </Animated.View>
                        ) : (
                            <Text style={styles.setProgressText}>
                                {setsDone}/{exercise.sets.length}
                            </Text>
                        )
                    )}
                    <TouchableOpacity
                        onPress={toggleNote}
                        style={styles.iconButton}
                    >
                        <MaterialIcons
                            name="sticky-note-2"
                            size={18}
                            color={exercise.notes && exercise.notes.length > 0 ? theme.primary : theme.textSecondary}
                        />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setShowDeleteAlert(true)} style={styles.iconButton}>
                        <Feather name="x" size={18} color={theme.textSecondary} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Note Input */}
            {isNoteVisible && (
                <Expandable ref={noteRef} animateOnMount>
                <View style={styles.noteContainer}>
                    <TextInput
                        style={styles.noteInput}
                        value={exercise.notes}
                        onChangeText={handleNoteChange}
                        placeholder="Add notes..."
                        placeholderTextColor={theme.textSecondary}
                        multiline
                    />
                </View>
                </Expandable>
            )}

            {/* Table Header */}
            <View style={styles.tableHeader}>
                <Text style={[styles.columnHeader, styles.colSet]}>SET</Text>
                {(!isTemplate && !hidePrevious) ? (
                    <Animated.View
                        key={headerKey}
                        entering={hasMountedRef.current ? FadeIn.duration(220) : undefined}
                        style={[styles.colPrev, { alignItems: 'center', justifyContent: 'center' }]}
                    >
                        {showSuggestion ? (
                            // Tap to fill all un-ticked sets with their suggestions.
                            <TouchableOpacity
                                onPress={fillAllSuggested}
                                hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
                                style={{ alignItems: 'center', justifyContent: 'center' }}
                            >
                                <MaterialCommunityIcons name="trending-up" size={14} color={theme.primary} />
                            </TouchableOpacity>
                        ) : (
                            <Text style={[styles.columnHeader]}>PREVIOUS</Text>
                        )}
                    </Animated.View>
                ) : (
                    <View style={{ flex: 1 }} />
                )}
                {showRpe && <Text style={[styles.columnHeader, styles.colRpe]}>RPE</Text>}
                <Text style={[styles.columnHeader, styles.colKg]}>{isCardio ? "DIST (km)" : (isAssisted ? `ASSIST (${unitLabel(useImperial)})` : unitLabel(useImperial).toUpperCase())}</Text>
                <Text style={[styles.columnHeader, styles.colReps]}>{isCardio ? "TIME" : "REPS"}</Text>
                {!isTemplate && <View style={styles.colCheck}><Feather name="check" size={12} color={theme.textSecondary} /></View>}
            </View>

            {/* Sets */}
            <View style={styles.setsContainer}>
                {exercise.sets.map((set, index) => {
                    const meta = rowMeta[index] || EMPTY_ROW_META;
                    return (
                        <Expandable
                            key={set.id || index}
                            ref={(r) => { if (set.id == null) return; if (r) rowRefs.current[set.id] = r; else delete rowRefs.current[set.id]; }}
                            // Grows in when a set is added mid-workout; on the
                            // card's own mount the rows are simply there.
                            animateOnMount={hasMountedRef.current}
                            // No `exiting` here: rapid removals interrupt exit
                            // animations mid-flight and Reanimated permanently
                            // retains the detached views (measured: Views count
                            // never recovers). It's also visually redundant — a
                            // swiped row has already slid off-screen, and rows
                            // removed with a whole card are covered by the
                            // card's own fade. The layout transition below
                            // still slides the remaining rows up.
                        >
                            <Animated.View entering={hasMountedRef.current ? FadeIn.duration(180) : undefined}>
                            <SwipeableSetRow
                                onDelete={() => requestDeleteSet(index, set.id)}
                                index={index}
                                simultaneousHandlers={simultaneousHandlers}
                                isExerciseDragging={false}
                                completed={set.completed}
                            >
                                <SetRowBody
                                    set={set}
                                    index={index}
                                    displayNumber={meta.displayNumber}
                                    isTemplate={isTemplate}
                                    hidePrevious={hidePrevious}
                                    columnText={meta.columnText}
                                    fillData={meta.fillData}
                                    showSuggestion={showSuggestion}
                                    computedSuggestion={meta.computedSuggestion}
                                    isLifetimePRSuggestion={meta.isLifetimePRSuggestion}
                                    brightColor={brightColor}
                                    isCardio={isCardio}
                                    theme={theme}
                                    styles={styles}
                                    onFillFromPrevious={fillFromPrevious}
                                    onToggleSetType={toggleSetType}
                                    onToggleSetComplete={toggleSetComplete}
                                    onWeightChange={handleWeightChange}
                                    onRepsChange={handleRepsChange}
                                    onDistanceChange={handleDistanceChange}
                                    onMinutesChange={handleMinutesChange}
                                    showRpe={showRpe}
                                    onRpePress={setRpeFor}
                                    fillAllToken={fillAllToken}
                                />
                            </SwipeableSetRow>
                            </Animated.View>
                        </Expandable>
                    );
                })}
            </View>

            {/* What to load on the bar. Rendered for the whole life of the
                card once the exercise is set up as a barbell, showing the
                empty bar until a weight is typed, so the card never changes
                height when one lands. */}
            {showPlates && !isCardio && resolvedEquipment && isPlateLoaded(resolvedEquipment.type) && (
                <PlateHint
                    resolved={resolvedEquipment}
                    sets={exercise.sets}
                    theme={theme}
                    useImperial={useImperial}
                />
            )}

            {/* Footer */}
            <View>
                <TouchableOpacity style={styles.addSetButton} onPress={addNewSet} activeOpacity={0.6}>
                    <Text style={styles.addSetText}>+ ADD SET</Text>
                </TouchableOpacity>
            </View>

            <RpePicker
                theme={theme}
                visible={rpeFor !== null}
                value={rpeFor !== null ? exercise.sets[rpeFor]?.rpe ?? null : null}
                setLabel={rpeFor !== null ? rowMeta[rpeFor]?.displayNumber : null}
                onSelect={(n) => { setRpe(rpeFor, n); setRpeFor(null); }}
                onClear={() => { setRpe(rpeFor, null); setRpeFor(null); }}
                onClose={() => setRpeFor(null)}
            />

            <CustomAlert
                visible={showDeleteAlert}
                title="Remove Exercise"
                description={`Remove ${exerciseName} from this workout?`}
                iconType="destructive"
                onClose={() => setShowDeleteAlert(false)}
                buttons={[
                    {
                        text: 'Cancel',
                        style: 'cancel',
                    },
                    {
                        text: 'Remove',
                        style: 'destructive',
                        onPress: handleConfirmDelete,
                    },
                ]}
            />
        </Animated.View>
        </Expandable>
    );
};

const getStyles = (theme) => {
    const lightTheme = isLightTheme(theme);
    const safeError = theme.error || '#EF4444';
    const safePrimary = theme.primary;
    const safeSuccess = theme.success || '#22c55e';
    const completedFill = withAlpha(safeSuccess, lightTheme ? 0.06 : 0.045);
    const fillFlashColor = withAlpha(safePrimary, lightTheme ? 0.12 : 0.18);

    return StyleSheet.create({
        container: {
            backgroundColor: theme.surface,
            borderRadius: 16,
            marginBottom: 12,
            ...(lightTheme ? getThemedShadow(theme, 'small') : null),
        },
        header: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingVertical: 10,
            backgroundColor: lightTheme ? theme.overlaySubtle : theme.surface,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            borderBottomWidth: 1,
            borderBottomColor: lightTheme ? theme.overlayBorder : 'transparent',
        },
        headerLeft: {
            flexDirection: 'row',
            alignItems: 'center',
            flex: 1,
        },
        dragHandle: {
            paddingRight: 8,
            paddingVertical: 4,
        },
        exerciseName: {
            fontSize: 15,
            fontFamily: FONTS.bold,
            color: theme.primary,
        },
        headerActions: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
        },
        setProgressText: {
            fontSize: 12,
            fontFamily: FONTS.semiBold,
            color: theme.textSecondary,
            fontVariant: ['tabular-nums'],
        },
        iconButton: {
            padding: 2,
        },
        noteContainer: {
            paddingHorizontal: 12,
            paddingBottom: 8,
            backgroundColor: theme.surface,
        },
        noteInput: {
            color: theme.text,
            fontFamily: FONTS.regular,
            fontSize: 13,
            backgroundColor: lightTheme ? theme.overlaySubtle : theme.overlayMedium,
            borderRadius: 8,
            padding: 10,
            minHeight: 32,
            borderWidth: 1,
            borderColor: lightTheme ? theme.overlayBorder : 'transparent',
        },
        tableHeader: {
            flexDirection: 'row',
            paddingHorizontal: 12,
            paddingVertical: 6,
            alignItems: 'center',
            backgroundColor: lightTheme ? theme.overlaySubtle : theme.overlaySubtle,
        },
        columnHeader: {
            fontSize: 10,
            fontFamily: FONTS.bold,
            color: theme.textSecondary,
            textAlign: 'center',
            letterSpacing: 0.5,
        },
        colSet: { width: 30, alignItems: 'center', justifyContent: 'center' },
        colPrev: { flex: 1, alignItems: 'center', justifyContent: 'center' },
        // 64 rather than 76: the RPE column has to come out of the row's
        // fixed width, and the alternative was taking it from the PREVIOUS
        // column, which in PR mode holds a suggestion pill that then
        // truncated ("82.5 x ...", and "95 x ... PR" on a PR row, which is the
        // widest thing that column ever holds). These still hold a
        // five-character weight such as 100.5.
        colKg: { width: 64, marginHorizontal: 2 },
        colReps: { width: 64, marginHorizontal: 2 },
        colRpe: { width: 30, alignItems: 'center', justifyContent: 'center' },
        colCheck: { width: 30, alignItems: 'center' },
        rpeCell: {
            width: 26,
            height: 32,
            borderRadius: RADIUS.s,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.overlayInput,
        },
        rpeCellSet: { backgroundColor: withAlpha(safePrimary, lightTheme ? 0.14 : 0.20) },
        rpeText: { fontSize: 14, fontFamily: FONTS.semiBold, color: theme.textSecondary },
        rpeTextSet: { color: safePrimary, fontFamily: FONTS.bold },

        setsContainer: {
            backgroundColor: theme.surface,
        },
        swipeableContainer: {
            overflow: 'hidden',
            backgroundColor: theme.surface,
            marginBottom: -StyleSheet.hairlineWidth,
        },
        // RN 0.86 removed StyleSheet.absoluteFillObject — spreading it yielded
        // undefined (views silently fell into normal flow). absoluteFill is the
        // surviving equivalent; keep using it for all overlay fills.
        deleteBackground: {
            ...StyleSheet.absoluteFill,
            flexDirection: 'row',
            justifyContent: 'flex-end',
            // The action region stretches to row height via the default
            // cross-axis stretch (no alignItems:'center' / height:'100%').
        },
        deleteActionRegion: {
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: safeError,
        },
        deleteIconContainer: {
            alignItems: 'center',
            justifyContent: 'center',
        },
        rowForeground: {
            backgroundColor: 'transparent',
        },
        setRow: {
            backgroundColor: 'transparent',
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingVertical: 6,
            overflow: 'hidden',
            position: 'relative',
        },
        completedBackground: {
            ...StyleSheet.absoluteFill,
            backgroundColor: completedFill,
            zIndex: -1,
        },
        fillFlashOverlay: {
            backgroundColor: fillFlashColor,
            zIndex: 0,
        },
        setNumberBadge: {
            width: 20,
            height: 20,
            borderRadius: 4,
            backgroundColor: 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
        },
        setNumberText: {
            fontSize: 13,
            fontFamily: FONTS.bold,
            color: theme.textSecondary,
        },
        badgeWarmup: { backgroundColor: withAlpha(theme.warning, lightTheme ? 0.18 : 0.2) },
        // Pastels are illegible on light surfaces — use the stronger theme tones there
        textWarmup: { color: lightTheme ? theme.warning : '#fdcb6e' },
        badgeDrop: { backgroundColor: withAlpha(theme.info, lightTheme ? 0.16 : 0.2) },
        textDrop: { color: lightTheme ? theme.info : '#74b9ff' },

        prevContentWrapper: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 3,
        },
        prevText: {
            fontSize: 12,
            fontFamily: FONTS.regular,
            color: theme.textSecondary,
            textAlign: 'center',
            opacity: 0.7,
            flexShrink: 1,
        },
        suggestionText: {
            color: safePrimary,
            opacity: 1,
        },
        suggestionPill: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            alignSelf: 'center',
            backgroundColor: theme.overlayInput,
            borderRadius: 100,
            paddingHorizontal: 8,
            paddingVertical: 3.5,
            gap: 4,
        },
        suggestionPillText: {
            fontSize: 12.5,
            fontFamily: FONTS.semiBold,
            letterSpacing: -0.2,
            color: theme.text,
            fontVariant: ['tabular-nums'],
            flexShrink: 1,
        },
        prTargetPill: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            alignSelf: 'center',
            borderRadius: 100,
            paddingHorizontal: 8,
            paddingVertical: 3.5,
            gap: 5,
        },
        prTargetText: {
            fontSize: 12.5,
            fontFamily: FONTS.bold,
            letterSpacing: -0.2,
            fontVariant: ['tabular-nums'],
            flexShrink: 1,
        },
        prTargetBadge: {
            borderRadius: 4,
            paddingHorizontal: 4,
            paddingVertical: 1,
        },
        prTargetBadgeText: {
            fontSize: 8,
            fontFamily: FONTS.bold,
            color: '#FFFFFF',
            letterSpacing: 0.6,
        },

        inputContainer: {
            backgroundColor: lightTheme ? theme.background : theme.overlayInput,
            borderRadius: 8,
            height: 36,
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: lightTheme ? theme.border : theme.overlayBorder,
        },
        inputFocused: {
            borderColor: safePrimary,
            backgroundColor: lightTheme ? withAlpha(safePrimary, 0.08) : theme.overlayInputFocused,
        },
        inputDisabled: {
            opacity: 0.5,
            backgroundColor: 'transparent',
            borderWidth: 0,
        },
        textInputInternal: {
            textAlign: 'center',
            textAlignVertical: 'center',
            fontFamily: FONTS.bold,
            fontSize: 17,
            padding: 0,
            paddingHorizontal: 0,
            margin: 0,
            includeFontPadding: false,
        },
        checkButton: {
            width: 30,
            height: 30,
            borderRadius: 8,
            backgroundColor: lightTheme ? theme.background : theme.overlayBorder,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: lightTheme ? theme.border : theme.overlayBorder,
        },
        checkButtonCompleted: {
            backgroundColor: safeSuccess,
            borderColor: safeSuccess,
        },
        addSetButton: {
            paddingVertical: 12,
            alignItems: 'center',
            backgroundColor: lightTheme ? theme.overlaySubtle : theme.overlaySubtle,
            borderBottomLeftRadius: 16,
            borderBottomRightRadius: 16,
        },
        addSetText: {
            fontSize: 11,
            fontFamily: FONTS.bold,
            color: theme.primary,
            letterSpacing: 0.5,
        },
    });
};

export default React.memo(ExerciseEditable);