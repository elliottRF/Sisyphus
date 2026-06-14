import React, { useEffect, useLayoutEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useTheme } from '../context/ThemeContext';
import { FONTS, SHADOWS, withAlpha } from '../constants/theme';
import { SETTINGS_KEYS } from '../constants/preferences';
import {
  AppThemeSelector,
  GenderSegment,
  RepRangeSelector,
  SecondaryVolumeSlider,
  UnitSegment,
} from '../components/PreferenceControls';
import {
  getWorkoutHistoryCount,
  importStrongData,
  closeDatabase,
  isValidSQLiteHeader,
  reopenDatabaseAfterRestore,
} from '../components/db';
import { AppEvents, emit } from '../utils/events';
import { customAlert } from '../utils/customAlert';

const STEP_COUNT = 4;

// Small presentational helpers (kept above the screen so they aren't recreated
// every render).
const Feature = ({ theme, styles, IconSet = Feather, icon, title, desc }) => (
  <View style={styles.featureRow}>
    <View style={styles.featureIcon}>
      <IconSet name={icon} size={20} color={theme.primary} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureDesc}>{desc}</Text>
    </View>
  </View>
);

const Section = ({ theme, styles, IconSet = Feather, icon, title, desc, children }) => (
  <View style={styles.panel}>
    <View style={styles.sectionHeader}>
      <IconSet name={icon} size={18} color={theme.primary} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    {desc ? <Text style={styles.sectionDescription}>{desc}</Text> : null}
    {children}
  </View>
);

const StepHeader = ({ styles, title, subtitle }) => (
  <View style={{ gap: 8 }}>
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.subtitle}>{subtitle}</Text>
  </View>
);

