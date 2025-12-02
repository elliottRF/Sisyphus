import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Keyboard } from 'react-native'
import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useFocusEffect, useRouter } from 'expo-router';
import ActionSheet from "react-native-actions-sheet";
import { FlatList } from 'react-native-gesture-handler';

import { SafeAreaView } from 'react-native-safe-area-context';
import Body from "react-native-body-highlighter";
import { fetchRecentMuscleUsage, getPinnedExercises, pinExercise, fetchExercises } from '../components/db';
import { COLORS, FONTS, SHADOWS } from '../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import PRGraphCard from '../components/PRGraphCard';


const muscleMapping = {
    "Chest": "chest",
    "Upper Chest": "chest",
    "Quadriceps": "quadriceps",
    "Triceps": "triceps",
    "Biceps": "biceps",
    "Hamstring": "hamstring",
    "Hamstrings": "hamstring",
    "Upper-Back": "upper-back",
    "Lower-Back": "lower-back",
    "Shoulders": "deltoids",
    "Gluteal": "gluteal",
    "Glutes": "gluteal",
    "Forearms": "forearm",
    "Traps": "trapezius",
    "Calves": "calves",
};

const Home = () => {
    const [bodyData, setBodyData] = useState([]);
    const [pinnedExercises, setPinnedExercises] = useState([]);
    const [allExercises, setAllExercises] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const actionSheetRef = useRef(null);
    const router = useRouter();

    useFocusEffect(
        useCallback(() => {
            loadMuscleData();
            loadPinnedExercises();
        }, [])
    );

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

                // Calculate weighted score: Primary = 1, Accessory = 0.5
                const weightedScore = primarySets + (accessorySets * 0.5);

                let intensity = 0;

                if (weightedScore >= 3) {
                    intensity = 2; // Deep Blue
                } else if (weightedScore > 0) {
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

    const loadPinnedExercises = async () => {
        try {
            const pinned = await getPinnedExercises();
            setPinnedExercises(pinned);
        } catch (error) {
            console.error("Error loading pinned exercises:", error);
        }
    };

    const handleAddGraph = async () => {
        console.log("Opening Add Graph sheet...");
        if (allExercises.length === 0) {
            console.log("Fetching exercises...");
            try {
                const exercises = await fetchExercises();
                console.log("Fetched exercises count:", exercises.length);
                setAllExercises(exercises);
            } catch (error) {
                console.error("Error fetching exercises:", error);
            }
        } else {
            console.log("Exercises already loaded. Count:", allExercises.length);
        }
        actionSheetRef.current?.show();
    };

    const handlePinExercise = async (exercise) => {
        try {
            await pinExercise(exercise.exerciseID);
            loadPinnedExercises();
            actionSheetRef.current?.hide();
            setSearchQuery('');
        } catch (error) {
            console.error("Error pinning exercise:", error);
        }
    };

    const filteredExercises = allExercises
        .filter(ex => ex.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name));

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollViewContent}
            >
                <View style={styles.header}>
                    <View>
                        <Text style={styles.greeting}>Recovery Status</Text>
                        <Text style={styles.subGreeting}>Last 3 Days Activity</Text>
                    </View>
                    <TouchableOpacity onPress={() => router.push('/settings')} style={styles.settingsButton}>
                        <Feather name="settings" size={24} color={COLORS.text} />
                    </TouchableOpacity>
                </View>

                <ScrollView
                    horizontal={true}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.bodyScrollContent}
                    snapToInterval={320}
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

                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Progress Tracker</Text>
                </View>

                {pinnedExercises.map((exercise) => (
                    <PRGraphCard
                        key={exercise.exerciseID}
                        exerciseID={exercise.exerciseID}
                        exerciseName={exercise.name}
                        onRemove={loadPinnedExercises}
                    />
                ))}

                <TouchableOpacity onPress={handleAddGraph} style={styles.addGraphButton}>
                    <LinearGradient
                        colors={[COLORS.surface, COLORS.surface]}
                        style={styles.addGraphGradient}
                    >
                        <Feather name="plus-circle" size={24} color={COLORS.primary} />
                        <Text style={styles.addGraphText}>Add Progress Graph</Text>
                    </LinearGradient>
                </TouchableOpacity>

            </ScrollView>

            <ActionSheet
                ref={actionSheetRef}
                containerStyle={styles.actionSheetContainer}
                indicatorStyle={{ backgroundColor: COLORS.textSecondary }}
                gestureEnabled={true}
            >
                <View style={styles.contentContainer}>
                    <View style={styles.searchContainer}>
                        <View style={styles.searchBar}>
                            <Feather name="search" size={20} color={COLORS.textSecondary} style={styles.searchIcon} />
                            <TextInput
                                style={styles.searchInput}
                                placeholder="Search exercises to pin..."
                                placeholderTextColor={COLORS.textSecondary}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                returnKeyType="done"
                                onSubmitEditing={Keyboard.dismiss}
                            />
                        </View>
                    </View>
                    <FlatList
                        data={filteredExercises}
                        keyExtractor={item => item.exerciseID.toString()}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={styles.exerciseCard}
                                onPress={() => handlePinExercise(item)}
                                activeOpacity={0.7}
                            >
                                <View style={styles.exerciseContent}>
                                    <Text style={styles.exerciseName}>{item.name}</Text>
                                    <Feather name="plus" size={20} color={COLORS.primary} />
                                </View>
                            </TouchableOpacity>
                        )}
                        contentContainerStyle={styles.listContent}
                        ListEmptyComponent={
                            <View style={{ padding: 20, alignItems: 'center' }}>
                                <Text style={{ color: COLORS.textSecondary }}>
                                    {allExercises.length === 0 ? "Loading exercises..." : "No exercises found"}
                                </Text>
                            </View>
                        }
                        keyboardShouldPersistTaps="always"
                        showsVerticalScrollIndicator={false}
                        style={styles.list}
                        nestedScrollEnabled={true}
                        bounces={false}
                    />
                </View>
            </ActionSheet>
        </SafeAreaView >
    )
}
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    scrollViewContent: {
        paddingBottom: 100,
    },
    header: {
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 10,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    settingsButton: {
        padding: 8,
        backgroundColor: COLORS.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
        ...SHADOWS.small,
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
    bodyScrollContent: {
        paddingHorizontal: 10,
        marginBottom: 20,
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
    },
    sectionHeader: {
        paddingHorizontal: 20,
        marginBottom: 16,
        marginTop: 10,
    },
    sectionTitle: {
        fontSize: 20,
        fontFamily: FONTS.bold,
        color: COLORS.text,
    },
    addGraphButton: {
        marginHorizontal: 20,
        marginBottom: 20,
        borderRadius: 16,
        ...SHADOWS.small,
    },
    addGraphGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderStyle: 'dashed',
        gap: 12,
    },
    addGraphText: {
        fontSize: 16,
        fontFamily: FONTS.semiBold,
        color: COLORS.primary,
    },
    actionSheetContainer: {
        backgroundColor: COLORS.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        height: '85%',
    },
    contentContainer: {
        height: '100%',
        backgroundColor: COLORS.background,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        overflow: 'hidden',
    },
    searchContainer: {
        padding: 16,
        backgroundColor: COLORS.surface,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.background,
        borderRadius: 12,
        paddingHorizontal: 12,
        height: 44,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    searchIcon: {
        marginRight: 10,
    },
    searchInput: {
        flex: 1,
        color: COLORS.text,
        fontFamily: FONTS.medium,
        fontSize: 16,
        height: '100%',
    },
    list: {
        flex: 1,
        paddingHorizontal: 20,
        paddingBottom: 100,
    },
    listContent: {
        paddingBottom: 40,
        paddingTop: 20,
    },
    exerciseCard: {
        backgroundColor: COLORS.surface,
        borderRadius: 16,
        marginBottom: 12,
        padding: 20,
        borderWidth: 1,
        borderColor: COLORS.border,
        ...SHADOWS.small,
    },
    exerciseContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    exerciseName: {
        color: COLORS.text,
        fontSize: 16,
        fontFamily: FONTS.semiBold,
    },
});
export default Home
