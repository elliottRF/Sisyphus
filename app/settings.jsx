import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Animated, TextInput } from 'react-native';
import Reanimated, { FadeIn, LinearTransition, Easing as REasing } from 'react-native-reanimated';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { FONTS, isLightTheme, getThemedShadow } from '../constants/theme';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { importStrongData, exportWorkoutData, importBodyWeightData, exportBodyWeightData, prepareDatabaseBackup, closeDatabase, isValidSQLiteHeader, reopenDatabaseAfterRestore } from '../components/db';
import * as Sharing from 'expo-sharing';
import * as haptics from '../utils/haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { AppEvents, emit } from '../utils/events';
import { getHapticsEnabled, setHapticsEnabled } from '../utils/haptics';
import { customAlert } from '../utils/customAlert';
import {
    AppThemeSelector,
    recoveryRateLabel,
    GenderSegment,
    RepRangeSelector,
    SecondaryVolumeSlider,
    RecoveryRateSlider
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
                haptics.select();
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

// A settings row that shows its current value and reveals the real control
// only when tapped. The heavy controls (rep range, sliders, theme picker) were
// all rendered expanded at all times, which is what made this page endless.
const ExpandableRow = ({ iconNode, title, value, expanded, onToggle, children, isLast, theme, styles }) => (
    <Reanimated.View
        layout={LinearTransition.duration(200).easing(REasing.out(REasing.ease))}
        style={!isLast && !expanded ? { borderBottomWidth: 1, borderBottomColor: theme.border } : null}
    >
        <TouchableOpacity style={styles.rowContainer} onPress={onToggle} activeOpacity={0.6}>
            <View style={styles.rowLeft}>
                {iconNode}
                <View style={styles.rowTextContainer}>
                    <Text style={[styles.rowTitle, { color: theme.text }]}>{title}</Text>
                </View>
            </View>
            <View style={styles.rowValueGroup}>
                {value != null && <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>}
                <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textSecondary} />
            </View>
        </TouchableOpacity>
        {expanded && (
            <Reanimated.View
                entering={FadeIn.duration(160)}
                style={[styles.expandedContent, !isLast && { borderBottomWidth: 1, borderBottomColor: theme.border }]}
            >
                {children}
            </Reanimated.View>
        )}
    </Reanimated.View>
);

// A plain tappable row for one-shot actions (backup, import, export). Full
// labels rather than an icon grid — these are destructive-adjacent and need to
// say exactly what they do.
const ActionRow = ({ iconNode, title, description, onPress, disabled, busy, isLast, theme, styles }) => (
    <TouchableOpacity
        style={[styles.rowContainer, !isLast && { borderBottomWidth: 1, borderBottomColor: theme.border }, disabled && { opacity: 0.5 }]}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.6}
    >
        <View style={styles.rowLeft}>
            {iconNode}
            <View style={styles.rowTextContainer}>
                <Text style={[styles.rowTitle, { color: theme.text }]}>{title}</Text>
                {description && <Text style={[styles.rowDescription, { color: theme.textSecondary }]}>{description}</Text>}
            </View>
        </View>
        {busy
            ? <ActivityIndicator size="small" color={theme.primary} />
            : <Feather name="chevron-right" size={18} color={theme.textSecondary} />}
    </TouchableOpacity>
);

// --- Main Component ---

