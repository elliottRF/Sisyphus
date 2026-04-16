import { View, Text, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React from 'react'
import { TouchableOpacity } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import Octicons from '@expo/vector-icons/Octicons';
import Entypo from '@expo/vector-icons/Entypo';
import { FONTS, getThemedShadow, isLightTheme } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

const TabBar = ({ state, descriptors, navigation }) => {
    const { theme, workoutInProgress } = useTheme();
    const insets = useSafeAreaInsets();
    const styles = getStyles(theme);

    const focusedRoute = state.routes[state.index];
    const focusedDescriptor = descriptors[focusedRoute.key];
    const focusedOptions = focusedDescriptor.options;

    if (focusedOptions.tabBarStyle?.display === 'none') {
        return null;
    }

    const icons = {
        index: (props) => <FontAwesome name="home" size={24} {...props} />,
        current: (props) => <Entypo name="circle-with-plus" size={24} {...props} />,
        history: (props) => <Octicons name="checklist" size={24} {...props} />,
        profile: (props) => <FontAwesome6 name="dumbbell" size={24} {...props} />
    }

    return (
        <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 0) + 0 }]}>
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
                    if (!icons[route.name]) return null;

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
                                    color: isFocused
                                        ? theme.primary
                                        : (route.name === 'current' && workoutInProgress)
                                            ? theme.primary
                                            : theme.textSecondary
                                })
                            }

                            <Text style={{
                                color: isFocused
                                    ? theme.primary
                                    : theme.textSecondary,
                                fontSize: 11,
                                fontFamily: isFocused ? FONTS.bold : FONTS.medium,
                                marginTop: 2
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

const withOpacity = (hex, opacity) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

const getStyles = (theme) => StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    tabBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: withOpacity(
            theme.surface,
            isLightTheme(theme) ? 0.95 : 0.95
        ),
        width: '85%',
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 35,
        borderWidth: 1,
        borderColor: isLightTheme(theme) ? theme.overlayBorder : theme.border,
        ...getThemedShadow(theme, 'medium'),
    },
    tabBarItem: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    }
})

export default TabBar
