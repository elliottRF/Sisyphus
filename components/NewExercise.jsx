import { View, Text, ScrollView, StyleSheet, TextInput, Button, FlatList, TouchableOpacity } from 'react-native'
import React, { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import Body from "react-native-body-highlighter";

import { MultipleSelectList  } from 'react-native-dropdown-select-list'

import { insertExercise } from '../components/db';

const NewExercise = props => {


    const [exerciseName, setExerciseName] = useState("");
    const [targetSelected, setTargetSelected] = useState([]);
    const [accessorySelected, setAccessorySelected] = useState([]);
    const [formattedTargets, setFormattedTargets] = useState([]);
    
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
      
        return list
          .map(item => String(item).toLowerCase().replace(/\s+/g, "")) // Convert to string, lowercase, remove spaces
          .join(","); // Join with commas
      }

    const createExercise = async () => {
        await insertExercise(exerciseName, formatListToString(targetSelected), formatListToString(accessorySelected));
        props.close();

    }


    const targetMuscle = [
        {key:'1', value:'Chest'},
        {key:'2', value:'Triceps'},
        {key:'3', value:'Deltoids'},
        {key:'4', value:'Trapezius'},
        {key:'5', value:'Upper-Back'},
        {key:'6', value:'Lower-Back'},
        {key:'7', value:'Biceps'},
        {key:'8', value:'Forearm'},
        {key:'9', value:'Abs'},
        {key:'10', value:'Quadriceps'},
        {key:'11', value:'Hamstring'},
        {key:'12', value:'Gluteal'},
        {key:'13', value:'Calves'},
        {key:'14', value:'Adductors'},
    ]

    const accessoryMuscles = [
        {key:'1', value:'Chest'},
        {key:'2', value:'Triceps'},
        {key:'3', value:'Deltoids'},
        {key:'4', value:'Trapezius'},
        {key:'5', value:'Upper-Back'},
        {key:'6', value:'Lower-Back'},
        {key:'7', value:'Biceps'},
        {key:'8', value:'Forearm'},
        {key:'9', value:'Abs'},
        {key:'10', value:'Quadriceps'},
        {key:'11', value:'Hamstring'},
        {key:'12', value:'Gluteal'},
        {key:'13', value:'Calves'},
        {key:'14', value:'Adductors'},
    ]

    return (
        <View style={{ height: '100%', width: '100%' }}>
            <ScrollView 
                horizontal={false} // Set to false for vertical scrolling
                showsVerticalScrollIndicator={false} 
                showsHorizontalScrollIndicator={false}
            >
                {/* Body images container */}
                <View style={styles.bodyContainer}>
                    <Body
                        data={formattedTargets}
                        gender="male"
                        side="front"
                        scale={1}
                        border="#262626"
                    />
                    <Body
                        data={formattedTargets}
                        gender="male"
                        side="back"
                        scale={1}
                        border="#262626"
                    />
                </View>

                {/* Name input box */}
                <TextInput
                    style={styles.input}
                    onChangeText={setExerciseName}
                    value={exerciseName}
                    placeholder="Add Name"
                    placeholderTextColor="#B0B0B0" // Set placeholder text color here
                    keyboardType="text"
                    keyboardShouldPersistTaps="always"

                />

                {/* Multiple selection boxes */}
                <MultipleSelectList 
                    setSelected={(val) => setTargetSelected(val)} 
                    data={targetMuscle} 
                    save="value"
                    label="Target Muscles"
                    dropdownItemStyles={{color:"white"}}
                    labelStyles={{color:"white"}}
                    placeholder={"Target Muscles"}
                    checkBoxStyles={{backgroundColor:"white"}}
                    maxHeight={1000}
                    search={false}
                    dropdownTextStyles={{color:"white"}} 
                    inputStyles={{color:"white"}}
                    badgeStyles={{backgroundColor:"#0084e3"}}
                    onSelect={handleOpened1}
                />
                <MultipleSelectList 
                    setSelected={(val) => setAccessorySelected(val)} 
                    data={accessoryMuscles} 
                    save="value"
                    label="Accessory Muscles"
                    boxStyles={styles.selectionBox} // Apply selection box styles here
                    inputStyles={{color:"white"}}
                    dropdownItemStyles={{color:"white"}}
                    labelStyles={{color:"white"}}
                    placeholder={"Accessory Muscles"}
                    checkBoxStyles={{backgroundColor:"white"}}
                    maxHeight={1000}
                    search={false}
                    dropdownTextStyles={{color:"white"}} 
                    badgeStyles={{backgroundColor:"#74b9ff"}}
                    onSelect={handleOpened1}
                />

                <TouchableOpacity style={[styles.button, styles.finishButton]} onPress={createExercise}>
                    <Text style={styles.buttonText}>Create Exercise</Text>
                </TouchableOpacity>

            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    button: {

        paddingVertical: 20,
        paddingHorizontal: 40,
        borderRadius: 10,
        alignItems: "center",
    },
    buttonText: {
        color: '#fff',
        fontSize: 24,
        fontWeight: "bold",
    },
    finishButton: {
        marginBottom: 100, // Add some space above the finish button
    },
    container: {
        flex: 1,
        backgroundColor: "#121212",
        justifyContent: 'center', // Center the content vertically
        alignItems: 'center', // Center the content horizontally
        
    },
    bodyContainer: {
        flexDirection: 'row', // Align the body images horizontally
        justifyContent: 'space-between', // Space out the images
        width: '100%', // Ensure the container takes up full width
        marginBottom: 20, // Add space below the body images
    },
    input: {
        backgroundColor: '#4A4A4A', // Dark gray background
        color: 'white', // White text color
        borderRadius: 10, // Rounded corners
        paddingHorizontal: 15,
        paddingVertical: 10,
        margin:10
    }
});
export default NewExercise;
