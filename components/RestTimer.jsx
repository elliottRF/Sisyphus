import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Vibration, Platform, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence, withTiming, runOnJS } from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';
import { COLORS, FONTS } from '../constants/theme';

// Configure notifications
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
    }),
});

const RestTimer = () => {
    const [timeLeft, setTimeLeft] = useState(0);
    const [isActive, setIsActive] = useState(false);
    const [sound, setSound] = useState();
    const endTimeRef = useRef(null);
    const appState = useRef(AppState.currentState);
    const isCompletingRef = useRef(false);

    // Animation values
    const scale = useSharedValue(1);
    const translateY = useSharedValue(0);

    const TIMER_KEY = 'SISYPHUS_TIMER_END';

    useEffect(() => {
        const subscription = AppState.addEventListener('change', nextAppState => {
            if (
                appState.current.match(/inactive|background/) &&
                nextAppState === 'active'
            ) {
                // App has come to the foreground
                syncTimer();
            }
            appState.current = nextAppState;
        });

        return () => {
            subscription.remove();
        };
    }, []);

    const syncTimer = async () => {
        try {
            const storedEndTime = await AsyncStorage.getItem(TIMER_KEY);
            if (storedEndTime) {
                const end = parseInt(storedEndTime, 10);
                const now = Date.now();
                if (end > now) {
                    const remaining = Math.ceil((end - now) / 1000);
                    endTimeRef.current = end;
                    setTimeLeft(remaining);
                    setIsActive(true);
                    isCompletingRef.current = false;
                } else {
                    // Timer finished while away
                    await AsyncStorage.removeItem(TIMER_KEY);
                    setTimeLeft(0);
                    setIsActive(false);
                    // Optionally handle completion if needed, but notification would have fired
                }
            }
        } catch (e) {
            console.error("Failed to sync timer", e);
        }
    };

    useEffect(() => {
        syncTimer();
    }, []);

    useEffect(() => {
        let interval = null;
        if (isActive && timeLeft > 0) {
            interval = setInterval(() => {
                const now = Date.now();
                if (endTimeRef.current) {
                    const remaining = Math.ceil((endTimeRef.current - now) / 1000);
                    if (remaining <= 0) {
                        clearInterval(interval);
                        handleTimerComplete();
                        setTimeLeft(0);
                    } else {
                        setTimeLeft(remaining);
                    }
                } else {
                    // Fallback if ref is missing (shouldn't happen if logic is correct)
                    setTimeLeft(prev => prev - 1);
                }
            }, 1000);
        } else if (timeLeft === 0 && isActive) {
            // Handle case where it hits 0 exactly
            setIsActive(false);
            if (interval) clearInterval(interval);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isActive, timeLeft]); // timeLeft dependency might cause re-creation of interval every second?
    // Optimization: timeLeft dependency is needed if we use functional update, but with Date.now() we rely on ref.
    // Actually, if we use Date.now(), we don't strictly need timeLeft in dependency if we don't use it inside.
    // But we need it to stop if <= 0.
    // Let's refine the interval hook.

    useEffect(() => {
        let interval = null;
        if (isActive) {
            interval = setInterval(() => {
                const now = Date.now();
                if (endTimeRef.current) {
                    const remaining = Math.ceil((endTimeRef.current - now) / 1000);
                    if (remaining <= 0) {
                        clearInterval(interval);
                        if (!isCompletingRef.current) {
                            handleTimerComplete();
                        }
                        setTimeLeft(0);
                    } else {
                        setTimeLeft(remaining);
                    }
                }
            }, 200); // Check more frequently for smoothness, though 1s is fine for display
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isActive]);


    useEffect(() => {
        // Request permissions
        async function requestPermissions() {
            const { status } = await Notifications.requestPermissionsAsync();
            if (status !== 'granted') {
                console.log('Notification permissions not granted');
            }
        }
        requestPermissions();

        // Load sound (placeholder)
        async function loadSound() {
            try {
                // User needs to add a sound file or we can use a default if available
                // For now, we'll just prepare the audio mode
                await Audio.setAudioModeAsync({
                    playsInSilentModeIOS: true,
                    staysActiveInBackground: true,
                    shouldDuckAndroid: true,
                });
            } catch (e) {
                console.log("Error loading sound", e);
            }
        }
        loadSound();

        return () => {
            if (sound) {
                sound.unloadAsync();
            }
        };
    }, []);

    const scheduleNotification = async (seconds) => {
        await Notifications.cancelAllScheduledNotificationsAsync();
        await Notifications.scheduleNotificationAsync({
            content: {
                title: "Rest Complete!",
                body: "Time to get back to work.",
                sound: true,
            },
            trigger: {
                seconds: seconds,
            },
        });
    };

    const handleTimerComplete = async () => {
        if (isCompletingRef.current) return;
        isCompletingRef.current = true;

        setIsActive(false);
        await AsyncStorage.removeItem(TIMER_KEY);
        endTimeRef.current = null;

        Vibration.vibrate([0, 500, 200, 500]);

        // Play sound if available
        try {
            const { sound } = await Audio.Sound.createAsync(require('../assets/ding.mp3'));
            setSound(sound);
            await sound.playAsync();
        } catch (e) {
            console.log("Error playing sound", e);
        }

        // Reset flag after a delay
        setTimeout(() => {
            isCompletingRef.current = false;
        }, 2000);
    };

    const startTimer = async () => {
        const duration = 120; // 2 minutes
        const end = Date.now() + duration * 1000;
        endTimeRef.current = end;
        await AsyncStorage.setItem(TIMER_KEY, end.toString());

        setTimeLeft(duration);
        setIsActive(true);
        scale.value = withSequence(withTiming(1.2, { duration: 100 }), withTiming(1, { duration: 100 }));

        await scheduleNotification(duration);
    };

    const addTime = async () => {
        if (!isActive) return;

        const newTimeLeft = timeLeft + 30;
        const end = Date.now() + newTimeLeft * 1000;
        endTimeRef.current = end;
        await AsyncStorage.setItem(TIMER_KEY, end.toString());

        setTimeLeft(newTimeLeft);
        translateY.value = withSequence(withTiming(-10, { duration: 100 }), withTiming(0, { duration: 100 }));

        await scheduleNotification(newTimeLeft);
    };

    const subtractTime = async () => {
        if (!isActive) return;

        const newTimeLeft = Math.max(0, timeLeft - 30);
        const end = Date.now() + newTimeLeft * 1000;
        endTimeRef.current = end;
        await AsyncStorage.setItem(TIMER_KEY, end.toString());

        setTimeLeft(newTimeLeft);
        translateY.value = withSequence(withTiming(10, { duration: 100 }), withTiming(0, { duration: 100 }));

        await scheduleNotification(newTimeLeft);
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    // Gestures
    const tap = Gesture.Tap()
        .onEnd(() => {
            if (!isActive && timeLeft === 0) {
                runOnJS(startTimer)();
            } else {
                // If active, reset to 2 mins? Or stop? 
                // User didn't specify behavior for tap while active.
                // Assuming reset/restart based on previous behavior.
                runOnJS(startTimer)();
            }
        });

    const pan = Gesture.Pan()
        .activeOffsetY([-10, 10])
        .onEnd((e) => {
            if (e.translationY < -20) {
                // Swipe Up
                runOnJS(addTime)();
            } else if (e.translationY > 20) {
                // Swipe Down
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
        width: 48, // Slightly wider for text
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
