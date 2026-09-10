import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { THEMES } from '../constants/theme';
import {
    DEFAULT_REP_RANGE,
    DEFAULT_REP_RANGE_PRESET,
    SETTINGS_KEYS
} from '../constants/preferences';
import { defaultGym, isDefaultGym } from '../utils/equipment';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    const [themeID, setThemeID] = useState('DEFAULT');
    const [theme, setTheme] = useState(THEMES.DEFAULT);
    const [customThemes, setCustomThemes] = useState([]);
    // Whether the RPE column shows in a live workout. The data is always
    // stored when present; this only governs whether the column is offered,
    // because it is a sixth column on a row used one-handed between sets.
    const [trackRPE, setTrackRPE] = useState(true);
    // The bar, plate rack and dumbbell ladder this user's gym has, in kg.
    // Per-exercise profiles fall back to these, so setting up a gym once
    // is most of the work; an exercise only overrides what differs (the
    // 9 kg EZ bar on the preacher station, say). Null until settings load
    // -- the defaults depend on whether they work in kg or lb, and that
    // preference arrives in the same read.
    const [gymEquipment, setGymEquipment] = useState(null);

    const [gender, setGender] = useState('male');
    const [accessoryWeight, setAccessoryWeight] = useState(0.5);
    const [recoveryRate, setRecoveryRate] = useState(1);
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
                storedRecoveryRate,
                storedUnitPref,
                storedRepRangePreset,
                storedRepRangeMin,
                storedRepRangeMax,
                storedWorkoutStartTime,
                storedCustomThemes,
                storedCurrentWorkout,
                storedTrackRPE,
                storedGym,
            ] = await Promise.all([
                AsyncStorage.getItem('user_theme'),
                AsyncStorage.getItem('user_gender'),
                AsyncStorage.getItem('user_accessory_weight'),
                AsyncStorage.getItem('user_recovery_rate'),
                AsyncStorage.getItem('user_unit_imperial'),
                AsyncStorage.getItem(SETTINGS_KEYS.repRangePreset),
                AsyncStorage.getItem(SETTINGS_KEYS.repRangeMin),
                AsyncStorage.getItem(SETTINGS_KEYS.repRangeMax),
                AsyncStorage.getItem('@workoutStartTime'),
                AsyncStorage.getItem('user_custom_themes'),
                AsyncStorage.getItem('@currentWorkout'),
                AsyncStorage.getItem(SETTINGS_KEYS.trackRPE),
                AsyncStorage.getItem(SETTINGS_KEYS.gymEquipment),
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
            if (storedRecoveryRate !== null) {
                setRecoveryRate(parseFloat(storedRecoveryRate));
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
            // Absent means never set, which is on: the feature is new and
            // meant to be visible. Only an explicit 'false' hides it.
            if (storedTrackRPE !== null) {
                setTrackRPE(storedTrackRPE === 'true');
            }
            // Seeded from the unit preference read above, not from state:
            // setUseImperial has not committed yet at this point.
            const imperial = storedUnitPref === 'true';
            let parsedGym = null;
            if (storedGym) {
                try { parsedGym = JSON.parse(storedGym); } catch (e) { parsedGym = null; }
            }
            setGymEquipment(parsedGym || defaultGym(imperial));
            // The Train tab owns this flag while it is mounted (same rule:
            // exercises present OR a start time), but tabs now mount lazily,
            // so after a cold start it isn't mounted until visited. Without
            // this the tab bar showed "Train" with no timer on Home while a
            // workout was in fact running. Seeded here from the same stored
            // state the tab restores from, so the bar is right from first paint.
            let storedHasExercises = false;
            if (storedCurrentWorkout) {
                try { storedHasExercises = JSON.parse(storedCurrentWorkout).length > 0; } catch (_) {}
            }
            if (storedHasExercises || storedWorkoutStartTime) {
                setWorkoutInProgress(true);
            }
        } catch (error) {
            console.error("Failed to load settings:", error);
        } finally {
            setSettingsLoaded(true); console.log('[boot] settings-loaded', Date.now());
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

    // Replace a custom theme's colours and name, keeping its id so it stays
    // selected and keeps its place in the list. If it is the active theme the
    // app has to be repainted with the new object -- `theme` is resolved once
    // at selection time, not derived from customThemes on every render.
    const updateCustomTheme = async (id, themeObj, name) => {
        const existing = customThemes.find((t) => t.id === id);
        if (!existing) return;
        const full = { ...themeObj, id, name: name?.trim() || existing.name };
        const next = customThemes.map((t) => (t.id === id ? full : t));
        setCustomThemes(next);
        if (themeID === id) setTheme(full);
        try {
            await AsyncStorage.setItem('user_custom_themes', JSON.stringify(next));
        } catch (error) {
            console.error("Failed to update custom theme:", error);
        }
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

    const updateRecoveryRate = async (rate) => {
        setRecoveryRate(rate);
        try {
            await AsyncStorage.setItem('user_recovery_rate', rate.toString());
        } catch (error) {
            console.error("Failed to save recovery rate:", error);
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

        // A gym profile still identical to the default for the OLD unit was
        // never a choice -- it was seeded at first launch, before the user
        // had said which unit they think in. Re-seed it, or switching to
        // pounds leaves them with a rack of 55.12 / 44.09 / 33.07 lb plates:
        // correct conversions of kilo plates, and nobody's actual gym.
        //
        // A profile they have edited is theirs and is left exactly alone.
        // Kilo plates stay kilo plates however the app chooses to show them.
        if (isDefaultGym(gymEquipment, !imperial)) {
            await updateGymEquipment(defaultGym(imperial));
        }

        try {
            await AsyncStorage.setItem('user_unit_imperial', imperial.toString());
        } catch (error) {
            console.error("Failed to save unit preference:", error);
        }
    };

    const updateTrackRPE = async (enabled) => {
        setTrackRPE(enabled);
        try {
            await AsyncStorage.setItem(SETTINGS_KEYS.trackRPE, enabled.toString());
        } catch (error) {
            console.error("Failed to save RPE preference:", error);
        }
    };

    const updateGymEquipment = async (next) => {
        setGymEquipment(next);
        try {
            await AsyncStorage.setItem(SETTINGS_KEYS.gymEquipment, JSON.stringify(next));
        } catch (error) {
            console.error("Failed to save gym equipment:", error);
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
            trackRPE,
            updateTrackRPE,
            gymEquipment,
            updateGymEquipment,
            customThemes,
            addCustomTheme,
            updateCustomTheme,
            deleteCustomTheme,
            gender,
            updateGender,
            accessoryWeight,
            updateAccessoryWeight,
            recoveryRate,
            updateRecoveryRate,
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
