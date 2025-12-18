import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Keyboard, ActivityIndicator } from 'react-native'
import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useScrollToTop } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ActionSheet from "react-native-actions-sheet";
import { FlatList } from 'react-native-gesture-handler';

import { SafeAreaView } from 'react-native-safe-area-context';
import Body from "react-native-body-highlighter";
import { fetchRecentMuscleUsage, getPinnedExercises, pinExercise, fetchExercises } from '../components/db';
import { FONTS, SHADOWS } from '../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import PRGraphCard from '../components/PRGraphCard';
import { useTheme } from '../context/ThemeContext';


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
    "Deltoids": "deltoids",
    "Gluteal": "gluteal",
    "Glutes": "gluteal",
    "Forearms": "forearm",
    "Forearm": "forearm",
    "Traps": "trapezius",
    "Trapezius": "trapezius",
    "Calves": "calves",
    "Abs": "abs",
    "Adductors": "adductors",
    "Neck": "neck",
    "Obliques": "obliques",
};

const GradientOrView = ({ colors, style, theme, children }) => {
    if (theme.type === 'dynamic') {
        return <View style={[style, { backgroundColor: theme.surface }]}>{children}</View>;
    }
    return <LinearGradient colors={colors} style={style}>{children}</LinearGradient>;
};

const Home = () => {
    const { theme, gender } = useTheme();
    const styles = getStyles(theme);
    const [bodyData, setBodyData] = useState([]);
    const [pinnedExercises, setPinnedExercises] = useState([]);
    const [allExercises, setAllExercises] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const actionSheetRef = useRef(null);
    const router = useRouter();

    const scrollRef = useRef(null);
    useScrollToTop(scrollRef);

    // Load data only on mount
    useEffect(() => {
        loadMuscleData();
        loadPinnedExercises();
    }, []);

    // Listen for workout completion events
    useEffect(() => {
        const checkForWorkoutCompletion = async () => {
            try {
                const workoutCompleted = await AsyncStorage.getItem('@workoutCompleted');
                if (workoutCompleted === 'true') {
                    console.log('Workout completed, refreshing home screen data...');
                    await loadMuscleData();
                    await loadPinnedExercises();
                    // Clear the flag
                    await AsyncStorage.removeItem('@workoutCompleted');
                }
            } catch (error) {
                console.error('Error checking workout completion:', error);
            }
        };

        // Check immediately
        checkForWorkoutCompletion();

        // Set up interval to check periodically (every 2 seconds)
        const interval = setInterval(checkForWorkoutCompletion, 2000);

        return () => clearInterval(interval);
    }, []);

    const loadMuscleData = async () => {
        try {
            const usageData = await fetchRecentMuscleUsage(3);
            const muscleStats = {};

            usageData.forEach(exercise => {
                const sets = parseInt(exercise.sets, 10) || 0;

                // Process Target Muscles (Primary)
                if (exercise.targetMuscle) {
                    const targetMuscles = exercise.targetMuscle.split(',').map(m => m.trim());
                    targetMuscles.forEach(targetMuscle => {
                        if (targetMuscle) {
                            const target = muscleMapping[targetMuscle] || targetMuscle.toLowerCase();
                            if (!muscleStats[target]) muscleStats[target] = { primarySets: 0, accessorySets: 0 };
                            muscleStats[target].primarySets += sets;
                        }
                    });
                }

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
                    intensity = 2; // Deep Blue or Theme Primary
                } else if (weightedScore > 0) {
                    intensity = 1; // Light Blue or Theme Secondary
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

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            await Promise.all([
                loadMuscleData(),
                loadPinnedExercises()
            ]);
        } catch (error) {
            console.error("Error refreshing data:", error);
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleAddGraph = async () => {
        if (allExercises.length === 0) {
            try {
                const exercises = await fetchExercises();
                setAllExercises(exercises);
            } catch (error) {
                console.error("Error fetching exercises:", error);
            }
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

    // Dynamic Body Colors based on theme
    // Fallback for Dynamic Theme: Body highlighter usually expects hex strings.
    // PlatformColor cannot be converted to Hex easily.
    // We will use a safe fallback for System theme.
    // Dynamic Body Colors based on theme
    // Fallback for Dynamic Theme
    const isDynamic = theme.type === 'dynamic';
    // User requested "Accessory similar to main one, just lighter".
    const bodyColors = isDynamic
        ? ['#2DC4B680', '#2DC4B6'] // Light Teal (Accessory) and Teal (Target)
        : [`${theme.primary}60`, theme.primary];
    const safeBorder = isDynamic ? '#4d4d4dff' : theme.border;

    return (
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
            <ScrollView
                ref={scrollRef}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollViewContent}
            >
                <View style={styles.header}>
                    <View>
                        <Text style={styles.greeting}>Recovery Status</Text>
                        <Text style={styles.subGreeting}>Last 3 Days Activity</Text>
                    </View>
                    <View style={styles.headerButtons}>
                        <TouchableOpacity
                            onPress={handleRefresh}
                            style={styles.refreshButton}
                            disabled={isRefreshing}
                        >
                            {isRefreshing ? (
                                <ActivityIndicator size="small" color={theme.primary} />
                            ) : (
                                <Feather name="refresh-cw" size={24} color={theme.text} />
                            )}
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => router.push('/settings')} style={styles.settingsButton}>
                            <Feather name="settings" size={24} color={theme.text} />
                        </TouchableOpacity>
                    </View>
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
                            gender={gender}
                            side="front"
                            scale={1.1}
                            border={safeBorder}
                            colors={bodyColors}
                            bg={theme.surface}
                            defaultFill={theme.bodyFill}
                        />
                    </View>

                    <View style={styles.cardContainer}>
                        <Text style={styles.cardTitle}>Back</Text>
                        <Body
                            data={bodyData}
                            gender={gender}
                            side="back"
                            scale={1.1}
                            border={safeBorder}
                            colors={bodyColors}
                            bg={theme.surface}
                            defaultFill={theme.bodyFill}
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
                        refreshTrigger={isRefreshing}
                    />
                ))}

                <TouchableOpacity onPress={handleAddGraph} style={styles.addGraphButton}>
                    <GradientOrView
                        colors={[theme.surface, theme.surface]}
                        style={styles.addGraphGradient}
                        theme={theme}
                    >
                        <Feather name="plus-circle" size={24} color={theme.primary} />
                        <Text style={styles.addGraphText}>Add Progress Graph</Text>
                    </GradientOrView>
                </TouchableOpacity>

            </ScrollView>

            <ActionSheet
                ref={actionSheetRef}
                enableGestureBack={true}
                closeOnPressBack={true}
                androidCloseOnBackPress={true}
                containerStyle={styles.actionSheetContainer}
                indicatorStyle={styles.indicator}
                snapPoints={[100]}
                initialSnapIndex={0}
            >
                <View style={styles.contentContainer}>
                    <View style={styles.searchContainer}>
                        <View style={styles.searchBar}>
                            <Feather name="search" size={20} color={theme.textSecondary} style={styles.searchIcon} />
                            <TextInput
                                style={styles.searchInput}
                                placeholder="Search exercises to pin..."
                                placeholderTextColor={theme.textSecondary}
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
                                    <Feather name="plus" size={20} color={theme.primary} />
                                </View>
                            </TouchableOpacity>
                        )}
                        contentContainerStyle={styles.listContent}
                        ListEmptyComponent={
                            <View style={{ padding: 20, alignItems: 'center' }}>
                                <Text style={{ color: theme.textSecondary }}>
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

const getStyles = (theme) => {
    // Safe Colors for Reanimated (ActionSheet)
    const isDynamic = theme.type === 'dynamic';
    const safeIndicator = isDynamic ? '#aaaaaa' : theme.textSecondary;

    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: theme.background,
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
        headerButtons: {
            flexDirection: 'row',
            gap: 12,
        },
        refreshButton: {
            padding: 8,
            backgroundColor: theme.surface,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.border,
            minWidth: 40,
            minHeight: 40,
            alignItems: 'center',
            justifyContent: 'center',
            ...SHADOWS.small,
        },
        settingsButton: {
            padding: 8,
            backgroundColor: theme.surface,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.border,
            ...SHADOWS.small,
        },
        greeting: {
            fontSize: 28,
            fontFamily: FONTS.bold,
            color: theme.text,
        },
        subGreeting: {
            fontSize: 14,
            fontFamily: FONTS.medium,
            color: theme.textSecondary,
            marginTop: 4,
        },
        bodyScrollContent: {
            paddingHorizontal: 10,
            marginBottom: 20,
        },
        cardContainer: {
            backgroundColor: theme.surface,
            borderRadius: 24,
            padding: 20,
            marginHorizontal: 10,
            alignItems: 'center',
            justifyContent: 'center',
            width: 300,
            height: 500,
            borderWidth: 1,
            borderColor: theme.border,
            ...SHADOWS.medium,
        },
        cardTitle: {
            fontSize: 18,
            fontFamily: FONTS.semiBold,
            color: theme.textSecondary,
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
            color: theme.text,
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
            borderColor: theme.border,
            borderStyle: 'dashed',
            gap: 12,
        },
        addGraphText: {
            fontSize: 16,
            fontFamily: FONTS.semiBold,
            color: theme.primary,
        },
        actionSheetContainer: {
            backgroundColor: 'transparent',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            height: '85%',
        },
        indicator: {
            backgroundColor: safeIndicator,
        },
        contentContainer: {
            height: '100%',
            backgroundColor: theme.surface, // Use dynamic surface color here
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            overflow: 'hidden',
        },
        searchContainer: {
            padding: 16,
            backgroundColor: theme.surface,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
        },
        searchBar: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: theme.background,
            borderRadius: 12,
            paddingHorizontal: 12,
            height: 44,
            borderWidth: 1,
            borderColor: theme.border,
        },
        searchIcon: {
            marginRight: 10,
        },
        searchInput: {
            flex: 1,
            color: theme.text,
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
            backgroundColor: theme.surface,
            borderRadius: 16,
            marginBottom: 12,
            padding: 20,
            borderWidth: 1,
            borderColor: theme.border,
            ...SHADOWS.small,
        },
        exerciseContent: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
        exerciseName: {
            color: theme.text,
            fontSize: 16,
            fontFamily: FONTS.semiBold,
        },
    });
};
export default Home
