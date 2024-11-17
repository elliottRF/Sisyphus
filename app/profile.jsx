import { View, Text, ScrollView, StyleSheet} from 'react-native'
import React from 'react'

import { SafeAreaView } from 'react-native-safe-area-context';
import Body from "react-native-body-highlighter";

const Profile = () => {

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}>


            </ScrollView>
        </SafeAreaView >
    )
}
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#121212",
        alignItems: "center",
        justifyContent: "center",
    },
  });
  
export default Profile

