import React, { useEffect, useState } from 'react';
import {
    StyleSheet,
    Text,
    View,
    Modal,
    Pressable,
    Dimensions,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform
} from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    Easing,
} from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';
import { FONTS, SHADOWS } from '../constants/theme';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';

const { width } = Dimensions.get('window');

const ICON_MAP = {
    destructive: { path: 'M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z', color: '#ef4444' },
    confirm: { path: 'M20 6L9 17l-5-5', color: '#2563eb' },
    default: { path: 'M12 8v4m0 4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z', color: '#2563eb' },
};

const AlertIcon = ({ type }) => {
    const icon = ICON_MAP[type] ?? ICON_MAP.default;
    return (
        <View style={[styles.iconCircle, {
            backgroundColor: icon.color + '1a',
            borderColor: icon.color + '33',
        }]}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"
                stroke={icon.color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <Path d={icon.path} />
            </Svg>
        </View>
    );
};

const AnimatedButton = ({ style, children, onPress }) => (
    <Pressable
        onPress={onPress}
        style={({ pressed }) => [
            style,
            { opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }
        ]}
    >
        {children}
    </Pressable>
);

const CustomAlert = ({
    visible,
    title,
    description,
    buttons = [],
    onClose,
    iconType,
    id,
    children,
    onShow,
}) => {
    const { theme } = useTheme();
    const scale = useSharedValue(0.92);
    const opacity = useSharedValue(0);
    const [modalMounted, setModalMounted] = useState(false);

    useEffect(() => {
        if (visible) {
            setModalMounted(true);
            requestAnimationFrame(() => {
                opacity.value = withTiming(1, { duration: 180 });
                scale.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
            });
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } else {
            opacity.value = withTiming(0, { duration: 150 });
            scale.value = withTiming(0.95, { duration: 150 });
            setTimeout(() => setModalMounted(false), 150);
        }
    }, [visible]);

    const animatedBackdropStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
    const animatedContentStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ scale: scale.value }],
    }));

    const handleButtonPress = (onPress) => {
        if (onPress) onPress();
        setTimeout(() => onClose?.(id), 100);
    };

    const resolvedIconType = iconType !== undefined
        ? iconType
        : (buttons.some(b => b.style === 'destructive') ? 'destructive' : 'confirm');

    const isRow = buttons.length === 2;
    const isShowing = visible || modalMounted;

    return (
        <Modal
            transparent
            visible={isShowing}
            animationType="none"
            onRequestClose={() => onClose?.(id)}
            onShow={onShow}
        >
            <KeyboardAvoidingView
                style={styles.container}
                behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
            >
                <Animated.View style={[styles.backdrop, animatedBackdropStyle]}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => onClose?.(id)} />
                </Animated.View>

                <Animated.View style={[
                    styles.card,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                    animatedContentStyle,
                ]}>
                    {resolvedIconType && <AlertIcon type={resolvedIconType} />}

                    {title && <Text style={[styles.title, { color: theme.text }]}>{title}</Text>}
                    {description && (
                        <Text style={[styles.description, { color: theme.textSecondary }]}>
                            {description}
                        </Text>
                    )}

                    {children}

                    <View style={[styles.buttonContainer, isRow && styles.buttonRow]}>
                        {buttons.map((button, index) => {
                            const isDestructive = button.style === 'destructive';
                            const isCancel = button.style === 'cancel';

                            const baseButtonStyle = isCancel
                                ? [styles.ghostButton, { borderColor: theme.border }]
                                : [styles.filledButton, { backgroundColor: isDestructive ? theme.danger : theme.primary }];

                            const rowStyle = isRow ? { flex: 1 } : { width: '100%' };

                            return (
                                <AnimatedButton
                                    key={index}
                                    style={[...baseButtonStyle, rowStyle]}
                                    onPress={() => handleButtonPress(button.onPress)}
                                >
                                    {button.loading ? (
                                        <ActivityIndicator color={isCancel ? theme.textSecondary : theme.textAlternate} size="small" />
                                    ) : (
                                        <Text style={[
                                            isCancel ? styles.ghostButtonText : styles.filledButtonText,
                                            isCancel ? { color: theme.textSecondary } : (!isDestructive && { color: theme.textAlternate })
                                        ]}>
                                            {button.text}
                                        </Text>
                                    )}
                                </AnimatedButton>
                            );
                        })}
                    </View>
                </Animated.View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.75)' },
    card: {
        width: width * 0.72,
        maxWidth: 320,
        borderRadius: 20,
        borderWidth: 1,
        paddingTop: 18,
        paddingHorizontal: 16,
        paddingBottom: 16,
        alignItems: 'center',
        gap: 6,
        ...SHADOWS.medium,
    },
    iconCircle: {
        width: 38, height: 38, borderRadius: 19, borderWidth: 1,
        alignItems: 'center', justifyContent: 'center', marginBottom: 2,
    },
    title: { fontSize: 16, fontFamily: FONTS.bold, textAlign: 'center', paddingHorizontal: 4, letterSpacing: -0.2 },
    description: { fontSize: 13, fontFamily: FONTS.regular, textAlign: 'center', lineHeight: 18, marginBottom: 8 },
    buttonContainer: { width: '100%', gap: 8, marginTop: 2 },
    buttonRow: { flexDirection: 'row' },
    filledButton: { paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    filledButtonText: { fontSize: 14, fontFamily: FONTS.bold, color: '#fff', letterSpacing: 0.1 },
    ghostButton: { paddingVertical: 10, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)' },
    ghostButtonText: { fontSize: 14, fontFamily: FONTS.semiBold },
});

export default CustomAlert;