import { View, Text, StyleSheet} from 'react-native'
import React from 'react'
import { TouchableOpacity } from 'react-native';

import FontAwesome from '@expo/vector-icons/FontAwesome';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import Octicons from '@expo/vector-icons/Octicons';

import Entypo from '@expo/vector-icons/Entypo';



const TabBar = ({ state, descriptors, navigation }) => {

    const icons ={

        index: (props)=> <FontAwesome name="home" size={26} color={greyColor} {...props}/>,
        current: (props)=> <Entypo name="circle-with-plus" size={26} color={greyColor} {...props}/>,
        history: (props)=><Octicons name="checklist" size={26} color={greyColor} {...props}/>,
        profile: (props)=> <FontAwesome6 name="dumbbell" size={26} color={greyColor} {...props}/>
    }


    const primaryColor = '#0891b2';
    const greyColor = '#737373';

    
    return (
            <View style={styles.tabBar}>
            {state.routes.map((route, index) => {
                const { options } = descriptors[route.key];
                const label =
                    options.tabBarLabel !== undefined
                        ? options.tabBarLabel
                        : options.title !== undefined
                            ? options.title
                            : "route.name";

                if(['_sitemap', '+not-found'].includes(route.name)) return null;

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
                                color: isFocused? primaryColor: greyColor
                            })
                        }

                        <Text style={{
                            color: isFocused ? primaryColor : greyColor,
                            fontSiz: 11

                        }}>
                            {label}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    )
}


const styles = StyleSheet.create({

    tabBar:{
        position: 'absolute',
        bottom: 10,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems:'center',
        backgroundColor:'#1c1d1f',
        marginHorizontal: 10,
        paddingVertical: 10,
        borderRadius: 25,
        borderCurve: 'continuous',
        shadowColor: 'black',
        shadowOffset: {width: 0, height: 10},
        shadowRadius: 10,
        shadowOpacity: 0.1
    },
    tabBarItem:{
        flex:1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 4
    }

})



export default TabBar

