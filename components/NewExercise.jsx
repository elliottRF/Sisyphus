import { View, Text, StyleSheet, TextInput, TouchableOpacity, Modal, FlatList } from 'react-native';
import React, { useState, useEffect } from 'react';
import Body from 'react-native-body-highlighter';
import { insertExercise, updateExercise, fetchExercises } from '../components/db';
import { COLORS, FONTS, SHADOWS } from '../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useScrollHandlers } from 'react-native-actions-sheet';
import { NativeViewGestureHandler } from 'react-native-gesture-handler';
import { ScrollView as RNScrollView } from 'react-native';

const NewExercise = (props) => {
    const [exerciseName, setExerciseName] = useState('');
    const [targetSelected, setTargetSelected] = useState([]);
    const [accessorySelected, setAccessorySelected] = useState([]);
    const [formattedTargets, setFormattedTargets] = useState([]);
    const [isEditMode, setIsEditMode] = useState(false);
    const [targetModalVisible, setTargetModalVisible] = useState(false);
    const [accessoryModalVisible, setAccessoryModalVisible] = useState(false);

    // Load exercise data if exerciseID is provided
    useEffect(() => {
        const loadExercise = async () => {
            if (props.exerciseID) {
                setIsEditMode(true);
                const exercises = await fetchExercises();
                const exercise = exercises.find((ex) => ex.exerciseID === props.exerciseID);

                if (exercise) {
                    setExerciseName(exercise.name);

                    // Parse target muscles
                    const targets = exercise.targetMuscle ? exercise.targetMuscle.split(',').map((m) => m.trim()) : [];
                    setTargetSelected(targets);

                    // Parse accessory muscles
                    const accessories = exercise.accessoryMuscles ? exercise.accessoryMuscles.split(',').map((m) => m.trim()) : [];
                    setAccessorySelected(accessories);

                    // Format targets for body visualization
                    const sluggedTargets = targets.map((target) => ({
                        slug: target.toLowerCase(),
                        intensity: 1,
                    }));

                    const sluggedAccessories = accessories.map((accessory) => ({
                        slug: accessory.toLowerCase(),
                        intensity: 2,
                    }));

                    setFormattedTargets([...sluggedTargets, ...sluggedAccessories]);
                }
            }
        };

        loadExercise();
    }, [props.exerciseID]);

    const toggleTargetSelection = (value) => {
        setTargetSelected((prev) => {
            const newSelected = prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value];
            setFormattedTargets([
                ...newSelected.map((target) => ({ slug: target.toLowerCase(), intensity: 1 })),
                ...accessorySelected.map((accessory) => ({ slug: accessory.toLowerCase(), intensity: 2 })),
            ]);
            return newSelected;
        });
    };

    const toggleAccessorySelection = (value) => {
        setAccessorySelected((prev) => {
            const newSelected = prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value];
            setFormattedTargets([
                ...targetSelected.map((target) => ({ slug: target.toLowerCase(), intensity: 1 })),
                ...newSelected.map((accessory) => ({ slug: accessory.toLowerCase(), intensity: 2 })),
            ]);
            return newSelected;
        });
    };

    function formatListToString(list) {
        if (!Array.isArray(list)) {
            throw new Error('Input must be an array');
        }

        // Preserve exact format from dropdown (e.g., "Chest", "Upper-Back")
        return list.map((item) => String(item).trim()).filter((item) => item.length > 0).join(',');
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
            await insertExercise(exerciseName, formatListToString(targetSelected), formatListToString(accessorySelected));
        }

        props.close();
    };

    const muscleOptions = [
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
    ];

    const handlers = useScrollHandlers();

    return (
        <View style={styles.container}>
            <NativeViewGestureHandler simultaneousHandlers={handlers.simultaneousHandlers}>
                <RNScrollView
                    {...handlers}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    showsHorizontalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.bodyContainer}>
                        <Body data={formattedTargets} gender="male" side="front" scale={1} border={COLORS.border} />
                        <Body data={formattedTargets} gender="male" side="back" scale={1} border={COLORS.border} />
                    </View>

                    <TextInput
                        style={styles.input}
                        onChangeText={setExerciseName}
                        value={exerciseName}
                        placeholder="Add Name"
                        placeholderTextColor={COLORS.textSecondary}
                        keyboardType="default"
                    />

                    <View style={styles.dropdownContainer}>
                        <Text style={styles.label}>Target Muscles</Text>
                        <TouchableOpacity style={styles.dropdownBox} onPress={() => setTargetModalVisible(true)}>
                            <Text style={styles.dropdownInput}>
                                {targetSelected.length > 0 ? targetSelected.join(', ') : 'Select Target Muscles'}
                            </Text>
                            <Feather name="chevron-down" size={20} color={COLORS.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.dropdownContainer}>
                        <Text style={styles.label}>Accessory Muscles</Text>
                        <TouchableOpacity style={styles.dropdownBox} onPress={() => setAccessoryModalVisible(true)}>
                            <Text style={styles.dropdownInput}>
                                {accessorySelected.length > 0 ? accessorySelected.join(', ') : 'Select Accessory Muscles'}
                            </Text>
                            <Feather name="chevron-down" size={20} color={COLORS.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity onPress={createExercise} activeOpacity={0.8}>
                        <LinearGradient
                            colors={[COLORS.primary, COLORS.secondary]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.createButton}
                        >
                            <Text style={styles.createButtonText}>{isEditMode ? 'Update Exercise' : 'Create Exercise'}</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </RNScrollView>
            </NativeViewGestureHandler>

            {/* Target Muscles Modal */}
            <Modal
                visible={targetModalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setTargetModalVisible(false)}
            >
                <View style={styles.modalContainer}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Select Target Muscles</Text>
                        <FlatList
                            data={muscleOptions}
                            keyExtractor={(item) => item.key}
                            contentContainerStyle={{ paddingHorizontal: 8 }}
                            showsVerticalScrollIndicator={true}
                            renderItem={({ item }) => (
                                <TouchableOpacity style={styles.listItem} onPress={() => toggleTargetSelection(item.value)}>
                                    <Text style={styles.listText}>{item.value}</Text>
                                    <Feather
                                        name={targetSelected.includes(item.value) ? 'check-square' : 'square'}
                                        size={20}
                                        color={COLORS.text}
                                    />
                                </TouchableOpacity>
                            )}
                        />
                        <TouchableOpacity
                            style={styles.doneButton}
                            onPress={() => setTargetModalVisible(false)}
                        >
                            <Text style={styles.doneText}>Done</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Accessory Muscles Modal */}
            <Modal
                visible={accessoryModalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setAccessoryModalVisible(false)}
            >
                <View style={styles.modalContainer}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Select Accessory Muscles</Text>
                        <FlatList
                            data={muscleOptions}
                            keyExtractor={(item) => item.key}
                            contentContainerStyle={{ paddingHorizontal: 8 }}
                            showsVerticalScrollIndicator={true}
                            renderItem={({ item }) => (
                                <TouchableOpacity style={styles.listItem} onPress={() => toggleTargetSelection(item.value)}>
                                    <Text style={styles.listText}>{item.value}</Text>
                                    <Feather
                                        name={targetSelected.includes(item.value) ? 'check-square' : 'square'}
                                        size={20}
                                        color={COLORS.text}
                                    />
                                </TouchableOpacity>
                            )}
                        />
                        <TouchableOpacity
                            style={styles.doneButton}
                            onPress={() => setAccessoryModalVisible(false)}
                        >
                            <Text style={styles.doneText}>Done</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    scrollContent: {
        paddingBottom: 100,
        paddingHorizontal: 20,
    },
    bodyContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
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
    label: {
        color: COLORS.text,
        fontFamily: FONTS.medium,
        marginBottom: 8,
    },
    dropdownBox: {
        backgroundColor: COLORS.surface,
        borderColor: COLORS.border,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    dropdownInput: {
        color: COLORS.text,
        fontFamily: FONTS.medium,
        fontSize: 16,
        flex: 1,
        numberOfLines: 2,
        ellipsizeMode: 'tail',
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
    modalContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    modalContent: {
        backgroundColor: COLORS.surface,
        borderRadius: 12,
        padding: 20,
        width: '70%',
        maxHeight: '50%',
    },
    modalTitle: {
        fontFamily: FONTS.bold,
        fontSize: 18,
        color: COLORS.text,
        marginBottom: 10,
    },
    listItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    listText: {
        fontFamily: FONTS.medium,
        color: COLORS.text,
        fontSize: 16,
    },
    doneButton: {
        marginTop: 20,
        backgroundColor: COLORS.primary,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    doneText: {
        color: '#FFFFFF',
        fontFamily: FONTS.bold,
        fontSize: 16,
    },
});

export default NewExercise;