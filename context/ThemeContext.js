import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS as DEFAULT_COLORS, THEMES } from '../constants/theme';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    const [themeID, setThemeID] = useState('DEFAULT');
    const [theme, setTheme] = useState(THEMES.DEFAULT);

    const [gender, setGender] = useState('male');
    const [accessoryWeight, setAccessoryWeight] = useState(0.5);
    const [workoutInProgress, setWorkoutInProgress] = useState(false);
    const [useImperial, setUseImperial] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const [storedThemeID, storedGender, storedAccessoryWeight, storedUnitPref] = await Promise.all([
                AsyncStorage.getItem('user_theme'),
                AsyncStorage.getItem('user_gender'),
                AsyncStorage.getItem('user_accessory_weight'),
                AsyncStorage.getItem('user_unit_imperial')
            ]);

            if (storedThemeID && THEMES[storedThemeID]) {
                setThemeID(storedThemeID);
                setTheme(THEMES[storedThemeID]);
            }
            if (storedGender) {
                setGender(storedGender);
            }
            if (storedAccessoryWeight !== null) {
                setAccessoryWeight(parseFloat(storedAccessoryWeight));
            }
            if (storedUnitPref !== null) {
                setUseImperial(storedUnitPref === 'true');
            }
        } catch (error) {
            console.error("Failed to load settings:", error);
        }
    };

    const updateTheme = async (newThemeID) => {
        if (THEMES[newThemeID]) {
            setThemeID(newThemeID);
            setTheme(THEMES[newThemeID]);
            try {
                await AsyncStorage.setItem('user_theme', newThemeID);
            } catch (error) {
                console.error("Failed to save theme:", error);
            }
        }
    };

    const updateGender = async (newGender) => {
        setGender(newGender);
        try {
            await AsyncStorage.setItem('user_gender', newGender);
        } catch (error) {
            console.error("Failed to save gender:", error);
        }
    };

    const updateAccessoryWeight = async (weight) => {
        setAccessoryWeight(weight);
        try {
            await AsyncStorage.setItem('user_accessory_weight', weight.toString());
        } catch (error) {
            console.error("Failed to save accessory weight:", error);
        }
    };

    const updateUnitPref = async (imperial) => {
        setUseImperial(imperial);
        try {
            await AsyncStorage.setItem('user_unit_imperial', imperial.toString());
        } catch (error) {
            console.error("Failed to save unit preference:", error);
        }
    };

    return (
        <ThemeContext.Provider value={{
            theme,
            themeID,
            updateTheme,
            gender,
            updateGender,
            accessoryWeight,
            updateAccessoryWeight,
            workoutInProgress,
            setWorkoutInProgress,
            useImperial,
            updateUnitPref
        }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);
