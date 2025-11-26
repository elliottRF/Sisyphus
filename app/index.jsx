import { View, Text, ScrollView, StyleSheet } from 'react-native'
import React, { useState, useCallback } from 'react'
import { useFocusEffect } from 'expo-router';

import { SafeAreaView } from 'react-native-safe-area-context';
import Body from "react-native-body-highlighter";
import { fetchRecentMuscleUsage } from '../components/db';
import { COLORS, FONTS, SHADOWS } from '../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';


const muscleMapping = {
    "Chest": "chest",
    "Upper Chest": "chest",
    "Quadriceps": "quadriceps",
    "Triceps": "triceps",
    "Biceps": "biceps",
    "Hamstring": "hamstring",
    "Hamstrings": "hamstring",
    "Upper-Back": "upper-back",
    "Upper Back": "upper-back",
    "Lower-Back": "lower-back",
    "Shoulders": "deltoids",
    "Gluteal": "gluteal",
    "Glutes": "gluteal",
    "Forearms": "forearm",
    "Traps": "trapezius",
    "Calves": "calves",
    "Back": "upper-back", // Defaulting generic back to upper-back
};

const Home = () => {
    const [bodyData, setBodyData] = useState([]);

    useFocusEffect(
        useCallback(() => {
            const loadMuscleData = async () => {
                try {
                    const usageData = await fetchRecentMuscleUsage(3);

                    const muscleStats = {};

                    usageData.forEach(exercise => {
                        const sets = parseInt(exercise.sets, 10) || 0;

                        // Process Target Muscle (Primary)
                        const target = muscleMapping[exercise.targetMuscle] || exercise.targetMuscle.toLowerCase();
                        if (!muscleStats[target]) muscleStats[target] = { primarySets: 0, accessorySets: 0 };
                        muscleStats[target].primarySets += sets;

                        // Process Accessory Muscles
                        if (exercise.accessoryMuscles) {
                            const accessories = exercise.accessoryMuscles.split(',').map(m => m.trim());
                            accessories.forEach(acc => {
                                if (acc) {
                                    const accTarget = muscleMapping[acc] || acc.toLowerCase();
                                    if (!muscleStats[accTarget]) muscleStats[accTarget] = { primarySets: 0, accessorySets: 0 };
                                    muscleStats[accTarget].accessorySets += sets;
                                }
                            });
                        }
                    });

                    // Convert stats to body highlighter data
                    const newBodyData = Object.keys(muscleStats).map(slug => {
                        const { primarySets, accessorySets } = muscleStats[slug];
                        let intensity = 0;

                        if (primarySets >= 3) {
                            intensity = 2; // Deep Blue
                        } else if (accessorySets >= 6) {
                            intensity = 2; // Deep Blue
                        } else if (primarySets > 0 || accessorySets > 0) {
                            intensity = 1; // Light Blue
                        }

                        if (intensity > 0) {
                            return { slug, intensity };
                        }
                        return null;
                    }).filter(item => item !== null);

                    setBodyData(newBodyData);

                } catch (error) {
                    console.error("Failed to load muscle usage data:", error);
                }
            };

            loadMuscleData();
        }, [])
    );

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.greeting}>Recovery Status</Text>
                <Text style={styles.subGreeting}>Last 3 Days Activity</Text>
            </View>

            <ScrollView
                horizontal={true}
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollViewContent}
                snapToInterval={320} // Approximate card width + margin
                decelerationRate="fast"
            >
                <View style={styles.cardContainer}>
                    <Text style={styles.cardTitle}>Front</Text>
                    <Body
                        data={bodyData}
                        gender="male"
                        side="front"
                        scale={1.1}
                        border={COLORS.border}
                        colors={[COLORS.secondary, COLORS.primary]}
                    />
                </View>

                <View style={styles.cardContainer}>
                    <Text style={styles.cardTitle}>Back</Text>
                    <Body
                        data={bodyData}
                        gender="male"
                        side="back"
                        scale={1.1}
                        border={COLORS.border}
                        colors={[COLORS.secondary, COLORS.primary]}
                    />
                </View>

            </ScrollView>
        </SafeAreaView >
    )
}
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    header: {
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 10,
    },
    greeting: {
        fontSize: 28,
        fontFamily: FONTS.bold,
        color: COLORS.text,
    },
    subGreeting: {
        fontSize: 14,
        fontFamily: FONTS.medium,
        color: COLORS.textSecondary,
        marginTop: 4,
    },
    scrollViewContent: {
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingBottom: 100, // Space for tab bar
    },
    cardContainer: {
        backgroundColor: COLORS.surface,
        borderRadius: 24,
        padding: 20,
        marginHorizontal: 10,
        alignItems: 'center',
        justifyContent: 'center',
        width: 300,
        height: 500,
        borderWidth: 1,
        borderColor: COLORS.border,
        ...SHADOWS.medium,
    },
    cardTitle: {
        fontSize: 18,
        fontFamily: FONTS.semiBold,
        color: COLORS.textSecondary,
        marginBottom: 20,
        position: 'absolute',
        top: 20,
        left: 20,
    }
});
export default Home
