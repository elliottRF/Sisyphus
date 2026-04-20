import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Audio } from 'expo-av';
import { COLORS, FONTS } from '../constants/theme';
import { customAlert } from '../utils/customAlert';

const TestSoundButton = () => {
    const testSound = async () => {
        console.log('=== TESTING SOUND ===');
        try {
            // First, set audio mode (simplified - no invalid options)
            await Audio.setAudioModeAsync({
                playsInSilentModeIOS: true,
                staysActiveInBackground: true,
                shouldDuckAndroid: true,
            });
            console.log('✓ Audio mode set');

            // Load and play the sound
            const { sound } = await Audio.Sound.createAsync(
                require('../assets/notifications/dingnoti.wav'),
                { volume: 1.0 }
            );
            console.log('✓ Sound loaded');

            await sound.playAsync();
            console.log('✓ Sound played!');

            customAlert('Success!', 'Sound played. Did you hear it?');

            // Cleanup after playing
            sound.setOnPlaybackStatusUpdate((status) => {
                if (status.didJustFinish) {
                    sound.unloadAsync();
                    console.log('✓ Sound unloaded');
                }
            });
        } catch (e) {
            console.error('✗ Test sound failed:', e);
            customAlert('Error', `Failed to play sound: ${e.message}`);
        }
    };

    return (
        <TouchableOpacity
            style={styles.button}
            onPress={testSound}
            activeOpacity={0.7}
        >
            <Text style={styles.buttonText}>🔊 Test Sound</Text>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    button: {
        backgroundColor: COLORS.primary,
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

export default TestSoundButton;