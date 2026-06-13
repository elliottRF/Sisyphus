import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Animated, TextInput } from 'react-native';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { FONTS, isLightTheme, getThemedShadow } from '../constants/theme';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { importStrongData, exportWorkoutData, importBodyWeightData, exportBodyWeightData, prepareDatabaseBackup, closeDatabase, isValidSQLiteHeader, reopenDatabaseAfterRestore } from '../components/db';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { AppEvents, emit } from '../utils/events';
import { customAlert } from '../utils/customAlert';
import {
    AppThemeSelector,
    GenderSegment,
    RepRangeSelector,
    SecondaryVolumeSlider
} from '../components/PreferenceControls';

// --- Sub-components (Helpers) ---

const AnimatedSwitch = ({ value, onValueChange, activeColor, inactiveColor, thumbColor }) => {
    const animation = useRef(new Animated.Value(value ? 1 : 0)).current;
    const isFirstRender = useRef(true);

    useEffect(() => {
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
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
                Haptics.selectionAsync();
                onValueChange(!value);
            }}
        >
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

const SettingsRow = ({ iconNode, title, description, children, isLast, theme, styles }) => (
    <View style={[styles.rowContainer, !isLast && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
        <View style={styles.rowLeft}>
            {iconNode}
            <View style={styles.rowTextContainer}>
                <Text style={[styles.rowTitle, { color: theme.text }]}>{title}</Text>
                {description && <Text style={[styles.rowDescription, { color: theme.textSecondary }]}>{description}</Text>}
            </View>
        </View>
        <View style={styles.rowRight}>
            {children}
        </View>
    </View>
);

const SettingsBlock = ({ iconNode, title, description, children, theme, styles }) => (
    <View style={styles.blockContainer}>
        <View style={styles.cardHeader}>
            {iconNode}
            <Text style={[styles.cardTitle, { color: theme.text }]}>{title}</Text>
        </View>
        {description && <Text style={[styles.cardDescription, { color: theme.textSecondary }]}>{description}</Text>}
        {children}
    </View>
);

// --- Main Component ---

const Settings = () => {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const {
        theme, themeID, updateTheme,
        gender, updateGender,
        accessoryWeight, updateAccessoryWeight,
        repRangePreset, repRangeMin, repRangeMax, updateRepRange,
        useImperial, updateUnitPref,
    } = useTheme();

    const styles = useMemo(() => getStyles(theme), [theme]);

    // Local state for sliders to prevent lag
    const [localAccessoryWeight, setLocalAccessoryWeight] = useState(accessoryWeight);
    const [localRepMin, setLocalRepMin] = useState(repRangeMin);
    const [localRepMax, setLocalRepMax] = useState(repRangeMax);
    const [localRepPreset, setLocalRepPreset] = useState(repRangePreset);
    const pendingRangeRef = useRef({ min: repRangeMin, max: repRangeMax, preset: repRangePreset });

    useEffect(() => { setLocalAccessoryWeight(accessoryWeight); }, [accessoryWeight]);
    useEffect(() => {
        setLocalRepMin(repRangeMin);
        setLocalRepMax(repRangeMax);
        setLocalRepPreset(repRangePreset);
        pendingRangeRef.current = { min: repRangeMin, max: repRangeMax, preset: repRangePreset };
    }, [repRangeMin, repRangeMax, repRangePreset]);

    const [importingWorkouts, setImportingWorkouts] = useState(false);
    const [importingBodyWeight, setImportingBodyWeight] = useState(false);
    const [importProgress, setImportProgress] = useState('');
    const [defaultTimer, setDefaultTimer] = useState('180');
    const [isAutoTimerEnabled, setIsAutoTimerEnabled] = useState(true);
    const [isTimerMuted, setIsTimerMuted] = useState(false);
    const scrollRef = useRef(null);
    const [isReady, setIsReady] = useState(false);

    useFocusEffect(
        React.useCallback(() => {
            scrollRef.current?.scrollTo({ y: 0, animated: false });
        }, [])
    );

    useEffect(() => { loadSettings(); }, []);

    const loadSettings = async () => {
        try {
            const saved = await AsyncStorage.getItem('settings_default_timer');
            if (saved !== null) setDefaultTimer(saved);
            const savedAuto = await AsyncStorage.getItem('settings_auto_timer');
            if (savedAuto !== null) setIsAutoTimerEnabled(savedAuto === 'true');
            const savedMuted = await AsyncStorage.getItem('settings_timer_muted');
            if (savedMuted !== null) setIsTimerMuted(savedMuted === 'true');
            setIsReady(true);
        } catch (e) {
            setIsReady(true);
        }
    };

    const saveTimerSetting = async (text) => {
        const sanitized = text.replace(/[^0-9]/g, '');
        setDefaultTimer(sanitized);
        try {
            // Save '180' as fallback if user clears the input
            const toSave = sanitized === '' ? '180' : sanitized;
            await AsyncStorage.setItem('settings_default_timer', toSave);
        } catch (e) {
            console.error(e);
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
            setImportProgress('Reading file...');
            const fileUri = result.assets[0].uri;
            const fileContent = await FileSystem.readAsStringAsync(fileUri);

            const count = await importStrongData(fileContent, (progress) => {
                if (progress.stage === 'parsing') {
                    setImportProgress(`Parsing ${progress.total} rows...`);
                } else if (progress.stage === 'preparing') {
                    setImportProgress('Preparing workouts...');
                } else if (progress.stage === 'importing') {
                    setImportProgress(`Importing workout ${progress.current} of ${progress.total}...`);
                } else if (progress.stage === 'complete') {
                    setImportProgress('Finalizing...');
                }
            });

            customAlert("Import Successful", `Successfully imported ${count} workout sets.`, [{ text: "OK" }]);
            emit(AppEvents.WORKOUT_DATA_IMPORTED);
        } catch (error) {
            console.error("Import error:", error);
            customAlert("Import Failed", "An error occurred while importing your data.");
        } finally {
            setImportingWorkouts(false);
            setImportProgress('');
        }
    };

    const handleExportData = async () => {
        try {
            const csv = await exportWorkoutData();
            if (!csv) return customAlert("Error", "No data to export.");
            const fileUri = `${FileSystem.cacheDirectory}sisyphus_workouts.csv`;
            await FileSystem.writeAsStringAsync(fileUri, csv);
            await Sharing.shareAsync(fileUri);
        } catch (e) {
            customAlert("Error", "Export failed.");
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
            const count = await importBodyWeightData(fileContent);
            customAlert("Import Successful", `Successfully imported ${count} body weight entries.`, [{ text: "OK" }]);
            emit(AppEvents.BODYWEIGHT_DATA_IMPORTED);
        } catch (error) {
            console.error("Import error:", error);
            customAlert("Import Failed", "An error occurred while importing body weight data.");
        } finally {
            setImportingBodyWeight(false);
            setImportProgress('');
        }
    };

    const handleBackupDatabase = async () => {
        try {
            const dbName = await prepareDatabaseBackup();
            const srcUri = `${FileSystem.documentDirectory}SQLite/${dbName}`;
            const info = await FileSystem.getInfoAsync(srcUri);
            if (!info.exists) return customAlert("Error", "Database file not found.");
            const date = new Date().toISOString().slice(0, 10);
            const destUri = `${FileSystem.cacheDirectory}sisyphus_backup_${date}.db`;
            await FileSystem.copyAsync({ from: srcUri, to: destUri });
            await Sharing.shareAsync(destUri, { dialogTitle: 'Save Sisyphus backup' });
        } catch (e) {
            console.error("Backup error:", e);
            customAlert("Error", "Backup failed.");
        }
    };

    const performRestore = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
            if (result.canceled) return;
            const uri = result.assets[0].uri;

            // Validate the file is actually a SQLite database before nuking anything
            const header = await FileSystem.readAsStringAsync(uri, {
                encoding: FileSystem.EncodingType.Base64,
                length: 16,
                position: 0,
            });
            if (!isValidSQLiteHeader(header)) {
                return customAlert("Invalid File", "That file doesn't look like a Sisyphus backup (.db file).");
            }

            const dbUri = `${FileSystem.documentDirectory}SQLite/sisyphus.db`;
            await closeDatabase();
            // Clear stale WAL/SHM files so the restored db is read cleanly
            await FileSystem.deleteAsync(`${dbUri}-wal`, { idempotent: true });
            await FileSystem.deleteAsync(`${dbUri}-shm`, { idempotent: true });
            await FileSystem.copyAsync({ from: uri, to: dbUri });
            await reopenDatabaseAfterRestore();
            customAlert("Restore Complete", "Your data has been restored from the backup.");
        } catch (e) {
            console.error("Restore error:", e);
            customAlert("Error", "Restore failed. Your existing data was not changed.");
            try { await reopenDatabaseAfterRestore(); } catch { }
        }
    };

    const handleRestoreDatabase = () => {
        customAlert(
            "Restore Backup",
            "This will replace ALL current data (workouts, templates, PRs) with the backup. This cannot be undone. Consider creating a backup first.",
            [
                { text: "Cancel", style: "cancel" },
                { text: "Restore", style: "destructive", onPress: performRestore },
            ]
        );
    };

    const handleExportBodyWeight = async () => {
        try {
            const csv = await exportBodyWeightData();
            if (!csv) return customAlert("Error", "No data to export.");
            const fileUri = `${FileSystem.cacheDirectory}sisyphus_weight.csv`;
            await FileSystem.writeAsStringAsync(fileUri, csv);
            await Sharing.shareAsync(fileUri);
        } catch (e) {
            customAlert("Error", "Export failed.");
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

            <ScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

                {/* --- Appearance --- */}
                <Text style={styles.sectionTitle}>Appearance</Text>
                <View style={styles.cardGroup}>
                    <SettingsBlock theme={theme} styles={styles} title="App Theme" iconNode={<Feather name="droplet" size={20} color={theme.primary} />}>
                        <AppThemeSelector theme={theme} themeID={themeID} onChange={updateTheme} />
                    </SettingsBlock>
                </View>

                {/* --- Workouts --- */}
                <Text style={styles.sectionTitle}>Workout Preferences</Text>
                <View style={styles.cardGroup}>
                    <SettingsRow theme={theme} styles={styles} title="Use Pounds (lbs)" iconNode={<MaterialCommunityIcons name="weight" size={20} color={theme.primary} />}>
                        {isReady ? <AnimatedSwitch value={useImperial} onValueChange={updateUnitPref} activeColor={theme.primary} inactiveColor={theme.overlayInputFocused} thumbColor={theme.surface} /> : <ActivityIndicator size="small" color={theme.primary} />}
                    </SettingsRow>
                    <SettingsBlock theme={theme} styles={styles} title="Target Rep Range" description="Rep range for progressive overload suggestions." iconNode={<Feather name="sliders" size={20} color={theme.primary} />}>
                        <RepRangeSelector theme={theme} value={localRepPreset} min={localRepMin} max={localRepMax} onRangeChange={(r) => { setLocalRepMin(r.min); setLocalRepMax(r.max); setLocalRepPreset(r.preset); pendingRangeRef.current = r; }} onRangeChangeComplete={() => updateRepRange(pendingRangeRef.current)} compact />
                    </SettingsBlock>
                    <SettingsBlock theme={theme} styles={styles} title="Secondary Volume" description="Weight for supporting muscles (0.0-1.0)." iconNode={<MaterialCommunityIcons name="chart-bell-curve-cumulative" size={20} color={theme.primary} />}>
                        <SecondaryVolumeSlider theme={theme} value={localAccessoryWeight} onChange={setLocalAccessoryWeight} onSlidingComplete={(val) => { updateAccessoryWeight(val); emit(AppEvents.WORKOUT_DATA_IMPORTED); }} />
                    </SettingsBlock>
                    <SettingsBlock theme={theme} styles={styles} title="Muscle Model" description="Gender for highlighter model." iconNode={<MaterialCommunityIcons name="human-male-female" size={20} color={theme.primary} />} isLast>
                        <GenderSegment theme={theme} value={gender} onChange={updateGender} />
                    </SettingsBlock>
                </View>

                {/* --- Rest Timer --- */}
                <Text style={styles.sectionTitle}>Rest Timer</Text>
                <View style={styles.cardGroup}>
                    <SettingsRow theme={theme} styles={styles} title="Default Duration" description="In seconds" iconNode={<Feather name="clock" size={20} color={theme.primary} />}>
                        <View style={styles.timerInputWrapper}>
                            <TextInput style={[styles.timerInput, { color: theme.text }]} value={defaultTimer} onChangeText={saveTimerSetting} keyboardType="numeric" placeholder="180" maxLength={4} />
                            <Text style={[styles.unitText, { color: theme.textSecondary }]}>s</Text>
                        </View>
                    </SettingsRow>
                    <SettingsRow theme={theme} styles={styles} title="Auto-Start Timer" iconNode={<Feather name="play-circle" size={20} color={theme.primary} />}>
                        {isReady ? <AnimatedSwitch value={isAutoTimerEnabled} onValueChange={(v) => { setIsAutoTimerEnabled(v); AsyncStorage.setItem('settings_auto_timer', v.toString()); }} activeColor={theme.primary} inactiveColor={theme.overlayInputFocused} thumbColor={theme.surface} /> : <ActivityIndicator size="small" color={theme.primary} />}
                    </SettingsRow>
                    <SettingsRow theme={theme} styles={styles} title="Mute Audio" iconNode={<Feather name="volume-x" size={20} color={theme.primary} />} isLast>
                        {isReady ? <AnimatedSwitch value={isTimerMuted} onValueChange={(v) => { setIsTimerMuted(v); AsyncStorage.setItem('settings_timer_muted', v.toString()); }} activeColor={theme.primary} inactiveColor={theme.overlayInputFocused} thumbColor={theme.surface} /> : <ActivityIndicator size="small" color={theme.primary} />}
                    </SettingsRow>
                </View>

                {/* --- Data --- */}
                <Text style={styles.sectionTitle}>Data & Backup</Text>
                <View style={styles.cardGroup}>
                    <View style={styles.dataBlock}>
                        <TouchableOpacity style={styles.actionButton} onPress={handleBackupDatabase}><MaterialCommunityIcons name="database-export" size={18} color={theme.surface} /><Text style={styles.actionButtonText}>Backup Everything</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.actionButtonOutline} onPress={handleRestoreDatabase}><MaterialCommunityIcons name="database-import" size={18} color={theme.primary} /><Text style={[styles.actionButtonOutlineText, { color: theme.primary }]}>Restore From Backup</Text></TouchableOpacity>
                        <View style={styles.divider} />
                        <TouchableOpacity style={styles.actionButton} onPress={handleExportData}><Feather name="upload" size={18} color={theme.surface} /><Text style={styles.actionButtonText}>Export Workouts</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.actionButton} onPress={handleExportBodyWeight}><Feather name="upload" size={18} color={theme.surface} /><Text style={styles.actionButtonText}>Export Body Weight</Text></TouchableOpacity>
                        <View style={styles.divider} />
                        <TouchableOpacity style={styles.actionButtonOutline} onPress={handleImportData} disabled={importingWorkouts}><Feather name="download" size={18} color={theme.primary} /><Text style={[styles.actionButtonOutlineText, { color: theme.primary }]}>Import Workouts Sisyphus/Strong</Text></TouchableOpacity>
                        <View style={styles.buttonRowWithHelp}>
                            <TouchableOpacity style={[styles.actionButtonOutline, { flex: 1 }]} onPress={handleImportBodyWeight} disabled={importingBodyWeight}><Feather name="download" size={18} color={theme.primary} /><Text style={[styles.actionButtonOutlineText, { color: theme.primary }]}>Import Body Weight</Text></TouchableOpacity>
                            <TouchableOpacity onPress={() => customAlert("Weight Import", "Extract Strong measurements ZIP file for weight.csv")} style={styles.infoButton}><Feather name="help-circle" size={22} color={theme.textSecondary} /></TouchableOpacity>
                        </View>
                        {(importingWorkouts || importingBodyWeight) && importProgress && (
                            <Text style={[styles.progressText, { color: theme.textSecondary }]}>{importProgress}</Text>
                        )}
                    </View>
                </View>
            </ScrollView>
        </View>
    );
};

