import { View, Text, ScrollView, StyleSheet} from 'react-native'
import React from 'react'

import { SafeAreaView } from 'react-native-safe-area-context';
import Body from "react-native-body-highlighter";



const backgroundColour = "#121212";


const Home = () => {
    return (
        <SafeAreaView style={styles.container}>
            <ScrollView 
                horizontal={true}
                showsVerticalScrollIndicator={false} 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollViewContent}
            >

                <Body
                    data={[
                        { slug: "upper-back", intensity: 1, side: "both" },
                        { slug: "quadriceps", intensity: 2 },
                        { slug: "deltoids", intensity: 1 },
                    ]}
                    gender="male"
                    side="front"
                    scale={1}
                    border="#262626"
                />
                <Body
                    data={[
                        { slug: "upper-back", intensity: 1, side: "both" },
                        { slug: "quad", intensity: 2 },
                        { slug: "deltoids", intensity: 1 },
                    ]}
                    gender="male"
                    side="back"
                    scale={1}
                    border="#262626"
                />

            </ScrollView>
        </SafeAreaView >
    )
}
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: backgroundColour,
        alignItems: "center",
        justifyContent: "center",
        
    },
  });
export default Home

