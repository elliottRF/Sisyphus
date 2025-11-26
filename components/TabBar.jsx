import { View, Text, StyleSheet } from 'react-native'
import React from 'react'
import { TouchableOpacity } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import Octicons from '@expo/vector-icons/Octicons';
import Entypo from '@expo/vector-icons/Entypo';
import { COLORS, FONTS, SHADOWS } from '../constants/theme';

const TabBar = ({ state, descriptors, navigation }) => {

    const icons = {
        index: (props) => <FontAwesome name="home" size={24} {...props} />,
        current: (props) => <Entypo name="circle-with-plus" size={24} {...props} />,
        history: (props) => <Octicons name="checklist" size={24} {...props} />,
        profile: (props) => <FontAwesome6 name="dumbbell" size={24} {...props} />
    }

    return (
        <View style={styles.container}>
            <View style={styles.tabBar}>
                {state.routes.map((route, index) => {
                    const { options } = descriptors[route.key];
                    const label =
                        options.tabBarLabel !== undefined
                            ? options.tabBarLabel
                            : options.title !== undefined
                                ? options.title
                                : route.name;

                    if (['_sitemap', '+not-found'].includes(route.name)) return null;

                    const isFocused = state.index === index;

                    const onPress = () => {
                        const event = navigation.emit({
                            type: 'tabPress',
                            target: route.key,
                            canPreventDefault: true,
                        });

                        if (!isFocused && !event.defaultPrevented) {
                            navigation.navigate(route.name, route.params);
                        }
                    };

                    const onLongPress = () => {
                        navigation.emit({
                            type: 'tabLongPress',
                            target: route.key,
                        });
                    };

                    return (
                        <TouchableOpacity
                            key={route.name}
                            style={styles.tabBarItem}
                            accessibilityRole="button"
                            accessibilityState={isFocused ? { selected: true } : {}}
                            accessibilityLabel={options.tabBarAccessibilityLabel}
                            testID={options.tabBarButtonTestID}
                            onPress={onPress}
                            onLongPress={onLongPress}
                        >
                            {
                                icons[route.name]({
                                    color: isFocused ? COLORS.primary : COLORS.textSecondary
                                })
                            }

                            <Text style={{
                                color: isFocused ? COLORS.primary : COLORS.textSecondary,
                                fontSize: 10,
                                fontFamily: isFocused ? FONTS.bold : FONTS.medium,
                                marginTop: 4
                            }}>
                                {label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        alignItems: 'center',
        paddingBottom: 20, // Safe area padding simulation
    },
    tabBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: COLORS.surface,
        width: '90%',
        paddingVertical: 12,
        paddingHorizontal: 10,
        borderRadius: 35,
        borderWidth: 1,
        borderColor: COLORS.border,
        ...SHADOWS.medium,
    },
    tabBarItem: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    }
})

export default TabBar

