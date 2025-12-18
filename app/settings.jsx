import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import React, { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
// import { COLORS, FONTS, SHADOWS } from '../constants/theme'; // Removed static import
import { FONTS, SHADOWS, THEMES } from '../constants/theme';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { importStrongData } from '../components/db';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TextInput } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const Settings = () => {
    const router = useRouter();
    const { theme, themeID, updateTheme } = useTheme(); // Use Theme Hook
    const styles = getStyles(theme);

    const [importing, setImporting] = useState(false);
    const [importProgress, setImportProgress] = useState('');
    const [defaultTimer, setDefaultTimer] = useState('180');

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const saved = await AsyncStorage.getItem('settings_default_timer');
            if (saved) setDefaultTimer(saved);
        } catch (e) {
            console.error("Failed to load settings", e);
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

    const handleImportStrong = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['text/csv', 'text/comma-separated-values', 'application/csv'],
                copyToCacheDirectory: true,
            });

            if (result.canceled) return;

            setImporting(true);
            setImportProgress('Reading file...');
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
                `Successfully imported ${count} workout sets from Strong.`,
                [{ text: "OK" }]
            );

        } catch (error) {
            console.error("Import error:", error);
            Alert.alert("Import Failed", "An error occurred while importing your data. Please check the CSV format.");
        } finally {
            setImporting(false);
            setImportProgress('');
        }
    };

    return (
        <SafeAreaView style={styles.container}>


            <ScrollView contentContainerStyle={styles.content}>

                {/* --- THEME SETTINGS --- */}
                <Text style={styles.sectionTitle}>Appearance</Text>
                <View style={[styles.card, { paddingVertical: 16 }]}>
                    <View style={[styles.cardHeader, { paddingHorizontal: 0 }]}>
                        <Feather name="droplet" size={24} color={theme.primary} />
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
                                        {key.charAt(0) + key.slice(1).toLowerCase()}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>

                {/* --- DATA MANAGEMENT --- */}
                <Text style={styles.sectionTitle}>Data Management</Text>

                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <Feather name="database" size={24} color={theme.primary} />
                        <Text style={styles.cardTitle}>Import Data</Text>
                    </View>
                    <Text style={styles.cardDescription}>
                        Import your workout history from the Strong app. Select your exported CSV file.
                    </Text>

                    <TouchableOpacity
                        style={styles.importButton}
                        onPress={handleImportStrong}
                        disabled={importing}
                    >
                        {importing ? (
                            <ActivityIndicator color={theme.surface} />
                        ) : (
                            <>
                                <Feather name="download" size={20} color={theme.surface} />
                                <Text style={styles.importButtonText}>Import Strong CSV</Text>
                            </>
                        )}
                    </TouchableOpacity>
                    {importing && importProgress && (
                        <Text style={styles.progressText}>{importProgress}</Text>
                    )}
                </View>

                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <Feather name="clock" size={24} color={theme.primary} />
                        <Text style={styles.cardTitle}>Timer Settings</Text>
                    </View>
                    <Text style={styles.cardDescription}>
                        Set the default duration (in seconds) for the rest timer.
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
            </ScrollView>
        </SafeAreaView>
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
        paddingHorizontal: 20,
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
});

export default Settings;
