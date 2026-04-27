import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    ScrollView as RNScrollView, Animated
} from 'react-native';
import ActionSheet, {
    SheetManager,
    FlatList as SheetFlatList
} from 'react-native-actions-sheet';
import Body from 'react-native-body-highlighter';
import {
    insertExercise, updateExercise, fetchExercises,
    fetchExercisesWithRatios,
    updateExerciseStrengthRatios
} from '../components/db';
import { FONTS, getThemedShadow, isLightTheme } from '../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useScrollHandlers } from 'react-native-actions-sheet';
import { NativeViewGestureHandler } from 'react-native-gesture-handler';
import { useTheme } from '../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { emit, AppEvents } from '../utils/events';
import Fuse from 'fuse.js';



const MUSCLE_OPTIONS = [
    'Chest', 'Triceps', 'Deltoids', 'Trapezius', 'Upper-Back', 'Lower-Back',
    'Biceps', 'Forearm', 'Abs', 'Quadriceps', 'Hamstring', 'Gluteal',
    'Calves', 'Adductors', 'Neck', 'Obliques'
];

const MUSCLE_LABEL_MAP = { 'Upper-Back': 'Back', 'Gluteal': 'Glutes', 'Lower-Back': 'Lower Back' };
const getMuscleLabel = (muscle) => MUSCLE_LABEL_MAP[muscle] ?? muscle;
const RATIO_LABELS = ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite'];

// ─── Animated muscle chip ────────────────────────────────────────────────────
const AnimatedMuscleChip = React.memo(({ muscle, isSelected, isDisabled, onPress, styles, theme, inactiveBg }) => {
    const activeProgress = useRef(new Animated.Value(isSelected ? 1 : 0)).current;
    const pressScale = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.timing(activeProgress, {
            toValue: isSelected ? 1 : 0,
            duration: 180,
            useNativeDriver: false,
        }).start();
    }, [isSelected]);

    const handlePressIn = () =>
        Animated.spring(pressScale, { toValue: 0.92, speed: 40, bounciness: 2, useNativeDriver: true }).start();
    const handlePressOut = () =>
        Animated.spring(pressScale, { toValue: 1, speed: 24, bounciness: 5, useNativeDriver: true }).start();

    const activeBg = activeProgress.interpolate({ inputRange: [0, 1], outputRange: [inactiveBg, theme.primary] });
    const activeBorder = activeProgress.interpolate({ inputRange: [0, 1], outputRange: [theme.border, theme.primary] });
    const textColor = activeProgress.interpolate({ inputRange: [0, 1], outputRange: [theme.text, theme.textAlternate ?? '#ffffff'] });

    return (
        <Animated.View style={{ transform: [{ scale: pressScale }], opacity: isDisabled ? 0.4 : 1 }}>
            <TouchableOpacity activeOpacity={1} onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
                <Animated.View style={[styles.chip, { backgroundColor: activeBg, borderColor: activeBorder }]}>
                    <Animated.Text style={[styles.chipText, { color: textColor }]}>
                        {getMuscleLabel(muscle)}
                    </Animated.Text>
                </Animated.View>
            </TouchableOpacity>
        </Animated.View>
    );
});

