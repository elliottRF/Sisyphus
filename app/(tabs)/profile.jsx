import { View, Text, ScrollView, StyleSheet, TextInput, Keyboard, FlatList, TouchableOpacity } from 'react-native'
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useScrollToTop } from '@react-navigation/native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchExercises, fetchLatestWorkoutSession, getLatestWorkoutSession, insertWorkoutHistory, calculateIfPR, fetchExerciseWorkoutCounts, getExerciseSnapshot } from '../../components/db';

import Feather from '@expo/vector-icons/Feather';
import { FONTS, SHADOWS } from '../../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter, useSegments } from 'expo-router';
import { useTheme } from '../../context/ThemeContext';
import { primeGraphData } from '../../components/PRGraphCard';
import Fuse from 'fuse.js';

const Profile = () => {
    const insets = useSafeAreaInsets();
    const { theme } = useTheme();
    const styles = getStyles(theme);

    const scrollRef = useRef(null);
    useScrollToTop(scrollRef);
    const [searchQuery, setSearchQuery] = useState('');
    const [exercises, setExercises] = useState([]);
    const [workoutCounts, setWorkoutCounts] = useState(new Map());

    const router = useRouter();
    const segments = useSegments();

    useEffect(() => {
        if (segments[0] === '(tabs)' && segments[1] !== 'profile') {
            setSearchQuery('');
        }
    }, [segments]);

    // Pre-load on mount
    useEffect(() => {
        Promise.all([fetchExercises(), fetchExerciseWorkoutCounts()])
            .then(([data, counts]) => {
                setExercises(data);
                setWorkoutCounts(counts);
            })
            .catch(err => console.error(err));
    }, []);

    useFocusEffect(
        React.useCallback(() => {
            Promise.all([fetchExercises(), fetchExerciseWorkoutCounts()])
                .then(([data, counts]) => {
                    setExercises(data);
                    setWorkoutCounts(counts);
                })
                .catch(err => console.error(err));
        }, [])
    );





    const openCreateExerciseSheet = () => {
        router.push('/exercise/new');
    };

    const [loadingExerciseID, setLoadingExerciseID] = useState(null);



    const fuse = useMemo(() => {
        return new Fuse(exercises, {
            keys: ['name'],
            threshold: 0.35,      // 0.3 - 0.4 is usually the "sweet spot"
            includeScore: true,   // CRITICAL: We need the score to sort properly
            ignoreLocation: true,
            minMatchCharLength: 2,
        });
    }, [exercises]);

    const sortedAndFilteredExercises = useMemo(() => {
        if (!searchQuery.trim()) {
            // Just sort by usage if no search
            return [...exercises].sort((a, b) =>
                (workoutCounts.get(b.exerciseID) ?? 0) - (workoutCounts.get(a.exerciseID) ?? 0)
            );
        }

        const searchResults = fuse.search(searchQuery);

        return searchResults
            .sort((a, b) => {
                // 1. If one is a significantly better fuzzy match, prioritize it
                // Score 0 is perfect. We give a 0.2 buffer.
                if (Math.abs(a.score - b.score) > 0.2) {
                    return a.score - b.score;
                }

                // 2. If the matches are "close enough" in quality, 
                // use workout count as the tie-breaker.
                const countA = workoutCounts.get(a.item.exerciseID) ?? 0;
                const countB = workoutCounts.get(b.item.exerciseID) ?? 0;

                return countB - countA;
            })
            .map(r => r.item); // Map to item at the VERY end
    }, [searchQuery, exercises, workoutCounts, fuse]);

    const prewarmExercise = (exerciseID) => {
        // Start loading from disk into memory cache as soon as the user touches the card
        getExerciseSnapshot(exerciseID).catch(() => { });
    };

    const showExerciseInfo = async (item) => {
        if (loadingExerciseID) return;

        setLoadingExerciseID(item.exerciseID);

        try {
            const snapshot = await getExerciseSnapshot(item.exerciseID);
            if (snapshot) {
                primeGraphData(
                    snapshot.graphData,
                    !!snapshot.isAssisted,
                    snapshot.graphData3m
                );
            }
            router.push(`/exercise/${item.exerciseID}?name=${encodeURIComponent(item.name)}`);
        } catch (error) {
            console.error('Error prewarming exercise snapshot:', error);
            router.push(`/exercise/${item.exerciseID}?name=${encodeURIComponent(item.name)}`);
        } finally {
            setTimeout(() => setLoadingExerciseID(null), 300);
        }
    };


    const renderItem = ({ item }) => {
        const count = workoutCounts.get(item.exerciseID) ?? 0;
        const hasMuscles = (item.targetMuscle && item.targetMuscle.trim() !== '') ||
            (item.accessoryMuscles && item.accessoryMuscles.trim() !== '');

        return (
            <TouchableOpacity
                style={styles.exerciseCard}
                onPress={() => showExerciseInfo(item)}
                onPressIn={() => prewarmExercise(item.exerciseID)}
                activeOpacity={0.7}
            >
                <View style={styles.exerciseContent}>
                    <Text style={styles.exerciseName} numberOfLines={1} ellipsizeMode="tail">
                        {item.name}
                    </Text>
                    <View style={styles.exerciseRight}>
                        {!hasMuscles && !item.isCardio && (
                            <TouchableOpacity
                                onPress={() => router.push(`/exercise/new?id=${item.exerciseID}`)}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                                <Feather name="help-circle" size={18} color={theme.textSecondary} />
                            </TouchableOpacity>
                        )}
                        {count > 0 && (
                            <Text style={styles.workoutCount}>{count}×</Text>
                        )}
                        <Feather name="chevron-right" size={20} color={theme.textSecondary} />
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    // Safe Colors for Reanimated / Linear Gradient fallbacks
    const isDynamic = theme.type === 'dynamic';
    const safeSurface = isDynamic ? '#1e1e1e' : theme.surface;
    const safeBackground = isDynamic ? '#121212' : theme.background;

    // Helper for Button Gradient
    const ButtonBackground = ({ children, style }) => {
        if (isDynamic) {
            return (
                <View style={[style, { backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }]}>
                    {children}
                </View>
            );
        }
        return (
            <LinearGradient
                colors={[theme.primary, theme.secondary]}
                style={style}
            >
                {children}
            </LinearGradient>
        );
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
            <View style={styles.header}>
                <Text style={styles.title}>Exercises</Text>
            </View>

            <View style={styles.searchContainer}>
                <View style={styles.searchBar}>
                    <Feather name="search" size={20} color={theme.textSecondary} style={styles.searchIcon} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search exercises..."
                        placeholderTextColor={theme.textSecondary}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        returnKeyType="done"
                        onSubmitEditing={Keyboard.dismiss}

                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity
                            onPress={() => setSearchQuery('')}
                            style={styles.clearButton}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <Feather name="x" size={20} color={theme.textSecondary} />
                        </TouchableOpacity>
                    )}
                </View>
                <TouchableOpacity
                    style={styles.addButton}
                    onPress={openCreateExerciseSheet}
                >
                    <ButtonBackground style={styles.addButtonGradient}>
                        <Feather name="plus" size={24} color={theme.textAlternate} />
                    </ButtonBackground>
                </TouchableOpacity>
            </View>

            <FlatList
                ref={scrollRef}
                data={sortedAndFilteredExercises}
                keyExtractor={(item) => item.exerciseID.toString()}
                renderItem={renderItem}
                keyboardShouldPersistTaps="always"
                contentContainerStyle={styles.list}
                showsVerticalScrollIndicator={false}
                keyboardDismissMode="on-drag"
            />


        </View>
    )
}

const getStyles = (theme) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.background,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingHorizontal: 16,
        paddingTop: 20,
        paddingBottom: 10,
    },
    title: {
        fontSize: 28,
        fontFamily: FONTS.bold,
        color: theme.text,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        marginBottom: 20,
    },
    searchBar: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.surface,
        borderRadius: 12,
        paddingHorizontal: 12,
        height: 50,
        borderWidth: 1,
        borderColor: theme.border,
        marginRight: 12,
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
    clearButton: {
        padding: 4,
        marginLeft: 8,
    },
    addButton: {
        ...SHADOWS.medium,
    },
    addButtonGradient: {
        width: 50,
        height: 50,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    list: {
        paddingHorizontal: 16,
        paddingBottom: 100,
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
        flex: 1,           // takes all available space
        marginRight: 8,
    },
    closeIconContainerUpperPosition: {
        position: 'absolute',
        top: 16,
        right: 16,
        zIndex: 1,
    },
    closeIcon: {
        backgroundColor: theme.surface,
        padding: 8,
        borderRadius: 20,
    },
    exerciseRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
    },
    workoutCount: {
        color: theme.textSecondary,
        fontFamily: FONTS.medium,
        fontSize: 14,
    },
});

export default Profile
