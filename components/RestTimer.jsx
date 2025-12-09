import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Vibration, Platform, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming, runOnJS } from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';
import { COLORS, FONTS } from '../constants/theme';

// Configure notifications
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
    }),
});

const RestTimer = () => {
    const [timeLeft, setTimeLeft] = useState(0);
    const [isActive, setIsActive] = useState(false);
    const [completionSound, setCompletionSound] = useState();
    const [backgroundSound, setBackgroundSound] = useState();
    const endTimeRef = useRef(null);
    const appState = useRef(AppState.currentState);
    const isCompletingRef = useRef(false);
    const checkIntervalRef = useRef(null);
    const persistentNotificationIdRef = useRef(null);
    const updateNotificationIntervalRef = useRef(null);

    // Animation values
    const scale = useSharedValue(1);
    const translateY = useSharedValue(0);

    const TIMER_KEY = 'SISYPHUS_TIMER_END';

    // Initialize audio system
    useEffect(() => {
        async function initAudio() {
            try {
                await Audio.setAudioModeAsync({
                    playsInSilentModeIOS: true,
                    staysActiveInBackground: true,
                    shouldDuckAndroid: true,
                });

                console.log('Audio mode set');

                // Load completion sound
                try {
                    const { sound: dingSound } = await Audio.Sound.createAsync(
                        require('../assets/notifications/dingnoti.wav'),
                        {
                            shouldPlay: false,
                            volume: 1.0,
                        }
                    );
                    console.log('Ding sound loaded successfully');
                    setCompletionSound(dingSound);
                } catch (soundError) {
                    console.error('Failed to load ding sound:', soundError);
                }

                // Background sound for keeping audio session alive
                try {
                    const { sound: bgSound } = await Audio.Sound.createAsync(
                        require('../assets/notifications/ding.mp3'),
                        {
                            shouldPlay: false,
                            isLooping: true,
                            volume: 0.0,
                        }
                    );
                    console.log('Background sound loaded successfully');
                    setBackgroundSound(bgSound);
                } catch (bgError) {
                    console.error('Failed to load background sound:', bgError);
                }

            } catch (e) {
                console.error("Error initializing audio", e);
            }
        }

        initAudio();

        return () => {
            if (completionSound) {
                completionSound.unloadAsync();
            }
            if (backgroundSound) {
                backgroundSound.stopAsync().then(() => backgroundSound.unloadAsync()).catch(e => console.log(e));
            }
        };
    }, []);

    // Setup notification channel
    useEffect(() => {
        async function setupNotifications() {
            const { status } = await Notifications.getPermissionsAsync();
            if (status !== 'granted') {
                await Notifications.requestPermissionsAsync();
            }

            // Set up Android notification channel
            if (Platform.OS === 'android') {
                await Notifications.setNotificationChannelAsync('timer-ongoing', {
                    name: 'Timer Running',
                    importance: Notifications.AndroidImportance.LOW,
                    sound: null,
                    enableVibrate: false,
                    showBadge: false,
                });

                await Notifications.setNotificationChannelAsync('timer-complete', {
                    name: 'Timer Complete',
                    importance: Notifications.AndroidImportance.HIGH,
                    sound: 'dingnoti.wav',
                    vibrationPattern: [0, 500, 200, 500],
                    enableVibrate: true,
                    showBadge: true,
                });

                console.log('Notification channels created');
            }
        }

        setupNotifications();
    }, []);

    // App state handling
    useEffect(() => {
        const subscription = AppState.addEventListener('change', nextAppState => {
            console.log('App state changed:', appState.current, '->', nextAppState);
            if (
                appState.current.match(/inactive|background/) &&
                nextAppState === 'active'
            ) {
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
                    await dismissPersistentNotification();
                    if (backgroundSound) {
                        await backgroundSound.stopAsync().catch(e => console.log(e));
                    }
                }
            }
        } catch (e) {
            console.error("Failed to sync timer", e);
        }
    };

    useEffect(() => {
        syncTimer();
    }, []);

    // Main timer interval
    useEffect(() => {
        if (isActive) {
            checkIntervalRef.current = setInterval(() => {
                const now = Date.now();
                if (endTimeRef.current) {
                    const remaining = Math.ceil((endTimeRef.current - now) / 1000);
                    if (remaining <= 0) {
                        if (checkIntervalRef.current) {
                            clearInterval(checkIntervalRef.current);
                        }
                        if (!isCompletingRef.current) {
                            handleTimerComplete();
                        }
                        setTimeLeft(0);
                    } else {
                        setTimeLeft(remaining);
                    }
                }
            }, 200);
        } else {
            if (checkIntervalRef.current) {
                clearInterval(checkIntervalRef.current);
            }
        }

        return () => {
            if (checkIntervalRef.current) {
                clearInterval(checkIntervalRef.current);
            }
        };
    }, [isActive]);

    const showPersistentNotification = async (seconds) => {
        try {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            const timeString = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

            // Dismiss existing persistent notification
            if (persistentNotificationIdRef.current) {
                await Notifications.dismissNotificationAsync(persistentNotificationIdRef.current);
            }

            const notificationId = await Notifications.scheduleNotificationAsync({
                content: {
                    title: 'Rest Timer',
                    body: `${timeString} remaining`,
                    sticky: true,
                    autoDismiss: false,
                    priority: Notifications.AndroidNotificationPriority.LOW,
                },
                trigger: null, // Immediate
            });

            persistentNotificationIdRef.current = notificationId;
        } catch (e) {
            console.error('Error showing persistent notification:', e);
        }
    };

    const updatePersistentNotification = async (seconds) => {
        await showPersistentNotification(seconds);
    };

    const dismissPersistentNotification = async () => {
        try {
            if (persistentNotificationIdRef.current) {
                await Notifications.dismissNotificationAsync(persistentNotificationIdRef.current);
                persistentNotificationIdRef.current = null;
            }
            if (updateNotificationIntervalRef.current) {
                clearInterval(updateNotificationIntervalRef.current);
                updateNotificationIntervalRef.current = null;
            }
        } catch (e) {
            console.error('Error dismissing persistent notification:', e);
        }
    };

    const scheduleCompletionNotification = async (seconds) => {
        try {
            const futureDate = new Date(Date.now() + seconds * 1000);
            console.log(`Scheduling completion notification for ${seconds} seconds from now:`, futureDate);

            const notificationId = await Notifications.scheduleNotificationAsync({
                content: {
                    title: "Rest Complete! 💪",
                    body: "Time to get back to work.",
                    sound: 'dingnoti.wav',
                    vibrate: [0, 500, 200, 500],
                },
                trigger: futureDate,
            });

            console.log('Completion notification scheduled with ID:', notificationId);
        } catch (e) {
            console.error('Error scheduling completion notification:', e);
        }
    };

    const handleTimerComplete = async () => {
        if (isCompletingRef.current) return;
        isCompletingRef.current = true;

        console.log('Timer completing...');

        setIsActive(false);
        await AsyncStorage.removeItem(TIMER_KEY);
        endTimeRef.current = null;

        // Dismiss persistent notification
        await dismissPersistentNotification();

        try {
            // Stop background sound first
            if (backgroundSound) {
                const bgStatus = await backgroundSound.getStatusAsync();
                if (bgStatus.isLoaded && bgStatus.isPlaying) {
                    await backgroundSound.stopAsync();
                    console.log('Background sound stopped');
                }
            }

            // Play completion sound
            if (completionSound) {
                const status = await completionSound.getStatusAsync();
                console.log('Completion sound status:', status);

                if (status.isLoaded) {
                    await completionSound.setPositionAsync(0);
                    await completionSound.playAsync();
                    console.log('Playing completion sound');
                } else {
                    console.log('Completion sound not loaded, reloading...');
                    await completionSound.loadAsync(require('../assets/notifications/dingnoti.wav'), {
                        shouldPlay: true,
                        volume: 1.0,
                    });
                }
            }

            // Vibrate
            Vibration.vibrate([0, 500, 200, 500]);
            console.log('Vibration triggered');

        } catch (e) {
            console.error("Error in timer completion", e);
        }

        setTimeout(() => {
            isCompletingRef.current = false;
        }, 2000);
    };

    const startTimer = async () => {
        console.log('=== STARTING TIMER ===');
        const duration = 3; // 3 seconds for testing
        const end = Date.now() + duration * 1000;
        endTimeRef.current = end;
        await AsyncStorage.setItem(TIMER_KEY, end.toString());
        console.log('Timer end time set:', new Date(end).toISOString());

        setTimeLeft(duration);
        setIsActive(true);
        isCompletingRef.current = false;
        scale.value = withSequence(
            withTiming(1.2, { duration: 100 }),
            withTiming(1, { duration: 100 })
        );

        // Start background audio
        if (backgroundSound) {
            try {
                const status = await backgroundSound.getStatusAsync();
                if (!status.isLoaded) {
                    await backgroundSound.loadAsync(require('../assets/notifications/ding.mp3'), {
                        isLooping: true,
                        volume: 0.0,
                        shouldPlay: true,
                    });
                    console.log('Background sound started');
                } else if (!status.isPlaying) {
                    await backgroundSound.playAsync();
                    console.log('Background sound resumed');
                }
            } catch (e) {
                console.error("Error starting background sound", e);
            }
        }

        // Show persistent notification
        await showPersistentNotification(duration);

        // Update persistent notification every second
        updateNotificationIntervalRef.current = setInterval(async () => {
            const now = Date.now();
            if (endTimeRef.current) {
                const remaining = Math.ceil((endTimeRef.current - now) / 1000);
                if (remaining > 0) {
                    await updatePersistentNotification(remaining);
                }
            }
        }, 1000);

        // Schedule completion notification
        await scheduleCompletionNotification(duration);
    };

    const addTime = async () => {
        if (!isActive) return;

        const newTimeLeft = timeLeft + 30;
        const end = Date.now() + newTimeLeft * 1000;
        endTimeRef.current = end;
        await AsyncStorage.setItem(TIMER_KEY, end.toString());

        setTimeLeft(newTimeLeft);
        translateY.value = withSequence(
            withTiming(-10, { duration: 100 }),
            withTiming(0, { duration: 100 })
        );

        // Update persistent notification
        await updatePersistentNotification(newTimeLeft);

        // Reschedule completion notification
        await Notifications.cancelAllScheduledNotificationsAsync();
        await scheduleCompletionNotification(newTimeLeft);
        console.log('Time added, notifications updated');
    };

    const subtractTime = async () => {
        if (!isActive) return;

        const newTimeLeft = Math.max(0, timeLeft - 30);
        const end = Date.now() + newTimeLeft * 1000;
        endTimeRef.current = end;
        await AsyncStorage.setItem(TIMER_KEY, end.toString());

        setTimeLeft(newTimeLeft);
        translateY.value = withSequence(
            withTiming(10, { duration: 100 }),
            withTiming(0, { duration: 100 })
        );

        if (newTimeLeft === 0) {
            handleTimerComplete();
        } else {
            // Update persistent notification
            await updatePersistentNotification(newTimeLeft);

            // Reschedule completion notification
            await Notifications.cancelAllScheduledNotificationsAsync();
            await scheduleCompletionNotification(newTimeLeft);
            console.log('Time subtracted, notifications updated');
        }
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
            }
        });

    const pan = Gesture.Pan()
        .activeOffsetY([-10, 10])
        .onEnd((e) => {
            if (!isActive) return;

            if (e.translationY < -20) {
                runOnJS(addTime)();
            } else if (e.translationY > 20) {
                runOnJS(subtractTime)();
            }
        });

    const composed = Gesture.Race(tap, pan);

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