import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS as DEFAULT_COLORS, THEMES } from '../constants/theme';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    const [themeID, setThemeID] = useState('TITANIUM');
    const [theme, setTheme] = useState(THEMES.TITANIUM);

    const [gender, setGender] = useState('male');
    const [accessoryWeight, setAccessoryWeight] = useState(0.5);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const [storedThemeID, storedGender, storedAccessoryWeight] = await Promise.all([
                AsyncStorage.getItem('user_theme'),
                AsyncStorage.getItem('user_gender'),
                AsyncStorage.getItem('user_accessory_weight')
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

    return (
        <ThemeContext.Provider value={{
            theme,
            themeID,
            updateTheme,
            gender,
            updateGender,
            accessoryWeight,
            updateAccessoryWeight
        }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);