const Onboarding = () => {
  const insets = useSafeAreaInsets();
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
    useImperial,
    updateUnitPref,
  } = useTheme();
  const styles = getStyles(theme);
  const isDynamicTheme = theme.type === 'dynamic';

  const [isReady, setIsReady] = useState(false);
  const [hasWorkoutHistory, setHasWorkoutHistory] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [step, setStep] = useState(0);
  // True only while a page transition is in flight — used to hardware-rasterise
  // the animating content so Android doesn't draw the card shadows/borders as
  // hard black edges mid-fade.
  const [transitioning, setTransitioning] = useState(true);
  // Scroll cue: shows a fade + chevron when the current step has content below
  // the fold, so sections like Secondary Volume don't feel hidden.
  const [scrollY, setScrollY] = useState(0);
  const [viewH, setViewH] = useState(0);
  const [contentH, setContentH] = useState(0);

  const scrollRef = useRef(null);
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentX = useRef(new Animated.Value(20)).current;
  const masterOpacity = useRef(new Animated.Value(1)).current;
  const backAnim = useRef(new Animated.Value(0)).current; // 0 = hidden, 1 = shown

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

  // Fade/slide the active step in — driven by `step` so it only fires AFTER the
  // new page has been committed. (Starting the fade-in inside the fade-out
  // callback raised opacity while the previous step was still mounted, so it
  // flickered back for a frame before swapping.) useLayoutEffect runs after the
  // commit but before paint, so the new content never paints at the old offset.
  useLayoutEffect(() => {
    if (!isReady) return;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    setScrollY(0); // reset the cue for the new step
    const anim = Animated.parallel([
      Animated.timing(contentOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.timing(contentX, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]);
    anim.start(({ finished }) => { if (finished) setTransitioning(false); });
    return () => anim.stop();
  }, [step, isReady, contentOpacity, contentX]);

  // Slide/fade the back button in or out as it becomes relevant (width animates
  // so the Continue button resizes smoothly instead of the back button popping).
  useEffect(() => {
    Animated.timing(backAnim, {
      toValue: step > 0 ? 1 : 0,
      duration: 240,
      useNativeDriver: false,
    }).start();
  }, [step, backAnim]);

  // Fade/slide the current step out, then swap to the next one. The effect above
  // fades it back in once it's mounted.
  const animateToStep = (nextStep, dir) => {
    setTransitioning(true);
    Animated.timing(contentOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return;
      contentX.setValue(dir * 36); // offset the incoming page before it mounts
      setStep(nextStep);
    });
  };
  const goNext = () => animateToStep(step + 1, 1);
  const goBack = () => animateToStep(step - 1, -1);

  const finishOnboarding = () => {
    Animated.timing(masterOpacity, {
      toValue: 0,
      duration: 350,
      useNativeDriver: true,
    }).start(async () => {
      try {
        await AsyncStorage.setItem(SETTINGS_KEYS.onboardingSeen, 'true');
        emit(AppEvents.ONBOARDING_COMPLETED);
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
      customAlert(
        'Import Successful',
        `Imported ${count} workout sets from ${sourceLabel}. Tap “Start Training” when you're ready.`,
        [{ text: 'OK' }],
      );
    } catch (error) {
      console.error('Onboarding import error:', error);
      customAlert('Import Failed', 'An error occurred while importing your Strong export.');
    } finally {
      setImporting(false);
      setImportProgress('');
    }
  };

  // Full database restore — same path as Settings → Restore. Replaces the whole
  // SQLite db (workouts, templates, PRs, body weight) from a .db backup. For a
  // fresh install there's nothing to lose; on completion we head into the app.
  const performFullRestore = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (result.canceled) return;
      const uri = result.assets[0].uri;

      // Validate it's really a SQLite file before replacing anything.
      const header = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
        length: 16,
        position: 0,
      });
      if (!isValidSQLiteHeader(header)) {
        customAlert('Invalid File', "That file doesn't look like a Sisyphus backup (.db file).");
        return;
      }

      setImporting(true);
      setImportProgress('Restoring backup...');

      const dbUri = `${FileSystem.documentDirectory}SQLite/sisyphus.db`;
      await closeDatabase();
      await FileSystem.deleteAsync(`${dbUri}-wal`, { idempotent: true });
      await FileSystem.deleteAsync(`${dbUri}-shm`, { idempotent: true });
      await FileSystem.copyAsync({ from: uri, to: dbUri });
      await reopenDatabaseAfterRestore();

      emit(AppEvents.WORKOUT_DATA_IMPORTED);
      setHasWorkoutHistory(true);
      customAlert('Restore Complete', 'Your data has been restored from the backup.', [
        { text: 'Continue', onPress: finishOnboarding },
      ]);
    } catch (error) {
      console.error('Onboarding restore error:', error);
      customAlert('Error', 'Restore failed. Your existing data was not changed.');
      try { await reopenDatabaseAfterRestore(); } catch { }
    } finally {
      setImporting(false);
      setImportProgress('');
    }
  };

  const handleFullRestore = () => {
    customAlert(
      'Restore Full Backup',
      'This replaces all current data with your backup (.db) file. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore', style: 'destructive', onPress: performFullRestore },
      ],
    );
  };

  if (!isReady) {
    return <View style={[styles.loadingContainer, { paddingTop: insets.top }]} />;
  }

  const isLast = step === STEP_COUNT - 1;
  const primaryLabel = step === 0 ? 'Get Started' : isLast ? 'Start Training' : 'Continue';
  const onPrimary = isLast ? finishOnboarding : goNext;

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <View style={{ gap: 22 }}>
            <View style={styles.heroIconCircle}>
              <MaterialCommunityIcons name="trophy-variant" size={38} color={theme.primary} />
            </View>
            <StepHeader
              styles={styles}
              title="Welcome to Sisyphus"
              subtitle="Your training, tracked and intentional. A quick setup and you're ready to lift."
            />
            <View style={styles.featureList}>
              <Feature theme={theme} styles={styles} IconSet={MaterialCommunityIcons} icon="trophy"
                title="Every PR, automatically"
                desc="1RM, volume and weight records tracked as you train." />
              <Feature theme={theme} styles={styles} IconSet={MaterialCommunityIcons} icon="heart-pulse"
                title="Recovery at a glance"
                desc="See which muscles are fresh and which still need rest." />
              <Feature theme={theme} styles={styles} IconSet={Feather} icon="trending-up"
                title="Smart suggestions"
                desc="Progressive-overload targets based on your rep range." />
            </View>
          </View>
        );
      case 1:
        return (
          <View style={{ gap: 18 }}>
            <StepHeader styles={styles} title="Make it yours"
              subtitle="Set your units and look. You can change any of this later in Settings." />
            <Section theme={theme} styles={styles} IconSet={MaterialCommunityIcons} icon="scale-balance"
              title="Units" desc="How weights are shown everywhere in the app.">
              <UnitSegment theme={theme} value={useImperial} onChange={updateUnitPref} />
            </Section>
            <Section theme={theme} styles={styles} IconSet={MaterialCommunityIcons} icon="human-male-female"
              title="Muscle model" desc="Gender of the muscle-highlighter figure.">
              <GenderSegment theme={theme} value={gender} onChange={updateGender} />
            </Section>
            <Section theme={theme} styles={styles} icon="droplet"
              title="Theme" desc="Choose the look you want to launch into.">
              <AppThemeSelector theme={theme} themeID={themeID} onChange={updateTheme} />
            </Section>
          </View>
        );
      case 2:
        return (
          <View style={{ gap: 18 }}>
            <StepHeader styles={styles} title="Dial in your training"
              subtitle="These power your overload suggestions and weekly volume tracking." />
            <Section theme={theme} styles={styles} icon="sliders"
              title="Target rep range"
              desc="When you hit the top of the range, suggestions bump the weight.">
              <RepRangeSelector
                theme={theme}
                value={repRangePreset}
                min={repRangeMin}
                max={repRangeMax}
                onRangeChange={updateRepRange}
              />
            </Section>
            <Section theme={theme} styles={styles} IconSet={MaterialCommunityIcons} icon="chart-bell-curve-cumulative"
              title="Secondary volume"
              desc="How much supporting muscles count — e.g. triceps on a bench day.">
              <SecondaryVolumeSlider
                theme={theme}
                value={accessoryWeight}
                onChange={updateAccessoryWeight}
              />
            </Section>
          </View>
        );
      case 3:
      default:
        return hasWorkoutHistory ? (
          <View style={{ gap: 22 }}>
            <View style={styles.heroIconCircle}>
              <Feather name="check" size={38} color={theme.primary} />
            </View>
            <StepHeader styles={styles} title="You're all set"
              subtitle="Your history is loaded and your preferences are saved. Time to train." />
          </View>
        ) : (
          <View style={{ gap: 18 }}>
            <StepHeader styles={styles} title="Bring your history"
              subtitle="Already track elsewhere? Import now so your charts and PRs are ready from day one." />
            <Section theme={theme} styles={styles} icon="download-cloud"
              title="Import past training"
              desc="Bring your data over so your charts and PRs are ready from day one.">
              <TouchableOpacity
                style={styles.importButton}
                onPress={() => handleImportData('Sisyphus/Strong')}
                activeOpacity={0.85}
                disabled={importing}
              >
                {importing ? (
                  <ActivityIndicator color={theme.surface} />
                ) : (
                  <>
                    <Feather name="upload" size={18} color={theme.surface} />
                    <Text style={styles.importButtonText}>Import workouts (CSV)</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.restoreButton}
                onPress={handleFullRestore}
                activeOpacity={0.85}
                disabled={importing}
              >
                <MaterialCommunityIcons name="database-import" size={18} color={theme.primary} />
                <Text style={styles.restoreButtonText}>Restore full backup (.db)</Text>
              </TouchableOpacity>

              <Text style={styles.importHelp}>
                CSV imports workout history from Strong or Sisyphus. A .db backup restores
                everything — history, templates and body weight.
              </Text>
              {!!importProgress && <Text style={styles.progressText}>{importProgress}</Text>}
            </Section>
            <Text style={styles.skipHint}>No data to import? Just tap “Start Training”.</Text>
          </View>
        );
    }
  };

  return (
    <Animated.View style={[styles.container, { paddingTop: insets.top, opacity: masterOpacity }]}>
      {isDynamicTheme ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.background }]} />
      ) : (
        <LinearGradient
          colors={[theme.background, theme.surface, theme.background]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}

      <View style={styles.progressRow}>
        {Array.from({ length: STEP_COUNT }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i < step && styles.dotDone,
              i === step && styles.dotActive,
            ]}
          />
        ))}
      </View>

      <Animated.View
        // Rasterise only while transitioning so the card shadows/borders fade as
        // one flat layer (no hard black edge), without paying the cost while the
        // user is scrolling a settled page.
        renderToHardwareTextureAndroid={transitioning}
        needsOffscreenAlphaCompositing={transitioning}
        style={{ flex: 1, opacity: contentOpacity, transform: [{ translateX: contentX }] }}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
          onLayout={(e) => setViewH(e.nativeEvent.layout.height)}
          onContentSizeChange={(_, h) => setContentH(h)}
        >
          {renderStep()}
        </ScrollView>

        {/* "More below" cue — visible whenever the step overflows and we're not
            yet at the bottom, so sections under the fold aren't missed. */}
        {viewH > 0 && contentH > viewH + 8 && contentH - viewH - scrollY > 8 && (
          <LinearGradient
            pointerEvents="none"
            colors={['transparent', isDynamicTheme ? '#151517' : theme.background]}
            style={styles.scrollCue}
          >
            <Feather name="chevron-down" size={20} color={theme.textSecondary} />
          </LinearGradient>
        )}
      </Animated.View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom + 12, 20) }]}>
        <Animated.View
          style={{
            width: backAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 66] }),
            opacity: backAnim,
            overflow: 'hidden',
          }}
          pointerEvents={step > 0 ? 'auto' : 'none'}
        >
          <TouchableOpacity style={styles.backButton} onPress={goBack} activeOpacity={0.8} disabled={step === 0}>
            <Feather name="chevron-left" size={22} color={theme.text} />
          </TouchableOpacity>
        </Animated.View>

        <TouchableOpacity
          style={[styles.continueButton, importing && styles.continueButtonDisabled]}
          onPress={onPrimary}
          activeOpacity={0.9}
          disabled={importing}
        >
          {isDynamicTheme ? (
            <View style={[styles.continueGradient, { backgroundColor: theme.primary }]}>
              <Text style={styles.continueText}>{primaryLabel}</Text>
            </View>
          ) : (
            <LinearGradient
              colors={[theme.primary, theme.primaryDark || theme.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.continueGradient}
            >
              <Text style={styles.continueText}>{primaryLabel}</Text>
            </LinearGradient>
          )}
        </TouchableOpacity>
      </View>
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
    progressRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 6,
      paddingTop: 14,
      paddingBottom: 6,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.border,
    },
    dotDone: {
      backgroundColor: withAlpha(theme.primary, 0.5),
    },
    dotActive: {
      width: 22,
      backgroundColor: theme.primary,
    },
    content: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 28,
    },
    scrollCue: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 52,
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingBottom: 6,
    },
    title: {
      fontSize: 28,
      lineHeight: 34,
      color: theme.text,
      fontFamily: FONTS.bold,
      maxWidth: '94%',
    },
    subtitle: {
      fontSize: 15,
      lineHeight: 23,
      color: theme.textSecondary,
      fontFamily: FONTS.regular,
      maxWidth: '94%',
    },
    heroIconCircle: {
      width: 78,
      height: 78,
      borderRadius: 39,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.primary, 0.12),
      borderWidth: 1,
      borderColor: withAlpha(theme.primary, 0.22),
    },
    featureList: {
      gap: 18,
      marginTop: 2,
    },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    featureIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.primary, 0.12),
    },
    featureTitle: {
      fontSize: 16,
      fontFamily: FONTS.semiBold,
      color: theme.text,
      marginBottom: 2,
    },
    featureDesc: {
      fontSize: 13.5,
      lineHeight: 19,
      fontFamily: FONTS.regular,
      color: theme.textSecondary,
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
    importButtonText: {
      fontSize: 15,
      color: theme.surface,
      fontFamily: FONTS.bold,
    },
    restoreButton: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 10,
      borderWidth: 1,
      borderColor: theme.primary,
    },
    restoreButtonText: {
      fontSize: 15,
      color: theme.primary,
      fontFamily: FONTS.bold,
    },
    importHelp: {
      fontSize: 12.5,
      lineHeight: 18,
      fontFamily: FONTS.regular,
      color: theme.textSecondary,
    },
    progressText: {
      fontSize: 13,
      fontFamily: FONTS.medium,
      color: theme.textSecondary,
    },
    skipHint: {
      fontSize: 13,
      fontFamily: FONTS.regular,
      color: theme.textSecondary,
      textAlign: 'center',
      marginTop: 2,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 10,
    },
    backButton: {
      width: 54,
      height: 58,
      marginRight: 12,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    continueButton: {
      flex: 1,
      borderRadius: 18,
      overflow: 'hidden',
      ...SHADOWS.medium,
    },
    continueButtonDisabled: {
      opacity: 0.4,
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
