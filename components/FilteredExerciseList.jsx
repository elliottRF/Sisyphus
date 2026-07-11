import { useState, useEffect, useRef, useMemo } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, Keyboard, ScrollView } from 'react-native';
// The library's own FlatList is pre-wired with the sheet's scroll/drag gesture
// coordination, so scrolling the list no longer fights the sheet's pan.
import ActionSheet, { FlatList } from "react-native-actions-sheet";
import { fetchExercises, fetchLastWorkoutSets, fetchExerciseWorkoutCounts } from '../components/db';
import { FONTS, getThemedShadow, isLightTheme, withAlpha } from '../constants/theme';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../context/ThemeContext';
import { broadMuscleGroups, muscleMapping } from '../constants/muscles';

import NewExercise from './NewExercise';
import { LinearGradient } from 'expo-linear-gradient';
import { formatWeight } from '../utils/units';
import Fuse from 'fuse.js';

const FilteredExerciseList = ({ exercises, actionSheetRef, setCurrentWorkout, onExerciseCreated, existingExerciseIds = [] }) => {
    const { theme, useImperial } = useTheme();
    const styles = getStyles(theme);
    const [searchQuery, setSearchQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const createExerciseActionSheetRef = useRef(null);
    const searchInputRef = useRef(null);
    const [workoutCounts, setWorkoutCounts] = useState(new Map());
    // Multi-select: stage several exercises, then add them all at once.
    const [selectedIds, setSelectedIds] = useState(() => new Set());
    // Quick muscle-group filter (null = All).
    const [activeFilter, setActiveFilter] = useState(null);
    // The sheet's keyboard handler leaves the footer's bottom edge just under
    // the keyboard — give it extra clearance while the keyboard is up.
    const [keyboardVisible, setKeyboardVisible] = useState(false);

    useEffect(() => {
        const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
        const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
        return () => { show.remove(); hide.remove(); };
    }, []);

    const existingSet = useMemo(() => new Set(existingExerciseIds), [existingExerciseIds]);

    useEffect(() => {
        if (isOpen) {
            const timer = setTimeout(() => {
                searchInputRef.current?.focus();
            }, 150);
            
            // Refresh counts when opening
            fetchExerciseWorkoutCounts().then(setWorkoutCounts);

            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    const safeBackground = theme.background;

    const openCreateExerciseSheet = () => {
        createExerciseActionSheetRef.current?.show();
    };

    const handleCloseCreateExerciseSheet = (newExercise) => {
        createExerciseActionSheetRef.current?.hide();
        if (onExerciseCreated) {
            onExerciseCreated();
        }

        if (newExercise && typeof newExercise === 'object') {
            // Close the main selection sheet too
            actionSheetRef.current?.hide();
            // Automatically add to workout
            inputExercise(newExercise);
        }
    };

    // Narrow to the selected muscle group first; search/sort runs on top of this.
    const muscleFiltered = useMemo(() => {
        if (!activeFilter) return exercises;
        const group = broadMuscleGroups.find((g) => g.label === activeFilter);
        if (!group) return exercises;
        const groupSlugs = new Set(group.slugs);
        // Match the primary (target) muscle only — secondary muscles shouldn't
        // surface an exercise under a group it isn't really for (e.g. a chest
        // fly with biceps as a secondary muscle showing under "Biceps").
        return exercises.filter((ex) => {
            const names = (ex.targetMuscle || '')
                .split(',').map((m) => m.trim()).filter(Boolean);
            return names.some((n) => groupSlugs.has(muscleMapping[n] || n.toLowerCase()));
        });
    }, [exercises, activeFilter]);

    const fuse = useMemo(() => {
        return new Fuse(muscleFiltered, {
            keys: ['name'],
            threshold: 0.35,
            includeScore: true,
            ignoreLocation: true,
        });
    }, [muscleFiltered]);

    const sortedAndFilteredExercises = useMemo(() => {
        // 1. If search is empty, return the full list sorted by frequency (workoutCount), then alphabetically
        if (!searchQuery.trim()) {
            return [...muscleFiltered].sort((a, b) => {
                const countA = workoutCounts.get(a.exerciseID) || 0;
                const countB = workoutCounts.get(b.exerciseID) || 0;
                if (countB !== countA) return countB - countA;
                return a.name.localeCompare(b.name);
            });
        }

        // 2. Perform the fuzzy search
        const results = fuse.search(searchQuery);

        // 3. Sort by relevance, then alphabetical
        return results
            .sort((a, b) => {
                // Priority 1: Fuzzy Match Strength (Score)
                // If one is clearly a better match, put it first
                if (Math.abs(a.score - b.score) > 0.1) {
                    return a.score - b.score;
                }

                // Priority 2: Frequency (Workout Count)
                const countA = workoutCounts.get(a.item.exerciseID) || 0;
                const countB = workoutCounts.get(b.item.exerciseID) || 0;
                if (countB !== countA) return countB - countA;

                // Priority 3: Alphabetical Tie-breaker
                // If they are equally relevant, sort A-Z
                return a.item.name.localeCompare(b.item.name);
            })
            .map(r => r.item);
    }, [searchQuery, muscleFiltered, fuse, workoutCounts]);

    const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 9);

    // Build a workout group for one exercise, seeded from its last session.
    const buildWorkoutEntry = async (item) => {
        const history = await fetchLastWorkoutSets(item.exerciseID);

        let setsToUse;
        if (history && history.length > 0) {
            setsToUse = history.map(hSet => ({
                id: generateId(),
                weight: formatWeight(hSet.weight, useImperial),
                reps: hSet.reps?.toString() || null,
                distance: hSet.distance?.toString() || null,
                // Exact fractional minutes — the clock field renders mm:ss.
                minutes: hSet.seconds ? String(hSet.seconds / 60) : null,
                setType: hSet.setType || 'N',
                completed: false
            }));
        } else {
            setsToUse = [{
                id: generateId(), weight: null, reps: null, distance: null,
                minutes: null, setType: 'N', completed: false,
            }];
        }

        return {
            id: generateId(),
            exercises: [{ id: generateId(), exerciseID: item.exerciseID, sets: setsToUse, notes: '' }],
        };
    };

    // Single add (used by the create-exercise flow): add immediately and close.
    const inputExercise = async (item) => {
        actionSheetRef.current?.hide();
        const entry = await buildWorkoutEntry(item);
        setCurrentWorkout((prev) => [...prev, entry]);
    };

    const toggleSelect = (item) => {
        Haptics.selectionAsync();
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(item.exerciseID)) next.delete(item.exerciseID);
            else next.add(item.exerciseID);
            return next;
        });
    };

    // Add every staged exercise in selection order, then close.
    const commitSelection = async () => {
        const staged = [...selectedIds]
            .map((id) => exercises.find((e) => e.exerciseID === id))
            .filter(Boolean);
        if (staged.length === 0) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const entries = await Promise.all(staged.map(buildWorkoutEntry));
        setCurrentWorkout((prev) => [...prev, ...entries]);
        actionSheetRef.current?.hide();
    };

    const renderItem = ({ item }) => {
        const selected = selectedIds.has(item.exerciseID);
        const already = existingSet.has(item.exerciseID);
        return (
            <TouchableOpacity
                style={[styles.exerciseCard, selected && styles.exerciseCardSelected]}
                onPress={() => toggleSelect(item)}
                activeOpacity={0.7}
            >
                <View style={styles.exerciseContent}>
                    <View style={{ flex: 1, marginRight: 12 }}>
                        <Text style={styles.exerciseName} numberOfLines={2}>{item.name}</Text>
                        <View style={styles.metaRow}>
                            {workoutCounts.has(item.exerciseID) && (
                                <Text style={styles.usageCount}>
                                    {workoutCounts.get(item.exerciseID)} {workoutCounts.get(item.exerciseID) === 1 ? 'workout' : 'workouts'}
                                </Text>
                            )}
                            {already && <Text style={styles.inWorkoutTag}>In workout</Text>}
                        </View>
                    </View>
                    <View style={[styles.plusIconContainer, selected && styles.checkIconContainer]}>
                        <Feather
                            name={selected ? 'check' : 'plus'}
                            size={20}
                            color={selected ? theme.textAlternate : theme.primary}
                        />
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <ActionSheet
            ref={actionSheetRef}
            containerStyle={styles.actionSheetContainer}
            indicatorStyle={styles.indicator}
            gestureEnabled={true}
            keyboardHandlerEnabled={true}
            onOpen={() => setIsOpen(true)}

            onClose={() => {
                setIsOpen(false);
                setSearchQuery('');
                setActiveFilter(null);
                setSelectedIds(new Set());
            }}
        >
            <View style={styles.contentContainer}>
                <View style={styles.searchContainer}>
                    <View style={styles.searchBar}>
                        <Feather name="search" size={20} color={theme.textSecondary} style={styles.searchIcon} />
                        <TextInput
                            ref={searchInputRef}
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
                        <ButtonBackground style={styles.addButtonGradient} theme={theme}>
                            <Feather name="plus" size={24} color={theme.textAlternate} />
                        </ButtonBackground>
                    </TouchableOpacity>
                </View>

                {/* Quick muscle-group filters */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyboardShouldPersistTaps="always"
                    style={styles.chipsScroll}
                    contentContainerStyle={styles.chipsRow}
                >
                    {['All', ...broadMuscleGroups.map((g) => g.label)].map((label) => {
                        const active = label === 'All' ? !activeFilter : activeFilter === label;
                        return (
                            <TouchableOpacity
                                key={label}
                                style={[styles.chip, active && styles.chipActive]}
                                onPress={() => setActiveFilter(label === 'All' ? null : label)}
                                activeOpacity={0.8}
                            >
                                <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>

                <FlatList
                    data={sortedAndFilteredExercises}
                    keyExtractor={(item) => item.exerciseID.toString()}
                    renderItem={renderItem}
                    keyboardShouldPersistTaps="always"
                    keyboardDismissMode="on-drag"
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    style={styles.list}
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <Feather name="search" size={32} color={theme.textSecondary} style={{ opacity: 0.4, marginBottom: 10 }} />
                            <Text style={styles.emptyTitle}>No exercises found</Text>
                            <Text style={styles.emptySubtitle}>Try a different search, or create it with the + button.</Text>
                        </View>
                    }
                />

                {selectedIds.size > 0 && (
                    <View style={[styles.footer, keyboardVisible && styles.footerAboveKeyboard]}>
                        <TouchableOpacity style={styles.addSelectedButton} onPress={commitSelection} activeOpacity={0.9}>
                            <Feather name="plus" size={20} color={theme.textAlternate} />
                            <Text style={styles.addSelectedText}>
                                Add {selectedIds.size} exercise{selectedIds.size > 1 ? 's' : ''}
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            {/* New Create Exercise ActionSheet */}
            <ActionSheet
                ref={createExerciseActionSheetRef}
                containerStyle={[styles.subActionSheetContainer, { backgroundColor: safeBackground }]}
            >
                <View style={styles.closeIconContainerUpperPosition}>
                    <TouchableOpacity onPress={handleCloseCreateExerciseSheet} style={styles.closeIcon}>
                        <Feather name="x" size={24} color={theme.text} />
                    </TouchableOpacity>
                </View>

                <NewExercise close={handleCloseCreateExerciseSheet} />
            </ActionSheet>
        </ActionSheet>
    );
};

const ButtonBackground = ({ children, style, theme }) => {
    // 1. Safety check: Fallback to a default hex if theme or colors are missing
    const primary = theme?.primary || '#444444';
    const secondary = theme?.secondary || '#222222';

    return (
        <LinearGradient
            // 2. Ensure colors is ALWAYS an array of valid strings
            colors={[primary, secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={style}
        >
            {children}
        </LinearGradient>
    );
};

const getStyles = (theme) => {
    // Safe Colors for Reanimated (ActionSheet)
    const lightTheme = isLightTheme(theme);
    const safeBackground = theme.background;
    const safeSurface = theme.surface;
    const safeBorder = theme.border;
    const safeText = theme.text;
    const safeTextSecondary = theme.textSecondary;

    return StyleSheet.create({
        actionSheetContainer: {
            // Filled (not transparent) so the bottom safe-area strip the sheet
            // adds under the Android gesture bar is the sheet colour, not a gap
            // showing the dimmed backdrop.
            backgroundColor: safeSurface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            height: '100%',
        },
        subActionSheetContainer: {
            height: '100%',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
        },
        indicator: {
            backgroundColor: safeTextSecondary,
        },
        contentContainer: {
            height: '100%',
            backgroundColor: theme.surface, // Use dynamic PlatformColor here
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            overflow: 'hidden',
        },
        searchContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            padding: 16,
            backgroundColor: theme.surface,
            borderBottomWidth: 1,
            borderBottomColor: safeBorder,
        },
        searchBar: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: safeBackground,
            borderRadius: 12,
            paddingHorizontal: 12,
            height: 44,
            borderWidth: 1,
            borderColor: safeBorder,
            marginRight: 12,
        },
        searchIcon: {
            marginRight: 10,
        },
        searchInput: {
            flex: 1,
            color: safeText, // input text color usually safe, but good component practice
            fontFamily: FONTS.medium,
            fontSize: 16,
            height: '100%',
        },
        clearButton: {
            padding: 4,
            marginLeft: 8,
        },
        addButton: {
            ...getThemedShadow(theme, 'medium'),
        },
        addButtonGradient: {
            width: 44,
            height: 44,
            borderRadius: 12,
            justifyContent: 'center',
            alignItems: 'center',
        },
        closeIconContainerUpperPosition: {
            position: 'absolute',
            top: 16,
            right: 16,
            zIndex: 1,
        },
        closeIcon: {
            backgroundColor: lightTheme ? 'rgba(255,255,255,0.94)' : theme.surface,
            padding: 8,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: lightTheme ? safeBorder : 'transparent',
        },
        chipsScroll: {
            flexGrow: 0,
            backgroundColor: theme.surface,
            borderBottomWidth: 1,
            borderBottomColor: safeBorder,
        },
        chipsRow: {
            paddingHorizontal: 16,
            paddingVertical: 12,
            gap: 8,
        },
        chip: {
            paddingHorizontal: 14,
            paddingVertical: 7,
            borderRadius: 100,
            backgroundColor: safeBackground,
            borderWidth: 1,
            borderColor: safeBorder,
        },
        chipActive: {
            backgroundColor: theme.primary,
            borderColor: theme.primary,
        },
        chipText: {
            fontSize: 13,
            fontFamily: FONTS.semiBold,
            color: safeTextSecondary,
        },
        chipTextActive: {
            color: theme.textAlternate,
        },
        list: {
            flex: 1,
            paddingHorizontal: 20,
        },
        listContent: {
            paddingTop: 16,
            paddingBottom: 40,
        },
        exerciseCard: {
            backgroundColor: theme.surface,
            borderRadius: 16,
            marginBottom: 12,
            padding: 20,
            borderWidth: 1,
            borderColor: safeBorder,
            // No shadow: the border separates the cards, and the elevation drew a
            // hard dark edge (especially over the tinted selected state).
        },
        exerciseCardSelected: {
            borderColor: theme.primary,
            backgroundColor: withAlpha(theme.primary, lightTheme ? 0.08 : 0.14),
        },
        exerciseContent: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
        exerciseName: {
            color: safeText,
            fontSize: 16,
            fontFamily: FONTS.semiBold,
        },
        metaRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginTop: 3,
        },
        usageCount: {
            color: safeTextSecondary,
            fontSize: 13,
            fontFamily: FONTS.medium,
        },
        inWorkoutTag: {
            color: theme.primary,
            fontSize: 11,
            fontFamily: FONTS.bold,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            backgroundColor: withAlpha(theme.primary, lightTheme ? 0.1 : 0.18),
            paddingHorizontal: 7,
            paddingVertical: 2,
            borderRadius: 100,
            overflow: 'hidden',
        },
        plusIconContainer: {
            width: 34,
            height: 34,
            borderRadius: 17,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: withAlpha(theme.primary, lightTheme ? 0.1 : 0.16),
        },
        checkIconContainer: {
            backgroundColor: theme.primary,
        },
        footer: {
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 16,
            borderTopWidth: 1,
            borderTopColor: safeBorder,
            backgroundColor: theme.surface,
        },
        footerAboveKeyboard: {
            paddingBottom: 44,
        },
        addSelectedButton: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            backgroundColor: theme.primary,
            borderRadius: 16,
            minHeight: 54,
            ...getThemedShadow(theme, 'medium'),
        },
        addSelectedText: {
            color: theme.textAlternate,
            fontSize: 16,
            fontFamily: FONTS.bold,
        },
        emptyState: {
            alignItems: 'center',
            justifyContent: 'center',
            paddingTop: 60,
            paddingHorizontal: 24,
        },
        emptyTitle: {
            color: safeText,
            fontSize: 16,
            fontFamily: FONTS.semiBold,
        },
        emptySubtitle: {
            color: safeTextSecondary,
            fontSize: 13,
            fontFamily: FONTS.regular,
            textAlign: 'center',
            marginTop: 4,
        },
    });
};

export default FilteredExerciseList;