// ─── Ratio Picker ActionSheet Content ─────────────────────────────────────────
const RatioPickerSheet = ({ sheetRef, onSelect, exercises, theme }) => {
    const [search, setSearch] = useState('');
    const styles = getStyles(theme);

    const fuse = useMemo(() => {
        return new Fuse(exercises, {
            keys: ['name'],
            threshold: 0.35,
            includeScore: true,
            ignoreLocation: true,
        });
    }, [exercises]);

    const filtered = useMemo(() => {
        if (!search.trim()) {
            return [...exercises].sort((a, b) => a.name.localeCompare(b.name));
        }

        const results = fuse.search(search);

        return results
            .sort((a, b) => {
                // Priority 1: Fuzzy Match Strength (Score)
                if (Math.abs(a.score - b.score) > 0.1) {
                    return a.score - b.score;
                }
                // Priority 2: Alphabetical Tie-breaker
                return a.item.name.localeCompare(b.item.name);
            })
            .map(r => r.item);
    }, [search, exercises, fuse]);


    return (
        <ActionSheet
            ref={sheetRef}
            gestureEnabled={true}
            headerAlwaysVisible={true}
            containerStyle={styles.sheetContainer}
            indicatorStyle={styles.modalHandle}
            keyboardHandlerEnabled={true}
        >
            <View style={styles.sheetHeader}>
                <Text style={styles.modalTitle}>Similar to...</Text>
                <Text style={styles.modalSubtitle}>Borrow strength standards from a similar exercise</Text>

                <View style={styles.modalSearchRow}>
                    <Feather name="search" size={16} color={theme.textSecondary} style={{ marginRight: 8 }} />
                    <TextInput
                        style={styles.modalSearchInput}
                        value={search}
                        onChangeText={setSearch}
                        placeholder="Search exercises..."
                        placeholderTextColor={theme.textSecondary}
                    />
                    {search.length > 0 && (
                        <TouchableOpacity onPress={() => setSearch('')}>
                            <Feather name="x" size={16} color={theme.textSecondary} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            <SheetFlatList
                data={filtered}
                keyExtractor={item => String(item.exerciseID)}
                style={styles.sheetList}
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="always"
                contentContainerStyle={{ paddingBottom: 40 }}

                renderItem={({ item }) => {
                    const ratios = JSON.parse(item.strengthRatios);
                    return (
                        <TouchableOpacity
                            style={styles.modalItem}
                            onPress={() => {
                                onSelect(item, ratios);
                                sheetRef.current?.hide();
                            }}
                        >
                            <Text style={styles.modalItemName}>{item.name}</Text>
                            <View style={styles.modalRatioPills}>
                                {ratios.map((r, i) => (
                                    <View key={i} style={styles.modalRatioPill}>
                                        <Text style={styles.modalRatioPillLabel}>{RATIO_LABELS[i][0]}</Text>
                                        <Text style={styles.modalRatioPillValue}>{r}x</Text>
                                    </View>
                                ))}
                            </View>
                        </TouchableOpacity>
                    );
                }}
                ItemSeparatorComponent={() => <View style={styles.modalSeparator} />}
            />
        </ActionSheet>
    );
};

const MuscleChips = ({ type, selectedData, handleMuscleToggle, accessorySelected, targetSelected, styles, theme, inactiveBg }) => (
    <View style={styles.chipContainer}>
        {MUSCLE_OPTIONS.map((muscle) => {
            const isSelected = selectedData.includes(muscle);
            const isDisabled = type === 'target'
                ? accessorySelected.includes(muscle)
                : targetSelected.includes(muscle);
            return (
                <AnimatedMuscleChip
                    key={muscle}
                    muscle={muscle}
                    isSelected={isSelected}
                    isDisabled={isDisabled}
                    onPress={() => handleMuscleToggle(muscle, type)}
                    styles={styles}
                    theme={theme}
                    inactiveBg={inactiveBg}
                />
            );
        })}
    </View>
);

const GradientOrView = ({ colors, style, theme, children }) => {
    if (theme?.type === 'dynamic') {
        return <View style={[style, { backgroundColor: theme.surface || '#ffffff' }]}>{children}</View>;
    }
    const safeColors = Array.isArray(colors) && colors.every(c => !!c) ? colors : ['transparent', 'transparent'];
    return <LinearGradient colors={safeColors} style={style}>{children}</LinearGradient>;
};

// ─── Main component ───────────────────────────────────────────────────────────
const NewExercise = (props) => {
    const { theme, gender } = useTheme();
    const styles = getStyles(theme);
    const handlers = useScrollHandlers();
    const insets = useSafeAreaInsets();

    const ratioSheetRef = useRef(null);

    const [exerciseName, setExerciseName] = useState('');
    const [targetSelected, setTargetSelected] = useState([]);
    const [accessorySelected, setAccessorySelected] = useState([]);
    const [isCardio, setIsCardio] = useState(false);
    const [isAssisted, setIsAssisted] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [isCanonical, setIsCanonical] = useState(false);

    const [ratioExercises, setRatioExercises] = useState([]);
    const [borrowedRatioSource, setBorrowedRatioSource] = useState(null);

    useEffect(() => {
        fetchExercisesWithRatios().then(setRatioExercises).catch(console.error);
    }, []);

    useEffect(() => {
        const loadExercise = async () => {
            if (!props.exerciseID) return;
            setIsEditMode(true);

            const [exercises, ratioExs] = await Promise.all([
                fetchExercises(),
                fetchExercisesWithRatios(),
            ]);

            const exercise = exercises.find((ex) => ex.exerciseID === props.exerciseID);
            if (!exercise) return;

            setExerciseName(exercise.name);
            setIsCardio(!!exercise.isCardio);
            setIsAssisted(!!exercise.isAssisted);
            setIsCanonical(exercise.exerciseID < 1000);

            const targets = exercise.targetMuscle ? exercise.targetMuscle.split(',').map((m) => m.trim()) : [];
            const accessories = exercise.accessoryMuscles ? exercise.accessoryMuscles.split(',').map((m) => m.trim()) : [];
            setTargetSelected(targets);
            setAccessorySelected(accessories);

            if (exercise.strengthRatios) {
                try {
                    const parsed = JSON.parse(exercise.strengthRatios);
                    if (parsed) {
                        const canonicalExercises = ratioExs.filter(ex => ex.exerciseID < 1000);
                        const matches = canonicalExercises.filter(ex => ex.strengthRatios === exercise.strengthRatios);
                        let matched = matches[0];
                        if (matches.length > 1) {
                            const customWords = exercise.name.toLowerCase().split(/\W+/).filter(Boolean);
                            let bestScore = -1;
                            for (const m of matches) {
                                const mWords = m.name.toLowerCase().split(/\W+/).filter(Boolean);
                                const score = customWords.filter(w => mWords.includes(w)).length;
                                if (score > bestScore) {
                                    bestScore = score;
                                    matched = m;
                                }
                            }
                        }
                        setBorrowedRatioSource({ name: matched ? matched.name : 'Custom', ratios: parsed });
                    }
                } catch (_) { }
            }
        };
        loadExercise();
    }, [props.exerciseID]);

    const ALL_MUSCLE_SLUGS = [
        'chest', 'quadriceps', 'triceps', 'biceps', 'hamstring',
        'upper-back', 'lower-back', 'deltoids', 'gluteal', 'forearm',
        'trapezius', 'calves', 'abs', 'adductors', 'obliques',
        'tibialis', 'abductors', 'neck', 'hands', 'feet', 'knees', 'ankles'
    ];

    const formattedTargets = useMemo(() => {
        const workedSlugs = new Set();
        const targets = targetSelected.map(t => { const slug = t.toLowerCase(); workedSlugs.add(slug); return { slug, intensity: 2 }; });
        const accessories = accessorySelected.map(a => { const slug = a.toLowerCase(); workedSlugs.add(slug); return { slug, intensity: 3 }; });
        const unworked = ALL_MUSCLE_SLUGS.filter(slug => !workedSlugs.has(slug)).map(slug => ({ slug, intensity: 1 }));
        return [...targets, ...accessories, ...unworked];
    }, [targetSelected, accessorySelected]);

    const handleMuscleToggle = (muscle, type) => {
        if (type === 'target') {
            setTargetSelected(prev => prev.includes(muscle) ? prev.filter(m => m !== muscle) : [...prev, muscle]);
            setAccessorySelected(prev => prev.filter(m => m !== muscle));
        } else {
            setAccessorySelected(prev => prev.includes(muscle) ? prev.filter(m => m !== muscle) : [...prev, muscle]);
            setTargetSelected(prev => prev.filter(m => m !== muscle));
        }
    };

    const handleSave = async () => {
        if (!exerciseName.trim()) return;

        let newExerciseObj = {
            name: exerciseName,
            targetMuscle: targetSelected.join(','),
            accessoryMuscles: accessorySelected.join(','),
            isCardio: isCardio ? 1 : 0,
            isAssisted: isAssisted ? 1 : 0
        };

        if (isEditMode && props.exerciseID) {
            await updateExercise(props.exerciseID, newExerciseObj.name, newExerciseObj.targetMuscle, newExerciseObj.accessoryMuscles, newExerciseObj.isCardio, newExerciseObj.isAssisted);
            if (!isCanonical) await updateExerciseStrengthRatios(props.exerciseID, borrowedRatioSource?.ratios ?? null);
            newExerciseObj.exerciseID = props.exerciseID;
        } else {
            const newId = await insertExercise(newExerciseObj.name, newExerciseObj.targetMuscle, newExerciseObj.accessoryMuscles, newExerciseObj.isCardio, newExerciseObj.isAssisted);
            if (borrowedRatioSource?.ratios && newId) await updateExerciseStrengthRatios(newId, borrowedRatioSource.ratios);
            newExerciseObj.exerciseID = newId;
        }

        emit(AppEvents.WORKOUT_DATA_IMPORTED);
        props.close(newExerciseObj);
    };

    const safeBorder = theme.type === 'dynamic' ? '#4d4d4d' : theme.border;
    const safeBodyColors = theme.type === 'dynamic' ? [theme.bodyFill, '#2DC4B6', '#2DC4B680'] : [theme.bodyFill, theme.primary, `${theme.primary}60`];
    const chipInactiveBg = isLightTheme(theme) ? theme.background : theme.surface;

    const musclesAnim = useRef(new Animated.Value(isCardio ? 0 : 1)).current;
    useEffect(() => {
        Animated.timing(musclesAnim, { toValue: isCardio ? 0 : 1, duration: 260, useNativeDriver: false }).start();
    }, [isCardio]);

    const cardioScale = useRef(new Animated.Value(1)).current;
    const assistedScale = useRef(new Animated.Value(1)).current;
    const punchScale = (anim) => {
        Animated.sequence([
            Animated.spring(anim, { toValue: 0.98, speed: 60, bounciness: 2, useNativeDriver: true }),
            Animated.spring(anim, { toValue: 1, speed: 30, bounciness: 6, useNativeDriver: true }),
        ]).start();
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <NativeViewGestureHandler simultaneousHandlers={handlers.simultaneousHandlers}>
                <RNScrollView
                    {...handlers}
                    contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                >
                    <View style={styles.bodyWrapper}>
                        <Body data={formattedTargets} gender={gender} side="front" scale={0.75} border={safeBorder} colors={safeBodyColors} defaultFill={theme.bodyFill} />
                        <View style={styles.bodyDivider} />
                        <Body data={formattedTargets} gender={gender} side="back" scale={0.75} border={safeBorder} colors={safeBodyColors} defaultFill={theme.bodyFill} />
                    </View>

                    <View style={[styles.inputContainer, isCanonical && { opacity: 0.5 }]}>
                        <Feather name="edit-2" size={20} color={theme.textSecondary} style={styles.inputIcon} />
                        <TextInput
                            style={styles.input}
                            onChangeText={setExerciseName}
                            value={exerciseName}
                            placeholder="Exercise Name"
                            placeholderTextColor={theme.textSecondary}
                            editable={!isCanonical}
                        />
                    </View>

                    <TouchableOpacity
                        style={[styles.cardioToggleCard, isCanonical && { opacity: 0.5 }]}
                        onPress={() => {
                            if (isCanonical) return;
                            punchScale(cardioScale);
                            setIsCardio(!isCardio);
                            if (!isCardio) setIsAssisted(false);
                        }}
                    >
                        <View style={styles.cardioTextWrapper}>
                            <Text style={styles.label}>Cardio Exercise</Text>
                            {isCanonical && <Text style={styles.subtext}>Managed by Sisyphus</Text>}
                        </View>
                        <Feather name={isCardio ? "check-circle" : "circle"} size={26} color={isCardio ? theme.primary : theme.textSecondary} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.cardioToggleCard, isCanonical && { opacity: 0.5 }]}
                        onPress={() => {
                            if (isCanonical) return;
                            punchScale(assistedScale);
                            setIsAssisted(!isAssisted);
                            if (!isAssisted) setIsCardio(false);
                        }}
                    >
                        <View style={styles.cardioTextWrapper}>
                            <Text style={styles.label}>Assisted Machine</Text>
                            {isCanonical && <Text style={styles.subtext}>Managed by Sisyphus</Text>}
                        </View>
                        <Feather name={isAssisted ? "check-circle" : "circle"} size={26} color={isAssisted ? theme.primary : theme.textSecondary} />
                    </TouchableOpacity>

                    {!isCanonical && !isCardio && (
                        <View style={styles.ratioCard}>
                            <View style={styles.ratioCardHeader}>
                                <View style={styles.ratioCardHeaderLeft}>
                                    <Text style={styles.label}>Strength Standards</Text>
                                    <Text style={styles.subtext}>
                                        {borrowedRatioSource ? `Based on ${borrowedRatioSource.name}` : 'Compare your lifts to benchmarks'}
                                    </Text>
                                </View>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    {borrowedRatioSource && (
                                        <TouchableOpacity
                                            style={[styles.ratioSelectBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
                                            onPress={() => setBorrowedRatioSource(null)}
                                        >
                                            <Text style={[styles.ratioSelectBtnText, { color: theme.textSecondary }]}>Remove</Text>
                                        </TouchableOpacity>
                                    )}
                                    <TouchableOpacity
                                        style={[styles.ratioSelectBtn, { backgroundColor: theme.primary + '18', borderColor: theme.primary + '40' }]}
                                        onPress={() => ratioSheetRef.current?.show()}
                                    >
                                        <Text style={[styles.ratioSelectBtnText, { color: theme.primary }]}>
                                            {borrowedRatioSource ? 'Change' : 'Select'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    )}

                    <Animated.View style={{ opacity: musclesAnim, overflow: 'hidden' }}>
                        <View style={styles.sectionContainer}>
                            <Text style={styles.sectionTitle}>Target Muscles</Text>
                            <MuscleChips type="target" selectedData={targetSelected} handleMuscleToggle={handleMuscleToggle} accessorySelected={accessorySelected} targetSelected={targetSelected} styles={styles} theme={theme} inactiveBg={chipInactiveBg} />
                        </View>
                        <View style={styles.sectionContainer}>
                            <Text style={styles.sectionTitle}>Secondary Muscles</Text>
                            <MuscleChips type="accessory" selectedData={accessorySelected} handleMuscleToggle={handleMuscleToggle} accessorySelected={accessorySelected} targetSelected={targetSelected} styles={styles} theme={theme} inactiveBg={chipInactiveBg} />
                        </View>
                    </Animated.View>

                    <TouchableOpacity onPress={handleSave} activeOpacity={0.9}>
                        <GradientOrView colors={[theme.primary, theme.secondary]} theme={theme} style={styles.saveButton}>
                            <Text style={styles.saveButtonText}>{isEditMode ? 'Update Exercise' : 'Create Exercise'}</Text>
                        </GradientOrView>
                    </TouchableOpacity>
                </RNScrollView>
            </NativeViewGestureHandler>

            <RatioPickerSheet
                sheetRef={ratioSheetRef}
                exercises={ratioExercises.filter(ex => ex.exerciseID < 1000)}
                theme={theme}
                onSelect={(ex, ratios) => setBorrowedRatioSource({ name: ex.name, ratios })}
            />
        </View>
    );
};

const getStyles = (theme) => {
    const lightTheme = isLightTheme(theme);
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: theme.background },
        scrollContent: { paddingHorizontal: 20 },
        sheetContainer: { backgroundColor: theme.background, paddingHorizontal: 20 },
        sheetHeader: { paddingTop: 10 },
        sheetList: { height: 400 },
        bodyWrapper: {
            flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center',
            backgroundColor: theme.surface, borderRadius: 20, borderWidth: 1, borderColor: theme.border, marginBottom: 24,
            ...getThemedShadow(theme, 'small'),
        },
        bodyDivider: { width: 1, height: '80%', backgroundColor: theme.border, opacity: 0.5 },
        inputContainer: {
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: theme.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.border,
            paddingHorizontal: 16, marginBottom: 20, ...getThemedShadow(theme, 'small'),
        },
        inputIcon: { marginRight: 10 },
        input: { flex: 1, color: theme.text, fontFamily: FONTS.medium, fontSize: 16, paddingVertical: 16 },
        cardioToggleCard: {
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            backgroundColor: theme.surface, padding: 18, borderRadius: 14,
            borderWidth: 1, borderColor: theme.border, marginBottom: 24,
            ...getThemedShadow(theme, 'small'),
        },
        cardioTextWrapper: { flex: 1 },
        label: { color: theme.text, fontFamily: FONTS.bold, fontSize: 16 },
        subtext: { color: theme.textSecondary, fontFamily: FONTS.regular, fontSize: 13, marginTop: 2 },
        ratioCard: {
            backgroundColor: theme.surface, borderRadius: 14, borderWidth: 1,
            borderColor: theme.border, padding: 18, marginBottom: 24,
            ...getThemedShadow(theme, 'small'),
        },
        ratioCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        ratioCardHeaderLeft: { flex: 1 },
        ratioSelectBtn: {
            flexDirection: 'row', alignItems: 'center', gap: 5,
            borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
        },
        ratioSelectBtnText: { fontFamily: FONTS.medium, fontSize: 13 },
        modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.border, marginVertical: 10 },
        modalTitle: { color: theme.text, fontFamily: FONTS.bold, fontSize: 18, marginBottom: 4 },
        modalSubtitle: { color: theme.textSecondary, fontFamily: FONTS.regular, fontSize: 13, marginBottom: 16 },
        modalSearchRow: {
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: theme.surface, borderRadius: 12,
            borderWidth: 1, borderColor: theme.border,
            paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12,
        },
        modalSearchInput: { flex: 1, color: theme.text, fontFamily: FONTS.medium, fontSize: 15 },
        modalItem: { paddingVertical: 14 },
        modalItemName: { color: theme.text, fontFamily: FONTS.medium, fontSize: 15, marginBottom: 8 },
        modalRatioPills: { flexDirection: 'row', gap: 6 },
        modalRatioPill: {
            flex: 1, alignItems: 'center', backgroundColor: theme.surface,
            borderRadius: 8, borderWidth: 1, borderColor: theme.border,
            paddingVertical: 5, paddingHorizontal: 2,
        },
        modalRatioPillLabel: { color: theme.textSecondary, fontFamily: FONTS.regular, fontSize: 9 },
        modalRatioPillValue: { color: theme.text, fontFamily: FONTS.bold, fontSize: 12 },
        modalSeparator: { height: 1, backgroundColor: theme.border, opacity: 0.5 },
        sectionContainer: { marginBottom: 24 },
        sectionTitle: { color: theme.text, fontFamily: FONTS.bold, fontSize: 16, marginBottom: 12 },
        chipContainer: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
        chip: { borderWidth: 1, borderColor: theme.border, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, margin: 4 },
        chipText: { fontFamily: FONTS.medium, fontSize: 14 },
        saveButton: { paddingVertical: 18, borderRadius: 30, alignItems: 'center', marginTop: 10, ...getThemedShadow(theme, 'medium') },
        saveButtonText: { color: '#FFFFFF', fontSize: 18, fontFamily: FONTS.bold, letterSpacing: 0.5 },
    });
};

export default NewExercise;