const Settings = () => {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const {
        theme, themeID, updateTheme, customThemes,
        gender, updateGender,
        accessoryWeight, updateAccessoryWeight,
        recoveryRate, updateRecoveryRate,
        repRangePreset, repRangeMin, repRangeMax, updateRepRange,
        useImperial, updateUnitPref,
    } = useTheme();

    const styles = useMemo(() => getStyles(theme), [theme]);

    // Local state for sliders to prevent lag
    const [localAccessoryWeight, setLocalAccessoryWeight] = useState(accessoryWeight);
    const [localRecoveryRate, setLocalRecoveryRate] = useState(recoveryRate);
    const [localRepMin, setLocalRepMin] = useState(repRangeMin);
    const [localRepMax, setLocalRepMax] = useState(repRangeMax);
    const [localRepPreset, setLocalRepPreset] = useState(repRangePreset);
    const pendingRangeRef = useRef({ min: repRangeMin, max: repRangeMax, preset: repRangePreset });

    useEffect(() => { setLocalAccessoryWeight(accessoryWeight); }, [accessoryWeight]);
    useEffect(() => { setLocalRecoveryRate(recoveryRate); }, [recoveryRate]);
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

    // Android's share sheet only ever offers apps to send the file TO — there is
    // no "save to storage" entry in it, so the one thing most people want from a
    // backup (a copy they can actually find later) wasn't reachable. Writing to
    // a folder the user chooses needs the Storage Access Framework, which hands
    // back a content:// URI that only the SAF helpers can write to.
    const saveBackupToDevice = async (srcUri, filename) => {
        const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!perm.granted) return false;
        // A .db is binary, so it has to round-trip as base64 rather than utf8.
        const contents = await FileSystem.readAsStringAsync(srcUri, {
            encoding: FileSystem.EncodingType.Base64,
        });
        const targetUri = await FileSystem.StorageAccessFramework.createFileAsync(
            perm.directoryUri,
            filename,
            'application/octet-stream'
        );
        await FileSystem.writeAsStringAsync(targetUri, contents, {
            encoding: FileSystem.EncodingType.Base64,
        });
        return true;
    };

    const handleBackupDatabase = async () => {
        try {
            const dbName = await prepareDatabaseBackup();
            const srcUri = `${FileSystem.documentDirectory}SQLite/${dbName}`;
            const info = await FileSystem.getInfoAsync(srcUri);
            if (!info.exists) return customAlert("Error", "Database file not found.");
            // Local date parts, not toISOString(): a backup taken at 00:30 BST
            // would otherwise be stamped with the previous day.
            const now = new Date();
            const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const filename = `sisyphus_backup_${date}.db`;
            const destUri = `${FileSystem.cacheDirectory}${filename}`;
            await FileSystem.copyAsync({ from: srcUri, to: destUri });

            customAlert(
                "Backup Ready",
                "Back it up to Drive or another app, or save a copy to this device.",
                [
                    {
                        text: 'Back up',
                        style: 'default',
                        onPress: () => {
                            Sharing.shareAsync(destUri, { dialogTitle: 'Save Sisyphus backup' })
                                .catch(e => console.error("Backup share error:", e));
                        },
                    },
                    {
                        text: 'Save to Device',
                        style: 'default',
                        onPress: async () => {
                            try {
                                const saved = await saveBackupToDevice(destUri, filename);
                                // Not saved and no error means the user backed out
                                // of the folder picker — not something to alert on.
                                if (saved) customAlert("Backup Saved", `Saved as ${filename}.`);
                            } catch (e) {
                                console.error("Backup save error:", e);
                                customAlert("Error", "Could not write the backup to that folder.");
                            }
                        },
                    },
                    { text: 'Cancel', style: 'cancel' },
                ]
            );
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

    // Only one row is open at a time - the point is a short page.
    const [hapticsOn, setHapticsOn] = useState(getHapticsEnabled());
    const [openRow, setOpenRow] = useState(null);
    const toggleRow = (key) => setOpenRow((prev) => (prev === key ? null : key));

    const activeThemeName = React.useMemo(() => {
        const custom = customThemes?.find((t) => t.id === themeID);
        if (custom) return custom.name;
        return (themeID || 'DEFAULT')
            .split('_')
            .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
            .join(' ');
    }, [themeID, customThemes]);

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
                    <ExpandableRow
                        theme={theme} styles={styles} title="App Theme" value={activeThemeName}
                        iconNode={<Feather name="droplet" size={20} color={theme.primary} />}
                        expanded={openRow === 'theme'} onToggle={() => toggleRow('theme')} isLast
                    >
                        <AppThemeSelector theme={theme} themeID={themeID} onChange={updateTheme} horizontal />
                    </ExpandableRow>
                </View>

                {/* --- Workouts --- */}
                <Text style={styles.sectionTitle}>Workout Preferences</Text>
                <View style={styles.cardGroup}>
                    <SettingsRow theme={theme} styles={styles} title="Use Pounds (lbs)" iconNode={<MaterialCommunityIcons name="weight" size={20} color={theme.primary} />}>
                        {isReady ? <AnimatedSwitch value={useImperial} onValueChange={updateUnitPref} activeColor={theme.primary} inactiveColor={theme.overlayInputFocused} thumbColor={theme.surface} /> : <ActivityIndicator size="small" color={theme.primary} />}
                    </SettingsRow>
                    <ExpandableRow
                        theme={theme} styles={styles} title="Target Rep Range" value={localRepMin + '-' + localRepMax + ' reps'}
                        iconNode={<Feather name="sliders" size={20} color={theme.primary} />}
                        expanded={openRow === 'reps'} onToggle={() => toggleRow('reps')}
                    >
                        <Text style={styles.expandedHint}>Used for progressive overload suggestions.</Text>
                        <RepRangeSelector theme={theme} value={localRepPreset} min={localRepMin} max={localRepMax} onRangeChange={(r) => { setLocalRepMin(r.min); setLocalRepMax(r.max); setLocalRepPreset(r.preset); pendingRangeRef.current = r; }} onRangeChangeComplete={() => updateRepRange(pendingRangeRef.current)} compact />
                    </ExpandableRow>
                    <ExpandableRow
                        theme={theme} styles={styles} title="Secondary Volume" value={Number(localAccessoryWeight).toFixed(1)}
                        iconNode={<MaterialCommunityIcons name="chart-bell-curve-cumulative" size={20} color={theme.primary} />}
                        expanded={openRow === 'volume'} onToggle={() => toggleRow('volume')}
                    >
                        <Text style={styles.expandedHint}>How much supporting muscles count towards volume.</Text>
                        <SecondaryVolumeSlider theme={theme} value={localAccessoryWeight} onChange={setLocalAccessoryWeight} onSlidingComplete={(val) => { updateAccessoryWeight(val); emit(AppEvents.WORKOUT_DATA_IMPORTED); }} />
                    </ExpandableRow>
                    <ExpandableRow
                        theme={theme} styles={styles} title="Recovery Rate" value={recoveryRateLabel(localRecoveryRate)}
                        iconNode={<MaterialCommunityIcons name="heart-pulse" size={20} color={theme.primary} />}
                        expanded={openRow === 'recovery'} onToggle={() => toggleRow('recovery')}
                    >
                        <Text style={styles.expandedHint}>How quickly muscles recover, driving readiness percentages.</Text>
                        <RecoveryRateSlider theme={theme} value={localRecoveryRate} onChange={setLocalRecoveryRate} onSlidingComplete={(val) => { updateRecoveryRate(val); emit(AppEvents.WORKOUT_DATA_IMPORTED); }} />
                    </ExpandableRow>
                    <ExpandableRow
                        theme={theme} styles={styles} title="Muscle Model" value={gender === 'female' ? 'Female' : 'Male'}
                        iconNode={<MaterialCommunityIcons name="human-male-female" size={20} color={theme.primary} />}
                        expanded={openRow === 'gender'} onToggle={() => toggleRow('gender')} isLast
                    >
                        <Text style={styles.expandedHint}>Which figure the muscle highlighter draws.</Text>
                        <GenderSegment theme={theme} value={gender} onChange={updateGender} />
                    </ExpandableRow>
                </View>

                {/* --- Rest Timer --- */}
                <Text style={styles.sectionTitle}>Rest Timer</Text>
                <View style={styles.cardGroup}>
                    <SettingsRow theme={theme} styles={styles} title="Default Duration" iconNode={<Feather name="clock" size={20} color={theme.primary} />}>
                        <View style={styles.timerInputWrapper}>
                            <TextInput style={[styles.timerInput, { color: theme.text }]} value={defaultTimer} onChangeText={saveTimerSetting} keyboardType="numeric" placeholder="180" maxLength={4} />
                            <Text style={[styles.unitText, { color: theme.textSecondary }]}>s</Text>
                        </View>
                    </SettingsRow>
                    <SettingsRow theme={theme} styles={styles} title="Auto-Start Timer" iconNode={<Feather name="play-circle" size={20} color={theme.primary} />}>
                        {isReady ? <AnimatedSwitch value={isAutoTimerEnabled} onValueChange={(v) => { setIsAutoTimerEnabled(v); AsyncStorage.setItem('settings_auto_timer', v.toString()); }} activeColor={theme.primary} inactiveColor={theme.overlayInputFocused} thumbColor={theme.surface} /> : <ActivityIndicator size="small" color={theme.primary} />}
                    </SettingsRow>
                    <SettingsRow theme={theme} styles={styles} title="Mute Audio" iconNode={<Feather name="volume-x" size={20} color={theme.primary} />}>
                        {isReady ? <AnimatedSwitch value={isTimerMuted} onValueChange={(v) => { setIsTimerMuted(v); AsyncStorage.setItem('settings_timer_muted', v.toString()); }} activeColor={theme.primary} inactiveColor={theme.overlayInputFocused} thumbColor={theme.surface} /> : <ActivityIndicator size="small" color={theme.primary} />}
                    </SettingsRow>
                    <SettingsRow theme={theme} styles={styles} title="Haptic Feedback" description="Vibration on taps, PRs and timer end" iconNode={<MaterialCommunityIcons name="vibrate" size={20} color={theme.primary} />} isLast>
                        {isReady ? <AnimatedSwitch value={hapticsOn} onValueChange={(v) => { setHapticsOn(v); setHapticsEnabled(v); }} activeColor={theme.primary} inactiveColor={theme.overlayInputFocused} thumbColor={theme.surface} /> : <ActivityIndicator size="small" color={theme.primary} />}
                    </SettingsRow>
                </View>

                {/* --- Data --- */}
                <Text style={styles.sectionTitle}>Data & Backup</Text>
                <View style={styles.cardGroup}>
                    <ActionRow theme={theme} styles={styles} title="Backup Everything" description="Save a full .db file"
                        iconNode={<MaterialCommunityIcons name="database-export" size={20} color={theme.primary} />}
                        onPress={handleBackupDatabase} />
                    <ActionRow theme={theme} styles={styles} title="Restore From Backup" description="Replaces all current data"
                        iconNode={<MaterialCommunityIcons name="database-import" size={20} color={theme.primary} />}
                        onPress={handleRestoreDatabase} />
                    <ActionRow theme={theme} styles={styles} title="Import Workouts" description="From a Sisyphus or Strong CSV"
                        iconNode={<Feather name="download" size={20} color={theme.primary} />}
                        onPress={handleImportData} disabled={importingWorkouts} busy={importingWorkouts} />
                    <ActionRow theme={theme} styles={styles} title="Import Body Weight" description="weight.csv from Strong's measurements ZIP"
                        iconNode={<Feather name="download" size={20} color={theme.primary} />}
                        onPress={handleImportBodyWeight} disabled={importingBodyWeight} busy={importingBodyWeight} />
                    <ActionRow theme={theme} styles={styles} title="Export Workouts" description="Share as CSV"
                        iconNode={<Feather name="upload" size={20} color={theme.primary} />}
                        onPress={handleExportData} />
                    <ActionRow theme={theme} styles={styles} title="Export Body Weight" description="Share as CSV"
                        iconNode={<Feather name="upload" size={20} color={theme.primary} />}
                        onPress={handleExportBodyWeight} isLast />
                    {(importingWorkouts || importingBodyWeight) && importProgress && (
                        <Text style={[styles.progressText, { color: theme.textSecondary }]}>{importProgress}</Text>
                    )}
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
    content: { paddingVertical: 8, paddingHorizontal: 20, paddingBottom: 48 },
    sectionTitle: { fontSize: 13, fontFamily: FONTS.semiBold, color: theme.textSecondary, marginBottom: 6, marginTop: 14, textTransform: 'uppercase', letterSpacing: 1.2, marginLeft: 4 },
    cardGroup: { backgroundColor: theme.surface, borderRadius: 16, ...(isLightTheme(theme) ? getThemedShadow(theme, 'small') : null), marginBottom: 14, overflow: 'hidden' },
    rowContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 18 },
    rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 16 },
    rowTextContainer: { marginLeft: 16, flex: 1 },
    rowTitle: { fontSize: 16, fontFamily: FONTS.medium },
    rowDescription: { fontSize: 13, fontFamily: FONTS.regular, marginTop: 2 },
    rowRight: { justifyContent: 'center', alignItems: 'flex-end' },
    rowValueGroup: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
    rowValue: { fontSize: 14, fontFamily: FONTS.medium, color: theme.textSecondary, flexShrink: 1 },
    expandedContent: { paddingHorizontal: 18, paddingBottom: 16 },
    expandedHint: { fontSize: 13, fontFamily: FONTS.regular, color: theme.textSecondary, marginBottom: 12, lineHeight: 17 },
    progressText: { fontSize: 14, fontFamily: FONTS.medium, marginTop: 8, textAlign: 'center' },
    timerInputWrapper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background, borderRadius: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: theme.border, height: 40, minWidth: 80 },
    timerInput: { fontFamily: FONTS.semiBold, fontSize: 16, textAlign: 'center', paddingVertical: 0, textAlignVertical: 'center', paddingRight: 2 },
    unitText: { fontFamily: FONTS.regular, fontSize: 14, marginLeft: 4 },
});

export default Settings;