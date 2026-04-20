import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Modal, Pressable, Dimensions } from 'react-native';
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
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none"
                stroke={icon.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
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
            {
                opacity: pressed ? 0.7 : 1,
                transform: [{ scale: pressed ? 0.97 : 1 }],
            }
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
    iconType = 'default',
    id,
}) => {
    const { theme } = useTheme();
    const scale = useSharedValue(0.92);
    const opacity = useSharedValue(0);
    const [modalMounted, setModalMounted] = useState(false);

    useEffect(() => {
        if (visible) {
            setModalMounted(true);
            requestAnimationFrame(() => {
                opacity.value = withTiming(1, { duration: 150 });
                scale.value = withTiming(1, { duration: 150, easing: Easing.out(Easing.cubic) });
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
        // Use a slight delay to allow the animation to feel responsive
        setTimeout(() => onClose(id), 100);
    };

    const resolvedIconType = iconType ?? (
        buttons.some(b => b.style === 'destructive') ? 'destructive' : 'confirm'
    );

    return (
        <Modal transparent visible={modalMounted} animationType="none" onRequestClose={onClose}>
            <View style={styles.container}>
                <Animated.View style={[styles.backdrop, animatedBackdropStyle]}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => onClose(id)} />
                </Animated.View>

                <Animated.View style={[
                    styles.card,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                    animatedContentStyle,
                ]}>
                    {resolvedIconType && <AlertIcon type={resolvedIconType} />}

                    {title && (
                        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
                    )}
                    {description && (
                        <Text style={[styles.description, { color: theme.textSecondary }]}>
                            {description}
                        </Text>
                    )}

                    <View style={styles.buttonStack}>
                        {buttons.map((button, index) => {
                            const isDestructive = button.style === 'destructive';
                            const isCancel = button.style === 'cancel';

                            if (isCancel) {
                                return (
                                    <AnimatedButton
                                        key={index}
                                        style={[styles.ghostButton, { borderColor: theme.border }]}
                                        onPress={() => handleButtonPress(button.onPress)}
                                    >
                                        <Text style={[styles.ghostButtonText, { color: theme.textSecondary }]}>
                                            {button.text}
                                        </Text>
                                    </AnimatedButton>
                                );
                            }

                            return (
                                <AnimatedButton
                                    key={index}
                                    style={[
                                        styles.filledButton,
                                        { backgroundColor: isDestructive ? theme.danger : theme.primary },
                                    ]}
                                    onPress={() => handleButtonPress(button.onPress)}
                                >
                                    <Text style={[
                                        styles.filledButtonText,
                                        !isDestructive && { color: theme.textAlternate }
                                    ]}>
                                        {button.text}
                                    </Text>
                                </AnimatedButton>
                            );
                        })}
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.75)',
    },
    card: {
        width: width * 0.82,
        borderRadius: 28,
        borderWidth: 1,
        paddingTop: 28,
        paddingHorizontal: 16,
        paddingBottom: 20,
        alignItems: 'center',
        gap: 10,
        ...SHADOWS.medium,
    },
    iconCircle: {
        width: 52,
        height: 52,
        borderRadius: 26,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
    },
    title: {
        fontSize: 18,
        fontFamily: FONTS.bold,
        textAlign: 'center',
        paddingHorizontal: 8,
        letterSpacing: -0.3,
    },
    description: {
        fontSize: 14,
        fontFamily: FONTS.regular,
        textAlign: 'center',
        paddingHorizontal: 8,
        lineHeight: 20,
        marginBottom: 6,
    },
    buttonStack: {
        width: '100%',
        gap: 10,
    },
    filledButton: {
        width: '100%',
        paddingVertical: 15,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    filledButtonText: {
        fontSize: 16,
        fontFamily: FONTS.bold,
        color: '#fff',
        letterSpacing: 0.2,
    },
    ghostButton: {
        width: '100%',
        paddingVertical: 13,
        borderRadius: 16,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.04)',
    },
    ghostButtonText: {
        fontSize: 15,
        fontFamily: FONTS.semiBold,
    },
});

export default CustomAlert;