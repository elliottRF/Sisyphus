import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView, PanResponder, Dimensions, Animated } from 'react-native';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
// import { COLORS, FONTS, SHADOWS } from '../constants/theme'; // Removed static import
import { FONTS, SHADOWS, THEMES } from '../constants/theme';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { importStrongData, exportWorkoutData, importBodyWeightData, exportBodyWeightData } from '../components/db';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TextInput } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { AppEvents, emit } from '../utils/events';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const AnimatedSwitch = ({ value, onValueChange, activeColor, inactiveColor, thumbColor }) => {
    // 1. Initialize the value directly so it starts at the right spot
    const animation = useRef(new Animated.Value(value ? 1 : 0)).current;
    const isFirstRender = useRef(true);

    useEffect(() => {
        // 2. Skip the animation on the first render
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }

        Animated.spring(animation, {
            toValue: value ? 1 : 0,
            useNativeDriver: false,
            bounciness: 8,
            speed: 14
        }).start();
    }, [value]);

    const translateX = animation.interpolate({
        inputRange: [0, 1],
        outputRange: [3, 25],
    });

    return (
        <TouchableOpacity activeOpacity={0.8} onPress={() => onValueChange(!value)}>
            <View style={{
                width: 50, height: 28, borderRadius: 14,
                backgroundColor: value ? activeColor : inactiveColor,
                justifyContent: 'center'
            }}>
                <Animated.View style={{
                    width: 22, height: 22, borderRadius: 11, backgroundColor: thumbColor,
                    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
                    transform: [{ translateX }]
                }} />
            </View>
        </TouchableOpacity>
    );
};

