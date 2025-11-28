import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, StatusBar } from 'react-native';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../constants/theme';

const ReorderModal = ({ visible, data, onClose, onReorder, exercises }) => {
    const [localData, setLocalData] = useState(data);

    // Update local data when prop changes
    React.useEffect(() => {
        setLocalData(data);
    }, [data]);

    const handleDone = () => {
        onReorder(localData);
        onClose();
    };

    const renderItem = ({ item, drag, isActive }) => {
        // Find exercise name
        const exerciseDetails = exercises.find(e => e.exerciseID === item.exercises[0]?.exerciseID);
        const exerciseName = exerciseDetails ? exerciseDetails.name : 'Unknown Exercise';

        return (
            <ScaleDecorator>
                <TouchableOpacity
                    onLongPress={drag}
                    disabled={isActive}
                    style={[
                        styles.exerciseRow,
                        isActive && styles.exerciseRowActive
                    ]}
                >
                    <MaterialIcons name="drag-handle" size={24} color={COLORS.textSecondary} />
                    <Text style={styles.exerciseText}>{exerciseName}</Text>
                </TouchableOpacity>
            </ScaleDecorator>
        );
    };

    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent={true}
            onRequestClose={onClose}
        >
            <GestureHandlerRootView style={styles.modalContainer}>
                <StatusBar barStyle="light-content" />
                <View style={styles.overlay}>
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={onClose}>
                            <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <Text style={styles.title}>Reorder Exercises</Text>
                        <TouchableOpacity onPress={handleDone}>
                            <Text style={styles.doneText}>Done</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Exercise List */}
                    <DraggableFlatList
                        data={localData}
                        onDragEnd={({ data }) => setLocalData(data)}
                        keyExtractor={(item) => item.id}
                        renderItem={renderItem}
                        contentContainerStyle={styles.listContent}
                    />
                </View>
            </GestureHandlerRootView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalContainer: {
        flex: 1,
    },
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.95)',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    },
    title: {
        fontSize: 18,
        fontFamily: FONTS.bold,
        color: COLORS.text,
    },
    cancelText: {
        fontSize: 16,
        fontFamily: FONTS.regular,
        color: COLORS.textSecondary,
    },
    doneText: {
        fontSize: 16,
        fontFamily: FONTS.semiBold,
        color: COLORS.primary,
    },
    listContent: {
        padding: 20,
    },
    exerciseRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
    },
    exerciseRowActive: {
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        transform: [{ scale: 1.05 }],
    },
    exerciseText: {
        fontSize: 16,
        fontFamily: FONTS.medium,
        color: COLORS.text,
        marginLeft: 12,
        flex: 1,
    },
});

export default ReorderModal;
