import React, { useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import Animated, { LinearTransition, FadeIn, FadeOut, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const SortableExerciseList = ({ data, onReorder, renderItem, contentContainerStyle, ListFooterComponent }) => {
    const listRef = React.useRef(null);

    const renderItemWrapper = useCallback(({ item, drag, isActive, getIndex }) => {
        const animatedStyle = useAnimatedStyle(() => {
            return {
                transform: [{ scale: withSpring(isActive ? 1.02 : 1) }],
                zIndex: isActive ? 100 : 1,
                shadowColor: "#000",
                shadowOffset: {
                    width: 0,
                    height: 2,
                },
                shadowOpacity: withSpring(isActive ? 0.25 : 0),
                shadowRadius: withSpring(isActive ? 3.84 : 0),
                elevation: isActive ? 5 : 0,
            };
        });

        return (
            <Animated.View
                style={[
                    { opacity: isActive ? 0.9 : 1 },
                    animatedStyle
                ]}
                layout={LinearTransition.springify().damping(14).stiffness(100)}
                entering={FadeIn}
                exiting={FadeOut}
            >
                {renderItem({
                    item,
                    drag, // Pass the drag function
                    isActive,
                    index: getIndex(),
                    simultaneousHandlers: listRef
                })}
            </Animated.View>
        );
    }, [renderItem]);

    return (
        <DraggableFlatList
            ref={listRef}
            data={data}
            onDragEnd={({ data }) => {
                onReorder(data);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            onDragBegin={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            keyExtractor={(item) => item.id}
            renderItem={renderItemWrapper}
            contentContainerStyle={contentContainerStyle}
            containerStyle={styles.container}
            ListFooterComponent={ListFooterComponent}
            itemLayoutAnimation={LinearTransition.springify().damping(14).stiffness(100)}
            activationDistance={20}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
        />
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});

export default SortableExerciseList;
