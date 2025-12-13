import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS as DEFAULT_COLORS, THEMES } from '../constants/theme';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    const [themeID, setThemeID] = useState('MIDNIGHT');
    const [theme, setTheme] = useState(THEMES.MIDNIGHT);

    useEffect(() => {
        loadTheme();
    }, []);

    const loadTheme = async () => {
        try {
            const storedThemeID = await AsyncStorage.getItem('user_theme');
            if (storedThemeID && THEMES[storedThemeID]) {
                setThemeID(storedThemeID);
                setTheme(THEMES[storedThemeID]);
            }
        } catch (error) {
            console.error("Failed to load theme:", error);
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

    return (
        <ThemeContext.Provider value={{ theme, themeID, updateTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);
