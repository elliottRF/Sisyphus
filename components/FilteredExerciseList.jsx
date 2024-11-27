import { useState, useEffect } from 'react';
import { View, TextInput, FlatList, TouchableOpacity, Text, StyleSheet, Keyboard } from 'react-native';
import ActionSheet from "react-native-actions-sheet";
import { fetchExercises } from '../components/db';

const FilteredExerciseList = ({  exercises, actionSheetRef, setCurrentWorkout }) => {
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
        >
            <Text style={styles.exerciseButtonText}>{item.name}</Text>
        </TouchableOpacity>
    );

    return (
        <ActionSheet 
            ref={actionSheetRef} 
            overlayColor="transparent" 
            containerStyle={styles.actionSheetContainer}

        >
            
            <View style={styles.searchContainer}>
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search exercises..."
                    placeholderTextColor="#666"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                />
            </View>
            <FlatList
                data={sortedAndFilteredExercises}
                keyExtractor={(item) => item.exerciseID.toString()}
                renderItem={renderItem}
                keyboardShouldPersistTaps="always"
            />
        </ActionSheet>
    );
};

const styles = StyleSheet.create({
    searchContainer: {
        padding: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    actionSheetContainer: {
        borderTopLeftRadius: 20, // Rounded corners on top-left
        borderTopRightRadius: 20, // Rounded corners on top-right
        backgroundColor: '#121212' 
      },
    searchInput: {
        height: 40,
        backgroundColor: '#242424',
        borderRadius: 8,
        paddingHorizontal: 12,
        color: '#fff',
        fontSize: 16,
    },
    exerciseButton: {
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    exerciseButtonText: {
        color: '#fff',
        fontSize: 16,
    }
});

export default FilteredExerciseList;