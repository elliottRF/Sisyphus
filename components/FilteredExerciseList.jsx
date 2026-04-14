import { useState, useEffect, useRef } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, Keyboard } from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import ActionSheet from "react-native-actions-sheet";
import { fetchExercises, fetchLastWorkoutSets } from '../components/db';
import { FONTS, getThemedShadow, isLightTheme } from '../constants/theme';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

import NewExercise from './NewExercise';
import { LinearGradient } from 'expo-linear-gradient';
import { formatWeight } from '../utils/units';

const FilteredExerciseList = ({ exercises, actionSheetRef, setCurrentWorkout, onExerciseCreated }) => {
    const { theme, useImperial } = useTheme();
    const styles = getStyles(theme);
    const [searchQuery, setSearchQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const createExerciseActionSheetRef = useRef(null);
    const searchInputRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            const timer = setTimeout(() => {
                searchInputRef.current?.focus();
            }, 150);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    const isDynamic = theme.type === 'dynamic';
    const safeBackground = isDynamic ? '#121212' : theme.background;
    const safeSurface = isDynamic ? '#1e1e1e' : theme.surface;

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

    // Sort exercises alphabetically and then filter based on search
    const sortedAndFilteredExercises = exercises
        .sort((a, b) => a.name.localeCompare(b.name))
        .filter(exercise =>
            exercise.name.toLowerCase().includes(searchQuery.toLowerCase())
        );

    const inputExercise = async (item) => {
        actionSheetRef.current?.hide();
        const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 9);

        // Fetch last workout sets for this exercise
        const history = await fetchLastWorkoutSets(item.exerciseID);

        let setsToUse;
        if (history && history.length > 0) {
            // Use all sets from history including warm-ups
            setsToUse = history.map(hSet => ({
                id: generateId(),
                weight: formatWeight(hSet.weight, useImperial),
                reps: hSet.reps?.toString() || null,
                distance: hSet.distance?.toString() || null,
                minutes: hSet.seconds ? (hSet.seconds / 60).toFixed(1).replace(/\.0$/, '') : null,
                setType: hSet.setType || 'N',
                completed: false
            }));
        } else {
            // No history, create a single empty set
            setsToUse = [{
                id: generateId(),
                weight: null,
                reps: null,
                distance: null,
                minutes: null,
                setType: 'N',
                completed: false
            }];
        }

        setCurrentWorkout((prevWorkouts) => [
            ...prevWorkouts,
            {
                id: generateId(),
                exercises: [
                    {
                        id: generateId(),
                        exerciseID: item.exerciseID,
                        sets: setsToUse,
                        notes: ''
                    }
                ]
            }
        ]);
    };

    const renderItem = ({ item }) => (
        <TouchableOpacity
            style={styles.exerciseCard}
            onPress={() => inputExercise(item)}
            activeOpacity={0.7}
        >
            <View style={styles.exerciseContent}>
                <Text style={styles.exerciseName} numberOfLines={2}>{item.name}</Text>
                <View style={styles.plusIconContainer}>
                    <Feather name="plus" size={20} color={theme.primary} />
                </View>
            </View>
        </TouchableOpacity>
    );

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
                            <Feather name="plus" size={24} color={theme.surface} />
                        </ButtonBackground>
                    </TouchableOpacity>
                </View>
                <FlatList
                    data={sortedAndFilteredExercises}
                    keyExtractor={(item) => item.exerciseID.toString()}
                    renderItem={renderItem}
                    keyboardShouldPersistTaps="always"
                    keyboardDismissMode="on-drag"

                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    style={styles.list}
                    nestedScrollEnabled={true}
                    bounces={false}
                />
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
    const isDynamic = theme?.type === 'dynamic';

    if (isDynamic) {
        return (
            <View style={[
                style,
                {
                    backgroundColor: primary,
                    alignItems: 'center',
                    justifyContent: 'center'
                }
            ]}>
                {children}
            </View>
        );
    }

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
    const isDynamic = theme.type === 'dynamic';
    const lightTheme = isLightTheme(theme);
    const safeBackground = isDynamic ? '#121212' : theme.background;
    const safeSurface = isDynamic ? '#1e1e1e' : theme.surface;
    const safeBorder = isDynamic ? 'rgba(255,255,255,0.1)' : theme.border;
    const safeText = isDynamic ? '#FFFFFF' : theme.text;
    const safeTextSecondary = isDynamic ? '#aaaaaa' : theme.textSecondary;

    return StyleSheet.create({
        actionSheetContainer: {
            backgroundColor: 'transparent',
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
        list: {
            flex: 1,
            paddingHorizontal: 20,
            paddingBottom: 100,
        },
        listContent: {
            paddingBottom: 40,
        },
        exerciseCard: {
            backgroundColor: theme.surface,
            borderRadius: 16,
            marginBottom: 12,
            padding: 20,
            borderWidth: 1,
            borderColor: safeBorder,
            ...getThemedShadow(theme, 'small'),
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
            flex: 1,
            marginRight: 12,
        },
        plusIconContainer: {
            justifyContent: 'center',
            alignItems: 'center',
        },
    });
};

export default FilteredExerciseList;
