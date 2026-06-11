import React, { forwardRef, useImperativeHandle, useMemo } from 'react';
import { Text, StyleSheet } from 'react-native';
import Animated, {
    FadeIn,
    FadeOut,
    useSharedValue,
    useAnimatedStyle,
    useAnimatedReaction,
    withTiming,
    runOnJS,
} from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { FONTS } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

const ROW_MAX = 56;
const ROW_MIN = 34;
const ROW_GAP = 6;
const V_PAD = 12;
const H_PAD = 14;

/**
 * Full-area reorder overlay. Covers the workout list while a card is held:
 * every exercise becomes a compact name row, the held row tracks the finger
 * directly (positioned from the gesture's absolute Y — no scrolling or
 * measurement involved), the rest animate out of the way.
 *
 * The final order is read imperatively via ref.getOrder() when the gesture
 * ends, so the drag itself never touches React state.
 */
const ReorderOverlay = forwardRef(({ rows, activeId, fingerY, frame }, ref) => {
    const { theme } = useTheme();
    const styles = getStyles(theme);

    const count = Math.max(1, rows.length);
    // Shrink rows so the whole list always fits in the overlay — the finger
    // can then reach any position without any scrolling.
    const rowH = Math.max(ROW_MIN, Math.min(ROW_MAX, Math.floor((frame.height - V_PAD * 2) / count)));

    // Anchor the stack so the held exercise's slot opens exactly under the
    // finger (clamped to keep the stack on screen). Holding without moving
    // is then a no-op, and the surrounding rows sit close around the finger.
    const { stackTop, initialOrder } = useMemo(() => {
        const activeIndex = Math.max(0, rows.findIndex(r => String(r.id) === String(activeId)));
        const fingerLocal = fingerY.value - frame.y;
        const desired = fingerLocal - (activeIndex + 0.5) * rowH;
        const maxTop = Math.max(V_PAD, frame.height - V_PAD - count * rowH);
        return {
            stackTop: Math.min(maxTop, Math.max(V_PAD, desired)),
            initialOrder: rows.map(r => String(r.id)),
        };
        // Computed once per reorder session — the overlay remounts each time.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const orderSV = useSharedValue(initialOrder);

    useImperativeHandle(ref, () => ({
        getOrder: () => orderSV.value,
    }), [orderSV]);

    const tick = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Finger position -> target slot. Reordering happens entirely on the UI
    // thread; only the haptic tick hops to JS.
    useAnimatedReaction(
        () => {
            const local = fingerY.value - frame.y - stackTop;
            return Math.max(0, Math.min(count - 1, Math.floor(local / rowH)));
        },
        (target, previous) => {
            // First run fires for the starting position — never reorder on it.
            if (previous === null) return;
            const order = orderSV.value;
            const from = order.indexOf(String(activeId));
            if (from !== -1 && target !== from) {
                const next = order.slice();
                next.splice(from, 1);
                next.splice(target, 0, String(activeId));
                orderSV.value = next;
                runOnJS(tick)();
            }
        },
        [count, rowH, activeId, frame.y, stackTop]
    );

    return (
        <Animated.View
            entering={FadeIn.duration(120)}
            exiting={FadeOut.duration(150)}
            style={styles.overlay}
            pointerEvents="none"
        >
            {rows.map((row, initialIndex) => (
                <OverlayRow
                    key={String(row.id)}
                    row={row}
                    initialIndex={initialIndex}
                    isActive={String(row.id) === String(activeId)}
                    orderSV={orderSV}
                    fingerY={fingerY}
                    frameY={frame.y}
                    stackTop={stackTop}
                    rowH={rowH}
                    count={count}
                    styles={styles}
                    theme={theme}
                />
            ))}
        </Animated.View>
    );
});

const OverlayRow = ({ row, initialIndex, isActive, orderSV, fingerY, frameY, stackTop, rowH, count, styles, theme }) => {
    // Rows are laid out statically at their starting slot; only the delta to
    // their current slot is animated, so nothing flies in on mount.
    const baseTop = stackTop + initialIndex * rowH;

    const animatedStyle = useAnimatedStyle(() => {
        if (isActive) {
            const y = fingerY.value - frameY - rowH / 2;
            const clamped = Math.max(stackTop, Math.min(stackTop + (count - 1) * rowH, y));
            return {
                transform: [{ translateY: clamped - baseTop }],
                zIndex: 10,
            };
        }
        const idx = orderSV.value.indexOf(String(row.id));
        const target = stackTop + Math.max(0, idx) * rowH;
        return {
            transform: [{ translateY: withTiming(target - baseTop, { duration: 160 }) }],
            zIndex: 0,
        };
    }, [isActive, rowH, count, frameY, stackTop, baseTop]);

    return (
        <Animated.View style={[styles.row, { height: rowH - ROW_GAP, top: baseTop }, isActive && styles.rowActive, animatedStyle]}>
            <MaterialIcons
                name="drag-indicator"
                size={18}
                color={isActive ? theme.primary : theme.textSecondary}
                style={styles.rowIcon}
            />
            <Text style={[styles.rowLabel, isActive && styles.rowLabelActive]} numberOfLines={1}>
                {row.label}
            </Text>
            {row.meta ? <Text style={styles.rowMeta}>{row.meta}</Text> : null}
        </Animated.View>
    );
};

const getStyles = (theme) => StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: theme.background,
        zIndex: 1000,
        elevation: 1000,
    },
    row: {
        position: 'absolute',
        top: 0,
        left: H_PAD,
        right: H_PAD,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        borderRadius: 12,
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
    },
    rowActive: {
        borderColor: theme.primary,
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
    },
    rowIcon: {
        marginRight: 8,
    },
    rowLabel: {
        flex: 1,
        fontSize: 14,
        fontFamily: FONTS.semiBold,
        color: theme.text,
    },
    rowLabelActive: {
        color: theme.primary,
    },
    rowMeta: {
        fontSize: 12,
        fontFamily: FONTS.regular,
        color: theme.textSecondary,
        marginLeft: 8,
    },
});

export default ReorderOverlay;
