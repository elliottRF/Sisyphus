import { View, Text, ScrollView, StyleSheet, TextInput, Keyboard, FlatList, TouchableOpacity } from 'react-native'
import React, { useState, useEffect, useRef } from 'react';
import { useScrollToTop } from '@react-navigation/native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchExercises, fetchLatestWorkoutSession, getLatestWorkoutSession, insertWorkoutHistory, calculateIfPR } from '../components/db';
import ActionSheet from "react-native-actions-sheet";

import NewExercise from "../components/NewExercise"

import ExerciseHistory from "../components/exerciseHistory"
import Feather from '@expo/vector-icons/Feather';
import { FONTS, SHADOWS } from '../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '../context/ThemeContext';

const Profile = () => {
    const { theme } = useTheme();
    const styles = getStyles(theme);

    const scrollRef = useRef(null);
    useScrollToTop(scrollRef);
    const [searchQuery, setSearchQuery] = useState('');
    const [exercises, setExercises] = useState([]);
    const [selectedExerciseId, setSelectedExerciseId] = useState(null);
    const [currentExerciseName, setCurrentExerciseName] = useState(null)

    // New ref for create exercise action sheet
    const createExerciseActionSheetRef = useRef(null);
    const actionSheetRef = useRef(null);

    useFocusEffect(
        React.useCallback(() => {
            fetchExercises()
                .then(data => setExercises(data))
                .catch(err => console.error(err));
        }, [])
    );





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
            style={styles.exerciseCard}
            onPress={() => showExerciseInfo(item)}
            activeOpacity={0.7}
        >
            <View style={styles.exerciseContent}>
                <Text style={styles.exerciseName}>{item.name}</Text>
                <Feather name="chevron-right" size={20} color={theme.textSecondary} />
            </View>
        </TouchableOpacity>
    );

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
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
            <Text style={styles.title}>Exercises</Text>

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
                <TouchableOpacity
                    style={styles.addButton}
                    onPress={openCreateExerciseSheet}
                >
                    <ButtonBackground style={styles.addButtonGradient}>
                        <Feather name="plus" size={24} color="#fff" />
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
            />

            {/* Existing Exercise History ActionSheet */}
            <ActionSheet
                ref={actionSheetRef}
                containerStyle={[styles.actionSheetContainer, { backgroundColor: safeBackground }]}
                gestureEnabled={false}
            >
                <ExerciseHistory exerciseID={selectedExerciseId} exerciseName={currentExerciseName} />
            </ActionSheet>

            {/* New Create Exercise ActionSheet */}
            <ActionSheet
                ref={createExerciseActionSheetRef}
                containerStyle={[styles.actionSheetContainer, { backgroundColor: safeBackground }]}
            >
                <View style={styles.closeIconContainerUpperPosition}>
                    <TouchableOpacity onPress={handleCloseCreateExerciseSheet} style={styles.closeIcon}>
                        <Feather name="x" size={24} color="#fff" />
                    </TouchableOpacity>
                </View>

                <NewExercise close={handleCloseCreateExerciseSheet} />
            </ActionSheet>
        </SafeAreaView>
    )
}

const getStyles = (theme) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.background,
    },
    header: {
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 10,
    },
    title: {
        fontSize: 28,
        fontFamily: FONTS.bold,
        color: theme.text,
        padding: 20,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
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
        paddingHorizontal: 20,
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
    },
    actionSheetContainer: {
        height: '100%',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        // backgroundColor removed from here to be dynamic inline
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
});

export default Profile