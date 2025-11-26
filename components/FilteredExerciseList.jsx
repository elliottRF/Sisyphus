import { useState, useEffect } from 'react';
import { View, TextInput, FlatList, TouchableOpacity, Text, StyleSheet, Keyboard } from 'react-native';
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
        setCurrentWorkout((prevWorkouts) => [
            ...prevWorkouts,
            {
                exercises: [
                    {
                        exerciseID: item.exerciseID,
                        sets: [
                            {
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
            style={styles.exerciseButton}
            onPress={() => inputExercise(item)}
            activeOpacity={0.7}
        >
            <Text style={styles.exerciseButtonText}>{item.name}</Text>
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
    },
    listContent: {
        paddingBottom: 40,
    },
    exerciseButton: {
        paddingVertical: 16,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
        backgroundColor: COLORS.surface,
    },
    exerciseButtonText: {
        color: COLORS.text,
        fontSize: 16,
        fontFamily: FONTS.medium,
    }
});

export default FilteredExerciseList;