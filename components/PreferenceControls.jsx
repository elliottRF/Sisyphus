import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, PanResponder } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { FONTS, THEMES } from '../constants/theme';
import {
  DEFAULT_REP_RANGE,
  REP_RANGE_MAX,
  REP_RANGE_MIN,
  REP_RANGE_PRESETS,
} from '../constants/preferences';

const REP_PRESET_BOUNDS = {
  strength: { min: 3, max: 6 },
  balanced: { min: 6, max: 12 },
  hypertrophy: { min: 12, max: 15 },
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// ---------------------------------------------------------------------------
// RepRangeSelector
// ---------------------------------------------------------------------------

export const RepRangeSelector = ({
  theme,
  value,
  min = DEFAULT_REP_RANGE.min,
  max = DEFAULT_REP_RANGE.max,
  onPresetChange,
  onRangeChange,
  onRangeChangeComplete,
  compact = false,
}) => {
  const styles = getStyles(theme);

  const trackWidthRef = useRef(280);
  const activeThumbRef = useRef('min');

  const minRef = useRef(min);
  minRef.current = min;
  const maxRef = useRef(max);
  maxRef.current = max;
  const onRangeChangeRef = useRef(onRangeChange);
  onRangeChangeRef.current = onRangeChange;
  const onRangeChangeCompleteRef = useRef(onRangeChangeComplete);
  onRangeChangeCompleteRef.current = onRangeChangeComplete;

  const handleMoveRef = useRef(null);
  handleMoveRef.current = (locationX) => {
    const rangeSize = REP_RANGE_MAX - REP_RANGE_MIN;
    const width = Math.max(trackWidthRef.current, 1);
    const ratio = clamp(locationX / width, 0, 1);
    const rawValue = clamp(
      Math.round(REP_RANGE_MIN + ratio * rangeSize),
      REP_RANGE_MIN,
      REP_RANGE_MAX,
    );

    if (activeThumbRef.current === 'min') {
      const nextMin = clamp(rawValue, REP_RANGE_MIN, maxRef.current - 1);
      onRangeChangeRef.current({ min: nextMin, max: maxRef.current, preset: 'custom' });
    } else {
      const nextMax = clamp(rawValue, minRef.current + 1, REP_RANGE_MAX);
      onRangeChangeRef.current({ min: minRef.current, max: nextMax, preset: 'custom' });
    }
  };

  const rangePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (evt) => {
        const rangeSize = REP_RANGE_MAX - REP_RANGE_MIN;
        const width = Math.max(trackWidthRef.current, 1);
        const ratio = clamp(evt.nativeEvent.locationX / width, 0, 1);
        const touchValue = clamp(
          Math.round(REP_RANGE_MIN + ratio * rangeSize),
          REP_RANGE_MIN,
          REP_RANGE_MAX,
        );
        activeThumbRef.current =
          Math.abs(touchValue - minRef.current) <= Math.abs(touchValue - maxRef.current)
            ? 'min'
            : 'max';
        handleMoveRef.current(evt.nativeEvent.locationX);
      },
      onPanResponderMove: (evt) => handleMoveRef.current(evt.nativeEvent.locationX),
      onPanResponderRelease: (evt) => {
        handleMoveRef.current(evt.nativeEvent.locationX);
        onRangeChangeCompleteRef.current?.();
      },
    }),
  ).current;

  const rangeSize = REP_RANGE_MAX - REP_RANGE_MIN;
  const valueToPercent = (repValue) => ((repValue - REP_RANGE_MIN) / rangeSize) * 100;

  return (
    <View style={styles.repRangeShell}>
      <View style={[styles.repRangeGrid, compact && styles.repRangeGridCompact]}>
        {REP_RANGE_PRESETS.map((preset) => {
          const active = value === preset.key;
          return (
            <TouchableOpacity
              key={preset.key}
              activeOpacity={0.85}
              style={[
                styles.repCard,
                compact && styles.repCardCompact,
                active && { backgroundColor: theme.primary, borderColor: theme.primary },
              ]}
              onPress={() => {
                const bounds = REP_PRESET_BOUNDS[preset.key];
                onPresetChange?.(preset.key);
                onRangeChange({ min: bounds.min, max: bounds.max, preset: preset.key });
                onRangeChangeComplete?.();
              }}
            >
              <View style={styles.repHeader}>
                <Text style={[styles.repTitle, active && { color: theme.surface }]}>
                  {preset.title}
                </Text>
                {active && <Feather name="check" size={16} color={theme.surface} />}
              </View>
              <Text style={[styles.repRange, active && { color: theme.surface }]}>
                {preset.range}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.customRangeCard}>
        <View style={styles.customRangeHeader}>
          <View>
            <Text style={styles.customRangeTitle}>Custom range</Text>
            <Text style={styles.customRangeSubtitle}>
              Drag both handles to choose your target band.
            </Text>
          </View>
          <View
            style={[
              styles.customBadge,
              value === 'custom'
                ? { backgroundColor: theme.primary, borderColor: theme.primary }
                : null,
            ]}
          >
            <Text
              style={[
                styles.customBadgeText,
                value === 'custom' ? { color: theme.surface } : null,
              ]}
            >
              {min}–{max}
            </Text>
          </View>
        </View>

        <View
          style={styles.rangeTrack}
          onLayout={(e) => { trackWidthRef.current = e.nativeEvent.layout.width; }}
        >
          <View style={styles.rangeTrackBase} />
          <View
            style={[
              styles.rangeTrackFill,
              {
                left: `${valueToPercent(min)}%`,
                width: `${valueToPercent(max) - valueToPercent(min)}%`,
                backgroundColor: theme.primary,
              },
            ]}
          />
          <View
            style={[
              styles.rangeThumb,
              { left: `${valueToPercent(min)}%`, borderColor: theme.primary, backgroundColor: theme.surface },
            ]}
          />
          <View
            style={[
              styles.rangeThumb,
              { left: `${valueToPercent(max)}%`, borderColor: theme.primary, backgroundColor: theme.surface },
            ]}
          />
          <View style={styles.rangeTouchOverlay} {...rangePanResponder.panHandlers} />
        </View>

        <View style={styles.rangeScale}>
          {Array.from({ length: REP_RANGE_MAX - REP_RANGE_MIN + 1 }, (_, index) => {
            const repValue = REP_RANGE_MIN + index;
            const selected = repValue >= min && repValue <= max;
            return (
              <Text
                key={repValue}
                style={[
                  styles.scaleLabel,
                  { left: `${valueToPercent(repValue)}%` },
                  selected && { color: theme.primary, fontFamily: FONTS.bold },
                ]}
              >
                {repValue}
              </Text>
            );
          })}
        </View>
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// SecondaryVolumeSlider
// ---------------------------------------------------------------------------

export const SecondaryVolumeSlider = ({ theme, value, onChange, onSlidingComplete }) => {
  const styles = getStyles(theme);

  const sliderWidthRef = useRef(220);

  const handleMoveRef = useRef(null);
  handleMoveRef.current = (locationX) => {
    const width = Math.max(sliderWidthRef.current, 1);
    const raw = clamp(locationX / width, 0, 1);
    const stepped = Math.round(raw / 0.05) * 0.05;
    onChange(parseFloat(stepped.toFixed(2)));
  };

  const onSlidingCompleteRef = useRef(onSlidingComplete);
  onSlidingCompleteRef.current = onSlidingComplete;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (evt) => handleMoveRef.current(evt.nativeEvent.locationX),
      onPanResponderMove: (evt) => handleMoveRef.current(evt.nativeEvent.locationX),
      onPanResponderRelease: (evt) => {
        handleMoveRef.current(evt.nativeEvent.locationX);
        onSlidingCompleteRef.current?.();
      },
    }),
  ).current;

  return (
    <View style={styles.sliderContainer}>
      <View
        style={styles.sliderTrack}
        onLayout={(e) => { sliderWidthRef.current = e.nativeEvent.layout.width; }}
      >
        <View
          style={[styles.sliderFill, { width: `${value * 100}%`, backgroundColor: theme.primary }]}
        />
        <View
          style={[
            styles.sliderThumb,
            { left: `${value * 100}%`, borderColor: theme.primary, backgroundColor: theme.surface },
          ]}
        />
        <View
          {...panResponder.panHandlers}
          style={[StyleSheet.absoluteFill, { backgroundColor: 'transparent' }]}
        />
      </View>

      <View style={styles.sliderLabels}>
        <Text style={styles.sliderValueText}>None</Text>
        <Text style={[styles.sliderValueText, { color: theme.primary, fontFamily: FONTS.bold }]}>
          {value.toFixed(2)}
        </Text>
        <Text style={styles.sliderValueText}>Full</Text>
      </View>

      <View style={styles.weightQuickSelect}>
        {[0, 0.25, 0.5, 0.75, 1].map((preset) => {
          const active = value === preset;
          return (
            <TouchableOpacity
              key={preset}
              style={[
                styles.weightOption,
                active && { backgroundColor: theme.primary, borderColor: theme.primary },
              ]}
              onPress={() => {
                onChange(preset);
                onSlidingComplete?.();
              }}
            >
              <Text style={[styles.weightOptionText, active && { color: theme.surface }]}>
                {preset}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// GenderSegment
// ---------------------------------------------------------------------------

export const GenderSegment = ({ theme, value, onChange }) => {
  const styles = getStyles(theme);
  return (
    <View style={styles.genderToggleContainer}>
      {['male', 'female'].map((gender) => {
        const active = value === gender;
        return (
          <TouchableOpacity
            key={gender}
            style={[
              styles.genderOption,
              active && { backgroundColor: theme.primary, borderColor: theme.primary },
            ]}
            onPress={() => onChange(gender)}
            activeOpacity={0.85}
          >
            <Feather name="user" size={18} color={active ? theme.surface : theme.text} />
            <Text style={[styles.genderText, active && { color: theme.surface }]}>
              {gender.charAt(0).toUpperCase() + gender.slice(1)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

// ---------------------------------------------------------------------------
// AppThemeSelector
// ---------------------------------------------------------------------------

export const AppThemeSelector = ({ theme, themeID, onChange, compact = false }) => {
  const styles = getStyles(theme);
  const visibleThemes = Object.keys(THEMES);
  return (
    <View style={[styles.themeSelectorGrid, compact && styles.themeSelectorGridCompact]}>
      {visibleThemes.map((key) => {
        const itemTheme = THEMES[key];
        const isActive = themeID === key;
        return (
          <TouchableOpacity
            key={key}
            style={[
              styles.themeOption,
              isActive && styles.themeOptionActive,
              {
                backgroundColor: itemTheme.surface,
                borderColor: isActive ? theme.primary : itemTheme.border,
              },
            ]}
            onPress={() => onChange(key)}
            activeOpacity={0.85}
          >
            <View style={[styles.themePreview, { backgroundColor: itemTheme.background }]}>
              <View style={[styles.themePreviewCircle, { backgroundColor: itemTheme.primary }]} />
            </View>
            <Text style={[styles.themeName, { color: isActive ? theme.primary : theme.textSecondary }]}>
              {key
                .split('_')
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ')}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const getStyles = (theme) =>
  StyleSheet.create({
    repRangeShell: { gap: 14 },
    repRangeGrid: { gap: 12 },
    repRangeGridCompact: { gap: 10 },
    repCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.background,
      padding: 16,
      gap: 6,
    },
    repCardCompact: { padding: 14 },
    repHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    repTitle: { fontSize: 16, fontFamily: FONTS.semiBold, color: theme.text },
    repRange: { fontSize: 14, fontFamily: FONTS.bold, color: theme.primary },
    repDescription: {
      fontSize: 13,
      fontFamily: FONTS.regular,
      color: theme.textSecondary,
      lineHeight: 18,
    },
    customRangeCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.background,
      padding: 16,
      gap: 16,
    },
    customRangeHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
    },
    customRangeTitle: { fontSize: 15, fontFamily: FONTS.semiBold, color: theme.text },
    customRangeSubtitle: {
      fontSize: 13,
      lineHeight: 18,
      fontFamily: FONTS.regular,
      color: theme.textSecondary,
      maxWidth: '88%',
    },
    customBadge: {
      minWidth: 58,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      alignItems: 'center',
    },
    customBadgeText: { fontSize: 13, fontFamily: FONTS.bold, color: theme.text },
    rangeTrack: { height: 36, justifyContent: 'center', position: 'relative' },
    rangeTrackBase: {
      height: 8,
      borderRadius: 999,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
    },
    rangeTrackFill: { position: 'absolute', height: 8, borderRadius: 999, top: 14 },
    rangeThumb: {
      position: 'absolute',
      top: 4,
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 3,
      marginLeft: -14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 3,
      elevation: 3,
    },
    rangeTouchOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent' },
    rangeScale: { position: 'relative', height: 18, marginTop: 2 },
    scaleLabel: {
      position: 'absolute',
      width: 24,
      marginLeft: -12,
      textAlign: 'center',
      fontSize: 11,
      color: theme.textSecondary,
      fontFamily: FONTS.medium,
    },
    genderToggleContainer: { flexDirection: 'row', gap: 12 },
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
      backgroundColor: theme.background,
    },
    genderText: { fontSize: 14, fontFamily: FONTS.semiBold, color: theme.text },
    sliderContainer: { marginTop: 10 },
    sliderTrack: {
      height: 40,
      backgroundColor: theme.background,
      borderRadius: 20,
      position: 'relative',
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.border,
      width: '100%',
      alignSelf: 'center',
    },
    sliderFill: { height: '100%', position: 'absolute', top: 0, left: 0 },
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
    sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
    sliderValueText: { fontSize: 12, fontFamily: FONTS.medium, color: theme.textSecondary },
    weightQuickSelect: {
      flexDirection: 'row',
      justifyContent: 'center',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 18,
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
    weightOptionText: { fontSize: 12, fontFamily: FONTS.bold, color: theme.text },
    themeSelectorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    themeSelectorGridCompact: { gap: 10 },
    themeOption: {
      width: 100,
      padding: 12,
      borderRadius: 12,
      borderWidth: 2,
      alignItems: 'center',
      gap: 8,
    },
    themeOptionActive: {},
    themePreview: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)',
    },
    themePreviewCircle: { width: 16, height: 16, borderRadius: 8 },
    themeName: { fontSize: 12, fontFamily: FONTS.medium, textAlign: 'center' },
  });