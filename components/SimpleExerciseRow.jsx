import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, FONTS, SHADOWS } from '../constants/theme';
import { ScaleDecorator } from 'react-native-draggable-flatlist';

const SimpleExerciseRow = ({ item, drag, isActive, exercises }) => {
    const exerciseDetails = exercises.find(e => e.exerciseID === item.exercises[0].exerciseID);
    const name = exerciseDetails ? exerciseDetails.name : 'Unknown Exercise';

    return (
        <ScaleDecorator>
            <TouchableOpacity
                onLongPress={drag}
                disabled={isActive}
                style={[
                    styles.container,
                    isActive && styles.overlay
                ]}
            >
                <View style={styles.dragHandle}>
                    <MaterialIcons name="drag-handle" size={24} color={COLORS.textSecondary} />
                </View>
                <Text style={styles.text}>{name}</Text>
            </TouchableOpacity>
        </ScaleDecorator>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: COLORS.surface,
        marginBottom: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    overlay: {
        backgroundColor: COLORS.surface,
        borderColor: COLORS.primary,
        ...SHADOWS.medium,
        transform: [{ scale: 1.05 }],
    },
    dragHandle: {
        padding: 8,
        marginRight: 12,
        marginLeft: -8,
    },
    text: {
        fontSize: 16,
        fontFamily: FONTS.medium,
        color: COLORS.text,
    },
});

export default SimpleExerciseRow;
