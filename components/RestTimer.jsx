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
    const notificationTimeoutRef = useRef(null);

    // Animation values
    const scale = useSharedValue(1);
    const translateY = useSharedValue(0);

    const TIMER_KEY = 'SISYPHUS_TIMER_END';

    // Initialize audio system
    useEffect(() => {
        async function initAudio() {
            try {
                // Set audio mode for background playback - CRITICAL for iOS
                await Audio.setAudioModeAsync({
                    playsInSilentModeIOS: true,
                    staysActiveInBackground: true,
                    shouldDuckAndroid: true,
                });

                console.log('Audio mode set');

                // Load completion sound
                try {
                    const { sound: dingSound } = await Audio.Sound.createAsync(
                        require('../assets/notifications/ding.wav'),
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

                // Create a silent/minimal background sound to keep audio session active
                // Using ding.mp3 at zero volume as a workaround if silent.mp3 is too short
                try {
                    const { sound: bgSound } = await Audio.Sound.createAsync(
                        require('../assets/notifications/ding.mp3'), // Using existing file
                        {
                            shouldPlay: false,
                            isLooping: true,
                            volume: 0.0, // Completely silent
                        },
                        (status) => {
                            // Monitor playback status
                            if (status.isLoaded && !status.isPlaying && status.didJustFinish) {
                                console.log('Background sound finished, restarting...');
                            }
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
            // Cleanup
            if (completionSound) {
                completionSound.unloadAsync();
            }
            if (backgroundSound) {
                backgroundSound.stopAsync().then(() => backgroundSound.unloadAsync()).catch(e => console.log(e));
            }
        };
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

    // Request notification permissions and setup channel
    useEffect(() => {
        async function setupNotifications() {
            const { status } = await Notifications.requestPermissionsAsync();
            if (status !== 'granted') {
                console.log('Notification permissions not granted');
            } else {
                console.log('Notification permissions granted');
            }

            // Set up Android notification channel with sound and vibration
            if (Platform.OS === 'android') {
                await Notifications.setNotificationChannelAsync('timer-alerts', {
                    name: 'Timer Alerts',
                    importance: Notifications.AndroidImportance.MAX,
                    vibrationPattern: [0, 500, 200, 500],
                    sound: 'ding.wav', // Use your custom sound
                    enableVibrate: true,
                    enableLights: true,
                    lightColor: '#40BAAD',
                    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
                    bypassDnd: true, // Allow even in Do Not Disturb mode
                });
                console.log('Android notification channel created with custom sound');
            }
        }
        setupNotifications();
    }, []);

    const scheduleNotification = async (seconds) => {
        try {
            await Notifications.cancelAllScheduledNotificationsAsync();

            console.log(`Scheduling notification for ${seconds} seconds from now`);
            console.log('Current time:', new Date().toISOString());
            console.log('Target time:', new Date(Date.now() + seconds * 1000).toISOString());

            const notificationId = await Notifications.scheduleNotificationAsync({
                content: {
                    title: "Rest Complete! 💪",
                    body: "Time to get back to work.",
                    sound: true,
                    vibrate: [0, 500, 200, 500],
                    priority: Notifications.AndroidNotificationPriority.MAX,
                    data: { timerComplete: true },
                },
                trigger: seconds,
            });

            console.log('Notification scheduled with ID:', notificationId);

            // Verify it was scheduled
            const allScheduled = await Notifications.getAllScheduledNotificationsAsync();
            console.log('Scheduled notifications after scheduling:', allScheduled);
        } catch (e) {
            console.error('Error scheduling notification:', e);
        }
    };

    const handleTimerComplete = async () => {
        if (isCompletingRef.current) return;
        isCompletingRef.current = true;

        console.log('Timer completing...');

        setIsActive(false);
        await AsyncStorage.removeItem(TIMER_KEY);
        endTimeRef.current = null;

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
                    await completionSound.loadAsync(require('../assets/notifications/ding.wav'), {
                        shouldPlay: true,
                        volume: 1.0,
                    });
                }
            } else {
                console.log('No completion sound available');
            }

            // Vibrate (works in foreground, notification handles background)
            Vibration.vibrate([0, 500, 200, 500]);
            console.log('Vibration triggered');

            // Immediate notification as backup (will only show if backgrounded)
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: "Rest Complete! 💪",
                    body: "Time to get back to work.",
                    sound: Platform.OS === 'android' ? 'default' : false,
                    vibrate: [0, 500, 200, 500],
                },
                trigger: null, // Immediate
            });
            console.log('Immediate notification sent');

        } catch (e) {
            console.error("Error in timer completion", e);
        }

        // Reset flag after delay
        setTimeout(() => {
            isCompletingRef.current = false;
        }, 2000);
    };

    const startTimer = async () => {
        console.log('=== STARTING TIMER ===');
        const duration = 3; // 2 minutes
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

        // Check notification permissions before scheduling
        const { status } = await Notifications.getPermissionsAsync();
        console.log('Notification permission status:', status);

        if (status !== 'granted') {
            console.log('Requesting notification permissions...');
            const { status: newStatus } = await Notifications.requestPermissionsAsync();
            console.log('New permission status:', newStatus);
        }

        // Start background audio to keep session active
        if (backgroundSound) {
            try {
                const status = await backgroundSound.getStatusAsync();
                console.log('Background sound status before start:', status);

                if (!status.isLoaded) {
                    await backgroundSound.loadAsync(require('../assets/notifications/ding.mp3'), {
                        isLooping: true,
                        volume: 0.0,
                        shouldPlay: true,
                    });
                    console.log('Background sound loaded and playing');
                } else if (!status.isPlaying) {
                    await backgroundSound.playAsync();
                    console.log('Background sound started playing');
                } else {
                    console.log('Background sound already playing');
                }
            } catch (e) {
                console.error("Error starting background sound", e);
            }
        } else {
            console.log('No background sound available');
        }

        // Schedule notification for when timer completes (as backup)
        await scheduleNotification(duration);

        // ALSO set a JavaScript timeout as primary notification trigger
        // This is more reliable than scheduled notifications on some Android devices
        if (notificationTimeoutRef.current) {
            clearTimeout(notificationTimeoutRef.current);
        }
        notificationTimeoutRef.current = setTimeout(async () => {
            console.log('Timeout fired - sending notification');
            try {
                await Notifications.scheduleNotificationAsync({
                    content: {
                        title: "Rest Complete! 💪",
                        body: "Time to get back to work.",
                        sound: true,
                        vibrate: [0, 500, 200, 500],
                        priority: Notifications.AndroidNotificationPriority.MAX,
                    },
                    trigger: null, // Immediate
                });
            } catch (e) {
                console.error('Error sending timeout notification:', e);
            }
        }, duration * 1000);

        // List all scheduled notifications to verify
        const scheduled = await Notifications.getAllScheduledNotificationsAsync();
        console.log('All scheduled notifications:', scheduled.length, scheduled);
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

        // Reschedule notification with new time
        await scheduleNotification(newTimeLeft);
        console.log('Time added, notification rescheduled');
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
            // Reschedule notification with new time
            await scheduleNotification(newTimeLeft);
            console.log('Time subtracted, notification rescheduled');
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