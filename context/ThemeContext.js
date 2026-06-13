import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { THEMES } from '../constants/theme';
import {
    DEFAULT_REP_RANGE,
    DEFAULT_REP_RANGE_PRESET,
    SETTINGS_KEYS
} from '../constants/preferences';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    const [themeID, setThemeID] = useState('DEFAULT');
    const [theme, setTheme] = useState(THEMES.DEFAULT);
    const [customThemes, setCustomThemes] = useState([]);

    const [gender, setGender] = useState('male');
    const [accessoryWeight, setAccessoryWeight] = useState(0.5);
    const [repRangePreset, setRepRangePreset] = useState(DEFAULT_REP_RANGE_PRESET);
    const [repRangeMin, setRepRangeMin] = useState(DEFAULT_REP_RANGE.min);
    const [repRangeMax, setRepRangeMax] = useState(DEFAULT_REP_RANGE.max);
    const [workoutInProgress, setWorkoutInProgress] = useState(false);
    const [workoutStartTime, setWorkoutStartTime] = useState(null);
    const [useImperial, setUseImperial] = useState(false);
    const [settingsLoaded, setSettingsLoaded] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const [
                storedThemeID,
                storedGender,
                storedAccessoryWeight,
                storedUnitPref,
                storedRepRangePreset,
                storedRepRangeMin,
                storedRepRangeMax,
                storedWorkoutStartTime,
                storedCustomThemes,
            ] = await Promise.all([
                AsyncStorage.getItem('user_theme'),
                AsyncStorage.getItem('user_gender'),
                AsyncStorage.getItem('user_accessory_weight'),
                AsyncStorage.getItem('user_unit_imperial'),
                AsyncStorage.getItem(SETTINGS_KEYS.repRangePreset),
                AsyncStorage.getItem(SETTINGS_KEYS.repRangeMin),
                AsyncStorage.getItem(SETTINGS_KEYS.repRangeMax),
                AsyncStorage.getItem('@workoutStartTime'),
                AsyncStorage.getItem('user_custom_themes'),
            ]);

            // Custom themes are stored as full theme objects (each with an id).
            let parsedCustom = [];
            if (storedCustomThemes) {
                try { parsedCustom = JSON.parse(storedCustomThemes) || []; } catch (e) { parsedCustom = []; }
                setCustomThemes(parsedCustom);
            }

            // Resolve the saved theme from built-ins OR custom themes.
            if (storedThemeID) {
                if (THEMES[storedThemeID]) {
                    setThemeID(storedThemeID);
                    setTheme(THEMES[storedThemeID]);
                } else {
                    const custom = parsedCustom.find((t) => t.id === storedThemeID);
                    if (custom) {
                        setThemeID(storedThemeID);
                        setTheme(custom);
                    }
                }
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
            if (storedRepRangePreset) {
                setRepRangePreset(storedRepRangePreset);
            }
            if (storedRepRangeMin !== null) {
                setRepRangeMin(parseInt(storedRepRangeMin, 10));
            }
            if (storedRepRangeMax !== null) {
                setRepRangeMax(parseInt(storedRepRangeMax, 10));
            }
            if (storedWorkoutStartTime) {
                setWorkoutStartTime(storedWorkoutStartTime);
            }
        } catch (error) {
            console.error("Failed to load settings:", error);
        } finally {
            setSettingsLoaded(true);
        }
    };

    const updateTheme = async (newThemeID) => {
        const resolved = THEMES[newThemeID] || customThemes.find((t) => t.id === newThemeID);
        if (!resolved) return;
        setThemeID(newThemeID);
        setTheme(resolved);
        try {
            await AsyncStorage.setItem('user_theme', newThemeID);
        } catch (error) {
            console.error("Failed to save theme:", error);
        }
    };

    // Add a custom theme (a full theme object from buildCustomTheme) and make
    // it active. Returns the new theme id.
    const addCustomTheme = async (themeObj, name) => {
        const id = `custom_${Date.now()}`;
        const full = { ...themeObj, id, name: name?.trim() || `Custom ${customThemes.length + 1}` };
        const next = [...customThemes, full];
        setCustomThemes(next);
        setThemeID(id);
        setTheme(full);
        try {
            await AsyncStorage.multiSet([
                ['user_custom_themes', JSON.stringify(next)],
                ['user_theme', id],
            ]);
        } catch (error) {
            console.error("Failed to save custom theme:", error);
        }
        return id;
    };

    const deleteCustomTheme = async (id) => {
        const next = customThemes.filter((t) => t.id !== id);
        setCustomThemes(next);
        const removingActive = themeID === id;
        if (removingActive) {
            setThemeID('DEFAULT');
            setTheme(THEMES.DEFAULT);
        }
        try {
            const ops = [['user_custom_themes', JSON.stringify(next)]];
            if (removingActive) ops.push(['user_theme', 'DEFAULT']);
            await AsyncStorage.multiSet(ops);
        } catch (error) {
            console.error("Failed to delete custom theme:", error);
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

    const updateRepRangePreset = async (preset) => {
        setRepRangePreset(preset);
        try {
            await AsyncStorage.setItem(SETTINGS_KEYS.repRangePreset, preset);
        } catch (error) {
            console.error("Failed to save rep range preset:", error);
        }
    };

    const updateRepRange = async ({ min, max, preset = 'custom' }) => {
        setRepRangeMin(min);
        setRepRangeMax(max);
        setRepRangePreset(preset);

        try {
            await Promise.all([
                AsyncStorage.setItem(SETTINGS_KEYS.repRangeMin, String(min)),
                AsyncStorage.setItem(SETTINGS_KEYS.repRangeMax, String(max)),
                AsyncStorage.setItem(SETTINGS_KEYS.repRangePreset, preset)
            ]);
        } catch (error) {
            console.error("Failed to save rep range:", error);
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

    const updateWorkoutStartTime = async (time) => {
        setWorkoutStartTime(time);
        try {
            if (time) {
                await AsyncStorage.setItem('@workoutStartTime', time);
            } else {
                await AsyncStorage.removeItem('@workoutStartTime');
            }
        } catch (error) {
            console.error("Failed to save workout start time:", error);
        }
    };

    return (
        <ThemeContext.Provider value={{
            theme,
            themeID,
            updateTheme,
            customThemes,
            addCustomTheme,
            deleteCustomTheme,
            gender,
            updateGender,
            accessoryWeight,
            updateAccessoryWeight,
            repRangePreset,
            updateRepRangePreset,
            repRangeMin,
            repRangeMax,
            updateRepRange,
            workoutInProgress,
            setWorkoutInProgress,
            workoutStartTime,
            updateWorkoutStartTime,
            useImperial,
            updateUnitPref,
            settingsLoaded
        }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);
