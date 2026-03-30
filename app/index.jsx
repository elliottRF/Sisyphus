import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Keyboard, ActivityIndicator, Dimensions } from 'react-native'
import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useScrollToTop } from '@react-navigation/native';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ActionSheet from "react-native-actions-sheet";
import { FlatList } from 'react-native-gesture-handler';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Body from "react-native-body-highlighter";
import { fetchRecentMuscleUsage, getPinnedExercises, pinExercise, fetchExercises } from '../components/db';
import { FONTS, SHADOWS } from '../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import PRGraphCard from '../components/PRGraphCard';
import BodyweightGraphCard from '../components/bodyweightGraphCard';
import MuscleRadarChart from '../components/MuscleRadarChart';
import { useTheme } from '../context/ThemeContext';
import { AppEvents, emit, on, off } from '../utils/events';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

const TimeRangeSelector = ({ selectedRange, onSelect, theme, styles }) => {
    const ranges = ['1M', '6M', '1Y', 'ALL'];
    return (
        <View style={styles.rangeSelector}>
            {ranges.map(range => (
                <TouchableOpacity
                    key={range}
                    onPress={() => onSelect(range)}
                    style={[
                        styles.rangeButton,
                        selectedRange === range && styles.rangeButtonActive
                    ]}
                >
                    <Text style={[
                        styles.rangeText,
                        selectedRange === range && styles.rangeTextActive
                    ]}>
                        {range}
                    </Text>
                </TouchableOpacity>
            ))}
        </View>
    );
};

