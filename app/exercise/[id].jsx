import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import React from 'react';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ExerciseHistory from '../../components/exerciseHistory';
import { FONTS } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

const ExerciseDetail = () => {
    const insets = useSafeAreaInsets();
    const { id, name } = useLocalSearchParams();
    const router = useRouter();
    const { theme } = useTheme();


    return (
        <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <ExerciseHistory exerciseID={parseInt(id)} exerciseName={name} />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});

export default ExerciseDetail;

