import React, { useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

const SortableExerciseList = ({ data, onReorder, renderItem, contentContainerStyle }) => {

    const renderItemWrapper = useCallback(({ item, drag, isActive, getIndex }) => {
        return (
            <ScaleDecorator>
                <View style={{ opacity: isActive ? 0.9 : 1 }}>
                    {renderItem({
                        item,
                        drag, // Pass the drag function
                        isActive,
                        index: getIndex()
                    })}
                </View>
            </ScaleDecorator>
        );
    }, [renderItem]);

    return (
        <DraggableFlatList
            data={data}
            onDragEnd={({ data }) => onReorder(data)}
            keyExtractor={(item) => item.id}
            renderItem={renderItemWrapper}
            contentContainerStyle={contentContainerStyle}
            containerStyle={styles.container}
        />
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});

export default SortableExerciseList;
