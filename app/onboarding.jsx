import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import { FONTS, SHADOWS } from '../constants/theme';
import { SETTINGS_KEYS } from '../constants/preferences';
import {
  AppThemeSelector,
  GenderSegment,
  RepRangeSelector,
  SecondaryVolumeSlider,
} from '../components/PreferenceControls';
import { getWorkoutHistoryCount, importStrongData } from '../components/db';
import { AppEvents, emit } from '../utils/events';

const Onboarding = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    theme,
    themeID,
    updateTheme,
    repRangePreset,
    repRangeMin,
    repRangeMax,
    updateRepRange,
    accessoryWeight,
    updateAccessoryWeight,
    gender,
    updateGender,
  } = useTheme();
  const styles = getStyles(theme);
  const isDynamicTheme = theme.type === 'dynamic';

  const [isReady, setIsReady] = useState(false);
  const [hasWorkoutHistory, setHasWorkoutHistory] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const heroAnim = useState(new Animated.Value(0))[0];
  const cardsAnim = useState(new Animated.Value(0))[0];
  const ctaAnim = useState(new Animated.Value(0))[0];

  useEffect(() => {
    const load = async () => {
      try {
        const count = await getWorkoutHistoryCount();
        setHasWorkoutHistory(count > 0);
      } catch (error) {
        console.error('Failed to check workout history for onboarding:', error);
      } finally {
        setIsReady(true);
      }
    };

    load();
  }, []);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(heroAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.timing(cardsAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.timing(ctaAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, [cardsAnim, ctaAnim, heroAnim]);
  const masterOpacity = useState(new Animated.Value(1))[0];
  const finishOnboarding = async () => {
    // Start Fade Out
    Animated.timing(masterOpacity, {
      toValue: 0,
      duration: 350,
      useNativeDriver: true,
    }).start(async () => {
      try {
        // Set the flag ONLY after the animation finishes
        await AsyncStorage.setItem(SETTINGS_KEYS.onboardingSeen, 'true');

        // Navigate to tabs
        router.replace('/(tabs)');
      } catch (error) {
        console.error('Failed to complete onboarding:', error);
      }
    });
  };

  const handleImportData = async (sourceLabel) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      setImporting(true);
      setImportProgress('Reading your export...');
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

      emit(AppEvents.WORKOUT_DATA_IMPORTED);
      setHasWorkoutHistory(true);
      Alert.alert('Import Successful', `Imported ${count} workout sets from ${sourceLabel}.`, [
        { text: 'Continue', onPress: finishOnboarding },
      ]);
    } catch (error) {
      console.error('Onboarding import error:', error);
      Alert.alert('Import Failed', 'An error occurred while importing your Strong export.');
    } finally {
      setImporting(false);
      setImportProgress('');
    }
  };

  if (!isReady) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }




  return (
    <Animated.View style={[styles.container, { paddingTop: insets.top, opacity: masterOpacity }]}>
      {isDynamicTheme ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.background }]} />
      ) : (
        <LinearGradient
          colors={[
            theme.background,
            theme.surface,
            theme.background,
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom + 32, 40) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={[
            styles.hero,
            {
              opacity: heroAnim,
              transform: [
                {
                  translateY: heroAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [28, 0],
                  }),
                },
                {
                  scale: heroAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.97, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Personalize Sisyphus</Text>
          </View>
          <Text style={styles.title}>Customise your experience</Text>
          <Text style={styles.subtitle}>
            Select your options and preferred experience. You can change these at any time.
          </Text>
        </Animated.View>

        <Animated.View
          style={[
            styles.panel,
            styles.heroPanel,
            {
              opacity: cardsAnim,
              transform: [
                {
                  translateY: cardsAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [34, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.sectionHeader}>
            <Feather name="droplet" size={18} color={theme.primary} />
            <Text style={styles.sectionTitle}>Theme</Text>
          </View>
          <Text style={styles.sectionDescription}>
            Choose the look you want to launch into.
          </Text>
          <AppThemeSelector theme={theme} themeID={themeID} onChange={updateTheme} />
        </Animated.View>

        <Animated.View
          style={[
            styles.panel,
            {
              opacity: cardsAnim,
              transform: [
                {
                  translateY: cardsAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [40, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.sectionHeader}>
            <Feather name="sliders" size={18} color={theme.primary} />
            <Text style={styles.sectionTitle}>Target Rep Range</Text>
          </View>
          <Text style={styles.sectionDescription}>
            Set a rep range for progressive overload suggestions!
          </Text>
          <RepRangeSelector
            theme={theme}
            value={repRangePreset}
            min={repRangeMin}
            max={repRangeMax}
            onRangeChange={updateRepRange}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.panel,
            {
              opacity: cardsAnim,
              transform: [
                {
                  translateY: cardsAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [46, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="chart-bell-curve-cumulative" size={18} color={theme.primary} />
            <Text style={styles.sectionTitle}>Secondary volume</Text>
          </View>
          <Text style={styles.sectionDescription}>
            Choose how much supporting muscles should count toward weekly volume.
          </Text>
          <SecondaryVolumeSlider
            theme={theme}
            value={accessoryWeight}
            onChange={updateAccessoryWeight}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.panel,
            {
              opacity: cardsAnim,
              transform: [
                {
                  translateY: cardsAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [52, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="human-male-female" size={18} color={theme.primary} />
            <Text style={styles.sectionTitle}>Muscle model</Text>
          </View>
          <Text style={styles.sectionDescription}>
            Pick the body model used by the highlighter across the app.
          </Text>
          <GenderSegment theme={theme} value={gender} onChange={updateGender} />
        </Animated.View>

        {!hasWorkoutHistory && (
          <Animated.View
            style={[
              styles.panel,
              styles.importPanel,
              {
                opacity: cardsAnim,
                transform: [
                  {
                    translateY: cardsAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [58, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.sectionHeader}>
              <Feather name="download-cloud" size={18} color={theme.primary} />
              <Text style={styles.sectionTitle}>Import past training</Text>
            </View>
            <Text style={styles.sectionDescription}>
              Bring in previous workouts now so your charts and exercise history are ready from day one.
            </Text>

            <View style={styles.importButtonGroup}>
              <TouchableOpacity
                style={styles.importButton}
                onPress={() => handleImportData('Strong')}
                activeOpacity={0.85}
                disabled={importing}
              >
                {importing ? (
                  <ActivityIndicator color={theme.surface} />
                ) : (
                  <>
                    <Feather name="upload" size={18} color={theme.surface} />
                    <Text style={styles.importButtonText}>Import Strong CSV</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.importButton, styles.secondaryImportButton]}
                onPress={() => handleImportData('Sisyphus')}
                activeOpacity={0.85}
                disabled={importing}
              >
                {importing ? (
                  <ActivityIndicator color={theme.primary} />
                ) : (
                  <>
                    <Feather name="refresh-cw" size={18} color={theme.primary} />
                    <Text style={[styles.importButtonText, { color: theme.primary }]}>Import Sisyphus CSV</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {!!importProgress && <Text style={styles.progressText}>{importProgress}</Text>}
          </Animated.View>
        )}

        <Animated.View
          style={{
            opacity: ctaAnim,
            transform: [
              {
                translateY: ctaAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [24, 0],
                }),
              },
            ],
          }}
        >
          <TouchableOpacity style={styles.continueButton} onPress={finishOnboarding} activeOpacity={0.9}>
            {isDynamicTheme ? (
              <View style={[styles.continueGradient, { backgroundColor: theme.primary }]}>
                <Text style={styles.continueText}>Continue</Text>
              </View>
            ) : (
              <LinearGradient
                colors={[theme.primary, theme.primaryDark || theme.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.continueGradient}
              >
                <Text style={styles.continueText}>Continue</Text>
              </LinearGradient>
            )}
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </Animated.View>
  );
};

const getStyles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.background,
    },
    content: {
      paddingHorizontal: 20,
      gap: 18,
    },
    hero: {
      paddingTop: 24,
      paddingBottom: 8,
      gap: 12,
    },
    badge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: theme.overlayMedium,
      borderWidth: 1,
      borderColor: theme.overlayBorder,
    },
    badgeText: {
      color: theme.primary,
      fontFamily: FONTS.bold,
      fontSize: 12,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    title: {
      fontSize: 32,
      lineHeight: 38,
      color: theme.text,
      fontFamily: FONTS.bold,
      maxWidth: '92%',
    },
    subtitle: {
      fontSize: 15,
      lineHeight: 23,
      color: theme.textSecondary,
      fontFamily: FONTS.regular,
      maxWidth: '92%',
    },
    panel: {
      backgroundColor: theme.surface,
      borderRadius: 24,
      padding: 20,
      borderWidth: 1,
      borderColor: theme.border,
      gap: 14,
      ...SHADOWS.medium,
    },
    heroPanel: {
      overflow: 'hidden',
    },
    importPanel: {
      overflow: 'hidden',
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    sectionTitle: {
      fontSize: 18,
      fontFamily: FONTS.semiBold,
      color: theme.text,
    },
    sectionDescription: {
      fontSize: 14,
      lineHeight: 21,
      color: theme.textSecondary,
      fontFamily: FONTS.regular,
    },
    importButton: {
      marginTop: 4,
      backgroundColor: theme.primary,
      borderRadius: 16,
      minHeight: 56,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 10,
    },
    importButtonGroup: {
      gap: 12,
    },
    secondaryImportButton: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.primary,
    },
    importButtonText: {
      fontSize: 15,
      color: theme.surface,
      fontFamily: FONTS.bold,
    },
    progressText: {
      fontSize: 13,
      fontFamily: FONTS.medium,
      color: theme.textSecondary,
    },
    continueButton: {
      marginTop: 6,
      borderRadius: 18,
      overflow: 'hidden',
      ...SHADOWS.medium,
    },
    continueGradient: {
      minHeight: 58,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 18,
    },
    continueText: {
      color: theme.surface,
      fontSize: 16,
      fontFamily: FONTS.bold,
      letterSpacing: 0.3,
    },
  });

export default Onboarding;