const getStyles = (theme) => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
    backButton: { padding: 8, marginRight: 12 },
    title: { fontSize: 22, fontFamily: FONTS.bold, letterSpacing: -0.4, color: theme.text },
    content: { paddingVertical: 10, paddingHorizontal: 20, paddingBottom: 60 },
    sectionTitle: { fontSize: 13, fontFamily: FONTS.semiBold, color: theme.textSecondary, marginBottom: 8, marginTop: 16, textTransform: 'uppercase', letterSpacing: 1.2, marginLeft: 4 },
    cardGroup: { backgroundColor: theme.surface, borderRadius: 16, ...(isLightTheme(theme) ? getThemedShadow(theme, 'small') : null), marginBottom: 20, overflow: 'hidden' },
    rowContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, paddingHorizontal: 20 },
    rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 16 },
    rowTextContainer: { marginLeft: 16, flex: 1 },
    rowTitle: { fontSize: 16, fontFamily: FONTS.medium },
    rowDescription: { fontSize: 13, fontFamily: FONTS.regular, marginTop: 2 },
    rowRight: { justifyContent: 'center', alignItems: 'flex-end' },
    blockContainer: { paddingVertical: 16, paddingHorizontal: 20 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 12 },
    cardTitle: { fontSize: 16, fontFamily: FONTS.medium },
    cardDescription: { fontSize: 13, fontFamily: FONTS.regular, marginBottom: 16, lineHeight: 18 },
    dataBlock: { padding: 20, gap: 12 },
    actionButton: { backgroundColor: theme.primary, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    actionButtonText: { fontSize: 16, fontFamily: FONTS.semiBold, color: theme.surface },
    actionButtonOutline: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.primary, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    actionButtonOutlineText: { fontSize: 16, fontFamily: FONTS.semiBold },
    divider: { height: 1, backgroundColor: theme.border, marginVertical: 4 },
    buttonRowWithHelp: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    infoButton: { padding: 8, backgroundColor: theme.background, borderRadius: 10, borderWidth: 1, borderColor: theme.border },
    progressText: { fontSize: 14, fontFamily: FONTS.medium, marginTop: 8, textAlign: 'center' },
    timerInputWrapper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background, borderRadius: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: theme.border, height: 40, minWidth: 80 },
    timerInput: { fontFamily: FONTS.semiBold, fontSize: 16, textAlign: 'center', paddingVertical: 0, textAlignVertical: 'center', paddingRight: 2 },
    unitText: { fontFamily: FONTS.regular, fontSize: 14, marginLeft: 4 },
});

export default Settings;