const Home = () => {
    const insets = useSafeAreaInsets();
    const { theme, gender, accessoryWeight } = useTheme();
    const styles = getStyles(theme);
    const [bodyData, setBodyData] = useState([]);
    const [bodySide, setBodySide] = useState('front');
    const [recoveryGroups, setRecoveryGroups] = useState({ rest: [], recovering: [], ready: [] });
    const [pinnedExercises, setPinnedExercises] = useState([]);
    const [allExercises, setAllExercises] = useState([]);
    const [showBodyWeight, setShowBodyWeight] = useState(false);
    const [showMuscleRadar, setShowMuscleRadar] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [cardBodyHeight, setCardBodyHeight] = useState(0);

    const [cardBodyWidth, setCardBodyWidth] = useState(0);
    const actionSheetRef = useRef(null);
    const router = useRouter();

    const scrollRef = useRef(null);
    useScrollToTop(scrollRef);

    // Pre-load data on component mount
    useEffect(() => {
        loadMuscleData();
        loadPinnedExercises();
        loadModulePrefs();
    }, [accessoryWeight]);

    // Reload module prefs on focus
    useFocusEffect(
        React.useCallback(() => {
            loadModulePrefs();
        }, [])
    );

    // Subscribe to events
    useEffect(() => {
        const handler = () => {
            loadMuscleData();
            loadPinnedExercises();
        };
        on(AppEvents.WORKOUT_COMPLETED, handler);
        on(AppEvents.WORKOUT_DATA_IMPORTED, handler);
        return () => {
            off(AppEvents.WORKOUT_COMPLETED, handler);
            off(AppEvents.WORKOUT_DATA_IMPORTED, handler);
        };
    }, [accessoryWeight]);

    const loadModulePrefs = async () => {
        try {
            const bwVal = await AsyncStorage.getItem('settings_showBodyWeight');
            setShowBodyWeight(bwVal === 'true');
            const mrVal = await AsyncStorage.getItem('settings_showMuscleRadar');
            setShowMuscleRadar(mrVal === 'true');
        } catch (e) {
            console.error("Failed to load module prefs", e);
        }
    };

    const loadMuscleData = async () => {
        try {
            const usageData = await fetchRecentMuscleUsage(3);
            const muscleStats = {};

            usageData.forEach(exercise => {
                const sets = parseInt(exercise.sets, 10) || 0;

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

            const ALL_MUSCLE_SLUGS = [
                'chest', 'quadriceps', 'triceps', 'biceps', 'hamstring',
                'upper-back', 'lower-back', 'deltoids', 'gluteal', 'forearm',
                'trapezius', 'calves', 'abs', 'adductors', 'obliques',
                'tibialis', 'abductors', 'neck', 'hands', 'feet', 'knees', 'ankles'
            ];

            const newBodyData = ALL_MUSCLE_SLUGS.map(slug => {
                const stats = muscleStats[slug];
                if (!stats) {
                    return { slug, intensity: 1 }; // green — fresh
                }
                const weightedScore = Math.round(
                    (stats.primarySets + (stats.accessorySets * accessoryWeight)) * 10
                ) / 10;

                if (weightedScore >= 3) {
                    return { slug, intensity: 3 }; // red — rest
                } else {
                    return { slug, intensity: 2 }; // amber — recovering
                }
            });

            setBodyData(newBodyData);

            const majorMuscles = [
                { label: 'Chest', slugs: ['chest'] },
                { label: 'Upper Back', slugs: ['upper-back', 'trapezius'] },
                { label: 'Lower Back', slugs: ['lower-back'] },
                { label: 'Shoulders', slugs: ['deltoids'] },
                { label: 'Biceps', slugs: ['biceps'] },
                { label: 'Triceps', slugs: ['triceps'] },
                { label: 'Forearms', slugs: ['forearm'] },
                { label: 'Quads', slugs: ['quadriceps'] },
                { label: 'Hamstrings', slugs: ['hamstring'] },
                { label: 'Glutes', slugs: ['gluteal'] },
                { label: 'Calves', slugs: ['calves'] },
                { label: 'Abs', slugs: ['abs', 'obliques'] },
            ];

            const categories = { rest: [], recovering: [], ready: [] };
            majorMuscles.forEach(muscle => {
                let maxScore = 0;
                muscle.slugs.forEach(slug => {
                    const stats = muscleStats[slug];
                    if (stats) {
                        const score = Math.round((stats.primarySets + (stats.accessorySets * accessoryWeight)) * 10) / 10;
                        if (score > maxScore) maxScore = score;
                    }
                });

                if (maxScore >= 3) categories.rest.push(muscle.label);
                else if (maxScore > 0) categories.recovering.push(muscle.label);
                else categories.ready.push(muscle.label);
            });

            setRecoveryGroups(categories);
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
            emit(AppEvents.REFRESH_HOME);
            await Promise.all([loadMuscleData(), loadPinnedExercises()]);
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

    const toggleBodyWeightGraph = async () => {
        try {
            const newState = !showBodyWeight;
            setShowBodyWeight(newState);
            await AsyncStorage.setItem('settings_showBodyWeight', String(newState));
        } catch (e) {
            console.error("Error saving body weight pref", e);
        }
    };

    const toggleMuscleRadar = async () => {
        try {
            const newState = !showMuscleRadar;
            setShowMuscleRadar(newState);
            await AsyncStorage.setItem('settings_showMuscleRadar', String(newState));
        } catch (e) {
            console.error("Error saving muscle radar pref", e);
        }
    };

    const filteredExercises = allExercises
        .filter(ex => ex.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name));

    const isDynamic = theme.type === 'dynamic';
    const bodyColors = isDynamic
        ? ['#2DC4B699', '#f59e0bbb', '#bd2121cc']
        : [`${theme.primary}99`, '#f59e0bbb', '#bd2121cc'];

    const safeBorder = isDynamic ? '#4d4d4dff' : theme.border;
    const cardWidth = (SCREEN_WIDTH - 32 - 12) / 2;
    const bodyHeight = cardBodyHeight > 0 ? cardBodyHeight - 37 : 280;

    return (
        <View style={[styles.container, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
            <ScrollView
                ref={scrollRef}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollViewContent}
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.header}>
                    <View>
                        <Text style={styles.greeting}>Recovery Status</Text>
                        <Text style={styles.subGreeting}>Last 3 Days Activity</Text>
                    </View>
                    <View style={styles.headerButtons}>
                        <TouchableOpacity onPress={handleRefresh} style={styles.refreshButton} disabled={isRefreshing}>
                            {isRefreshing ? <ActivityIndicator size="small" color={theme.text} /> : <Feather name="refresh-cw" size={24} color={theme.text} />}
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => router.push('/settings')} style={styles.settingsButton}>
                            <Feather name="settings" size={24} color={theme.text} />
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.recoverySideBySide}>
                    {/* Left Column: Swipeable Body Highlighter */}
                    <View
                        style={[styles.highlighterCard, { width: cardWidth }]}
                        onLayout={(e) => {
                            setCardBodyWidth(e.nativeEvent.layout.width);
                            setCardBodyHeight(e.nativeEvent.layout.height);
                        }}
                    >
                        <View style={styles.highlighterHeader}>
                            <Text style={styles.highlighterTitle}>{bodySide === 'front' ? 'Front' : 'Back'}</Text>
                            <View style={styles.sideIndicators}>
                                <View style={[styles.indicatorDot, bodySide === 'front' && styles.indicatorDotActive]} />
                                <View style={[styles.indicatorDot, bodySide === 'back' && styles.indicatorDotActive]} />
                            </View>
                        </View>

                        <ScrollView
                            horizontal
                            pagingEnabled
                            showsHorizontalScrollIndicator={false}
                            onMomentumScrollEnd={(e) => {
                                const side = e.nativeEvent.contentOffset.x > (cardBodyWidth * 0.5) ? 'back' : 'front';
                                setBodySide(side);
                            }}
                            scrollEventThrottle={8}
                            style={styles.bodyScrollView}
                        >
                            <View style={[styles.bodyViewWrapper, { width: cardBodyWidth || cardWidth }]}>
                                <Body
                                    data={bodyData}
                                    gender={gender}
                                    side="front"
                                    scale={0.9}
                                    border={safeBorder}
                                    colors={bodyColors}
                                    bg="transparent"
                                    width={cardBodyWidth || cardWidth}
                                    height={bodyHeight}
                                />
                            </View>
                            <View style={[styles.bodyViewWrapper, { width: cardBodyWidth || cardWidth }]}>
                                <Body
                                    data={bodyData}
                                    gender={gender}
                                    side="back"
                                    scale={0.9}
                                    border={safeBorder}
                                    colors={bodyColors}
                                    bg="transparent"
                                    width={cardBodyWidth || cardWidth}
                                    height={bodyHeight}
                                />
                            </View>
                        </ScrollView>
                    </View>

                    {/* Right Column: Compact Muscle Readiness Widget */}
                    <View style={[styles.readinessStickyCard, { width: cardWidth }]}>
                        <View style={styles.readinessHeader}>
                            <Feather name="activity" size={14} color={theme.primary} />
                            <Text style={styles.readinessTitle}>Readiness</Text>
                        </View>

                        <View style={styles.readinessContent}>
                            {/* READY first — most actionable */}
                            <View style={styles.compactGroup}>
                                <View style={[styles.compactBadge, { backgroundColor: `${theme.primary}10` }]}>
                                    <Text style={[styles.compactBadgeText, { color: theme.primary }]}>READY</Text>
                                </View>
                                <View style={styles.muscleTagsRow}>
                                    {recoveryGroups.ready.length > 0 ? (
                                        recoveryGroups.ready.map(muscle => (
                                            <View key={muscle} style={styles.muscleTag}>
                                                <Text style={[styles.compactTagText, { color: theme.primary }]}>{muscle}</Text>
                                            </View>
                                        ))
                                    ) : (
                                        <Text style={styles.emptyReadyText}>None</Text>
                                    )}
                                </View>
                            </View>

                            {recoveryGroups.recovering.length > 0 && (
                                <View style={styles.compactGroup}>
                                    <View style={[styles.compactBadge, { backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}>
                                        <Text style={[styles.compactBadgeText, { color: '#f59e0b' }]}>RECOV.</Text>
                                    </View>
                                    <View style={styles.muscleTagsRow}>
                                        {recoveryGroups.recovering.map(muscle => (
                                            <View key={muscle} style={styles.muscleTag}>
                                                <Text style={[styles.compactTagText, { color: '#f59e0b' }]}>{muscle}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            )}

                            {recoveryGroups.rest.length > 0 && (
                                <View style={styles.compactGroup}>
                                    <View style={[styles.compactBadge, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
                                        <Text style={[styles.compactBadgeText, { color: '#ef4444' }]}>REST</Text>
                                    </View>
                                    <View style={styles.muscleTagsRow}>
                                        {recoveryGroups.rest.map(muscle => (
                                            <View key={muscle} style={styles.muscleTag}>
                                                <Text style={[styles.compactTagText, { color: '#ef4444' }]}>{muscle}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            )}
                        </View>
                    </View>
                </View>
                <View style={styles.divider} />

                <View style={[styles.sectionHeader, { marginTop: 0 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Feather name="trending-up" size={16} color={theme.primary} />
                        <Text style={styles.sectionTitle}>Progress Tracker</Text>
                    </View>
                </View>

                {showMuscleRadar && <MuscleRadarChart />}
                {showBodyWeight && <BodyweightGraphCard theme={theme} />}

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
                    <GradientOrView colors={[theme.surface, theme.surface]} style={styles.addGraphGradient} theme={theme}>
                        <Feather name="plus-circle" size={24} color={theme.primary} />
                        <Text style={styles.addGraphText}>Add Tracker</Text>
                    </GradientOrView>
                </TouchableOpacity>
            </ScrollView>

            <ActionSheet ref={actionSheetRef} gestureEnabled={true} containerStyle={styles.actionSheetContainer} indicatorStyle={styles.indicator} onClose={() => setSearchQuery('')}>
                <View style={styles.contentContainer}>
                    <View style={styles.actionSheetHeader}>
                        <Text style={styles.actionSheetTitle}>Add Module</Text>
                    </View>

                    <View style={styles.modulesContainer}>
                        <TouchableOpacity
                            style={[
                                styles.moduleCard,
                                {
                                    borderColor: showBodyWeight ? theme.primary : theme.overlayBorder,
                                    backgroundColor: showBodyWeight ? theme.overlayMedium : theme.overlaySubtle,
                                }
                            ]}
                            onPress={toggleBodyWeightGraph}
                            activeOpacity={0.8}
                        >
                            <Feather name="activity" size={28} color={showBodyWeight ? theme.primary : theme.textSecondary} />
                            <Text style={[styles.moduleText, showBodyWeight && { color: theme.primary, fontFamily: FONTS.bold }]}>Body Weight</Text>
                            {showBodyWeight && (
                                <View style={styles.checkBadge}>
                                    <Feather name="check" size={10} color="white" />
                                </View>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                styles.moduleCard,
                                {
                                    borderColor: showMuscleRadar ? theme.primary : theme.overlayBorder,
                                    backgroundColor: showMuscleRadar ? theme.overlayMedium : theme.overlaySubtle,
                                }
                            ]}
                            onPress={toggleMuscleRadar}
                            activeOpacity={0.8}
                        >
                            <Feather name="pie-chart" size={28} color={showMuscleRadar ? theme.primary : theme.textSecondary} />
                            <Text style={[styles.moduleText, showMuscleRadar && { color: theme.primary, fontFamily: FONTS.bold }]}>Muscle Balance</Text>
                            {showMuscleRadar && (
                                <View style={styles.checkBadge}>
                                    <Feather name="check" size={10} color="white" />
                                </View>
                            )}
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.subHeader}>Exercises</Text>
                    <View style={styles.searchContainer}>
                        <View style={styles.searchBar}>
                            <Feather name="search" size={20} color={theme.textSecondary} style={styles.searchIcon} />
                            <TextInput
                                style={styles.searchInput}
                                placeholder="Search exercises to pin..."
                                placeholderTextColor={theme.textSecondary}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
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
        </View>
    )
}

const getStyles = (theme) => {
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
            paddingHorizontal: 16,
            paddingTop: 20,
            paddingBottom: 10,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
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
        sectionHeader: {
            paddingHorizontal: 16,
            marginBottom: 16,
            marginTop: 10,
        },
        sectionTitle: {
            fontSize: 20,
            fontFamily: FONTS.bold,
            color: theme.text,
        },
        addGraphButton: {
            marginHorizontal: 16,
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
            height: '85%',
        },
        indicator: {
            backgroundColor: safeIndicator,
        },
        contentContainer: {
            height: '100%',
            backgroundColor: theme.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            overflow: 'hidden',
        },
        searchContainer: {
            padding: 16,
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
        },
        listContent: {
            padding: 16,
            paddingBottom: 40,
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
        actionSheetHeader: {
            padding: 20,
            paddingBottom: 10,
        },
        actionSheetTitle: {
            fontSize: 20,
            fontFamily: FONTS.bold,
            color: theme.text,
        },
        subHeader: {
            fontSize: 16,
            fontFamily: FONTS.semiBold,
            color: theme.text,
            marginLeft: 16,
            marginTop: 10,
            marginBottom: 10,
        },
        modulesContainer: {
            flexDirection: 'row',
            paddingHorizontal: 20,
            gap: 16,
            marginBottom: 20,
        },
        moduleCard: {
            flex: 1,
            height: 110,
            borderRadius: 24,
            borderWidth: 1.5,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
        },
        moduleText: {
            fontSize: 14,
            fontFamily: FONTS.medium,
            color: theme.textSecondary,
        },
        checkBadge: {
            position: 'absolute',
            top: 10,
            right: 10,
            backgroundColor: theme.primary,
            width: 18,
            height: 18,
            borderRadius: 9,
            alignItems: 'center',
            justifyContent: 'center',
        },
        recoverySideBySide: {
            flexDirection: 'row',
            paddingHorizontal: 16,
            marginBottom: 24,
            gap: 12,
            alignItems: 'stretch', // both cards match the taller one's height
        },
        highlighterCard: {
            // Removed flex: 1 to use fixed width for exact equality
            width: 0, // placeholder, overridden by inline style
            minHeight: 300, // body highlighter needs a minimum
            backgroundColor: theme.surface,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: theme.border,
            ...SHADOWS.medium,
            overflow: 'hidden',
        },
        highlighterHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(255,255,255,0.05)',
        },
        highlighterTitle: {
            fontSize: 14,
            fontFamily: FONTS.bold,
            color: theme.textSecondary,
        },
        sideIndicators: {
            flexDirection: 'row',
            gap: 4,
        },
        indicatorDot: {
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: 'rgba(255,255,255,0.1)',
        },
        indicatorDotActive: {
            backgroundColor: theme.primary,
        },
        bodyScrollView: {
            flex: 1,
        },
        bodyViewWrapper: {
            alignItems: 'center',
            justifyContent: 'center',
        },
        readinessStickyCard: {
            // Removed flex: 1 to use fixed width for exact equality
            width: 0, // placeholder, overridden by inline style
            backgroundColor: theme.surface,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: theme.border,
            ...SHADOWS.medium,
            padding: 12,
            overflow: 'hidden',
        },
        readinessHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginBottom: 10,
        },
        readinessTitle: {
            fontSize: 16,
            fontFamily: FONTS.bold,
            color: theme.text,
        },
        readinessContent: {
            flex: 1,
        },
        compactGroup: {
            flexDirection: 'column',
            marginBottom: 10,
            gap: 5,
        },
        muscleTagsRow: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 4,
        },
        compactBadge: {
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 4,
            alignSelf: 'flex-start',
            height: 20,
            justifyContent: 'center',
        },
        compactBadgeText: {
            fontSize: 10,
            fontFamily: FONTS.bold,
            letterSpacing: 0.5,
        },
        muscleTag: {
            backgroundColor: theme.overlayInputFocused,
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: theme.border,
        },
        compactTagText: {
            fontSize: 13,
            fontFamily: FONTS.semiBold,
        },
        emptyReadyText: {
            fontSize: 13,
            fontFamily: FONTS.medium,
            color: theme.textSecondary,
            fontStyle: 'italic',
        },
        divider: {
            height: 1,
            backgroundColor: theme.border,
            marginHorizontal: 16,
            marginBottom: 20,
            opacity: 0.5,
        },
    });
};

export default Home