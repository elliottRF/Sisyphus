import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity } from 'react-native'
import React, { useState, useEffect } from 'react';
import Body from "react-native-body-highlighter";
import { MultipleSelectList } from 'react-native-dropdown-select-list'
import { insertExercise, updateExercise, fetchExercises } from '../components/db';
import { COLORS, FONTS, SHADOWS } from '../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';

const NewExercise = props => {
    const [exerciseName, setExerciseName] = useState("");
    const [targetSelected, setTargetSelected] = useState([]);
    const [accessorySelected, setAccessorySelected] = useState([]);
    const [formattedTargets, setFormattedTargets] = useState([]);
    const [isEditMode, setIsEditMode] = useState(false);

    // Load exercise data if exerciseID is provided
    useEffect(() => {
        const loadExercise = async () => {
            if (props.exerciseID) {
                setIsEditMode(true);
                const exercises = await fetchExercises();
                const exercise = exercises.find(ex => ex.exerciseID === props.exerciseID);

                if (exercise) {
                    setExerciseName(exercise.name);

                    // Parse target muscles
                    const targets = exercise.targetMuscle
                        ? exercise.targetMuscle.split(',').map(m => m.trim())
                        : [];
                    setTargetSelected(targets);

                    // Parse accessory muscles
                    const accessories = exercise.accessoryMuscles
                        ? exercise.accessoryMuscles.split(',').map(m => m.trim())
                        : [];
                    setAccessorySelected(accessories);

                    // Format targets for body visualization
                    const sluggedTargets = targets.map(target => ({
                        slug: typeof target === 'string' ? target.toLowerCase() : '',
                        intensity: 1
                    }));

                    const sluggedAccessories = accessories.map(accessory => ({
                        slug: typeof accessory === 'string' ? accessory.toLowerCase() : '',
                        intensity: 2
                    }));

                    setFormattedTargets([...sluggedTargets, ...sluggedAccessories]);
                }
            }
        };

        loadExercise();
    }, [props.exerciseID]);

    const handleOpened1 = () => {
        // Process target muscles (intensity 1)
        const sluggedTargets = targetSelected.map(target => {
            const name = typeof target === 'object' && target !== null
                ? target.name
                : target;

            const slug = typeof name === 'string'
                ? name.toLowerCase()
                : '';

            return {
                slug,
                intensity: 1
            };
        });

        // Process accessory muscles (intensity 2)
        const sluggedAccessories = accessorySelected.map(accessory => {
            const name = typeof accessory === 'object' && accessory !== null
                ? accessory.name
                : accessory;

            const slug = typeof name === 'string'
                ? name.toLowerCase()
                : '';

            return {
                slug,
                intensity: 2
            };
        });

        // Combine both arrays
        const combinedTargets = [...sluggedTargets, ...sluggedAccessories];

        setFormattedTargets(combinedTargets);
    };

    function formatListToString(list) {
        // Ensure the input is an array
        if (!Array.isArray(list)) {
            throw new Error("Input must be an array");
        }

        // Preserve exact format from dropdown (e.g., "Chest", "Upper-Back")
        // Do NOT lowercase or remove spaces/hyphens
        return list
            .map(item => String(item).trim()) // Only trim whitespace
            .filter(item => item.length > 0) // Remove empty strings
            .join(","); // Join with commas
    }

    const createExercise = async () => {
        if (!exerciseName.trim()) return;

        if (isEditMode && props.exerciseID) {
            await updateExercise(
                props.exerciseID,
                exerciseName,
                formatListToString(targetSelected),
                formatListToString(accessorySelected)
            );
        } else {
            await insertExercise(
                exerciseName,
                formatListToString(targetSelected),
                formatListToString(accessorySelected)
            );
        }

        props.close();
    }

    const targetMuscle = [
        { key: '1', value: 'Chest' },
        { key: '2', value: 'Triceps' },
        { key: '3', value: 'Deltoids' },
        { key: '4', value: 'Trapezius' },
        { key: '5', value: 'Upper-Back' },
        { key: '6', value: 'Lower-Back' },
        { key: '7', value: 'Biceps' },
        { key: '8', value: 'Forearm' },
        { key: '9', value: 'Abs' },
        { key: '10', value: 'Quadriceps' },
        { key: '11', value: 'Hamstring' },
        { key: '12', value: 'Gluteal' },
        { key: '13', value: 'Calves' },
        { key: '14', value: 'Adductors' },
    ]

    const accessoryMuscles = [
        { key: '1', value: 'Chest' },
        { key: '2', value: 'Triceps' },
        { key: '3', value: 'Deltoids' },
        { key: '4', value: 'Trapezius' },
        { key: '5', value: 'Upper-Back' },
        { key: '6', value: 'Lower-Back' },
        { key: '7', value: 'Biceps' },
        { key: '8', value: 'Forearm' },
        { key: '9', value: 'Abs' },
        { key: '10', value: 'Quadriceps' },
        { key: '11', value: 'Hamstring' },
        { key: '12', value: 'Gluteal' },
        { key: '13', value: 'Calves' },
        { key: '14', value: 'Adductors' },
    ]

    return (
        <View style={styles.container}>
            <ScrollView
                horizontal={false}
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                <View style={styles.bodyContainer}>
                    <Body
                        data={formattedTargets}
                        gender="male"
                        side="front"
                        scale={1}
                        border={COLORS.border}
                    />
                    <Body
                        data={formattedTargets}
                        gender="male"
                        side="back"
                        scale={1}
                        border={COLORS.border}
                    />
                </View>

                <TextInput
                    style={styles.input}
                    onChangeText={setExerciseName}
                    value={exerciseName}
                    placeholder="Add Name"
                    placeholderTextColor={COLORS.textSecondary}
                    keyboardType="text"
                    keyboardShouldPersistTaps="always"
                />

                <View style={styles.dropdownContainer}>
                    <MultipleSelectList
                        setSelected={(val) => setTargetSelected(val)}
                        data={targetMuscle}
                        save="value"
                        defaultOption={targetSelected}
                        label="Target Muscles"
                        placeholder="Target Muscles"
                        maxHeight={200}
                        search={false}
                        boxStyles={styles.dropdownBox}
                        inputStyles={styles.dropdownInput}
                        dropdownStyles={styles.dropdownList}
                        dropdownItemStyles={styles.dropdownItem}
                        dropdownTextStyles={styles.dropdownText}
                        checkBoxStyles={styles.checkbox}
                        badgeStyles={{ backgroundColor: COLORS.primary }}
                        labelStyles={{ color: COLORS.text, fontFamily: FONTS.medium, marginBottom: 8 }}
                        onSelect={handleOpened1}
                    />
                </View>

                <View style={styles.dropdownContainer}>
                    <MultipleSelectList
                        setSelected={(val) => setAccessorySelected(val)}
                        data={accessoryMuscles}
                        save="value"
                        defaultOption={accessorySelected}
                        label="Accessory Muscles"
                        placeholder="Accessory Muscles"
                        maxHeight={200}
                        search={false}
                        boxStyles={styles.dropdownBox}
                        inputStyles={styles.dropdownInput}
                        dropdownStyles={styles.dropdownList}
                        dropdownItemStyles={styles.dropdownItem}
                        dropdownTextStyles={styles.dropdownText}
                        checkBoxStyles={styles.checkbox}
                        badgeStyles={{ backgroundColor: COLORS.secondary }}
                        labelStyles={{ color: COLORS.text, fontFamily: FONTS.medium, marginBottom: 8 }}
                        onSelect={handleOpened1}
                    />
                </View>

                <TouchableOpacity onPress={createExercise} activeOpacity={0.8}>
                    <LinearGradient
                        colors={[COLORS.primary, COLORS.secondary]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.createButton}
                    >
                        <Text style={styles.createButtonText}>
                            {isEditMode ? 'Update Exercise' : 'Create Exercise'}
                        </Text>
                    </LinearGradient>
                </TouchableOpacity>

            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        height: '100%',
        backgroundColor: COLORS.background,
    },
    scrollContent: {
        paddingBottom: 100,
        paddingHorizontal: 20,
    },
    bodyContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        width: '100%',
        marginBottom: 30,
        marginTop: 20,
    },
    input: {
        backgroundColor: COLORS.surface,
        color: COLORS.text,
        fontFamily: FONTS.medium,
        fontSize: 16,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    dropdownContainer: {
        marginBottom: 20,
    },
    dropdownBox: {
        backgroundColor: COLORS.surface,
        borderColor: COLORS.border,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    dropdownInput: {
        color: COLORS.text,
        fontFamily: FONTS.medium,
        fontSize: 16,
    },
    dropdownList: {
        backgroundColor: COLORS.surface,
        borderColor: COLORS.border,
        marginTop: 8,
    },
    dropdownItem: {
        borderBottomColor: COLORS.border,
    },
    dropdownText: {
        color: COLORS.text,
        fontFamily: FONTS.medium,
    },
    checkbox: {
        borderColor: COLORS.textSecondary,
    },
    createButton: {
        paddingVertical: 18,
        borderRadius: 30,
        alignItems: 'center',
        marginTop: 20,
        ...SHADOWS.medium,
    },
    createButtonText: {
        color: COLORS.text,
        fontSize: 18,
        fontFamily: FONTS.bold,
        letterSpacing: 1,
    },
});

export default NewExercise;
