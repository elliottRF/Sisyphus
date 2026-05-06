import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Dimensions } from 'react-native'
import Animated, { FadeInDown, FadeIn, FadeOutDown, LinearTransition } from 'react-native-reanimated';
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useScrollToTop } from '@react-navigation/native';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ActionSheet from "react-native-actions-sheet";
import { FlatList } from 'react-native-gesture-handler';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Body from "react-native-body-highlighter";
import { fetchRecentMuscleUsage, getPinnedExercises, pinExercise, fetchExercises, fetchExerciseWorkoutCounts } from '../../components/db';
import { FONTS, SHADOWS } from '../../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import PRGraphCard from '../../components/PRGraphCard';
import BodyweightGraphCard from '../../components/bodyweightGraphCard';
import MuscleRadarChart from '../../components/MuscleRadarChart';
import ReadinessCard from '../../components/ReadinessCard';
import { useTheme } from '../../context/ThemeContext';
import { AppEvents, emit, on, off } from '../../utils/events';
import { muscleMapping, majorMuscles } from '../../constants/muscles';
import Fuse from 'fuse.js';


const { width: SCREEN_WIDTH } = Dimensions.get('window');


const GradientOrView = ({ colors, style, theme, children }) => {
    if (theme?.type === 'dynamic') {
        return (
            <View style={[style, { backgroundColor: theme.surface || '#ffffff' }]}>
                {children}
            </View>
        );
    }

    const safeColors = Array.isArray(colors) && colors.every(c => !!c)
        ? colors
        : ['#transparent', '#transparent'];

    return (
        <LinearGradient colors={safeColors} style={style}>
            {children}
        </LinearGradient>
    );
};


