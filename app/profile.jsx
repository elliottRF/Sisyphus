import { View, Text, ScrollView, StyleSheet, TextInput, Keyboard, FlatList, TouchableOpacity} from 'react-native'
import React, { useState, useEffect, useRef } from 'react';

import { SafeAreaView } from 'react-native-safe-area-context';
import Body from "react-native-body-highlighter";
import { fetchExercises, fetchLatestWorkoutSession, getLatestWorkoutSession, insertWorkoutHistory, calculateIfPR } from '../components/db';
import ActionSheet from "react-native-actions-sheet";

import NewExercise from "../components/NewExercise"

import ExerciseHistory from "../components/exerciseHistory"
import Feather from '@expo/vector-icons/Feather';

const Profile = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [exercises, setExercises] = useState([]);
    const [selectedExerciseId, setSelectedExerciseId] = useState(null);
    const [currentExerciseName, setCurrentExerciseName] = useState(null)

    // New ref for create exercise action sheet
    const createExerciseActionSheetRef = useRef(null);
    const actionSheetRef = useRef(null);

    useEffect(() => {
        fetchExercises()
        .then(data => setExercises(data))
        .catch(err => console.error(err));
    }, []);



    

    // New function to handle exercise creation action sheet
    const openCreateExerciseSheet = () => {
        createExerciseActionSheetRef.current?.show();
    };



    const handleCloseCreateExerciseSheet = () => {
        createExerciseActionSheetRef.current?.hide();

        fetchExercises()
        .then(data => setExercises(data))
        .catch(err => console.error(err));

    };

    const sortedAndFilteredExercises = exercises
        .sort((a, b) => a.name.localeCompare(b.name))
        .filter(exercise =>
            exercise.name.toLowerCase().includes(searchQuery.toLowerCase())
        );

    const showExerciseInfo = (item) => {
        actionSheetRef.current?.show();
        setSelectedExerciseId(item.exerciseID);
        setCurrentExerciseName(item.name);
        console.log("open exercise actionsheet");
    };

    const handleClose = () => {
        actionSheetRef.current?.hide();
    };

    const renderItem = ({ item }) => (
        <TouchableOpacity 
            style={styles.exerciseButton} 
            onPress={() => showExerciseInfo(item)}
        >
            <Text style={styles.exerciseButtonText}>{item.name}</Text>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.container}>
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
                <TouchableOpacity 
                    style={styles.threeDotButton} 
                    onPress={openCreateExerciseSheet}
                >
                    <Feather name="plus" size={24} color="#fff" />
                </TouchableOpacity>
            </View>
            <FlatList
                data={sortedAndFilteredExercises}
                keyExtractor={(item) => item.exerciseID.toString()}
                renderItem={renderItem}
                keyboardShouldPersistTaps="always"
                contentContainerStyle={styles.list}
            />

            {/* Existing Exercise History ActionSheet */}
            <ActionSheet    
                ref={actionSheetRef} 
                containerStyle={styles.actionSheetContainer}
            >   
                <View style={styles.closeIconContainerUpperPosition}>
                    <TouchableOpacity onPress={handleClose} style={styles.closeIcon}>
                        <Feather name="x" size={30} color="#fff" />
                    </TouchableOpacity>
                </View>
                <ExerciseHistory exerciseID={selectedExerciseId} exerciseName={currentExerciseName}/>
            </ActionSheet>

            {/* New Create Exercise ActionSheet */}
            <ActionSheet
                ref={createExerciseActionSheetRef}
                containerStyle={styles.actionSheetContainer}
            >
                <View style={styles.closeIconContainerUpperPosition}>
                    <TouchableOpacity onPress={handleCloseCreateExerciseSheet} style={styles.closeIcon}>
                        <Feather name="x" size={30} color="#fff" />
                    </TouchableOpacity>
                </View>

                <NewExercise close={handleCloseCreateExerciseSheet}/>
            </ActionSheet>
        </SafeAreaView>
    )
}

const styles = StyleSheet.create({
    list: {
        paddingBottom: 80,
    },
    container: {
        flex: 1,
        backgroundColor: "#121212",
    },
    closeIconContainer: {
        position: 'absolute',
        bottom: 10,
        right: 10,
        zIndex: 1,
    },
    closeIconContainerUpperPosition: {
        position: 'absolute',
        top:10,
        right: 10,
        zIndex: 1,
    },



    closeIcon: {
        backgroundColor: 'rgba(85, 85, 85, 0.5)',
        padding: 10,
        borderRadius: 20,
    },
    actionSheetContainer: {
        height: '100%',
        overflow: 'hidden',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        backgroundColor: '#121212' 
    },
    searchContainer: {
        flexDirection: 'row', // Add this to align items horizontally
        alignItems: 'center', // Center items vertically
        padding: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    searchInput: {
        flex: 1, // Take up remaining space
        height: 40,
        backgroundColor: '#242424',
        borderRadius: 8,
        paddingHorizontal: 12,
        color: '#fff',
        fontSize: 16,
        marginRight: 10, // Add some spacing between input and three dots
    },
    threeDotButton: {
        padding: 10,
    },
    exerciseButton: {
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    exerciseButtonText: {
        color: '#fff',
        fontSize: 16,
    },
    createExerciseContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 20,
    },
    createExerciseButton: {
        backgroundColor: '#333',
        paddingVertical: 15,
        paddingHorizontal: 30,
        borderRadius: 10,
    },
    createExerciseButtonText: {
        color: '#fff',
        fontSize: 18,
        textAlign: 'center',
    },
});
  
export default Profile