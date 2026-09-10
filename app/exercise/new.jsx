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
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <NewExercise
                isScreen
                exerciseID={id ? Number(id) : undefined}
                close={(result) => {
                    // Popping one level after a delete lands on the exercise's
                    // own detail screen, which is now about a row that no longer
                    // exists. Unwind to the library instead -- dismissAll first,
                    // because navigating to a tab route from a stacked screen
                    // pushes a duplicate (tabs) navigator otherwise.
                    if (result?.deleted) {
                        if (router.canDismiss()) router.dismissAll();
                        router.navigate('/profile');
                        return;
                    }
                    router.back();
                }}
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