const Home = () => {
    const insets = useSafeAreaInsets();
    const { theme, gender, accessoryWeight, alternateView } = useTheme();
    const styles = getStyles(theme);

    const [bodyData, setBodyData] = useState([]);
    const [bodySide, setBodySide] = useState('front');
    const [pinnedExercises, setPinnedExercises] = useState([]);
    const [allExercises, setAllExercises] = useState([]);
    const [showBodyWeight, setShowBodyWeight] = useState(false);
    const [showMuscleRadar, setShowMuscleRadar] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [cardBodyWidth, setCardBodyWidth] = useState(0);
    const [allMusclesSorted, setAllMusclesSorted] = useState([]);
    const [workoutCounts, setWorkoutCounts] = useState(new Map());

    const actionSheetRef = useRef(null);
    const router = useRouter();
    const scrollRef = useRef(null);
    const readinessCardRef = useRef(null);

    const [muscleStatsData, setMuscleStatsData] = useState({});
    const [majorMuscleList, setMajorMuscleList] = useState([]);
    const [usageData, setUsageData] = useState([]);
    useScrollToTop(scrollRef);

    useEffect(() => {
        loadMuscleData();
        loadPinnedExercises();
        loadModulePrefs();
        fetchExerciseWorkoutCounts().then(setWorkoutCounts);
    }, [accessoryWeight]);

    useFocusEffect(
        React.useCallback(() => {
            loadModulePrefs();
            loadMuscleData();
            fetchExerciseWorkoutCounts().then(setWorkoutCounts);
        }, [accessoryWeight])
    );

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
            const usageData = await fetchRecentMuscleUsage(5);
            setUsageData(usageData);
            const muscleStats = {};
            const SETS_CAP = 6;
            const RECOVERY_WINDOW_DAYS = 4;
            const now = new Date();

            usageData.forEach(exercise => {
                if (!exercise.date) return;

                const exerciseDate = new Date(exercise.date);
                const diffInMs = now - exerciseDate;
                const hoursAgo = diffInMs / (1000 * 60 * 60);
                const daysAgoDecimal = hoursAgo / 24;

                if (daysAgoDecimal >= RECOVERY_WINDOW_DAYS || daysAgoDecimal < 0) return;

                const decayFactor = 1 - (daysAgoDecimal / RECOVERY_WINDOW_DAYS);

                const sets = parseInt(exercise.sets, 10) || 0;
                if (sets === 0) return;

                if (exercise.targetMuscle) {
                    exercise.targetMuscle.split(',').map(m => m.trim()).forEach(tm => {
                        if (tm) {
                            const target = muscleMapping[tm] || tm.toLowerCase();
                            if (!muscleStats[target]) muscleStats[target] = 0;
                            muscleStats[target] = Math.min(
                                SETS_CAP,
                                muscleStats[target] + (sets * decayFactor)
                            );
                        }
                    });
                }

                if (exercise.accessoryMuscles) {
                    exercise.accessoryMuscles.split(',').map(m => m.trim()).forEach(acc => {
                        if (acc) {
                            const accTarget = muscleMapping[acc] || acc.toLowerCase();
                            if (!muscleStats[accTarget]) muscleStats[accTarget] = 0;
                            muscleStats[accTarget] = Math.min(
                                SETS_CAP,
                                muscleStats[accTarget] + (sets * decayFactor * accessoryWeight)
                            );
                        }
                    });
                }
            });

            const allMusclesWithPercent = majorMuscles.map(muscle => {
                const maxScore = muscle.slugs.reduce((max, slug) => {
                    const score = muscleStats[slug] ?? 0;
                    return score > max ? score : max;
                }, 0);

                const percent = Math.max(0, Math.min(100, Math.round(100 - (maxScore / SETS_CAP) * 100)));
                return { label: muscle.label, percent };
            });

            allMusclesWithPercent.sort((a, b) => a.percent - b.percent);
            setAllMusclesSorted(allMusclesWithPercent);
            setMajorMuscleList(majorMuscles);

            const ALL_MUSCLE_SLUGS = [
                'chest', 'quadriceps', 'triceps', 'biceps', 'hamstring',
                'upper-back', 'lower-back', 'deltoids', 'gluteal', 'forearm',
                'trapezius', 'calves', 'abs', 'adductors', 'obliques',
                'tibialis', 'abductors', 'neck', 'hands', 'feet', 'knees', 'ankles'
            ];

            const newBodyData = ALL_MUSCLE_SLUGS.map(slug => {
                const score = muscleStats[slug] ?? 0;
                const percent = Math.max(0, Math.min(100, Math.round(100 - (score / SETS_CAP) * 100)));

                if (percent <= 60) return { slug, intensity: 3 };
                if (percent < 80) return { slug, intensity: 2 };
                return { slug, intensity: 1 };
            });

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
        fetchExerciseWorkoutCounts().then(setWorkoutCounts);
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

    const handleBodyPartPress = (bodyPart) => {
        const slug = bodyPart?.slug;
        if (!slug) return;
        const matched = majorMuscles.find(m => m.slugs.includes(slug));
        if (matched) readinessCardRef.current?.openMuscleByLabel(matched.label);
    };

    const fuse = useMemo(() => {
        return new Fuse(allExercises, {
            keys: ['name'],
            threshold: 0.35,
            includeScore: true,
            ignoreLocation: true,
        });
    }, [allExercises]);

    const filteredExercises = useMemo(() => {
        if (!searchQuery.trim()) {
            return [...allExercises].sort((a, b) => {
                const countA = workoutCounts.get(a.exerciseID) || 0;
                const countB = workoutCounts.get(b.exerciseID) || 0;
                if (countB !== countA) return countB - countA;
                return a.name.localeCompare(b.name);
            });
        }

        const searchResults = fuse.search(searchQuery);

        return searchResults
            .sort((a, b) => {
                if (Math.abs(a.score - b.score) > 0.1) {
                    return a.score - b.score;
                }
                const countA = workoutCounts.get(a.item.exerciseID) || 0;
                const countB = workoutCounts.get(b.item.exerciseID) || 0;
                if (countB !== countA) return countB - countA;
                return a.item.name.localeCompare(b.item.name);
            })
            .map(r => r.item);
    }, [searchQuery, allExercises, fuse]);


    const isDynamic = theme.type === 'dynamic';
    const bodyColors = isDynamic
        ? [theme.bodyFill, '#2DC4B655', '#2DC4B6CC']
        : [theme.bodyFill, `${theme.primary}55`, `${theme.primary}CC`];

    const safeBorder = isDynamic ? '#4d4d4dff' : theme.border;
    const cardWidth = (SCREEN_WIDTH - 32 - 12) / 2;

    const BODY_NATURAL_WIDTH = 170;
    const bodyScale = Math.min(0.95, ((cardBodyWidth || cardWidth) - 16) / BODY_NATURAL_WIDTH);

    // ── Alternate view: force both SVGs to identical width so front/back are symmetric
    const altBodyPanelWidth = Math.floor((SCREEN_WIDTH - 32 - 1) / 2); // 1px for divider
    const altBodyWidth = altBodyPanelWidth - 30; // increased padding each side
    const BODY_NATURAL_WIDTH_ALT = 170;
    const altBodyScale = altBodyWidth / BODY_NATURAL_WIDTH_ALT;

    return (
        <View style={[styles.container, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
            <ScrollView
                ref={scrollRef}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollViewContent}
                keyboardShouldPersistTaps="handled"
            >
                <Animated.View entering={FadeInDown.duration(400).delay(0).springify()} style={styles.header}>
                    <View>
                        <Text style={styles.greeting}>Recovery Status</Text>
                        <Text style={styles.subGreeting}>Based on Recent Workouts</Text>
                    </View>
                    <View style={styles.headerButtons}>
                        <TouchableOpacity onPress={handleRefresh} style={styles.refreshButton} disabled={isRefreshing}>
                            {isRefreshing ? <ActivityIndicator size="small" color={theme.text} /> : <Feather name="refresh-cw" size={24} color={theme.text} />}
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => router.push('/settings')} style={styles.settingsButton}>
                            <Feather name="settings" size={24} color={theme.text} />
                        </TouchableOpacity>
                    </View>
                </Animated.View>

                {!alternateView ? (
                    /* ── Dual Body (Normal View) ────────────────────────────────── */
                    <Animated.View entering={FadeInDown.duration(450).delay(80).springify()} style={{ marginTop: 10 }}>
                        <View style={styles.altBodyCard}>
                            <View style={styles.altLegendContainer}>
                                <Text style={styles.altCardTitle}>Fatigue Status</Text>
                                <View style={{ flexDirection: 'row', gap: 16 }}>
                                    <View style={styles.altLegendItem}>
                                        <View style={[styles.altLegendDot, { backgroundColor: bodyColors[2], borderColor: safeBorder }]} />
                                        <Text style={styles.altLegendText}>High</Text>
                                    </View>
                                    <View style={styles.altLegendItem}>
                                        <View style={[styles.altLegendDot, { backgroundColor: bodyColors[1], borderColor: safeBorder }]} />
                                        <Text style={styles.altLegendText}>Low</Text>
                                    </View>
                                </View>
                            </View>

                            <View style={styles.altBodyContentRow}>
                                <View style={[styles.altBodyPanel, { width: altBodyPanelWidth }]}>
                                    <View style={styles.altBodyCrop}>
                                        <Body
                                            data={bodyData}
                                            gender={gender}
                                            side="front"
                                            scale={altBodyScale}
                                            border={safeBorder}
                                            colors={bodyColors}
                                            width={altBodyWidth}
                                            onBodyPartPress={handleBodyPartPress}
                                        />
                                    </View>
                                </View>
                                <View style={styles.altBodyDivider} />
                                <View style={[styles.altBodyPanel, { width: altBodyPanelWidth }]}>
                                    <View style={styles.altBodyCrop}>
                                        <Body
                                            data={bodyData}
                                            gender={gender}
                                            side="back"
                                            scale={altBodyScale}
                                            border={safeBorder}
                                            colors={bodyColors}
                                            width={altBodyWidth}
                                            onBodyPartPress={handleBodyPartPress}
                                        />
                                    </View>
                                </View>
                            </View>
                        </View>

                        <ReadinessCard
                            ref={readinessCardRef}
                            allMusclesSorted={allMusclesSorted}
                            cardWidth={cardWidth}
                            usageData={usageData}
                            horizontal
                            showPercentage={false}
                        />
                    </Animated.View>
                ) : (
                    /* ── Swipeable (Alternate View) ─────────────────────────────── */
                    <Animated.View entering={FadeInDown.duration(450).delay(80).springify()} style={styles.recoverySideBySide}>
                        <View style={[styles.highlighterCard, { width: cardWidth }]} onLayout={(e) => setCardBodyWidth(e.nativeEvent.layout.width)}>
                            <View style={styles.highlighterHeader}>
                                <Text style={styles.highlighterTitle}>{bodySide === 'front' ? 'Front' : 'Back'}</Text>
                                <View style={styles.sideIndicators}>
                                    <View style={[styles.indicatorDot, bodySide === 'front' && styles.indicatorDotActive]} />
                                    <View style={[styles.indicatorDot, bodySide === 'back' && styles.indicatorDotActive]} />
                                </View>
                            </View>

                            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
                                onMomentumScrollEnd={(e) => setBodySide(e.nativeEvent.contentOffset.x > (cardBodyWidth * 0.5) ? 'back' : 'front')}
                                scrollEventThrottle={8}
                                style={styles.bodyScrollView}>
                                <View style={[styles.bodyViewWrapper, { width: cardBodyWidth || cardWidth }]}>
                                    <Body data={bodyData} gender={gender} side="front" scale={bodyScale} border={safeBorder} colors={bodyColors} bg="transparent" width={(cardBodyWidth || cardWidth) - 8} onBodyPartPress={handleBodyPartPress} />
                                </View>
                                <View style={[styles.bodyViewWrapper, { width: cardBodyWidth || cardWidth }]}>
                                    <Body data={bodyData} gender={gender} side="back" scale={bodyScale} border={safeBorder} colors={bodyColors} bg="transparent" width={(cardBodyWidth || cardWidth) - 8} onBodyPartPress={handleBodyPartPress} />
                                </View>
                            </ScrollView>
                        </View>

                        <ReadinessCard ref={readinessCardRef} allMusclesSorted={allMusclesSorted} cardWidth={cardWidth} usageData={usageData} />
                    </Animated.View>
                )}

                <Animated.View entering={FadeIn.duration(400).delay(200)} style={styles.divider} />

                <Animated.View entering={FadeInDown.duration(400).delay(240).springify()} style={[styles.sectionHeader, { marginTop: 0 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Feather name="trending-up" size={16} color={theme.primary} />
                        <Text style={styles.sectionTitle}>Progress Tracker</Text>
                    </View>
                </Animated.View>

                {showMuscleRadar && (
                    <Animated.View layout={LinearTransition} entering={FadeInDown.duration(400).delay(300).springify()}>
                        <MuscleRadarChart />
                    </Animated.View>
                )}
                {showBodyWeight && (
                    <Animated.View layout={LinearTransition} entering={FadeInDown.duration(400).delay(320).springify()}>
                        <BodyweightGraphCard theme={theme} />
                    </Animated.View>
                )}

                {pinnedExercises.map((exercise, index) => (
                    <Animated.View
                        key={exercise.exerciseID}
                        entering={FadeInDown.duration(400).delay(340 + index * 60).springify()}
                        exiting={FadeOutDown.duration(300)}
                        layout={LinearTransition}
                    >
                        <PRGraphCard
                            exerciseID={exercise.exerciseID}
                            exerciseName={exercise.name}
                            onRemove={loadPinnedExercises}
                            refreshTrigger={isRefreshing}
                        />
                    </Animated.View>
                ))}

                <Animated.View layout={LinearTransition} entering={FadeInDown.duration(400).delay(400).springify()}>
                    <TouchableOpacity onPress={handleAddGraph} style={styles.addGraphButton}>
                        <GradientOrView colors={[theme.surface, theme.surface]} style={styles.addGraphGradient} theme={theme}>
                            <Feather name="plus-circle" size={24} color={theme.primary} />
                            <Text style={styles.addGraphText}>Add Tracker</Text>
                        </GradientOrView>
                    </TouchableOpacity>
                </Animated.View>
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
                        showsVerticalScrollIndicator={false}
                        keyboardDismissMode="on-drag"
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={styles.exerciseCard}
                                onPress={() => handlePinExercise(item)}
                                activeOpacity={0.7}
                            >
                                <View style={styles.exerciseContent}>
                                    <View style={{ flex: 1, marginRight: 12 }}>
                                        <Text style={styles.exerciseName}>{item.name}</Text>
                                        {workoutCounts.has(item.exerciseID) && (
                                            <Text style={styles.usageCount}>
                                                {workoutCounts.get(item.exerciseID)} {workoutCounts.get(item.exerciseID) === 1 ? 'workout' : 'workouts'}
                                            </Text>
                                        )}
                                    </View>
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
    );
};

const getStyles = (theme) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.background
    },
    scrollViewContent: {
        paddingBottom: 100
    },
    header: {
        paddingHorizontal: 16,
        paddingTop: 20,
        paddingBottom: 10,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start'
    },
    headerButtons: {
        flexDirection: 'row',
        gap: 12
    },
    refreshButton: {
        padding: 10,
        backgroundColor: theme.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.border,
        ...SHADOWS.small,
    },
    settingsButton: {
        padding: 10,
        backgroundColor: theme.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.border,
        ...SHADOWS.small,
    },
    greeting: {
        fontSize: 28,
        fontFamily: FONTS.bold,
        color: theme.text
    },
    subGreeting: {
        fontSize: 14,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
        marginTop: 4
    },

    // ── Default layout ────────────────────────────────────────────────────────
    recoverySideBySide: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        marginBottom: 24,
        gap: 12,
        alignItems: 'stretch'
    },
    highlighterCard: {
        width: 0,
        minHeight: 405,
        backgroundColor: theme.surface,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: theme.border,
        ...SHADOWS.medium,
        overflow: 'hidden'
    },
    highlighterHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: theme.overlayBorder
    },
    highlighterTitle: {
        fontSize: 14,
        fontFamily: FONTS.bold,
        color: theme.textSecondary
    },
    sideIndicators: {
        flexDirection: 'row',
        gap: 4
    },
    indicatorDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: theme.overlayBorder
    },
    indicatorDotActive: {
        backgroundColor: theme.primary
    },
    bodyScrollView: {
        flex: 1,
    },
    bodyViewWrapper: {
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: -60,
        overflow: 'hidden',
        marginLeft: -1,
    },

    // ── Alternate layout ──────────────────────────────────────────────────────
    altBodyCard: {
        marginHorizontal: 16,
        marginBottom: 12,
        backgroundColor: theme.surface,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: theme.border,
        ...SHADOWS.medium,
        overflow: 'hidden',
    },
    altBodyContentRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    altBodyPanel: {
        alignItems: 'center',
        paddingTop: 0,
        paddingBottom: 0,
        overflow: 'hidden',
    },
    altBodyCrop: {
        marginVertical: -10,
    },
    altBodyDivider: {
        width: 1,
        height: 260,
        backgroundColor: theme.border,
        opacity: 0.3,
    },
    altLegendContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 16,
        paddingHorizontal: 20,
        marginBottom: -8,
    },
    altCardTitle: {
        fontSize: 11,
        fontFamily: FONTS.bold,
        color: theme.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 1.2,
        opacity: 0.7,
    },
    altLegendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    altLegendDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        borderWidth: 1,
    },
    altLegendText: {
        fontSize: 10,
        fontFamily: FONTS.bold,
        color: theme.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 1,
        opacity: 0.8,
    },



    // ── Rest ──────────────────────────────────────────────────────────────────
    divider: {
        height: 1,
        backgroundColor: theme.border,
        marginHorizontal: 16,
        marginBottom: 20,
        opacity: 0.5
    },
    sectionHeader: {
        paddingHorizontal: 16,
        marginBottom: 16,
        marginTop: 10
    },
    sectionTitle: {
        fontSize: 20,
        fontFamily: FONTS.bold,
        color: theme.text
    },
    addGraphButton: {
        marginHorizontal: 16,
        marginBottom: 30,
        borderRadius: 16,
        ...SHADOWS.small
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
        gap: 12
    },
    addGraphText: {
        fontSize: 16,
        fontFamily: FONTS.semiBold,
        color: theme.primary
    },
    actionSheetContainer: {
        backgroundColor: 'transparent',
        height: '100%'
    },
    indicator: {
        backgroundColor: '#aaaaaa'
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
    usageCount: {
        fontSize: 13,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
        marginTop: 2,
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
    readinessContent: {
        flex: 1,
    },
    compactGroup: {
        flexDirection: 'column',
        marginBottom: 6,
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
});

export default Home;