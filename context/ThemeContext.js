import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS as DEFAULT_COLORS, THEMES } from '../constants/theme';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    const [themeID, setThemeID] = useState('TITANIUM');
    const [theme, setTheme] = useState(THEMES.TITANIUM);

    const [gender, setGender] = useState('male');

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const [storedThemeID, storedGender] = await Promise.all([
                AsyncStorage.getItem('user_theme'),
                AsyncStorage.getItem('user_gender')
            ]);

            if (storedThemeID && THEMES[storedThemeID]) {
                setThemeID(storedThemeID);
                setTheme(THEMES[storedThemeID]);
            }
            if (storedGender) {
                setGender(storedGender);
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

    return (
        <ThemeContext.Provider value={{ theme, themeID, updateTheme, gender, updateGender }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);
