import { useState, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, Keyboard } from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import ActionSheet from "react-native-actions-sheet";
import { fetchExercises } from '../components/db';
import { COLORS, FONTS, SHADOWS } from '../constants/theme';
import { Feather } from '@expo/vector-icons';

const FilteredExerciseList = ({ exercises, actionSheetRef, setCurrentWorkout }) => {
    const [searchQuery, setSearchQuery] = useState('');

    // Sort exercises alphabetically and then filter based on search
    const sortedAndFilteredExercises = exercises
        .sort((a, b) => a.name.localeCompare(b.name))
        .filter(exercise =>
            exercise.name.toLowerCase().includes(searchQuery.toLowerCase())
        );

    const inputExercise = (item) => {
        actionSheetRef.current?.hide();
        const uniqueId = Date.now().toString() + Math.random().toString(36).substr(2, 9);

        setCurrentWorkout((prevWorkouts) => [
            ...prevWorkouts,
            {
                id: uniqueId,
                exercises: [
                    {
                        exerciseID: item.exerciseID,
                        sets: [
                            {
                                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                                weight: null,
                                reps: null
                            }
                        ]
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
                <Feather name="plus" size={20} color={COLORS.primary} />
            </View>
        </TouchableOpacity>
    );

    return (
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
                            placeholder="Search exercises..."
                            placeholderTextColor={COLORS.textSecondary}
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

const styles = StyleSheet.create({
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

export default FilteredExerciseList;