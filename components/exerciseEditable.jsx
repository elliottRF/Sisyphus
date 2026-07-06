import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Dimensions, Pressable, Keyboard, TextInput } from 'react-native'
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withSpring,
    withSequence,
    runOnJS,
    LinearTransition,
    FadeIn,
    ZoomIn,
    Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';

import { FONTS, getThemedShadow, isLightTheme, withAlpha } from '../constants/theme'
import { Feather, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchLastWorkoutSets, fetchLifetimePRs } from './db';
import { useTheme } from '../context/ThemeContext';
import { formatWeight, unitLabel } from '../utils/units';
import { secondsToClock, minutesToClock, clockDigitsToDisplay, clockDigitsToMinutes } from '../utils/time';
import * as Haptics from 'expo-haptics';
import {
    getPRType,
    useWorkoutSuggestions,
} from './suggestions';
import { on, AppEvents } from '../utils/events';
import CustomAlert from './CustomAlert';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = -100;

// Kill-switch for the LinearTransition layout animations, kept from the leak
// investigation (project memory: perf-slowdown-investigation). The proven
// leaks were scrolled-Animated.View retention and interrupted `exiting`
// animations — layout transitions were likely convicted by confounded tests,
// so they're back ON. If a Views-drill ever implicates them again, flip this.
const DISABLE_LAYOUT_ANIMS = false;
const layoutAnim = DISABLE_LAYOUT_ANIMS ? undefined : LinearTransition.duration(200).easing(Easing.out(Easing.ease));

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
    const styles = getStyles(theme);
    const translateX = useSharedValue(0);

    const pan = Gesture.Pan()
        .activeOffsetX([-10, 10])
        .failOffsetY([-5, 5])
        .onUpdate((event) => {
            if (isExerciseDragging) return;
            translateX.value = Math.min(event.translationX, 0);
        })
        .onEnd(() => {
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
            <Animated.View style={styles.deleteBackground}>
                <Animated.View style={[styles.deleteActionRegion, rRedBoxStyle]}>
                    <Animated.View style={[styles.deleteIconContainer, rIconStyle]}>
                        <Feather name="trash-2" size={18} color={theme.text} />
                    </Animated.View>
                </Animated.View>
            </Animated.View>
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
    const displayedTextRef = useRef(columnText);

    useEffect(() => {
        if (columnText === displayedTextRef.current) return;
        displayedTextRef.current = columnText;
        if (columnText === displayedText) {
            // Changed back before a pending swap committed — just restore.
            cellTextOpacity.value = withTiming(1, { duration: 160 });
            return;
        }
        cellTextOpacity.value = withTiming(0, { duration: 110 }, (finished) => {
            if (finished) runOnJS(setDisplayedText)(columnText);
        });
    }, [columnText, displayedText, cellTextOpacity]);

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
                style={[StyleSheet.absoluteFillObject, styles.fillFlashOverlay, flashOverlayStyle]}
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
                                        <Text style={styles.prTargetBadgeText}>PR</Text>
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
    isTemplate = false,
    hidePrevious = false,
    muscleOccurrenceIndex = 1,
    PRMODE = false,
    onReorderStart,
    onReorderEnd,
    reorderFingerY
}) => {
    const { theme, useImperial, repRangeMin, repRangeMax } = useTheme();
    const styles = getStyles(theme);
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

    const sanitizeDecimal = (text) => {
        let cleaned = text.replace(/[^0-9.]/g, '');
        if (cleaned.startsWith('.')) cleaned = '0' + cleaned;
        const parts = cleaned.split('.');
        if (parts.length > 2) cleaned = parts[0] + '.' + parts.slice(1).join('');
        return cleaned;
    };

    const sanitizeInteger = (text) => text.replace(/[^0-9]/g, '');

    const handleWeightChange = (text, setIndex) => {
        const sanitized = sanitizeDecimal(text);
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.map(e => e.id === exercise.id ? { ...e, sets: e.sets.map((s, i) => i === setIndex ? { ...s, weight: sanitized } : s) } : e) } : w));
    };
    const handleRepsChange = (text, setIndex) => {
        const sanitized = sanitizeInteger(text);
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.map(e => e.id === exercise.id ? { ...e, sets: e.sets.map((s, i) => i === setIndex ? { ...s, reps: sanitized } : s) } : e) } : w));
    };
    const handleDistanceChange = (text, setIndex) => {
        const sanitized = sanitizeDecimal(text);
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.map(e => e.id === exercise.id ? { ...e, sets: e.sets.map((s, i) => i === setIndex ? { ...s, distance: sanitized } : s) } : e) } : w));
    };
    const handleMinutesChange = (text, setIndex) => {
        // Arrives from the clock field already parsed to (fractional) minutes —
        // may carry a decimal (12.5 === 12:30), so no integer sanitizing here.
        const value = text === '' || text == null ? null : String(text);
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.map(e => e.id === exercise.id ? { ...e, sets: e.sets.map((s, i) => i === setIndex ? { ...s, minutes: value } : s) } : e) } : w));
    };

    const toggleSetComplete = (setIndex) => {
        if (isTemplate) return;
        const set = exercise.sets[setIndex];
        if (!set.completed) {
            Keyboard.dismiss();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (onSetComplete) onSetComplete();
        }
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.map(e => e.id === exercise.id ? { ...e, sets: e.sets.map((s, i) => i === setIndex ? { ...s, completed: !s.completed } : s) } : e) } : w));
    };

    const toggleSetType = (setIndex) => {
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.map(e => e.id === exercise.id ? { ...e, sets: e.sets.map((s, i) => { if (i === setIndex) { const t = s.setType || 'N'; const n = t === 'N' ? 'W' : t === 'W' ? 'D' : 'N'; return { ...s, setType: n }; } return s; }) } : e) } : w));
    };
    const handleNoteChange = (text) => {
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.map(e => e.id === exercise.id ? { ...e, notes: text } : e) } : w));
    };
    const addNewSet = () => {
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.map(e => e.id === exercise.id ? { ...e, sets: [...e.sets, { id: Date.now().toString() + Math.random().toString(36).substr(2, 9), weight: null, reps: null, distance: null, minutes: null, completed: false, setType: 'N' }] } : e) } : w));
    };
    const deleteSet = (setIndex) => {
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? { ...w, exercises: w.exercises.map(e => e.id === exercise.id ? { ...e, sets: e.sets.filter((_, i) => i !== setIndex) } : e) } : w));
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
    const handleConfirmDelete = () => {
        deleteAnim.value = withTiming(1, { duration: 200 }, (finished) => {
            if (finished) runOnJS(deleteExercise)();
        });
    };

    const fillFromPrevious = (setIndex, fillData) => {
        if (!fillData) return;
        const currentSet = exercise.sets[setIndex];
        if (currentSet.completed) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        updateCurrentWorkout(prev => prev.map(w => w.id === workoutID ? {
            ...w,
            exercises: w.exercises.map(e => e.id === exercise.id ? {
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
    };

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
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
    const setsDone = exercise.sets.filter(s => s.completed).length;
    const showSetProgress = !isTemplate && !hidePrevious && exercise.sets.length > 0;
    const allSetsDone = showSetProgress && setsDone === exercise.sets.length;

    let prevWarmupIndex = 0;
    let prevWorkingIndex = 0;
    let suggestWorkingIndex = 0;
    let suggestWarmupIndex = 0;

    const headerLeftContent = (
        <>
            <View style={styles.dragHandle}>
                <MaterialIcons name="drag-indicator" size={20} color={theme.textSecondary} />
            </View>
            <TouchableOpacity
                onPress={onOpenDetails}
                style={{ flex: 1 }}
            >
                <Text style={styles.exerciseName} numberOfLines={1}>{exerciseName}</Text>
            </TouchableOpacity>
        </>
    );

    return (
        <Animated.View
            style={[styles.container, animatedDeleteStyle]}
            layout={layoutAnim}
        >
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
                        onPress={() => setIsNoteVisible(!isNoteVisible)}
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
                <Text style={[styles.columnHeader, styles.colKg]}>{isCardio ? "DIST (km)" : (isAssisted ? `ASSIST (${unitLabel(useImperial)})` : unitLabel(useImperial).toUpperCase())}</Text>
                <Text style={[styles.columnHeader, styles.colReps]}>{isCardio ? "TIME" : "REPS"}</Text>
                {!isTemplate && <View style={styles.colCheck}><Feather name="check" size={12} color={theme.textSecondary} /></View>}
            </View>

            {/* Sets */}
            <Animated.View
                style={styles.setsContainer}
                layout={layoutAnim}
            >
                {exercise.sets.reduce((acc, set, index) => {
                    let displayNumber = index + 1;
                    if (set.setType === 'W') displayNumber = 'W';
                    else if (set.setType === 'D') displayNumber = 'D';
                    else {
                        const normalSetCount = exercise.sets.slice(0, index).filter(s => !s.setType || s.setType === 'N').length;
                        displayNumber = normalSetCount + 1;
                    }

                    let prevSetText = '-';
                    let prevSet = null;
                    prevSet = set.setType === 'W'
                        ? prevWarmups[prevWarmupIndex++]
                        : prevWorking[prevWorkingIndex++];

                    if (prevSet) {
                        if (isCardio) {
                            prevSetText = `${prevSet.distance || 0}km / ${secondsToClock(prevSet.seconds || 0)}`;
                        } else {
                            prevSetText = `${formatWeight(prevSet.weight, useImperial)} × ${prevSet.reps}`;
                        }
                    }

                    let suggestionText = '-';
                    let computedSuggestion = null;
                    let fillData = null;

                    if (showSuggestion) {
                        const isWarmup = set.setType === 'W';
                        if (isWarmup) {
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
                            const suggestIndex = suggestWorkingIndex++;
                            const computed = workingSuggestions[suggestIndex];
                            if (computed) {
                                // "min+" on a weight increase: do at least the min reps, push for more.
                                const repsLabel = computed.isWeightIncrease ? `${computed.reps}+` : `${computed.reps}`;
                                suggestionText = `${formatWeight(computed.weight, useImperial)} × ${repsLabel}`;
                                computedSuggestion = computed;
                                fillData = { weight: computed.weight, reps: computed.reps };
                            }
                        }
                    } else if (prevSet) {
                        if (isCardio) {
                            fillData = {
                                distance: prevSet.distance || 0,
                                // Exact fractional minutes so seconds survive the fill.
                                minutes: prevSet.seconds ? prevSet.seconds / 60 : 0,
                            };
                        } else {
                            fillData = { weight: prevSet.weight || 0, reps: prevSet.reps || 0 };
                        }
                    }

                    const columnText = showSuggestion ? suggestionText : prevSetText;

                    const prType = getPRType(computedSuggestion, lifetimePRs, isCardio);
                    const isLifetimePRSuggestion =
                        showSuggestion &&
                        lifetimePRs !== null &&
                        prType !== null;

                    acc.push(
                        <Animated.View
                            key={set.id || index}
                            entering={hasMountedRef.current ? FadeIn.duration(180) : undefined}
                            // No `exiting` here: rapid removals interrupt exit
                            // animations mid-flight and Reanimated permanently
                            // retains the detached views (measured: Views count
                            // never recovers). It's also visually redundant — a
                            // swiped row has already slid off-screen, and rows
                            // removed with a whole card are covered by the
                            // card's own fade. The layout transition below
                            // still slides the remaining rows up.
                            layout={layoutAnim}
                        >
                            <SwipeableSetRow
                                onDelete={() => deleteSet(index)}
                                index={index}
                                simultaneousHandlers={simultaneousHandlers}
                                isExerciseDragging={false}
                                completed={set.completed}
                            >
                                <SetRowBody
                                    set={set}
                                    index={index}
                                    displayNumber={displayNumber}
                                    isTemplate={isTemplate}
                                    hidePrevious={hidePrevious}
                                    columnText={columnText}
                                    fillData={fillData}
                                    showSuggestion={showSuggestion}
                                    computedSuggestion={computedSuggestion}
                                    isLifetimePRSuggestion={isLifetimePRSuggestion}
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
                                    fillAllToken={fillAllToken}
                                />
                            </SwipeableSetRow>
                        </Animated.View>
                    );
                    return acc;
                }, [])}
            </Animated.View>

            {/* Footer */}
            <Animated.View layout={layoutAnim}>
                <TouchableOpacity style={styles.addSetButton} onPress={addNewSet} activeOpacity={0.6}>
                    <Text style={styles.addSetText}>+ ADD SET</Text>
                </TouchableOpacity>
            </Animated.View>

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
    );
};

const getStyles = (theme) => {
    const isDynamic = theme.type === 'dynamic';
    const lightTheme = isLightTheme(theme);
    const safeSurface = isDynamic ? '#1e1e1e' : theme.surface;
    const safeError = isDynamic ? '#EF4444' : (theme.error || '#EF4444');
    const safePrimary = isDynamic ? '#2DC4B6' : theme.primary;
    const safeSuccess = isDynamic ? '#22c55e' : (theme.success || '#22c55e');
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
        colKg: { width: 76, marginHorizontal: 2 },
        colReps: { width: 76, marginHorizontal: 2 },
        colCheck: { width: 30, alignItems: 'center' },

        setsContainer: {
            backgroundColor: theme.surface,
        },
        swipeableContainer: {
            overflow: 'hidden',
            backgroundColor: theme.surface,
            marginBottom: -StyleSheet.hairlineWidth,
        },
        deleteBackground: {
            ...StyleSheet.absoluteFillObject,
            flexDirection: 'row',
            justifyContent: 'flex-end',
            alignItems: 'center',
        },
        deleteActionRegion: {
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: safeError,
            height: '100%',
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
            ...StyleSheet.absoluteFillObject,
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