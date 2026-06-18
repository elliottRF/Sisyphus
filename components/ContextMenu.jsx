import React, { useState } from 'react';
import { Modal, Pressable, View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONTS, getThemedShadow } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const MENU_WIDTH = 230;
const ROW_HEIGHT = 47;
const HEADER_HEIGHT = 56;

/**
 * Anchored hold-menu, desktop right-click style: zooms in at the press point,
 * zooms back out on dismiss. Closing is two-step (unmount the menu view so
 * its exit animation plays, then tear down the modal); item actions run after
 * the close animation.
 *
 * anchor: { x, y } page coordinates of the press.
 * items:  [{ icon, label, onPress, tint?, destructive? }]
 * header: optional non-pressable info row { icon, title, subtitle?, color? }
 */
const ContextMenu = ({ anchor, items, onClose, header }) => {
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();
    const styles = getStyles(theme);
    const [closing, setClosing] = useState(false);

    const close = (afterClose) => {
        if (closing) return;
        setClosing(true);
        setTimeout(() => {
            onClose();
            afterClose?.();
        }, 140);
    };

    const menuHeight = items.length * ROW_HEIGHT + (header ? HEADER_HEIGHT : 0);
    const position = {
        left: Math.min(Math.max(16, anchor.x - MENU_WIDTH / 2), SCREEN_WIDTH - MENU_WIDTH - 16),
        top: Math.min(Math.max(insets.top + 16, anchor.y - 20), SCREEN_HEIGHT - menuHeight - 60),
    };

    return (
        <Modal transparent animationType="none" statusBarTranslucent onRequestClose={() => close()}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => close()}>
                {!closing && (
                    <Animated.View
                        entering={ZoomIn.duration(140)}
                        exiting={ZoomOut.duration(120)}
                        style={[styles.menu, position]}
                    >
                        {header && (
                            <View style={styles.header}>
                                <Feather
                                    name={header.icon}
                                    size={15}
                                    color={header.color || theme.textSecondary}
                                />
                                <View style={styles.headerTextWrap}>
                                    <Text style={[styles.headerTitle, header.color && { color: header.color }]} numberOfLines={1}>
                                        {header.title}
                                    </Text>
                                    {header.subtitle ? (
                                        <Text style={styles.headerSubtitle} numberOfLines={1}>
                                            {header.subtitle}
                                        </Text>
                                    ) : null}
                                </View>
                            </View>
                        )}
                        {header && <View style={styles.divider} />}
                        {items.map((item, i) => (
                            <React.Fragment key={item.label}>
                                {i > 0 && <View style={styles.divider} />}
                                <TouchableOpacity
                                    style={styles.row}
                                    activeOpacity={0.6}
                                    onPress={() => close(item.onPress)}
                                >
                                    <Feather
                                        name={item.icon}
                                        size={16}
                                        color={item.destructive ? theme.danger : item.tint ? theme.primary : theme.text}
                                    />
                                    <Text style={[styles.text, item.destructive && { color: theme.danger }]}>
                                        {item.label}
                                    </Text>
                                </TouchableOpacity>
                            </React.Fragment>
                        ))}
                    </Animated.View>
                )}
            </Pressable>
        </Modal>
    );
};

const getStyles = (theme) => StyleSheet.create({
    menu: {
        position: 'absolute',
        width: MENU_WIDTH,
        backgroundColor: theme.surfaceElevated || theme.surface,
        borderRadius: 14,
        overflow: 'hidden',
        ...getThemedShadow(theme, 'medium'),
        elevation: 12,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 16,
        height: HEADER_HEIGHT,
    },
    headerTextWrap: {
        flex: 1,
    },
    headerTitle: {
        fontSize: 13.5,
        fontFamily: FONTS.semiBold,
        color: theme.text,
    },
    headerSubtitle: {
        fontSize: 11.5,
        fontFamily: FONTS.regular,
        color: theme.textSecondary,
        marginTop: 1,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        height: ROW_HEIGHT,
    },
    text: {
        fontSize: 15,
        fontFamily: FONTS.medium,
        color: theme.text,
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: theme.border,
    },
});

export default ContextMenu;
