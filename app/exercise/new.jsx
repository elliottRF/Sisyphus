import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import NewExercise from '../../components/NewExercise';
import { useTheme } from '../../context/ThemeContext';

export default function NewExerciseScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { theme } = useTheme();

    return (
        <View style={[styles.container, { backgroundColor: theme.background, paddingBottom: insets.bottom }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <NewExercise
                exerciseID={id ? Number(id) : undefined}
                close={() => router.back()}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    closeButton: {
        position: 'absolute',
        right: 16,
        zIndex: 10,
        padding: 8,
        borderRadius: 20,
    },
});