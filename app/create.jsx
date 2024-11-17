import { View, Text, ScrollView, StyleSheet, TextInput, Button, FlatList} from 'react-native'
import React, { useState, useEffect, useRef  } from 'react';

import { SafeAreaView } from 'react-native-safe-area-context';


import { ActivityIndicator } from 'react-native';


import { fetchExercises } from '../components/db';


const Create = () => {

    const [exercises, setExercises] = useState([]);

    useEffect(() => {
      fetchExercises()
        .then(data => setExercises(data))
        .catch(err => console.error(err));
    }, []);
  
    return (
      <SafeAreaView style={styles.container}>
        <FlatList
          data={exercises}
          keyExtractor={(item) => item.exerciseID.toString()}
          ListHeaderComponent={
            <View style={styles.container}>
              <Text style={styles.title}>Exercise List</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.item}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.details}>Target: {item.targetMuscle}</Text>
              {item.accessoryMuscles && (
                <Text style={styles.details}>
                  Accessories: {item.accessoryMuscles}
                </Text>
              )}
            </View>
          )}
        />
      </SafeAreaView>
    );
    
}
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#121212",
        alignItems: "center",
        justifyContent: "center",
    },
  });
export default Create

