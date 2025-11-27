import React from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { MaterialIcons, Feather } from '@expo/vector-icons';
import { COLORS, FONTS, SHADOWS } from '../constants/theme';
import SortableExerciseList from './SortableExerciseList';

const ReorderModal = ({ visible, onClose, data, onReorder, exercises }) => {

    const renderItem = ({ item, dragHandlers, isOverlay }) => {
        const exerciseDetails = exercises.find(e => e.exerciseID === item.exercises[0].exerciseID);
        const name = exerciseDetails ? exerciseDetails.name : 'Unknown Exercise';

        return (
            <View style={[
                styles.itemContainer,
                isOverlay && styles.itemOverlay
            ]}>
                <View
                    style={styles.dragHandle}
                    {...(dragHandlers || {})}
                >
                    <MaterialIcons name="drag-handle" size={24} color={COLORS.textSecondary} />
                </View>
                <Text style={styles.itemText}>{name}</Text>
            </View>
        );
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={onClose}
        >
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>Reorder Exercises</Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                        <Text style={styles.closeText}>Done</Text>
                    </TouchableOpacity>
                </View>

                <SortableExerciseList
                    data={data}
                    onReorder={onReorder}
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContent}
                />
            </SafeAreaView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    title: {
        fontSize: 18,
        fontFamily: FONTS.bold,
        color: COLORS.text,
    },
    closeButton: {
        padding: 8,
    },
    closeText: {
        fontSize: 16,
        fontFamily: FONTS.semiBold,
        color: COLORS.primary,
    },
    listContent: {
        padding: 16,
    },
    itemContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: COLORS.surface,
        marginBottom: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    itemOverlay: {
        backgroundColor: COLORS.surface,
        borderColor: COLORS.primary,
        ...SHADOWS.medium,
    },
    dragHandle: {
        padding: 8,
        marginRight: 12,
        marginLeft: -8,
    },
    itemText: {
        fontSize: 16,
        fontFamily: FONTS.medium,
        color: COLORS.text,
    },
});

export default ReorderModal;
