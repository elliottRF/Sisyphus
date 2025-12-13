import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming, runOnJS } from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../constants/theme';
import { useFocusEffect } from 'expo-router';
import Timer from '../app/timer/androidTimerModule';

const RestTimer = () => {
    const [timeLeft, setTimeLeft] = useState(0);
    const [defaultDuration, setDefaultDuration] = useState(180);
    const ignorePolls = React.useRef(false);

    // Animation values
    const scale = useSharedValue(1);
    const translateY = useSharedValue(0);

    useFocusEffect(
        useCallback(() => {
            loadSettings();
        }, [])
    );

    const loadSettings = async () => {
        try {
            const saved = await AsyncStorage.getItem('settings_default_timer');
            if (saved) setDefaultDuration(parseInt(saved, 10));
        } catch (e) {
            console.error("Failed to load timer settings", e);
        }
    };

    // Poll Native Timer
    useEffect(() => {
        const id = setInterval(async () => {
            if (ignorePolls.current) return;
            const remaining = await Timer.getRemaining();
            setTimeLeft(remaining);
        }, 200);

        return () => clearInterval(id);
    }, []);

    const startTimer = () => {
        if (timeLeft > 0) {
            Timer.stopTimer();
        } else {
            ignorePolls.current = true;
            setTimeLeft(defaultDuration); // Optimistic start
            Timer.startTimer(defaultDuration);

            // Resume polling after 1s
            setTimeout(() => { ignorePolls.current = false; }, 1000);

            scale.value = withSequence(
                withTiming(1.2, { duration: 100 }),
                withTiming(1, { duration: 100 })
            );
        }
    };

    const addTime = () => {
        if (timeLeft <= 0) return;
        const newTime = timeLeft + 30;

        ignorePolls.current = true;
        setTimeLeft(newTime); // Optimistic update
        Timer.startTimer(newTime);

        // Resume polling after 1s
        setTimeout(() => { ignorePolls.current = false; }, 1000);

        translateY.value = withSequence(
            withTiming(-10, { duration: 100 }),
            withTiming(0, { duration: 100 })
        );
    };

    const subtractTime = () => {
        if (timeLeft <= 0) return;
        const newTime = Math.max(0, timeLeft - 30);

        ignorePolls.current = true;
        setTimeLeft(newTime); // Optimistic update

        if (newTime === 0) Timer.stopTimer();
        else Timer.startTimer(newTime);

        // Resume polling after 1s
        setTimeout(() => { ignorePolls.current = false; }, 1000);

        translateY.value = withSequence(
            withTiming(10, { duration: 100 }),
            withTiming(0, { duration: 100 })
        );
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    // Gestures
    const tap = Gesture.Tap()
        .onEnd(() => {
            runOnJS(startTimer)();
        });

    const pan = Gesture.Pan()
        .activeOffsetY([-10, 10])
        .onEnd((e) => {
            if (e.translationY < -20) {
                runOnJS(addTime)();
            } else if (e.translationY > 20) {
                runOnJS(subtractTime)();
            }
        });

    const composed = Gesture.Simultaneous(tap, pan);

    const rStyle = useAnimatedStyle(() => {
        return {
            transform: [
                { scale: scale.value },
                { translateY: translateY.value }
            ]
        };
    });

    return (
        <GestureDetector gesture={composed}>
            <Animated.View style={[styles.container, rStyle]}>
                {timeLeft > 0 ? (
                    <Text style={styles.timerText}>{formatTime(timeLeft)}</Text>
                ) : (
                    <MaterialIcons name="timer" size={20} color={COLORS.primary} />
                )}
            </Animated.View>
        </GestureDetector>
    );
};

const styles = StyleSheet.create({
    container: {
        width: 48,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(64, 186, 173, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    timerText: {
        fontSize: 14,
        fontFamily: FONTS.bold,
        color: COLORS.primary,
    }
});

export default RestTimer;
