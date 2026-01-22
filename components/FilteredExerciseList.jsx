import { useState, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, Keyboard } from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import ActionSheet from "react-native-actions-sheet";
import { fetchExercises, fetchLastWorkoutSets } from '../components/db';
import { FONTS, SHADOWS } from '../constants/theme';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

const FilteredExerciseList = ({ exercises, actionSheetRef, setCurrentWorkout }) => {
    const { theme } = useTheme();
    const styles = getStyles(theme);
    const [searchQuery, setSearchQuery] = useState('');

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
                weight: hSet.weight?.toString() || null,
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
                <Text style={styles.exerciseName}>{item.name}</Text>
                <Feather name="plus" size={20} color={theme.primary} />
            </View>
        </TouchableOpacity>
    );

    return (
        <ActionSheet
            ref={actionSheetRef}
            containerStyle={styles.actionSheetContainer}
            indicatorStyle={styles.indicator}
            gestureEnabled={true}
            onClose={() => setSearchQuery('')}
        >
            <View style={styles.contentContainer}>
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
                    </View>
                </View>
                <FlatList
                    data={sortedAndFilteredExercises}
                    keyExtractor={(item) => item.exerciseID.toString()}
                    renderItem={renderItem}
                    keyboardShouldPersistTaps="always"
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    style={styles.list}
                    nestedScrollEnabled={true}
                    bounces={false}
                />
            </View>
        </ActionSheet>
    );
};

const getStyles = (theme) => {
    // Safe Colors for Reanimated (ActionSheet)
    const isDynamic = theme.type === 'dynamic';
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
            height: '85%',
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
            padding: 16,
            backgroundColor: theme.surface,
            borderBottomWidth: 1,
            borderBottomColor: safeBorder,
        },
        searchBar: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: safeBackground,
            borderRadius: 12,
            paddingHorizontal: 12,
            height: 44,
            borderWidth: 1,
            borderColor: safeBorder,
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
            ...SHADOWS.small,
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
    });
};

export default FilteredExerciseList;