const Settings = () => {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const {
        theme,
        themeID,
        updateTheme,
        gender,
        updateGender,
        accessoryWeight,
        updateAccessoryWeight,
        useImperial,
        updateUnitPref
    } = useTheme(); // Use Theme Hook
    const styles = getStyles(theme);

    const [importingWorkouts, setImportingWorkouts] = useState(false);
    const [importingBodyWeight, setImportingBodyWeight] = useState(false);
    const [importProgress, setImportProgress] = useState('');
    const [defaultTimer, setDefaultTimer] = useState('180');
    const [isAutoTimerEnabled, setIsAutoTimerEnabled] = useState(true);
    const [isTimerMuted, setIsTimerMuted] = useState(false);
    const scrollRef = useRef(null);

    const [isReady, setIsReady] = useState(false); // New state


    useFocusEffect(
        React.useCallback(() => {
            scrollRef.current?.scrollTo({ y: 0, animated: false });
        }, [])
    );

    const SLIDER_WIDTH = 200;

    const panResponder = useMemo(() => PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (evt) => {
            const { locationX } = evt.nativeEvent;
            const weight = Math.max(0, Math.min(1, locationX / SLIDER_WIDTH));
            const steppedWeight = Math.round(weight / 0.05) * 0.05;
            updateAccessoryWeight(parseFloat(steppedWeight.toFixed(2)));
        },
        onPanResponderGrant: (evt) => {
            const { locationX } = evt.nativeEvent;
            const weight = Math.max(0, Math.min(1, locationX / SLIDER_WIDTH));
            const steppedWeight = Math.round(weight / 0.05) * 0.05;
            updateAccessoryWeight(parseFloat(steppedWeight.toFixed(2)));
            emit(AppEvents.WORKOUT_DATA_IMPORTED);
        }
    }), [updateAccessoryWeight]);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const saved = await AsyncStorage.getItem('settings_default_timer');
            if (saved) setDefaultTimer(saved);

            const savedAuto = await AsyncStorage.getItem('settings_auto_timer');
            if (savedAuto !== null) setIsAutoTimerEnabled(savedAuto === 'true');

            const savedMuted = await AsyncStorage.getItem('settings_timer_muted');
            if (savedMuted !== null) setIsTimerMuted(savedMuted === 'true');

            // Settings are now loaded and accurate
            setIsReady(true);
        } catch (e) {
            console.error("Failed to load settings", e);
            setIsReady(true); // Set to true even on error so the UI shows up
        }
    };

    const saveTimerSetting = async (text) => {
        setDefaultTimer(text);
        try {
            await AsyncStorage.setItem('settings_default_timer', text);
        } catch (e) {
            console.error("Failed to save timer setting", e);
        }
    };

    const handleImportData = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['text/csv', 'text/comma-separated-values', 'application/csv'],
                copyToCacheDirectory: true,
            });

            if (result.canceled) return;

            setImportingWorkouts(true);
            setImportProgress('Reading file (This could take a while)...');
            const fileUri = result.assets[0].uri;
            const fileContent = await FileSystem.readAsStringAsync(fileUri);

            const count = await importStrongData(fileContent, (progress) => {
                if (progress.stage === 'parsing') {
                    setImportProgress(`Parsing ${progress.total} rows...`);
                } else if (progress.stage === 'preparing') {
                    setImportProgress('Preparing workouts...');
                } else if (progress.stage === 'importing') {
                    setImportProgress(`Importing workout ${progress.current} of ${progress.total} (${progress.setsImported} sets)`);
                } else if (progress.stage === 'complete') {
                    setImportProgress('Finalizing...');
                }
            });

            Alert.alert(
                "Import Successful",
                `Successfully imported ${count} workout sets.`,
                [{ text: "OK" }]
            );
            emit(AppEvents.WORKOUT_DATA_IMPORTED);

        } catch (error) {
            console.error("Import error:", error);
            Alert.alert("Import Failed", "An error occurred while importing your data. Please check the CSV format.");
        } finally {
            setImportingWorkouts(false);
            setImportProgress('');
        }
    };

    const handleImportBodyWeight = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['text/csv', 'text/comma-separated-values', 'application/csv'],
                copyToCacheDirectory: true,
            });

            if (result.canceled) return;

            setImportingBodyWeight(true);
            setImportProgress('Reading file...');
            const fileUri = result.assets[0].uri;
            const fileContent = await FileSystem.readAsStringAsync(fileUri);

            setImportProgress('Importing body weight data...');
            const count = await importBodyWeightData(fileContent);

            Alert.alert(
                "Import Successful",
                `Successfully imported ${count} body weight entries.`,
                [{ text: "OK" }]
            );
            emit(AppEvents.BODYWEIGHT_DATA_IMPORTED);

        } catch (error) {
            console.error("Import error:", error);
            Alert.alert("Import Failed", "An error occurred while importing your data. Please check the CSV format.");
        } finally {
            setImportingBodyWeight(false);
            setImportProgress('');
        }
    };

    const handleExportData = async () => {
        try {
            // Check if Sharing is available first
            const isSharingAvailable = await Sharing.isAvailableAsync().catch(() => false);
            if (!isSharingAvailable) {
                Alert.alert("Feature Unavailable", "Sharing is not available on this device or the app needs to be rebuilt with native modules.");
                return;
            }

            const csv = await exportWorkoutData();
            if (!csv) {
                Alert.alert("No Data", "There is no workout data to export.");
                return;
            }

            const fileName = `sisyphus_workout_data_${new Date().toISOString().split('T')[0]}.csv`;
            const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

            await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });

            await Sharing.shareAsync(fileUri, {
                mimeType: 'text/csv',
                dialogTitle: 'Export Workout Data',
                UTI: 'public.comma-separated-values-text'
            });
        } catch (error) {
            console.error("Export error:", error);
            Alert.alert("Export Failed", "An error occurred while exporting your data.");
        }
    };

    const handleExportBodyWeight = async () => {
        try {
            const isSharingAvailable = await Sharing.isAvailableAsync().catch(() => false);
            if (!isSharingAvailable) {
                Alert.alert("Feature Unavailable", "Sharing is not available on this device.");
                return;
            }

            const csv = await exportBodyWeightData();
            if (!csv) {
                Alert.alert("No Data", "There is no body weight data to export.");
                return;
            }

            const fileName = `sisyphus_weight_data_${new Date().toISOString().split('T')[0]}.csv`;
            const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

            await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });

            await Sharing.shareAsync(fileUri, {
                mimeType: 'text/csv',
                dialogTitle: 'Export Body Weight Data',
                UTI: 'public.comma-separated-values-text'
            });
        } catch (error) {
            console.error("Export error:", error);
            Alert.alert("Export Failed", "An error occurred while exporting your body weight data.");
        }
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <Feather name="chevron-left" size={28} color={theme.text} />
                </TouchableOpacity>
                <Text style={styles.title}>Settings</Text>
            </View>

            <ScrollView
                ref={scrollRef}
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >

                {/* --- PREFERENCES SECTION --- */}
                <Text style={styles.sectionTitle}>Preferences</Text>

                {/* Theme Selector */}
                <View style={[styles.card, { paddingVertical: 16 }]}>
                    <View style={[styles.cardHeader, { marginBottom: 16 }]}>
                        <Feather name="droplet" size={20} color={theme.primary} />
                        <Text style={styles.cardTitle}>App Theme</Text>
                    </View>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.themeScroll}>
                        {Object.keys(THEMES).map((key) => {
                            const itemTheme = THEMES[key];
                            const isActive = themeID === key;
                            return (
                                <TouchableOpacity
                                    key={key}
                                    style={[
                                        styles.themeOption,
                                        isActive && styles.themeOptionActive,
                                        { backgroundColor: itemTheme.surface, borderColor: isActive ? theme.primary : itemTheme.border }
                                    ]}
                                    onPress={() => updateTheme(key)}
                                >
                                    <View style={[styles.themePreview, { backgroundColor: itemTheme.background }]}>
                                        <View style={[styles.themePreviewCircle, { backgroundColor: itemTheme.primary }]} />
                                    </View>
                                    <Text style={[styles.themeName, { color: isActive ? theme.primary : theme.textSecondary }]}>
                                        {key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>

                {/* Timer Settings */}
                <View style={styles.card}>
                    <View style={styles.timerHeader}>
                        <View style={styles.timerTitleRow}>
                            <Feather name="clock" size={20} color={theme.primary} />
                            <Text style={styles.cardTitle}>Rest Timer</Text>
                        </View>

                        <View style={styles.switchRow}>
                            {isReady ? (
                                <>
                                    <View style={styles.switchItem}>
                                        <Text style={styles.switchLabel}>Auto-Start</Text>
                                        <AnimatedSwitch
                                            value={isAutoTimerEnabled}
                                            onValueChange={async (value) => {
                                                setIsAutoTimerEnabled(value);
                                                await AsyncStorage.setItem('settings_auto_timer', value.toString());
                                            }}
                                            activeColor={theme.primary}
                                            inactiveColor={theme.type === 'dynamic' ? '#555555' : theme.overlayInputFocused}
                                            thumbColor={theme.surface}
                                        />
                                    </View>
                                    <View style={styles.switchItem}>
                                        <Text style={styles.switchLabel}>Mute Audio</Text>
                                        <AnimatedSwitch
                                            value={isTimerMuted}
                                            onValueChange={async (value) => {
                                                setIsTimerMuted(value);
                                                await AsyncStorage.setItem('settings_timer_muted', value.toString());
                                            }}
                                            activeColor={theme.primary}
                                            inactiveColor={theme.type === 'dynamic' ? '#555555' : theme.overlayInputFocused}
                                            thumbColor={theme.surface}
                                        />
                                    </View>
                                </>
                            ) : (
                                <ActivityIndicator size="small" color={theme.primary} />
                            )}
                        </View>
                    </View>

                    <Text style={styles.cardDescription}>
                        Default duration for the rest timer in between sets.
                    </Text>
                    <View style={styles.inputContainer}>
                        <TextInput
                            style={styles.input}
                            value={defaultTimer}
                            onChangeText={saveTimerSetting}
                            keyboardType="numeric"
                            placeholder="180"
                            placeholderTextColor={theme.textSecondary}
                        />
                        <Text style={styles.unitText}>seconds</Text>
                    </View>
                </View>

                {/* Accessory Contribution */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <MaterialCommunityIcons name="chart-bell-curve-cumulative" size={20} color={theme.primary} />
                        <Text style={styles.cardTitle}>Secondary Volume</Text>
                    </View>
                    <Text style={styles.cardDescription}>
                        How much supporting muscles count toward a muscle’s weekly volume (0.0–1.0).
                    </Text>

                    <View style={styles.sliderContainer}>
                        <View style={styles.sliderTrack}>
                            <View
                                style={[
                                    styles.sliderFill,
                                    { width: `${accessoryWeight * 100}%`, backgroundColor: theme.primary }
                                ]}
                            />
                            <View
                                style={[
                                    styles.sliderThumb,
                                    { left: `${accessoryWeight * 100}%`, borderColor: theme.primary, backgroundColor: theme.surface }
                                ]}
                            />
                            <View
                                {...panResponder.panHandlers}
                                style={[StyleSheet.absoluteFill, { backgroundColor: 'transparent' }]}
                            />
                        </View>
                        <View style={styles.sliderLabels}>
                            <Text style={styles.sliderValueText}>0.0 (None)</Text>
                            <Text style={[styles.sliderValueText, { color: theme.primary, fontFamily: FONTS.bold }]}>
                                {accessoryWeight.toFixed(2)}
                            </Text>
                            <Text style={styles.sliderValueText}>1.0 (Full)</Text>
                        </View>

                        <View style={styles.weightQuickSelect}>
                            {[0, 0.25, 0.5, 0.75, 1].map((val) => (
                                <TouchableOpacity
                                    key={val}
                                    style={[
                                        styles.weightOption,
                                        accessoryWeight === val && { backgroundColor: theme.primary, borderColor: theme.primary }
                                    ]}
                                    onPress={() => {
                                        updateAccessoryWeight(val);
                                        emit(AppEvents.WORKOUT_DATA_IMPORTED);
                                    }}
                                >
                                    <Text style={[
                                        styles.weightOptionText,
                                        accessoryWeight === val && { color: theme.surface }
                                    ]}>
                                        {val}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </View>

                {/* Weight Units */}
                <View style={styles.card}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={[styles.cardHeader, { marginBottom: 0 }]}>
                            <MaterialCommunityIcons name="weight" size={20} color={theme.primary} />
                            <Text style={styles.cardTitle}>Use Pounds (lbs)</Text>
                        </View>
                        {isReady ? (
                            <AnimatedSwitch
                                value={useImperial}
                                onValueChange={(val) => updateUnitPref(val)}
                                activeColor={theme.primary}
                                inactiveColor={theme.type === 'dynamic' ? '#555555' : theme.overlayInputFocused}
                                thumbColor={theme.surface}
                            />
                        ) : (
                            <ActivityIndicator size="small" color={theme.primary} />
                        )}
                    </View>
                </View>


                {/* Highlighter Gender */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <MaterialCommunityIcons name="human-male-female" size={20} color={theme.primary} />
                        <Text style={styles.cardTitle}>Muscle Model</Text>
                    </View>
                    <Text style={styles.cardDescription}>
                        Gender of the muscle highlighter model shown across the app.
                    </Text>
                    <View style={styles.genderToggleContainer}>
                        <TouchableOpacity
                            style={[
                                styles.genderOption,
                                gender === 'male' && { backgroundColor: theme.primary, borderColor: theme.primary }
                            ]}
                            onPress={() => updateGender('male')}
                        >
                            <Feather name="user" size={18} color={gender === 'male' ? theme.surface : theme.text} />
                            <Text style={[styles.genderText, gender === 'male' && { color: theme.surface }]}>Male</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.genderOption,
                                gender === 'female' && { backgroundColor: theme.primary, borderColor: theme.primary }
                            ]}
                            onPress={() => updateGender('female')}
                        >
                            <Feather name="user" size={18} color={gender === 'female' ? theme.surface : theme.text} />
                            <Text style={[styles.genderText, gender === 'female' && { color: theme.surface }]}>Female</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* --- DATA & BACKUP SECTION --- */}
                <Text style={styles.sectionTitle}>Data & Backup</Text>

                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <Feather name="database" size={20} color={theme.primary} />
                        <Text style={styles.cardTitle}>Data & Backup</Text>
                    </View>
                    <Text style={styles.cardDescription}>
                        Export your workout data to a CSV file or import history from Sisyphus or Strong.
                    </Text>

                    <View style={{ gap: 12 }}>
                        <TouchableOpacity
                            style={styles.importButton}
                            onPress={handleExportData}
                        >
                            <Feather name="upload" size={18} color={theme.surface} />
                            <Text style={styles.importButtonText}>Export Workout Data</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.importButton}
                            onPress={handleExportBodyWeight}
                        >
                            <Feather name="upload" size={18} color={theme.surface} />
                            <Text style={styles.importButtonText}>Export Body Weight Data</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.importButton, { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.primary }]}
                            onPress={handleImportData}
                            disabled={importingWorkouts || importingBodyWeight}
                        >
                            {importingWorkouts ? (
                                <ActivityIndicator color={theme.primary} />
                            ) : (
                                <>
                                    <Feather name="download" size={18} color={theme.primary} />
                                    <Text style={[styles.importButtonText, { color: theme.primary }]}>Import Workout Data</Text>
                                </>
                            )}
                        </TouchableOpacity>

                        <View style={styles.buttonRow}>
                            <TouchableOpacity
                                style={[styles.importButton, { flex: 1, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.primary }]}
                                onPress={handleImportBodyWeight}
                                disabled={importingWorkouts || importingBodyWeight}
                            >
                                {importingBodyWeight ? (
                                    <ActivityIndicator color={theme.primary} />
                                ) : (
                                    <>
                                        <Feather name="download" size={18} color={theme.primary} />
                                        <Text style={[styles.importButtonText, { color: theme.primary }]}>Import Body Weight Data</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => Alert.alert("Weight Import", "Extract Strong measurements ZIP file for weight.csv")}
                                style={styles.infoButton}
                            >
                                <Feather name="help-circle" size={20} color={theme.textSecondary} />
                            </TouchableOpacity>
                        </View>

                    </View>

                    {(importingWorkouts || importingBodyWeight) && importProgress && (
                        <Text style={styles.progressText}>{importProgress}</Text>
                    )}
                </View>
            </ScrollView>
        </View>
    );
};

// Dynamic Styles Generator
const getStyles = (theme) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
    },
    backButton: {
        padding: 8,
        marginRight: 16,
    },
    title: {
        fontSize: 20,
        fontFamily: FONTS.bold,
        color: theme.text,
    },
    content: {
        paddingVertical: 10,
        paddingHorizontal: 20,
        paddingBottom: 60,
    },
    sectionTitle: {
        fontSize: 14,
        fontFamily: FONTS.semiBold,
        color: theme.textSecondary,
        marginBottom: 12,
        marginTop: 8,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    card: {
        backgroundColor: theme.surface,
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: theme.border,
        ...SHADOWS.small,
        marginBottom: 24,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        gap: 12,
    },
    cardTitle: {
        fontSize: 18,
        fontFamily: FONTS.semiBold,
        color: theme.text,
    },
    cardDescription: {
        fontSize: 14,
        fontFamily: FONTS.regular,
        color: theme.textSecondary,
        marginBottom: 20,
        lineHeight: 20,
    },
    importButton: {
        backgroundColor: theme.primary,
        borderRadius: 12,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    importButtonText: {
        fontSize: 16,
        fontFamily: FONTS.semiBold,
        color: theme.surface, // Text on primary
    },
    progressText: {
        fontSize: 14,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
        marginTop: 12,
        textAlign: 'center',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.background,
        borderRadius: 8,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: theme.border,
    },
    input: {
        flex: 1,
        color: theme.text,
        fontFamily: FONTS.regular,
        fontSize: 16,
        paddingVertical: 12,
    },
    unitText: {
        color: theme.textSecondary,
        fontFamily: FONTS.regular,
        fontSize: 14,
        marginLeft: 8,
    },
    // Theme Selector Styles
    themeScroll: {
        paddingHorizontal: 0,
        paddingBottom: 4,
        gap: 12,
    },
    themeOption: {
        width: 100,
        padding: 12,
        borderRadius: 12,
        borderWidth: 2,
        alignItems: 'center',
        gap: 8,
    },
    themeOptionActive: {
        // Border color handled inline
    },
    themePreview: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    themePreviewCircle: {
        width: 16,
        height: 16,
        borderRadius: 8,
    },
    themeName: {
        fontSize: 12,
        fontFamily: FONTS.medium,
    },
    genderToggleContainer: {
        flexDirection: 'row',
        gap: 12,
    },

    genderOption: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.border,
        gap: 8,
    },
    genderText: {
        fontSize: 14,
        fontFamily: FONTS.semiBold,
        color: theme.text,
    },
    // Slider Styles
    sliderContainer: {
        marginTop: 10,
    },
    sliderTrack: {
        height: 40,
        backgroundColor: theme.background,
        borderRadius: 20,
        position: 'relative',
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: theme.border,
        width: 200,
        alignSelf: 'center',
    },
    sliderFill: {
        height: '100%',
        position: 'absolute',
        top: 0,
        left: 0,
    },
    sliderThumb: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 3,
        position: 'absolute',
        top: 8,
        marginLeft: -12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
        elevation: 3,
    },
    sliderLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 12,
        paddingHorizontal: 10,
    },
    sliderValueText: {
        fontSize: 12,
        fontFamily: FONTS.medium,
        color: theme.textSecondary,
    },
    weightQuickSelect: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
        marginTop: 20,
    },
    weightOption: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.background,
        minWidth: 45,
        alignItems: 'center',
    },
    weightOptionText: {
        fontSize: 12,
        fontFamily: FONTS.bold,
        color: theme.text,
    },
    buttonRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    infoButton: {
        padding: 4,
    },
    timerHeader: {
        marginBottom: 16,
        gap: 12,
    },
    timerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    switchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 20, // Space between the two switch groups
        marginTop: 4,
    },
    switchItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    switchLabel: {
        color: theme.textSecondary,
        fontFamily: FONTS.medium,
        fontSize: 13,
    },
});

export default Settings;
