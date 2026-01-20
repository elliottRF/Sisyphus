import React, { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming, runOnJS } from 'react-native-reanimated';

import { MaterialIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { COLORS, FONTS } from '../constants/theme';
import { useFocusEffect } from 'expo-router';
import Timer from '../app/timer/androidTimerModule';

const RestTimer = forwardRef((props, ref) => {
    const [timeLeft, setTimeLeft] = useState(0);
    const [defaultDuration, setDefaultDuration] = useState(180);
    const targetEndTimeRef = useRef(null); // The absolute timestamp when the timer should end
    const timerRunning = useRef(false); // Track if we consider the timer active
    const frameIdRef = useRef(null); // RAF ID for smooth UI updates


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

    // UI Update Loop using requestAnimationFrame for smoothness
    const updateUI = useCallback(() => {
        if (!timerRunning.current || !targetEndTimeRef.current) {
            return;
        }

        const now = Date.now();
        const diff = targetEndTimeRef.current - now;

        if (diff <= 0) {
            setTimeLeft(0);
            timerRunning.current = false;
            targetEndTimeRef.current = null;
            return;
        }

        const secondsRemaining = Math.ceil(diff / 1000);
        setTimeLeft(secondsRemaining);

        frameIdRef.current = requestAnimationFrame(updateUI);
    }, []);

    // Initial Sync
    useEffect(() => {
        const syncInitial = async () => {
            const remaining = await Timer.getRemaining();
            if (remaining > 0) {
                targetEndTimeRef.current = Date.now() + (remaining * 1000);
                timerRunning.current = true;
                updateUI();
            }
        };
        syncInitial();

        return () => {
            if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current);
        };
    }, []);

    // Play "Ding" sound helper
    const playDing = async () => {
        try {
            const { sound } = await Audio.Sound.createAsync(
                require('../assets/notifications/dingnoti.wav'),
                { volume: 1.0 }
            );
            await sound.playAsync();

            // Cleanup when done
            sound.setOnPlaybackStatusUpdate(async (status) => {
                if (status.didJustFinish) {
                    await sound.unloadAsync();
                }
            });
        } catch (error) {
            console.error("Failed to play ding", error);
        }
    };

    useImperativeHandle(ref, () => ({
        startIfStopped: () => {
            // Only start if NOT already running
            if (!timerRunning.current) {
                console.log("Auto-starting timer from set completion");
                startTimer();
            }
        },
        stopTimer: () => {
            if (timerRunning.current) {
                console.log("Stopping timer from parent");
                startTimer(); // Toggle off
            }
        }
    }));

    const internalStop = (playAudio = false) => {
        // Clear Native Persistence (Hack: start with 0 to overwrite any lingering time)
        Timer.startTimer(0);
        Timer.stopTimer();

        targetEndTimeRef.current = null;
        timerRunning.current = false;
        setTimeLeft(0);
        if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current);

        if (playAudio) playDing();
    };

    useImperativeHandle(ref, () => ({
        startIfStopped: () => {
            // Only start if NOT already running
            if (!timerRunning.current) {
                console.log("Auto-starting timer from set completion");
                startTimer();
            }
        },
        stopTimer: () => {
            if (timerRunning.current) {
                console.log("Stopping timer from parent (silent)");
                internalStop(false); // Silent Stop
            }
        }
    }));

    const startTimer = () => {
        console.log("startTimer called (Tap)");

        if (timerRunning.current) {
            // STOP (Manual Tap -> Play Sound)
            internalStop(true);
        } else {
            // START
            targetEndTimeRef.current = Date.now() + (defaultDuration * 1000);
            timerRunning.current = true;
            Timer.startTimer(defaultDuration);
            updateUI(); // Start loop

            scale.value = withSequence(
                withTiming(1.2, { duration: 100 }),
                withTiming(1, { duration: 100 })
            );
        }
    };

    const addTime = () => {
        console.log("addTime called (Swipe Up)");

        // If not running, assume starting from 0? Or just return? 
        // Assuming we want to start it if stopped, or add to it if running.
        let newDuration = 30;

        if (timerRunning.current && targetEndTimeRef.current) {
            const currentRemaining = Math.max(0, Math.ceil((targetEndTimeRef.current - Date.now()) / 1000));
            newDuration = currentRemaining + 30;
        }

        targetEndTimeRef.current = Date.now() + (newDuration * 1000);
        timerRunning.current = true;

        // Optimistically update immediately
        setTimeLeft(newDuration);

        Timer.startTimer(newDuration); // Sync native

        // Ensure loop is running
        if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current);
        updateUI();

        translateY.value = withSequence(
            withTiming(-10, { duration: 100 }),
            withTiming(0, { duration: 100 })
        );
    };

    const subtractTime = () => {
        if (!timerRunning.current || !targetEndTimeRef.current) return;

        const currentRemaining = Math.max(0, Math.ceil((targetEndTimeRef.current - Date.now()) / 1000));
        const newDuration = Math.max(0, currentRemaining - 30);

        if (newDuration === 0) {
            internalStop(true); // Manual Swipe to 0 -> Play Sound
        } else {
            targetEndTimeRef.current = Date.now() + (newDuration * 1000);
            setTimeLeft(newDuration);
            Timer.startTimer(newDuration);
            // Ensure loop is running
            if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current);
            updateUI();
        }

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

    const composed = Gesture.Race(pan, tap);

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
});

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
