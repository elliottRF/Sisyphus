import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS, FONTS, SHADOWS } from '../constants/theme';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { importStrongData } from '../components/db';

const Settings = () => {
    const router = useRouter();
    const [importing, setImporting] = useState(false);
    const [importProgress, setImportProgress] = useState('');

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
                // Update progress based on stage
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
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Feather name="arrow-left" size={24} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={styles.title}>Settings</Text>
            </View>

            <View style={styles.content}>
                <Text style={styles.sectionTitle}>Data Management</Text>

                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <Feather name="database" size={24} color={COLORS.primary} />
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
                            <ActivityIndicator color={COLORS.text} />
                        ) : (
                            <>
                                <Feather name="download" size={20} color={COLORS.text} />
                                <Text style={styles.importButtonText}>Import Strong CSV</Text>
                            </>
                        )}
                    </TouchableOpacity>
                    {importing && importProgress && (
                        <Text style={styles.progressText}>{importProgress}</Text>
                    )}
                </View>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    backButton: {
        padding: 8,
        marginRight: 16,
    },
    title: {
        fontSize: 20,
        fontFamily: FONTS.bold,
        color: COLORS.text,
    },
    content: {
        padding: 20,
    },
    sectionTitle: {
        fontSize: 16,
        fontFamily: FONTS.semiBold,
        color: COLORS.textSecondary,
        marginBottom: 16,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    card: {
        backgroundColor: COLORS.surface,
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: COLORS.border,
        ...SHADOWS.small,
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
        color: COLORS.text,
    },
    cardDescription: {
        fontSize: 14,
        fontFamily: FONTS.regular,
        color: COLORS.textSecondary,
        marginBottom: 20,
        lineHeight: 20,
    },
    importButton: {
        backgroundColor: COLORS.primary,
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
        color: COLORS.text, // Assuming text on primary is readable, or use white
    },
    progressText: {
        fontSize: 14,
        fontFamily: FONTS.medium,
        color: COLORS.textSecondary,
        marginTop: 12,
        textAlign: 'center',
    },
});

export default Settings;
