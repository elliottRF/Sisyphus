import React from 'react';
import { TouchableOpacity, Text, StyleSheet, Alert, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { COLORS, FONTS } from '../constants/theme';

const TestNotificationButton = () => {
    const testNotification = async () => {
        console.log('=== TESTING NOTIFICATION ===');
        try {
            // Set notification handler first
            Notifications.setNotificationHandler({
                handleNotification: async () => ({
                    shouldShowAlert: true,
                    shouldPlaySound: true,
                    shouldSetBadge: true,
                }),
            });

            // Check permissions
            const { status } = await Notifications.getPermissionsAsync();
            console.log('Current permission status:', status);

            if (status !== 'granted') {
                console.log('Requesting permissions...');
                const { status: newStatus } = await Notifications.requestPermissionsAsync();
                console.log('New permission status:', newStatus);

                if (newStatus !== 'granted') {
                    Alert.alert('Error', 'Notification permissions not granted');
                    return;
                }
            }

            // Set up notification channel for Android
            if (Platform.OS === 'android') {
                await Notifications.setNotificationChannelAsync('test-channel', {
                    name: 'Test Notifications',
                    importance: Notifications.AndroidImportance.MAX,
                    vibrationPattern: [0, 500, 200, 500],
                    sound: 'default',
                    enableVibrate: true,
                    enableLights: true,
                });
                console.log('✓ Android channel created');
            }

            // Ultra-simple scheduled notification
            const futureDate = new Date(Date.now() + 10000); // 10 seconds
            console.log('Scheduling for:', futureDate);

            const id = await Notifications.scheduleNotificationAsync({
                content: {
                    title: "10 Second Test",
                    body: "This is 10 seconds later",
                },
                trigger: futureDate,
            });

            console.log('Scheduled ID:', id);

            // Check immediately
            const check1 = await Notifications.getAllScheduledNotificationsAsync();
            console.log('Immediate check:', check1.length);

            // Check after 1 second
            setTimeout(async () => {
                const check2 = await Notifications.getAllScheduledNotificationsAsync();
                console.log('After 1 second:', check2.length);
                if (check2.length > 0) {
                    console.log('Trigger details:', check2[0].trigger);
                }
            }, 1000);

            Alert.alert(
                'Simple Test',
                'Scheduled for 10 seconds. Background the app and wait!'
            );

        } catch (e) {
            console.error('✗ Test notification failed:', e);
            Alert.alert('Error', `Failed: ${e.message}`);
        }
    };

    return (
        <TouchableOpacity
            style={styles.button}
            onPress={testNotification}
            activeOpacity={0.7}
        >
            <Text style={styles.buttonText}>🔔 Test Notification</Text>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    button: {
        backgroundColor: '#FF6B6B',
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: 10,
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontFamily: FONTS.bold,
    }
});

export default TestNotificationButton;