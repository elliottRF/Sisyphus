import React, { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, Text, View, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming, runOnJS } from 'react-native-reanimated';

import { MaterialIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { FONTS } from '../constants/theme';
import { useFocusEffect } from 'expo-router';
import Timer from '../app/timer/androidTimerModule';
import { useTheme } from '../context/ThemeContext';
import * as Haptics from 'expo-haptics';

const RestTimer = forwardRef(({ onFirstStart }, ref) => {
    const { theme } = useTheme();
    const [timeLeft, setTimeLeft] = useState(0);
    const [defaultDuration, setDefaultDuration] = useState(180);
    const targetEndTimeRef = useRef(null); // The absolute timestamp when the timer should end
    const timerRunning = useRef(false); // Track if we consider the timer active
    const frameIdRef = useRef(null); // RAF ID for smooth UI updates
    const [isMuted, setIsMuted] = useState(false);


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
            if (saved && saved.trim() !== '') {
                setDefaultDuration(parseInt(saved, 10));
            } else {
                setDefaultDuration(180);
            }
            const savedMuted = await AsyncStorage.getItem('settings_timer_muted');
            if (savedMuted !== null) setIsMuted(savedMuted === 'true');
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


    // ─── Native Sync Polling ───────────────────────────────────────────────────
    // The notification +30/-30/Stop buttons update native SharedPreferences but
    // the JS RAF loop has no way to know. We poll every 1.5s and resync if the
    // native remaining differs from our JS estimate by more than 2 seconds.
    //
    // Gated to focus: the workout tab stays mounted for the whole app session
    // (lazy:false), so a plain useEffect would poll the native bridge — and run
    // the RAF re-render loop — forever, on every tab and while idle. useFocusEffect
    // tears both down on blur and resyncs from the (authoritative) native timer
    // on the next focus, so off the workout tab there's zero rest-timer work.
    useFocusEffect(useCallback(() => {
        const POLL_MS = 1500;
        const DRIFT_THRESHOLD = 2; // seconds

        const poll = async () => {
            const nativeRemaining = await Timer.getRemaining();

            if (nativeRemaining <= 0) {
                // Native side finished or was stopped via notification
                if (timerRunning.current) {
                    timerRunning.current = false;
                    targetEndTimeRef.current = null;
                    setTimeLeft(0);
                    if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current);
                }
                return;
            }

            if (!timerRunning.current) {
                // Native timer is running but JS doesn't know — resync (e.g. after app resume)
                targetEndTimeRef.current = Date.now() + nativeRemaining * 1000;
                timerRunning.current = true;
                setTimeLeft(nativeRemaining);
                if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current);
                updateUI();
                return;
            }

            // Both sides think timer is running — check for drift
            if (targetEndTimeRef.current) {
                const jsRemaining = Math.ceil((targetEndTimeRef.current - Date.now()) / 1000);
                const drift = Math.abs(jsRemaining - nativeRemaining);

                if (drift > DRIFT_THRESHOLD) {
                    // Notification button was tapped — snap JS to native value
                    targetEndTimeRef.current = Date.now() + nativeRemaining * 1000;
                    setTimeLeft(nativeRemaining);
                    // RAF loop is already running, it'll pick up the new targetEndTimeRef naturally
                }
            }
        };

        let intervalId = null;
        const startPolling = () => {
            if (intervalId) return;
            // stopPolling cancels the RAF UI loop on background; restart it here
            // if a timer is still mid-run, otherwise the on-screen countdown stays
            // frozen on resume (the notification keeps ticking but the UI loop is
            // dead). targetEndTimeRef is an absolute timestamp, so it's still
            // accurate; poll() below then resyncs against the native timer.
            if (timerRunning.current && targetEndTimeRef.current) {
                if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current);
                updateUI();
            }
            poll(); // resync immediately (catches a timer started/elapsed while away)
            intervalId = setInterval(poll, POLL_MS);
        };
        const stopPolling = () => {
            if (intervalId) { clearInterval(intervalId); intervalId = null; }
            if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current);
        };

        // Only poll while the app is in the foreground. Left backgrounded, this
        // native-bridge poll (and the RAF loop) would otherwise keep firing for
        // as long as the OS keeps the process alive — thousands of times over a
        // day — which is a big contributor to the app being sluggish on return.
        // The native timer is the source of truth, so we resync on resume.
        if (AppState.currentState === 'active') startPolling();
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') startPolling();
            else stopPolling();
        });

        return () => {
            sub.remove();
            stopPolling();
        };
    }, [updateUI])); // updateUI is stable (useCallback with no deps that change)

    // Play "Ding" sound helper
    const playDing = async () => {
        if (isMuted) return;

        try {
            const { sound } = await Audio.Sound.createAsync(
                require('../assets/notifications/dingnoti.wav'),
                { volume: 1 }
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

    const internalStop = (playAudio = false) => {
        // Clear Native Persistence (Hack: start with 0 to overwrite any lingering time)
        Timer.startTimer(0, isMuted);
        Timer.stopTimer();

        targetEndTimeRef.current = null;
        timerRunning.current = false;
        setTimeLeft(0);
        if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current);

        if (playAudio) playDing();
    };

    const restartTimer = useCallback(() => {

        // 0. Auto-start (ticking a set) is also a "first start" — make sure the
        // one-time notification-permission prompt fires here too, not just on the
        // manual button. (Idempotent: it no-ops once the user has been asked.)
        onFirstStart?.();

        // 1. Clear any existing UI loops
        if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current);

        // 2. Set the new end time (Default Duration)
        const newTarget = Date.now() + (defaultDuration * 1000);
        targetEndTimeRef.current = newTarget;
        timerRunning.current = true;

        // 3. Update state immediately so UI doesn't flicker
        setTimeLeft(defaultDuration);

        // 4. Sync with Native persistence (This overwrites the previous native timer)
        Timer.startTimer(defaultDuration, isMuted);

        // 5. Start the UI update loop
        updateUI();

        // 6. Optional: Trigger the start animation
        scale.value = withSequence(
            withTiming(1.2, { duration: 100 }),
            withTiming(1, { duration: 100 })
        );
    }, [defaultDuration, isMuted, updateUI, onFirstStart]);

    useImperativeHandle(ref, () => ({
        startIfStopped: () => {
            if (!timerRunning.current) {
                startTimer();
            }
        },
        // Add this new method
        restartTimer: () => {
            restartTimer();
        },
        stopTimer: () => {
            if (timerRunning.current) {
                internalStop(false);
            }
        }
    }));

    const startTimer = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        if (timerRunning.current) {
            // STOP (Manual Tap -> NO SOUND)
            internalStop(false);
        } else {
            onFirstStart?.(); // Ask for permission contextually on first ever start

            // START
            targetEndTimeRef.current = Date.now() + (defaultDuration * 1000);
            timerRunning.current = true;
            Timer.startTimer(defaultDuration, isMuted);
            updateUI(); // Start loop

            scale.value = withSequence(
                withTiming(1.2, { duration: 100 }),
                withTiming(1, { duration: 100 })
            );
        }
    };

    const addTime = () => {

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

        Timer.startTimer(newDuration, isMuted); // Sync native

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
            internalStop(false); // Manual Swipe to 0 -> NO SOUND
        } else {
            targetEndTimeRef.current = Date.now() + (newDuration * 1000);
            setTimeLeft(newDuration);
            Timer.startTimer(newDuration, isMuted);
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
            <Animated.View style={[
                styles.container,
                {
                    backgroundColor: theme.overlayMedium,
                    borderColor: theme.overlayBorder,
                },
                rStyle
            ]}>
                <View style={styles.arrowHint}>
                    {timeLeft > 0 && <MaterialIcons name="keyboard-arrow-up" size={11} color={theme.primary} />}
                </View>
                {timeLeft > 0 ? (
                    <Text style={[styles.timerText, { color: theme.primary }]}>{formatTime(timeLeft)}</Text>
                ) : (
                    <MaterialIcons name="timer" size={18} color={theme.primary} />
                )}
                <View style={styles.arrowHint}>
                    {timeLeft > 0 && <MaterialIcons name="keyboard-arrow-down" size={11} color={theme.primary} />}
                </View>
            </Animated.View>
        </GestureDetector>
    );
});

const styles = StyleSheet.create({
    container: {
        width: 50,
        height: 36,
        borderRadius: 14,
        alignItems: 'center',
        overflow: 'hidden',
        borderWidth: 1,
    },
    timerText: {
        fontSize: 13,
        lineHeight: 13,
        fontFamily: FONTS.bold,
        includeFontPadding: false,
    },
    arrowHint: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

export default RestTimer;
