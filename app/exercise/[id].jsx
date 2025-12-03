import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import React from 'react';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import ExerciseHistory from '../../components/exerciseHistory';
import { COLORS, FONTS } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

const ExerciseDetail = () => {
    const { id, name } = useLocalSearchParams();
    const router = useRouter();

    return (
        <SafeAreaView style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Exercise History</Text>
                <View style={{ width: 24 }} />
            </View>

            <ExerciseHistory exerciseID={parseInt(id)} exerciseName={name} />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
        backgroundColor: COLORS.background,
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 16,
        fontFamily: FONTS.bold,
        color: COLORS.text,
    },
});

export default ExerciseDetail;
