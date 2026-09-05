import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, Platform, KeyboardAvoidingView, ScrollView, Dimensions, Modal, FlatList, Pressable } from 'react-native'
import Animated, { LinearTransition, FadeIn, FadeOut, Easing } from 'react-native-reanimated';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useScrollToTop } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ReorderableList, { reorderItems } from 'react-native-reorderable-list';
import * as haptics from '../../utils/haptics';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AntDesign, Feather, Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';

import * as NavigationBar from 'expo-navigation-bar';

import { fetchExercises, getLatestWorkoutSession, insertWorkoutHistory, calculateIfPR, setupDatabase, getExercisePRs, getTemplates, deleteTemplate, createTemplate, fetchLastWorkoutSets, getTemplate, fetchRecentMuscleUsage, getSplits, createSplit, renameSplit, deleteSplit, moveTemplateToSplit } from '../../components/db';
import { setPreloadedData } from '../../constants/preloader';
import { toStorageKg, formatWeight, unitLabel } from '../../utils/units';
import { computeMuscleScores, slugRecoveryPercent, averageSlugRecovery, timeUntilSlugRecovery } from '../../utils/recovery';
import { estimateOneRMForStorage } from '../../utils/oneRM';
import { filterCompletedSets, buildWorkoutEntries } from '../../utils/workoutEntries';
import { muscleMapping } from '../../constants/muscles';


import ExerciseEditable from '../../components/exerciseEditable'

import ActionSheet from "react-native-actions-sheet";


import FilteredExerciseList from '../../components/FilteredExerciseList';
import { FONTS, RADIUS, SHADOWS, isLightTheme, getThemedShadow, withAlpha } from '../../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import Timer from '../../components/Timer';
import RestTimer from '../../components/RestTimer';
import { useOverlayReorder } from '../../utils/useOverlayReorder';
import ReorderOverlay from '../../components/ReorderOverlay';
import { useFocusEffect, router } from 'expo-router';
import { createAudioPlayer } from 'expo-audio';
import LottieView from 'lottie-react-native';

import { useTheme } from '../../context/ThemeContext';
import { ActivityIndicator } from 'react-native';
import { AppEvents, on, off } from '../../utils/events';
import { useLocalSearchParams } from 'expo-router';

import * as Notifications from 'expo-notifications';
import { customAlert } from '../../utils/customAlert';
import ContextMenu from '../../components/ContextMenu';



const { width } = Dimensions.get('window');

// Template ordering within a split. Persisted so it survives a restart.
const TEMPLATE_SORT_KEY = 'settings_templateSort';
const SORT_READINESS = 'readiness';
const SORT_CREATED = 'created';

// Optional Push/Pull/Legs starter templates, offered to users with no templates
// yet. Exercise IDs are canonical (see db setup), referenced by id.
const DEFAULT_TEMPLATES = [
    { name: 'Push', exerciseIDs: [3, 20, 15, 22] },
    { name: 'Pull', exerciseIDs: [6, 42, 2, 12] },
    { name: 'Legs', exerciseIDs: [21, 10, 4, 45, 71] },
];

const Current = () => {
    const insets = useSafeAreaInsets();
    const { theme, setWorkoutInProgress, useImperial, workoutStartTime, updateWorkoutStartTime, accessoryWeight, recoveryRate } = useTheme();
    const styles = useMemo(() => getStyles(theme), [theme]);

    const [exercises, setExercises] = useState([]);
    const [isReady, setIsReady] = useState(false);

    const actionSheetRef = useRef(null);
    const restTimerRef = useRef(null);
    // True while the current title came from a template (redo/repeat/start) —
    // see the guard in checkActiveWorkout.
    const templateAppliedRef = useRef(false);
    const listRef = useRef(null);
    const emptyStateScrollRef = useRef(null);
    const isFirstLaunch = useRef(true);

    useScrollToTop(listRef);
    useScrollToTop(emptyStateScrollRef);


    const [PRMODE, setPRMODE] = useState(false);
    const [showInfoIcon, setShowInfoIcon] = useState(false);

    // Real template data
    const [templates, setTemplates] = useState([]);
    const [templatesLoaded, setTemplatesLoaded] = useState(false);
    // Whether the saved workout has been read back from AsyncStorage yet.
    // workoutStartTime restores from context BEFORE this screen finishes its own
    // async read, so for a moment an in-progress workout is "started" with an
    // empty exercise list. Rendering the active view in that window put the
    // footer buttons at the top of the page, on top of nothing, and the title
    // back to "New Workout". Once true this stays true, so switching tabs later
    // never blanks the screen.
    const [workoutRestored, setWorkoutRestored] = useState(false);
    const [splits, setSplits] = useState([]);
    const [activeSplitIndex, setActiveSplitIndex] = useState(0);
    // Newest-first by default; readiness is available behind the eyebrow toggle.
    const [templateSort, setTemplateSort] = useState(SORT_CREATED);
    // { mode: 'create' | 'rename', split, name } — drives the split name dialog.
    const [splitEditor, setSplitEditor] = useState(null);
    const [splitMenu, setSplitMenu] = useState(false);
    const splitPagerRef = useRef(null);

    useEffect(() => {
        AsyncStorage.getItem(TEMPLATE_SORT_KEY)
            .then(saved => { if (saved === SORT_CREATED || saved === SORT_READINESS) setTemplateSort(saved); })
            .catch(() => {});
    }, []);

    const toggleTemplateSort = () => {
        setTemplateSort(prev => {
            const next = prev === SORT_READINESS ? SORT_CREATED : SORT_READINESS;
            AsyncStorage.setItem(TEMPLATE_SORT_KEY, next).catch(() => {});
            return next;
        });
    };
    const [loadingTemplateId, setLoadingTemplateId] = useState(null);
    const [muscleScores, setMuscleScores] = useState(null);
    // Raw usage rows kept alongside the derived scores so the hold-menu can
    // project readiness forward in time (when a template hits 80% recovered).
    const [recentUsage, setRecentUsage] = useState(null);

    const loadTemplates = async () => {
        try {
            const [data, splitRows] = await Promise.all([getTemplates(), getSplits()]);
            setTemplates(data);
            setSplits(splitRows);
        } catch (error) {
            console.error("Error loading templates:", error);
        } finally {
            setTemplatesLoaded(true);
        }
    };

    // Single source for recomputing template readiness (live DB + current
    // time — never a cached value).
    const loadMuscleScores = useCallback(() => {
        fetchRecentMuscleUsage(5)
            .then(usage => {
                setRecentUsage(usage);
                setMuscleScores(computeMuscleScores(usage, accessoryWeight, undefined, recoveryRate));
            })
            .catch(err => console.error(err));
    }, [accessoryWeight, recoveryRate]);

    // Compute at launch (and when the accessory-weight setting settles) so the
    // pills are accurate the first time the tab opens, not only after a focus.
    useEffect(() => {
        loadMuscleScores();
    }, [loadMuscleScores]);

    // Refresh in the background the moment a workout finishes, so returning to
    // this tab shows correct percentages with no stale-then-flash.
    useEffect(() => {
        const handler = () => {
            loadTemplates();
            loadMuscleScores();
        };
        on(AppEvents.WORKOUT_COMPLETED, handler, 'current-tab');
        on(AppEvents.WORKOUT_DATA_IMPORTED, handler, 'current-tab');
        return () => {
            off(AppEvents.WORKOUT_COMPLETED, handler);
            off(AppEvents.WORKOUT_DATA_IMPORTED, handler);
        };
    }, [loadMuscleScores]);


    // Asked at most once, ever: the persisted flag is set the first time (so a
    // decline is never re-prompted), and a synchronous in-session ref stops two
    // near-simultaneous starts (button + set tick) from racing into a double
    // prompt. Triggered from both rest-timer start paths (button + auto-start).
    const notifPermAskedRef = useRef(false);
    const requestNotificationPermissionOnce = async () => {
        if (notifPermAskedRef.current) return;
        notifPermAskedRef.current = true;

        const asked = await AsyncStorage.getItem('notifications_permission_asked');
        if (asked) return;

        await AsyncStorage.setItem('notifications_permission_asked', 'true');
        setShowInfoIcon(false);
        await Notifications.requestPermissionsAsync();
    };

    const showTimerInfoAlert = () => {
        customAlert(
            "Timer Controls",
            "• Tap it to start or cancel a timer.\n• Swipe it up or down to increment time.\n• Configure timer options in settings.",
            [{ text: "Got it" }],
            {
                onDismiss: async () => {
                    await AsyncStorage.setItem('notifications_permission_asked', 'true');
                    setShowInfoIcon(false);
                }
            }
        );
    };



    const startWorkout = async () => {
        const now = new Date().toISOString();
        updateWorkoutStartTime(now);

        fetchExercises()
            .then(data => setExercises(data))
            .catch(err => console.error(err));

        actionSheetRef.current?.show();
    };

    const loadTemplate = async (template) => {
        const now = new Date().toISOString();
        updateWorkoutStartTime(now);
        setWorkoutTitle(template.name);

        const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 9);

        const workoutWithDynamicData = await Promise.all(template.data.map(async (item) => {
            const updatedExercises = await Promise.all(item.exercises.map(async (ex) => {
                const history = await fetchLastWorkoutSets(ex.exerciseID);

                let setsToUse = ex.sets;
                if (history && history.length > 0) {
                    setsToUse = history.map(hSet => ({
                        id: generateId(),
                        weight: formatWeight(hSet.weight, useImperial),
                        reps: hSet.reps?.toString() || null,
                        distance: hSet.distance?.toString() || null,
                        // Exact fractional minutes — the clock field renders mm:ss,
                        // so rounding here would shift the seconds.
                        minutes: hSet.seconds ? String(hSet.seconds / 60) : null,
                        setType: hSet.setType || 'N',
                        completed: false
                    }));
                } else {
                    // Template-defined sets: leave any unset value (null, empty,
                    // 0 or NaN) blank so the user fills their own numbers — rather
                    // than showing NaN (from formatWeight(null)) or a stray 0.
                    const blankOrNum = (v, fmt) => {
                        const n = parseFloat(v);
                        return (isNaN(n) || n === 0) ? null : fmt(n);
                    };
                    setsToUse = ex.sets.map(set => ({
                        ...set,
                        id: generateId(),
                        weight: blankOrNum(set.weight, (n) => formatWeight(n, useImperial)),
                        reps: blankOrNum(set.reps, (n) => String(Math.round(n))),
                        distance: blankOrNum(set.distance, (n) => String(n)),
                        minutes: blankOrNum(set.minutes, (n) => String(n)),
                        completed: false
                    }));
                }

                return {
                    ...ex,
                    id: generateId(),
                    sets: setsToUse
                };
            }));

            return {
                ...item,
                id: generateId(),
                exercises: updatedExercises
            };
        }));

        setCurrentWorkout(workoutWithDynamicData);
        haptics.success();
    };

    const handleLongPressTemplate = async (template) => {
        setLoadingTemplateId(template.id);
        haptics.commit();

        try {
            const [fullTemplate, exercisesData] = await Promise.all([
                getTemplate(template.id),
                fetchExercises(),
                new Promise(resolve => setTimeout(resolve, 300))
            ]);

            setPreloadedData({
                template: fullTemplate,
                exercises: exercisesData
            });

            router.push(`/template/${template.id}?v=${Date.now()}`);
        } catch (error) {
            console.error("Error pre-loading template:", error);
            router.push(`/template/${template.id}?v=${Date.now()}`);
        }
    };

    // Hold-menu for a template card: { anchor: {x,y}, template, readiness }.
    const [templateMenu, setTemplateMenu] = useState(null);

    // Distinct target-muscle slugs across a template's exercises (same mapping
    // the readiness badge uses).
    const templateTargetSlugs = useCallback((template) => {
        const slugs = new Set();
        (template.data || []).forEach(group => group.exercises.forEach(ex => {
            const details = exercises.find(e => e.exerciseID === ex.exerciseID);
            (details?.targetMuscle || '').split(',').map(m => m.trim()).filter(Boolean)
                .forEach(m => slugs.add(muscleMapping[m] || m.toLowerCase()));
        }));
        return [...slugs];
    }, [exercises]);

    // Human "time until" string, e.g. "45m", "3h 20m", "1d 4h".
    const formatTimeUntil = (ms) => {
        const totalMin = Math.max(0, Math.round(ms / 60000));
        if (totalMin < 60) return `${totalMin}m`;
        const hours = Math.floor(totalMin / 60);
        const mins = totalMin % 60;
        if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
        const days = Math.floor(hours / 24);
        const remHours = hours % 24;
        return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
    };

    // Header for the hold-menu describing when the template reaches 80% recovered.
    const buildReadinessHeader = (template) => {
        const slugs = templateTargetSlugs(template);
        if (slugs.length === 0 || !muscleScores) return null;

        const readiness = averageSlugRecovery(muscleScores, slugs);
        if (readiness >= 80) {
            return {
                icon: 'check-circle',
                color: theme.success,
                title: 'Ready to train',
                subtitle: `Muscles ${readiness}% recovered`,
            };
        }

        const ms = recentUsage ? timeUntilSlugRecovery(recentUsage, accessoryWeight, slugs, 80, recoveryRate) : null;
        return {
            icon: 'clock',
            color: theme.warning,
            title: ms != null ? `80% ready in ${formatTimeUntil(ms)}` : 'Recovering',
            subtitle: `Currently ${readiness}% recovered`,
        };
    };

    const openTemplateMenu = (template, e) => {
        haptics.commit();
        setTemplateMenu({
            anchor: { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY },
            template,
            readiness: buildReadinessHeader(template),
        });
    };

    const confirmDeleteTemplate = (template) => {
        customAlert(
            'Delete Template',
            `Delete "${template.name}"? This can't be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => removeTemplate(template) },
            ],
        );
    };

    const removeTemplate = async (template) => {
        // Optimistically drop it from state so the card animates out and the
        // grid reflows (exiting + layout), rather than flashing to the new state.
        setTemplates(prev => prev.filter(t => t.id !== template.id));
        try {
            await deleteTemplate(template.id);
        } catch (error) {
            console.error('Failed to delete template:', error);
            loadTemplates(); // restore on failure
        }
    };

    // ── Splits ───────────────────────────────────────────────────────────────
    const openCreateSplit = () => setSplitEditor({ mode: 'create', split: null, name: '' });
    const openRenameSplit = (split) => setSplitEditor({ mode: 'rename', split, name: split.name });

    const submitSplitEditor = async () => {
        if (!splitEditor) return;
        const name = splitEditor.name.trim();
        if (!name) return;
        const editor = splitEditor;
        setSplitEditor(null);
        try {
            if (editor.mode === 'create') {
                await createSplit(name);
                const refreshed = await getSplits();
                setSplits(refreshed);
                // Land on the split just created.
                setActiveSplitIndex(Math.max(0, refreshed.length - 1));
            } else {
                await renameSplit(editor.split.id, name);
                setSplits(await getSplits());
            }
        } catch (error) {
            console.error('Failed to save split:', error);
            loadTemplates();
        }
    };

    const confirmDeleteSplit = (split) => {
        const count = templates.filter(t => t.splitId === split.id).length;
        const isLast = splits.length === 1;
        customAlert(
            `Delete "${split.name}"?`,
            isLast
                ? 'This is your only split, so it can\'t be removed. Rename it instead.'
                : count > 0
                    ? `Its ${count} ${count === 1 ? 'template' : 'templates'} will move to "${splits.find(s => s.id !== split.id)?.name}" — nothing is deleted.`
                    : 'This split is empty.',
            isLast
                ? [{ text: 'OK', style: 'cancel' }]
                : [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Delete', style: 'destructive', onPress: async () => {
                            try {
                                await deleteSplit(split.id);
                                setActiveSplitIndex(0);
                                await loadTemplates();
                            } catch (error) {
                                console.error('Failed to delete split:', error);
                            }
                        }
                    },
                ]
        );
    };

    const handleMoveTemplate = async (template, splitId) => {
        // Optimistic so the card leaves the current page immediately.
        setTemplates(prev => prev.map(t => (t.id === template.id ? { ...t, splitId } : t)));
        try {
            await moveTemplateToSplit(template.id, splitId);
        } catch (error) {
            console.error('Failed to move template:', error);
            loadTemplates();
        }
    };

    // One-tap Push/Pull/Legs starter pack (only offered when the user has no
    // templates). Inserts in order so the grid shows Push · Pull · Legs.
    const addStarterTemplates = async () => {
        if (loadingTemplateId) return;
        setLoadingTemplateId('starter');
        haptics.commit();
        const genId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
        const blankSet = (setType) => ({
            id: genId(), weight: null, reps: null, distance: null, minutes: null, setType, completed: false,
        });
        // One warm-up set followed by three working sets per exercise.
        const starterSets = () => [blankSet('W'), ...Array.from({ length: 3 }, () => blankSet('N'))];
        try {
            for (const tpl of DEFAULT_TEMPLATES) {
                const data = tpl.exerciseIDs.map(exerciseID => ({
                    id: genId(),
                    exercises: [{ id: genId(), exerciseID, notes: '', sets: starterSets() }],
                }));
                await createTemplate(tpl.name, data);
            }
            await loadTemplates();
            haptics.success();
        } catch (error) {
            console.error('Failed to add starter templates:', error);
        } finally {
            setLoadingTemplateId(null);
        }
    };

    const handleAddTemplate = async () => {
        setLoadingTemplateId('new');
        haptics.tap();
        // Land the new template on the split currently being viewed.
        const splitParam = activeSplit ? `&splitId=${activeSplit.id}` : '';

        try {
            const [exercisesData] = await Promise.all([
                fetchExercises(),
                new Promise(resolve => setTimeout(resolve, 300))
            ]);

            setPreloadedData({
                template: null,
                exercises: exercisesData
            });

            router.push(`/template/new?v=${Date.now()}${splitParam}`);
        } catch (error) {
            router.push(`/template/new?v=${Date.now()}${splitParam}`);
        }
    };

    const clearWorkout = async () => {
        setCurrentWorkout([]);
        updateWorkoutStartTime(null);
        templateAppliedRef.current = false;
        setWorkoutTitle("New Workout");
        restTimerRef.current?.stopTimer();
        setPRMODE(false);
        await AsyncStorage.multiRemove(['@currentWorkout', '@prMode']);
    };

    // PR mode is part of the in-progress workout, so it survives an app close.
    const togglePRMode = () => {
        setPRMODE(prev => {
            const next = !prev;
            AsyncStorage.setItem('@prMode', next ? 'true' : 'false');
            return next;
        });
    };



    const [currentWorkout, setCurrentWorkout] = useState([]);
    const [workoutTitle, setWorkoutTitle] = useState("New Workout");




    const params = useLocalSearchParams();

    useEffect(() => {
        if (params.template) {
            try {
                const parsed = JSON.parse(params.template);
                templateAppliedRef.current = true;
                loadTemplate(parsed);
                router.setParams({ template: "" });
            } catch (e) {
                templateAppliedRef.current = false;
                console.error("Invalid template passed:", e);
            }
        }
    }, [params.template]);


    const endWorkout = useCallback(async () => {
        // Flags whether the DB write landed, so the catch below can tell a
        // failed save (alert the user — their workout is still intact) from a
        // post-save hiccup (sound/navigation — the data is already safe).
        let saved = false;
        try {
            const latestSessionQuery = await getLatestWorkoutSession();
            const nextSessionNumber = latestSessionQuery + 1;

            if (!currentWorkout || !currentWorkout.length) {
                return;
            }

            const filteredWorkout = filterCompletedSets(currentWorkout);

            const workoutEntries = await buildWorkoutEntries({
                workout: filteredWorkout,
                exercises,
                useImperial,
                sessionNumber: nextSessionNumber,
                time: new Date().toISOString(),
                workoutTitle,
                getHistoricalPRs: (exerciseID) => getExercisePRs(exerciseID),
            });
            const endTime = Date.now();
            const startTimeMs = workoutStartTime ? new Date(workoutStartTime).getTime() : endTime;
            const durationMs = endTime - startTimeMs;
            const durationMinutes = Math.floor(durationMs / 60000);
            // insertWorkoutHistory emits WORKOUT_COMPLETED (with
            // showCelebration:false) — the trophy now plays inline on the
            // summary page instead of a full-screen overlay.
            await insertWorkoutHistory(workoutEntries, workoutTitle, durationMinutes);
            saved = true;

            try {
                const player = createAudioPlayer(require('../../assets/notifications/greatSuccess.mp3'));
                player.volume = 0.6;
                player.addListener('playbackStatusUpdate', (status) => {
                    if (status.didJustFinish) {
                        player.remove();
                    }
                });
                player.play();
            } catch (e) {
                console.warn("Error playing success sound", e);
            }

            // Push the celebratory summary straight over the current tab (one
            // clean flip transition — no instant flash to History first). Done
            // on the summary navigates to History.
            router.push({
                pathname: `/workout/${nextSessionNumber}`,
                params: {
                    // Include duration (a separate DB column, not on the entries)
                    // so the summary has everything it needs and can skip the
                    // post-mount re-fetch — that re-render was stuttering the
                    // count-up mid-animation.
                    initialData: JSON.stringify(workoutEntries.map(e => ({ ...e, duration: durationMinutes }))),
                    viewMode: 'summary'
                }
            });

            await AsyncStorage.multiRemove(['@currentWorkout', '@prMode']);
            setCurrentWorkout([]);
            updateWorkoutStartTime(null);
            templateAppliedRef.current = false;
            setWorkoutTitle("New Workout");
            restTimerRef.current?.stopTimer();
            setPRMODE(false);
        }
        catch (error) {
            console.error("Error saving workout:", error);
            if (!saved) {
                // The workout state is untouched on a failed save, so the user
                // can simply try finishing again.
                customAlert(
                    "Save Failed",
                    "Your workout couldn't be saved. Nothing was lost — please try finishing again."
                );
            }
        }
        // exercises drives the isAssisted lookups (PR flags) and useImperial the
        // kg conversion — both must be current when the workout is saved.
    }, [currentWorkout, workoutStartTime, workoutTitle, exercises, useImperial]);

    const plusButtonShowExerciseList = () => {
        fetchExercises()
            .then(data => setExercises(data))
            .catch(err => console.error(err));

        actionSheetRef.current?.show();
    };

    // Stable identity on purpose: this is handed to the React.memo'd
    // ExerciseEditable, and as an inline arrow it was the single prop keeping
    // that memo from ever holding. It takes the id and name rather than the
    // details object so the card can supply them from props it already has.
    const showExerciseInfo = useCallback((exerciseID, exerciseName) => {
        if (exerciseID == null) return;
        router.push(`/exercise/${exerciseID}?name=${encodeURIComponent(exerciseName || '')}`);
    }, [router]);

    const saveWorkoutToAsyncStorage = async (workout) => {
        const dataToSave = {
            workout,
            workoutTitle,
        };

        try {
            await AsyncStorage.setItem('@currentWorkout', JSON.stringify(dataToSave));
        } catch (error) {
            console.error('Error saving workout to AsyncStorage:', error);
        }
    };

    useEffect(() => {
        setupDatabase()
            .then(() => fetchExercises())
            .then(data => setExercises(data))
            .catch(err => console.error("Initial load error:", err));

        loadTemplates();
        setIsReady(true);
    }, []);

    const autoTimerEnabledRef = useRef(true);

    useFocusEffect(
        React.useCallback(() => {
            fetchExercises()
                .then(data => setExercises(data))
                .catch(err => console.error(err));
            loadTemplates();
            setLoadingTemplateId(null);

            // Recovery scores for the template readiness badges.
            loadMuscleScores();

            AsyncStorage.getItem('settings_auto_timer').then(val => {
                if (val !== null) autoTimerEnabledRef.current = val === 'true';
            });

            AsyncStorage.getItem('notifications_permission_asked').then(val => {
                setShowInfoIcon(val !== 'true');
            });

            const checkActiveWorkout = async () => {
                try {
                    const storedWorkout = await AsyncStorage.getItem('@currentWorkout');
                    if (storedWorkout) {
                        // Saved as { workout, workoutTitle } — must read the same key
                        // (was reading `title`, so the name reset to "New Workout").
                        const { workout, workoutTitle: savedTitle } = JSON.parse(storedWorkout);
                        setCurrentWorkout(current => {
                            if (current.length === 0 && workout && workout.length > 0) {
                                if (savedTitle) setWorkoutTitle(savedTitle);
                                return workout;
                            }
                            return current;
                        });
                        // PR mode is restored with the workout it belongs to.
                        const savedPRMode = await AsyncStorage.getItem('@prMode');
                        if (savedPRMode === 'true') setPRMODE(true);
                    } else {
                        setCurrentWorkout([]);
                        setPRMODE(false);
                        // This branch resumes from its AsyncStorage await AFTER
                        // the route-param effect has already applied a template
                        // and set its name, so it used to clobber that name back
                        // to "New Workout" on redo/repeat. `params.template`
                        // can't guard it — the param is cleared by then, and this
                        // focus callback closes over stale params either way.
                        if (!params.template && !templateAppliedRef.current) {
                            setWorkoutTitle("New Workout");
                        }
                    }
                    const storedStartTime = await AsyncStorage.getItem('@workoutStartTime');
                    if (storedStartTime) {
                        updateWorkoutStartTime(storedStartTime);
                    } else {
                        updateWorkoutStartTime(null);
                    }
                } catch (e) {
                    console.error("Error recovering active workout state:", e);
                } finally {
                    setWorkoutRestored(true);
                }
            };
            checkActiveWorkout();
        }, [accessoryWeight, recoveryRate])
    );

    // ── Template readiness: average recovery of each template's target
    // muscles, so the grid can answer "what should I train today?" ──────────
    const templatesWithReadiness = useMemo(() => {
        const readinessFor = (template) => {
            if (!muscleScores || exercises.length === 0) return null;
            const slugs = new Set();
            (template.data || []).forEach(group => group.exercises.forEach(ex => {
                const details = exercises.find(e => e.exerciseID === ex.exerciseID);
                (details?.targetMuscle || '').split(',').map(m => m.trim()).filter(Boolean)
                    .forEach(m => slugs.add(muscleMapping[m] || m.toLowerCase()));
            }));
            if (slugs.size === 0) return null;
            const percents = [...slugs].map(slug => slugRecoveryPercent(muscleScores, slug));
            return Math.round(percents.reduce((a, b) => a + b, 0) / percents.length);
        };

        const withReadiness = templates.map(template => ({ template, readiness: readinessFor(template) }));

        // Newest first when sorting by creation (getTemplates returns id DESC);
        // otherwise most-recovered first, which is the default.
        return templateSort === SORT_CREATED
            ? withReadiness
            : [...withReadiness].sort((a, b) => (b.readiness ?? -1) - (a.readiness ?? -1));
    }, [templates, exercises, muscleScores, templateSort]);

    // One bucket of templates per split, in split order. Templates whose split
    // was removed fall into the first split so nothing becomes unreachable.
    const splitPages = useMemo(() => {
        if (splits.length === 0) return [];
        const byId = new Map(splits.map(s => [s.id, []]));
        const firstId = splits[0].id;
        templatesWithReadiness.forEach(entry => {
            const key = byId.has(entry.template.splitId) ? entry.template.splitId : firstId;
            byId.get(key).push(entry);
        });
        return splits.map(split => ({ split, entries: byId.get(split.id) || [] }));
    }, [splits, templatesWithReadiness]);

    const activeSplit = splitPages[activeSplitIndex]?.split ?? null;
    const activeTemplateCount = splitPages[activeSplitIndex]?.entries.length ?? 0;

    // A trailing "new split" page, so swiping past the last split offers to
    // create one — the same gesture that reveals it also explains it.
    const pagerData = useMemo(
        () => (splitPages.length > 0 ? [...splitPages, { __newSplit: true }] : []),
        [splitPages]
    );

    // Keep the index valid when a split is deleted while it's showing.
    //
    // Valid indices run 0..splitPages.length inclusive: the pager carries one
    // page per split PLUS the trailing New Split page. Clamping at
    // splitPages.length - 1 also clamped away that last page, so swiping onto
    // New Split snapped the title and dots back to the previous split while the
    // pager itself stayed put — leaving the header naming one split and the
    // page showing another.
    useEffect(() => {
        if (activeSplitIndex > splitPages.length) {
            setActiveSplitIndex(Math.max(0, splitPages.length));
        }
    }, [splitPages.length, activeSplitIndex]);

    const readinessBadge = (readiness) => {
        if (readiness == null) return null;
        if (readiness >= 80) return { color: theme.success, label: readiness >= 95 ? 'Ready' : `${readiness}%` };
        if (readiness >= 60) return { color: theme.warning, label: `${readiness}%` };
        return { color: theme.danger, label: `${readiness}%` };
    };

    useEffect(() => {
        if (currentWorkout.length > 0) {
            // workoutTitle is in deps so a rename persists even when the sets
            // haven't changed.
            saveWorkoutToAsyncStorage(currentWorkout);
        }
        setWorkoutInProgress(currentWorkout.length > 0 || !!workoutStartTime);
    }, [currentWorkout, workoutStartTime, workoutTitle]);

    const inputExercise = (item) => {
        actionSheetRef.current?.hide();

        const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 9);

        setCurrentWorkout((prevWorkouts) => [
            ...prevWorkouts,
            {
                id: generateId(),
                exercises: [
                    {
                        id: generateId(),
                        exerciseID: item.exerciseID,
                        sets: [
                            {
                                id: generateId(),
                                weight: null,
                                reps: null,
                                distance: null,
                                minutes: null,
                                setType: 'N'
                            }
                        ],
                        notes: ''
                    }
                ]
            }
        ]);
    };

    const handleReorder = useCallback(({ from, to }) => {
        setCurrentWorkout((prevWorkout) => reorderItems(prevWorkout, from, to));
        haptics.tap();
    }, []);

    // Hold-to-reorder: holding a card's header opens an overlay of compact
    // exercise-name rows; the held row tracks the finger directly and the
    // new order is committed on release.
    const { session: reorderSession, overlayRef, listWrapperRef, fingerY, startReorder, endReorder, handleScrollToIndexFailed, isReordering } =
        useOverlayReorder(listRef, currentWorkout, setCurrentWorkout);

    const reorderRows = useMemo(() => {
        if (!reorderSession) return [];
        return currentWorkout.map(group => {
            const firstExercise = group.exercises[0];
            const details = exercises.find(e => e.exerciseID === firstExercise?.exerciseID);
            const setCount = group.exercises.reduce((n, ex) => n + ex.sets.length, 0);
            return {
                id: group.id,
                label: details ? details.name : 'Unknown Exercise',
                meta: `${setCount} ${setCount === 1 ? 'set' : 'sets'}`,
            };
        });
    }, [reorderSession, currentWorkout, exercises]);

    const handleSetComplete = useCallback(() => {
        if (autoTimerEnabledRef.current) {
            restTimerRef.current?.restartTimer();
        }
    }, []);

    // ── Live session stats (volume in display units, set progress) ──────────
    const liveStats = useMemo(() => {
        let volume = 0;
        let done = 0;
        let total = 0;
        currentWorkout.forEach(group => group.exercises.forEach(ex => ex.sets.forEach(set => {
            total++;
            if (set.completed) {
                done++;
                volume += (parseFloat(set.weight) || 0) * (parseInt(set.reps, 10) || 0);
            }
        })));
        return { volume, done, total };
    }, [currentWorkout]);

    // ── Live PR count: completed sets vs historical PRs (cached per exercise,
    // same comparisons endWorkout uses) ──────────────────────────────────────
    const prCacheRef = useRef(new Map());
    const [prCacheVersion, setPrCacheVersion] = useState(0);

    useEffect(() => {
        const ids = new Set();
        currentWorkout.forEach(group => group.exercises.forEach(ex => ids.add(ex.exerciseID)));
        ids.forEach(id => {
            if (prCacheRef.current.has(id)) return;
            prCacheRef.current.set(id, null); // pending
            getExercisePRs(id)
                .then(prs => {
                    prCacheRef.current.set(id, prs);
                    setPrCacheVersion(v => v + 1);
                })
                .catch(() => prCacheRef.current.delete(id));
        });
    }, [currentWorkout]);

    // Reset the cache when a workout ends so the next session re-fetches
    // fresh records.
    useEffect(() => {
        if (!workoutStartTime) {
            prCacheRef.current = new Map();
        }
    }, [workoutStartTime]);

    const livePRCount = useMemo(() => {
        let count = 0;
        currentWorkout.forEach(group => group.exercises.forEach(ex => {
            const hist = prCacheRef.current.get(ex.exerciseID);
            if (!hist) return;
            const details = exercises.find(e => e.exerciseID === ex.exerciseID);
            if (details?.isCardio) return;
            // Assisted exercises were skipped entirely here, so their PRs only
            // ever appeared after finishing. Mirror buildWorkoutEntries instead:
            // less assistance is better, and they get no 1RM/volume PRs.
            const isAssisted = !!details?.isAssisted;

            let bestOneRM = 0;
            let bestVolume = 0;
            let bestWeight = isAssisted ? Infinity : 0;
            let repsAtBestWeight = 0;
            let hasCountableSet = false;
            ex.sets.forEach(set => {
                if (!set.completed) return;
                const weightKg = toStorageKg(set.weight, useImperial) || 0;
                const reps = parseInt(set.reps, 10) || 0;
                // Zero-weight sets still count: a bodyweight exercise's record is
                // reps at 0kg, and its 1RM/volume stay 0 so they can't false-fire.
                if (reps <= 0) return;
                hasCountableSet = true;
                bestOneRM = Math.max(bestOneRM, estimateOneRMForStorage(weightKg, reps));
                bestVolume = Math.max(bestVolume, weightKg * reps);
                const isBetterWeight = isAssisted ? weightKg < bestWeight : weightKg > bestWeight;
                if (isBetterWeight) {
                    bestWeight = weightKg;
                    repsAtBestWeight = reps;
                } else if (weightKg === bestWeight && reps > repsAtBestWeight) {
                    repsAtBestWeight = reps;
                }
            });
            if (!hasCountableSet) return;

            if (!isAssisted && bestOneRM > (hist.maxOneRM || 0)) count++;
            if (!isAssisted && bestVolume > (hist.maxVolume || 0)) count++;

            // Same rule buildWorkoutEntries uses at save time: a better weight, OR
            // the same weight held for more reps. Testing only `>` meant beating
            // 39kg×5 with 39kg×6 showed no live PR but was flagged once saved.
            const histWeight = hist.maxWeight || 0;
            const beatsWeight = isAssisted ? bestWeight < histWeight : bestWeight > histWeight;
            if (beatsWeight ||
                (bestWeight === histWeight && repsAtBestWeight > (hist.maxRepsAtMaxWeight || 0))) count++;
        }));
        return count;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentWorkout, exercises, useImperial, prCacheVersion]);


    // Landing a PR mid-workout is the best moment the app has and had no
    // feedback at all. Driving it off livePRCount covers all three PR types
    // without duplicating the comparison logic.
    //
    // Both counts must rise together: on a cold start an in-progress workout
    // restores its completed sets and then the PR cache resolves, which would
    // otherwise fire a celebration for PRs set yesterday.
    const completedSetCount = useMemo(
        () => currentWorkout.reduce(
            (n, g) => n + g.exercises.reduce((m, e) => m + e.sets.filter((st) => st.completed).length, 0),
            0,
        ),
        [currentWorkout],
    );

    const prWatchRef = useRef({ prs: 0, sets: 0, armed: false });
    useEffect(() => {
        const prev = prWatchRef.current;
        if (prev.armed && livePRCount > prev.prs && completedSetCount > prev.sets) {
            haptics.success();
        }
        prWatchRef.current = { prs: livePRCount, sets: completedSetCount, armed: true };
    }, [livePRCount, completedSetCount]);

    const getFirstOccurrenceMap = (currentWorkout, exercisesData) => {
        const seenMuscles = {};
        const occurrenceMap = {};

        currentWorkout.forEach((workoutGroup) => {
            workoutGroup.exercises.forEach((ex) => {
                const details = exercisesData.find((d) => d.exerciseID === ex.exerciseID);
                const targets = (details?.targetMuscle || '')
                    .split(',')
                    .map(m => m.trim().toLowerCase())
                    .filter(Boolean);

                let maxOcc = 0;
                targets.forEach(m => {
                    const count = seenMuscles[m] || 0;
                    if (count > maxOcc) maxOcc = count;
                });

                const currentOccIdx = maxOcc + 1;

                occurrenceMap[ex.id] = currentOccIdx;

                targets.forEach(m => {
                    seenMuscles[m] = (seenMuscles[m] || 0) + 1;
                });
            });
        });
        return occurrenceMap;
    };


    const occurrenceMap = useMemo(() =>
        getFirstOccurrenceMap(currentWorkout, exercises),
        [currentWorkout, exercises]
    );

    const renderItem = useCallback(({ item, index }) => {
        return (
            <Animated.View
                collapsable={false}
                style={styles.exerciseWrapper}
                layout={LinearTransition.duration(200).easing(Easing.out(Easing.ease))}
            >
                {item.exercises.map((exercise, exerciseIndex) => {
                    const exerciseDetails = exercises.find(
                        (e) => e.exerciseID === exercise.exerciseID
                    );

                    return (
                        <ExerciseEditable
                            key={exercise.id}
                            exerciseID={exercise.exerciseID}
                            workoutID={item.id}
                            exercise={exercise}
                            exerciseName={exerciseDetails ? exerciseDetails.name : 'Unknown Exercise'}
                            updateCurrentWorkout={setCurrentWorkout}
                            onOpenDetails={showExerciseInfo}
                            simultaneousHandlers={listRef}
                            onSetComplete={handleSetComplete}
                            isCardio={!!exerciseDetails?.isCardio}
                            isAssisted={!!exerciseDetails?.isAssisted}
                            muscleOccurrenceIndex={occurrenceMap[exercise.id]}
                            PRMODE={PRMODE}
                            onReorderStart={startReorder}
                            onReorderEnd={endReorder}
                            reorderFingerY={fingerY}
                        />
                    );
                })}
            </Animated.View>
        );
    }, [setCurrentWorkout, exercises, handleSetComplete, occurrenceMap, PRMODE, startReorder, endReorder, fingerY, styles, showExerciseInfo]);

    const ButtonBackground = ({ children, style }) => (
        <LinearGradient
            colors={[theme.primary, theme.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={style}
        >
            {children}
        </LinearGradient>
    );


    // One page of the split pager: the template grid for a single split. Kept
    // as a function rather than a component so the existing card markup, its
    // layout animations and the hold-menu wiring stay exactly as they were.
    const renderSplitPage = ({ item }) => {
        if (item.__newSplit) {
            return (
                <View style={[styles.splitPage, styles.newSplitPage]}>
                    <TouchableOpacity style={styles.newSplitCard} onPress={openCreateSplit} activeOpacity={0.8}>
                        <AntDesign name="plus" size={30} color={theme.primary} style={{ marginBottom: 8 }} />
                        <Text style={styles.newSplitTitle}>New Split</Text>
                        <Text style={styles.newSplitSub}>Group templates into a routine like PPL or Upper/Lower</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        const { entries } = item;
        // The starter pack is only ever offered when the user has nothing at all.
        const showStarter = templates.length === 0;

        return (
            <View style={styles.splitPage}>
                <ScrollView contentContainerStyle={styles.emptyStateScrollContent} showsVerticalScrollIndicator={false}>
                    {(templatesLoaded && exercises.length > 0) && (
                            <Animated.View entering={FadeIn.duration(300)} style={styles.templatesGrid}>
                                {entries.map(({ template, readiness }) => {
                                    const exerciseNames = template.data.flatMap(group =>
                                        group.exercises.map(ex => {
                                            const detail = exercises.find(e => e.exerciseID === ex.exerciseID);
                                            return detail ? detail.name : 'Unknown';
                                        })
                                    );
                                    const displayNames = exerciseNames.slice(0, 4);
                                    const moreCount = exerciseNames.length - displayNames.length;
                                    const badge = readinessBadge(readiness);

                                    return (
                                        <Animated.View
                                            key={template.id}
                                            layout={LinearTransition.duration(220).easing(Easing.out(Easing.ease))}
                                            entering={FadeIn.duration(250)}
                                            exiting={FadeOut.duration(180)}
                                            style={styles.templateCardWrap}
                                        >
                                        <TouchableOpacity
                                            style={styles.templateCard}
                                            activeOpacity={0.7}
                                            onPress={() => loadTemplate(template)}
                                            onLongPress={(e) => openTemplateMenu(template, e)}
                                            delayLongPress={300}
                                        >
                                            <View style={{ flex: 1 }}>
                                                <View style={styles.templateCardHeader}>
                                                    <Text style={styles.templateName} numberOfLines={1}>{template.name}</Text>
                                                    <TouchableOpacity
                                                        style={styles.templateEditButton}
                                                        onPress={(e) => {
                                                            e.stopPropagation();
                                                            handleLongPressTemplate(template);
                                                        }}
                                                        disabled={!!loadingTemplateId}
                                                    >
                                                        {loadingTemplateId === template.id ? (
                                                            <ActivityIndicator size="small" color={theme.primary} />
                                                        ) : (
                                                            <Feather name="edit-2" size={14} color={theme.textSecondary} />
                                                        )}
                                                    </TouchableOpacity>
                                                </View>

                                                <View style={styles.templateOverview}>
                                                    {displayNames.map((name, idx) => (
                                                        <Text key={idx} style={styles.templateExerciseItem} numberOfLines={1}>
                                                            • {name}
                                                        </Text>
                                                    ))}
                                                    {moreCount > 0 ? (
                                                        <Text style={styles.templateMoreCount}>
                                                            + {moreCount} more
                                                        </Text>
                                                    ) : null}
                                                </View>
                                            </View>

                                            <View style={styles.cardFooter}>
                                                <Text style={styles.templateDetails}>
                                                    {exerciseNames.length} {exerciseNames.length === 1 ? 'exercise' : 'exercises'}
                                                </Text>
                                                {badge ? (
                                                    <View style={styles.readinessPill}>
                                                        <View style={[styles.readinessPillDot, { backgroundColor: badge.color }]} />
                                                        <Text style={[styles.readinessPillText, { color: badge.color }]}>
                                                            {badge.label}
                                                        </Text>
                                                    </View>
                                                ) : (
                                                    <Ionicons name="chevron-forward" size={16} color={theme.primary} opacity={0.5} />
                                                )}
                                            </View>
                                        </TouchableOpacity>
                                        </Animated.View>
                                    );
                                })}

                                {/* Starter pack — only when the user has no templates yet */}
                                {showStarter && (
                                    <Animated.View
                                        layout={LinearTransition.duration(220).easing(Easing.out(Easing.ease))}
                                        exiting={FadeOut.duration(180)}
                                        style={styles.templateCardWrap}
                                    >
                                        <TouchableOpacity
                                            style={[styles.templateCard, styles.starterCard]}
                                            activeOpacity={0.8}
                                            onPress={addStarterTemplates}
                                            disabled={!!loadingTemplateId}
                                        >
                                            <View style={styles.addTemplateInner}>
                                                {loadingTemplateId === 'starter' ? (
                                                    <ActivityIndicator color={theme.primary} />
                                                ) : (
                                                    <>
                                                        <MaterialCommunityIcons name="auto-fix" size={28} color={theme.primary} style={{ marginBottom: 6 }} />
                                                        <Text style={styles.starterTitle}>Add starter templates</Text>
                                                        <Text style={styles.starterSub}>Push · Pull · Legs to get you going</Text>
                                                    </>
                                                )}
                                            </View>
                                        </TouchableOpacity>
                                    </Animated.View>
                                )}

                                {/* Add Template Button */}
                                <Animated.View
                                    layout={LinearTransition.duration(220).easing(Easing.out(Easing.ease))}
                                    style={styles.templateCardWrap}
                                >
                                <TouchableOpacity
                                    style={[styles.templateCard, styles.addTemplateCard]}
                                    activeOpacity={0.7}
                                    onPress={handleAddTemplate}
                                    disabled={!!loadingTemplateId}
                                >
                                    <View style={styles.addTemplateInner}>
                                        <AntDesign name="plus" size={28} color={theme.textSecondary} style={{ marginBottom: 4 }} />
                                        <Text style={styles.addTemplateText}>New Template</Text>
                                    </View>
                                </TouchableOpacity>
                                </Animated.View>
                            </Animated.View>
                    )}
                </ScrollView>
            </View>
        );
    };

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <View style={[styles.container, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
                {!isReady ? (
                    <View style={styles.loadingContainer} />
                ) : (
                    <>
                        {workoutRestored && !workoutStartTime && currentWorkout.length === 0 && (
                            <View style={{ flex: 1 }}>
                                {/* Header lives OUTSIDE the pager so it sits in the
                                    exact same spot as the other tabs' headers. */}
                                <View style={styles.emptyStateHeader}>
                                    {/* Re-keyed on the page index so the eyebrow and
                                        title fade in when you swipe to another split,
                                        rather than snapping to the new name mid-gesture.
                                        The key remounts them, which is what gives
                                        `entering` something to animate. */}
                                    <Animated.View
                                        key={`split-head-${activeSplitIndex}`}
                                        entering={FadeIn.duration(260)}
                                        style={styles.emptyStateHeaderText}
                                    >
                                        <TouchableOpacity onPress={toggleTemplateSort} activeOpacity={0.6} hitSlop={8}>
                                            <Text style={styles.eyebrow}>
                                                {activeTemplateCount > 0
                                                    ? `${activeTemplateCount} ${activeTemplateCount === 1 ? 'TEMPLATE' : 'TEMPLATES'} · ${templateSort === SORT_READINESS ? 'READY FIRST' : 'NEWEST FIRST'}`
                                                    : 'READY WHEN YOU ARE'}
                                            </Text>
                                        </TouchableOpacity>
                                        <Text style={styles.emptyStateTitle} numberOfLines={1}>
                                            {activeSplit ? activeSplit.name : 'Train'}
                                        </Text>
                                    </Animated.View>
                                    {activeSplit && (
                                        <TouchableOpacity
                                            style={styles.splitEditButton}
                                            onPress={() => setSplitMenu(true)}
                                            hitSlop={6}
                                        >
                                            <Feather name="more-horizontal" size={20} color={theme.text} />
                                        </TouchableOpacity>
                                    )}
                                </View>

                                {splitPages.length > 1 && (
                                    <View style={styles.splitDots}>
                                        {pagerData.map((page, i) => (
                                            <TouchableOpacity
                                                key={page.__newSplit ? 'new' : page.split.id}
                                                onPress={() => {
                                                    setActiveSplitIndex(i);
                                                    splitPagerRef.current?.scrollToOffset({ offset: i * width, animated: true });
                                                }}
                                                hitSlop={8}
                                            >
                                                <View style={[
                                                    styles.splitDot,
                                                    page.__newSplit && styles.splitDotNew,
                                                    i === activeSplitIndex && styles.splitDotActive,
                                                ]} />
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )}

                                <FlatList
                                    ref={splitPagerRef}
                                    data={pagerData}
                                    renderItem={renderSplitPage}
                                    keyExtractor={(item) => (item.__newSplit ? 'new-split' : String(item.split.id))}
                                    horizontal
                                    pagingEnabled
                                    showsHorizontalScrollIndicator={false}
                                    // Only neighbouring splits stay mounted — each page holds a
                                    // full card grid, and this screen has a history of retaining
                                    // views (see project memory).
                                    windowSize={3}
                                    initialNumToRender={1}
                                    onMomentumScrollEnd={(e) => {
                                        const idx = Math.round(e.nativeEvent.contentOffset.x / width);
                                        if (idx !== activeSplitIndex) setActiveSplitIndex(idx);
                                    }}
                                />

                                <View style={[styles.bottomButtonContainer, { bottom: Math.max(insets.bottom + 80, 115) }]}>
                                    <TouchableOpacity onPress={startWorkout} activeOpacity={0.8} style={styles.startWorkoutButtonContainer}>
                                        <ButtonBackground style={styles.startButton}>
                                            <Text style={styles.startButtonText}>Start an Empty Workout</Text>
                                        </ButtonBackground>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}

                        {workoutRestored && (workoutStartTime || currentWorkout.length > 0) && (
                            <View style={{ flex: 1 }}>
                                {/* Header */}
                                <View style={styles.headerContainer}>
                                    <View style={styles.headerTopRow}>
                                        <TextInput
                                            style={styles.workoutTitleInput}
                                            onChangeText={setWorkoutTitle}
                                            value={workoutTitle}
                                            placeholder="Workout Name"
                                            placeholderTextColor={theme.textSecondary}
                                            keyboardType="text"
                                        />
                                        {workoutStartTime && (
                                            <Animated.View layout={LinearTransition.duration(200).easing(Easing.out(Easing.ease))} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                                <Animated.View layout={LinearTransition.duration(200).easing(Easing.out(Easing.ease))}>
                                                    <TouchableOpacity onPress={togglePRMode}>
                                                        <MaterialCommunityIcons name="trending-up" size={24} color={PRMODE ? theme.primary : theme.textSecondary} />
                                                    </TouchableOpacity>
                                                </Animated.View>
                                                <Animated.View layout={LinearTransition.duration(200).easing(Easing.out(Easing.ease))}>
                                                    <RestTimer ref={restTimerRef} onFirstStart={requestNotificationPermissionOnce} />
                                                </Animated.View>
                                                {showInfoIcon && (
                                                    <Animated.View
                                                        entering={FadeIn}
                                                        exiting={FadeOut}
                                                        layout={LinearTransition.duration(200).easing(Easing.out(Easing.ease))}
                                                    >
                                                        <TouchableOpacity onPress={showTimerInfoAlert} style={styles.timerInfoButton}>
                                                            <Feather name="info" size={20} color={theme.textSecondary} />
                                                        </TouchableOpacity>
                                                    </Animated.View>
                                                )}
                                            </Animated.View>
                                        )}
                                    </View>

                                    {/* Live session stats */}
                                    <View style={styles.liveStatsRow}>
                                        <Text style={styles.liveStatsText}>
                                            {Math.round(liveStats.volume).toLocaleString()} {unitLabel(useImperial)}
                                        </Text>
                                        <View style={styles.liveStatsDivider} />
                                        <Text style={styles.liveStatsText}>
                                            {liveStats.done}/{liveStats.total} sets
                                        </Text>
                                        {livePRCount > 0 && (
                                            <Animated.View entering={FadeIn.duration(250)} style={styles.livePRPill}>
                                                <MaterialCommunityIcons name="trophy" size={12} color={theme.primary} />
                                                <Text style={styles.livePRPillText}>
                                                    {livePRCount} PR{livePRCount > 1 ? 's' : ''}
                                                </Text>
                                            </Animated.View>
                                        )}
                                    </View>

                                    <View style={styles.headerDivider} />
                                </View>

                                <View ref={listWrapperRef} style={{ flex: 1 }} collapsable={false}>
                                <ReorderableList
                                    ref={listRef}
                                    data={currentWorkout}
                                    onReorder={handleReorder}
                                    onScrollToIndexFailed={handleScrollToIndexFailed}
                                    keyExtractor={(item) => String(item.id)}
                                    renderItem={renderItem}
                                    itemLayoutAnimation={LinearTransition.duration(200).easing(Easing.out(Easing.ease))}
                                    style={styles.list}
                                    contentContainerStyle={{ paddingBottom: 160, paddingHorizontal: 1 }}
                                    keyboardShouldPersistTaps="handled"
                                    showsVerticalScrollIndicator={false}
                                    keyboardDismissMode="on-drag"
                                    scrollEnabled={!isReordering}
                                    // The footer is deliberately NOT layout-animated.
                                    // Animating its position meant that when the list went
                                    // from empty to populated it slid down from the top
                                    // rather than simply being there, and an interrupted or
                                    // dropped animation left it stranded over the sets.
                                    ListFooterComponent={
                                        <Animated.View style={styles.footer}>
                                            <TouchableOpacity
                                                style={styles.addExerciseButton}
                                                onPress={plusButtonShowExerciseList}
                                                activeOpacity={0.7}
                                            >
                                                <Text style={styles.addExerciseText}>Add Exercise</Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                onPress={() => {
                                                    const mins = workoutStartTime
                                                        ? Math.max(0, Math.floor((Date.now() - new Date(workoutStartTime).getTime()) / 60000))
                                                        : 0;
                                                    const summary = `${mins}m · ${Math.round(liveStats.volume).toLocaleString()} ${unitLabel(useImperial)} · ${liveStats.done} of ${liveStats.total} sets completed`;
                                                    const warning = liveStats.done < liveStats.total
                                                        ? "\n\nIncomplete sets won't be saved."
                                                        : "";
                                                    customAlert(
                                                        "Finish Workout?",
                                                        `${summary}${warning}`,
                                                        [
                                                            { text: "Cancel", style: "cancel" },
                                                            { text: "Finish", onPress: endWorkout, style: "bold" }
                                                        ]
                                                    );
                                                }}
                                                activeOpacity={0.8}
                                                style={styles.finishButtonContainer}
                                            >
                                                <ButtonBackground style={styles.finishButton}>
                                                    <Text style={styles.finishButtonText}>Finish Workout</Text>
                                                </ButtonBackground>
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                onPress={() =>
                                                    customAlert(
                                                        "Clear Workout?",
                                                        "This will remove all data.",
                                                        [
                                                            { text: "Cancel", style: "cancel" },
                                                            { text: "Clear", onPress: clearWorkout, style: "destructive" }
                                                        ]
                                                    )
                                                }
                                                activeOpacity={0.7}
                                                style={styles.clearButton}
                                            >
                                                <Text style={styles.clearButtonText}>Clear Workout</Text>
                                            </TouchableOpacity>
                                        </Animated.View>
                                    }
                                />
                                {reorderSession && (
                                    <ReorderOverlay
                                        ref={overlayRef}
                                        rows={reorderRows}
                                        activeId={reorderSession.activeId}
                                        fingerY={fingerY}
                                        frame={reorderSession.frame}
                                    />
                                )}
                                </View>
                            </View>
                        )}
                        <FilteredExerciseList
                            exercises={exercises}
                            actionSheetRef={actionSheetRef}
                            setCurrentWorkout={setCurrentWorkout}
                            existingExerciseIds={currentWorkout.flatMap(g => g.exercises.map(e => e.exerciseID))}
                            onExerciseCreated={() => fetchExercises().then(data => setExercises(data))}
                        />
                    </>
                )}

                {templateMenu && (
                    <ContextMenu
                        anchor={templateMenu.anchor}
                        onClose={() => setTemplateMenu(null)}
                        header={templateMenu.readiness}
                        items={[
                            { icon: 'play', label: 'Start Workout', tint: true, onPress: () => loadTemplate(templateMenu.template) },
                            { icon: 'edit-2', label: 'Edit Template', onPress: () => handleLongPressTemplate(templateMenu.template) },
                            // One entry per other split, so moving a template is a
                            // single tap rather than a second picker screen.
                            ...splits
                                .filter(s => s.id !== templateMenu.template.splitId)
                                .map(s => ({
                                    icon: 'corner-up-right',
                                    label: `Move to ${s.name}`,
                                    onPress: () => handleMoveTemplate(templateMenu.template, s.id),
                                })),
                            { icon: 'trash-2', label: 'Delete Template', destructive: true, onPress: () => confirmDeleteTemplate(templateMenu.template) },
                        ]}
                    />
                )}

                {splitMenu && activeSplit && (
                    <ContextMenu
                        anchor={{ x: width - 40, y: insets.top + 60 }}
                        onClose={() => setSplitMenu(false)}
                        header={{ icon: 'layers', title: activeSplit.name }}
                        items={[
                            { icon: 'edit-2', label: 'Rename Split', onPress: () => openRenameSplit(activeSplit) },
                            { icon: 'plus', label: 'New Split', tint: true, onPress: openCreateSplit },
                            { icon: 'trash-2', label: 'Delete Split', destructive: true, onPress: () => confirmDeleteSplit(activeSplit) },
                        ]}
                    />
                )}

                {splitEditor && (
                    <Modal transparent animationType="fade" statusBarTranslucent onRequestClose={() => setSplitEditor(null)}>
                        <Pressable style={styles.splitDialogBackdrop} onPress={() => setSplitEditor(null)}>
                            <Pressable style={styles.splitDialog} onPress={() => {}}>
                                <Text style={styles.splitDialogTitle}>
                                    {splitEditor.mode === 'create' ? 'New Split' : 'Rename Split'}
                                </Text>
                                <TextInput
                                    style={styles.splitDialogInput}
                                    value={splitEditor.name}
                                    onChangeText={(text) => setSplitEditor(prev => ({ ...prev, name: text }))}
                                    placeholder="e.g. Push Pull Legs"
                                    placeholderTextColor={theme.textSecondary}
                                    autoFocus
                                    maxLength={40}
                                    returnKeyType="done"
                                    onSubmitEditing={submitSplitEditor}
                                    selectionColor={theme.primary}
                                />
                                <View style={styles.splitDialogActions}>
                                    <TouchableOpacity onPress={() => setSplitEditor(null)} style={styles.splitDialogBtn}>
                                        <Text style={styles.splitDialogCancel}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={submitSplitEditor}
                                        style={styles.splitDialogBtn}
                                        disabled={!splitEditor.name.trim()}
                                    >
                                        <Text style={[styles.splitDialogConfirm, !splitEditor.name.trim() && { opacity: 0.4 }]}>
                                            {splitEditor.mode === 'create' ? 'Create' : 'Save'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </Pressable>
                        </Pressable>
                    </Modal>
                )}
            </View>
        </GestureHandlerRootView>
    );
};



const getStyles = (theme) => {
    const safePrimary = theme.primary;
    const safeText = theme.text;
    const safeBorder = theme.border;
    const safeDanger = theme.danger;

    const numColumns = 2;
    const gap = 12;
    const padding = 16;
    const availableWidth = width - (padding * 2) - ((numColumns - 1) * gap);
    const itemWidth = Math.floor(availableWidth / numColumns);

    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: theme.background,
        },
        list: {
            flex: 1,
        },
        loadingContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
        },
        emptyStateScrollContent: {
            paddingHorizontal: padding,
            paddingTop: 4,
            paddingBottom: 240,
        },
        emptyStateHeader: {
            // Matches the header position on Home/History/Exercises exactly.
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 12,
            flexDirection: 'row',
            alignItems: 'flex-start',
        },
        emptyStateHeaderText: {
            flex: 1,
        },
        splitEditButton: {
            padding: 8,
            marginTop: 4,
        },
        splitDots: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 20,
            paddingBottom: 10,
        },
        splitDot: {
            width: 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: theme.overlayBorder,
        },
        splitDotActive: {
            backgroundColor: theme.primary,
            width: 18,
        },
        splitDotNew: {
            backgroundColor: 'transparent',
            borderWidth: 1,
            borderColor: theme.overlayBorder,
        },
        // Each page is exactly one screen wide so paging lands cleanly.
        splitPage: {
            width,
            flex: 1,
        },
        newSplitPage: {
            paddingHorizontal: 16,
            paddingTop: 8,
        },
        newSplitCard: {
            flex: 1,
            maxHeight: 220,
            borderRadius: RADIUS.l,
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: theme.overlayBorder,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
        },
        newSplitTitle: {
            fontSize: 17,
            fontFamily: FONTS.bold,
            color: theme.text,
            marginBottom: 4,
        },
        newSplitSub: {
            fontSize: 13,
            fontFamily: FONTS.medium,
            color: theme.textSecondary,
            textAlign: 'center',
            lineHeight: 18,
        },
        splitDialogBackdrop: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.6)',
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 32,
        },
        splitDialog: {
            width: '100%',
            backgroundColor: theme.surface,
            borderRadius: RADIUS.l,
            padding: 20,
            ...getThemedShadow(theme, 'medium'),
        },
        splitDialogTitle: {
            fontSize: 17,
            fontFamily: FONTS.bold,
            color: theme.text,
            marginBottom: 14,
        },
        splitDialogInput: {
            backgroundColor: theme.overlayInput,
            borderRadius: RADIUS.m,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 16,
            fontFamily: FONTS.medium,
            color: theme.text,
        },
        splitDialogActions: {
            flexDirection: 'row',
            justifyContent: 'flex-end',
            gap: 8,
            marginTop: 16,
        },
        splitDialogBtn: {
            paddingHorizontal: 14,
            paddingVertical: 8,
        },
        splitDialogCancel: {
            fontSize: 15,
            fontFamily: FONTS.semiBold,
            color: theme.textSecondary,
        },
        splitDialogConfirm: {
            fontSize: 15,
            fontFamily: FONTS.bold,
            color: theme.primary,
        },
        eyebrow: {
            fontSize: 12,
            fontFamily: FONTS.semiBold,
            color: theme.textSecondary,
            letterSpacing: 1.1,
            marginBottom: 2,
        },
        emptyStateTitle: {
            fontSize: 32,
            fontFamily: FONTS.bold,
            letterSpacing: -0.6,
            color: safeText,
        },
        readinessPill: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
        },
        readinessPillDot: {
            width: 7,
            height: 7,
            borderRadius: 3.5,
        },
        readinessPillText: {
            fontSize: 12,
            fontFamily: FONTS.bold,
        },
        templatesGrid: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: gap,
        },
        templateCardWrap: {
            width: itemWidth,
        },
        templateCard: {
            width: itemWidth,
            height: 200,
            backgroundColor: theme.surface,
            borderRadius: RADIUS.l,
            padding: 14,
            justifyContent: 'space-between',
            position: 'relative',
            ...(isLightTheme(theme) ? getThemedShadow(theme, 'small') : null),
        },
        templateCardHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
        },
        templateOverview: {
            flex: 1,
            marginTop: 4,
        },
        templateExerciseItem: {
            fontSize: 12,
            fontFamily: FONTS.medium,
            color: theme.textSecondary,
            marginBottom: 2,
            opacity: 0.8,
        },
        templateMoreCount: {
            fontSize: 11,
            fontFamily: FONTS.regular,
            color: theme.textSecondary,
            marginTop: 2,
            opacity: 0.6,
        },
        cardFooter: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 8,
            paddingTop: 8,
            borderTopWidth: 1,
            borderTopColor: theme.overlayBorder,
        },
        addTemplateInner: {
            alignItems: 'center',
            justifyContent: 'center',
        },
        addTemplateText: {
            fontSize: 14,
            fontFamily: FONTS.semiBold,
            color: theme.textSecondary,
        },
        plusCardLoader: {
            position: 'absolute',
            bottom: 12,
            right: 12,
        },
        addTemplateCard: {
            alignItems: 'center',
            justifyContent: 'center',
            // A recessed placeholder, not an elevated card — cancel the shadow
            // inherited from templateCard (its grey elevation halo around a
            // near-transparent fill looks janky in light mode).
            backgroundColor: theme.overlayInput,
            shadowColor: 'transparent',
            shadowOpacity: 0,
            shadowRadius: 0,
            elevation: 0,
        },
        starterCard: {
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: withAlpha(theme.primary, isLightTheme(theme) ? 0.08 : 0.14),
            borderWidth: 1,
            borderColor: withAlpha(theme.primary, isLightTheme(theme) ? 0.25 : 0.35),
            borderStyle: 'dashed',
            shadowColor: 'transparent',
            shadowOpacity: 0,
            shadowRadius: 0,
            elevation: 0,
        },
        starterTitle: {
            fontSize: 14,
            fontFamily: FONTS.bold,
            color: theme.primary,
            textAlign: 'center',
        },
        starterSub: {
            fontSize: 12,
            fontFamily: FONTS.medium,
            color: theme.textSecondary,
            textAlign: 'center',
            marginTop: 3,
            paddingHorizontal: 8,
        },
        templateEditButton: {
            width: 28,
            height: 28,
            borderRadius: 8,
            backgroundColor: theme.overlayInput,
            alignItems: 'center',
            justifyContent: 'center',
        },
        templateName: {
            fontSize: 15,
            fontFamily: FONTS.bold,
            color: safeText,
            flex: 1,
            marginRight: 8,
        },
        templateDetails: {
            fontSize: 12,
            fontFamily: FONTS.semiBold,
            color: theme.textSecondary,
        },
        bottomButtonContainer: {
            position: 'absolute',
            bottom: 75,
            left: 0,
            right: 0,
            paddingHorizontal: 16,
            backgroundColor: 'transparent',
            zIndex: 100,
        },
        startWorkoutButtonContainer: {
            width: '100%',
            ...SHADOWS.medium,
        },
        startButton: {
            paddingVertical: 16,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
        },
        startButtonText: {
            color: theme.textAlternate,
            fontSize: 16,
            fontFamily: FONTS.bold,
            letterSpacing: 0.5,
        },
        headerContainer: {
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 8,
            backgroundColor: theme.background,
            zIndex: 10,
        },
        headerTopRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
        },
        workoutTitleInput: {
            flex: 1,
            fontSize: 20,
            fontFamily: FONTS.bold,
            color: safeText,
            marginRight: 16,
        },
        headerDivider: {
            height: 1,
            backgroundColor: safeBorder,
            opacity: 0.5,
        },
        liveStatsRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginBottom: 9,
            // Matches livePRPill's height: the pill is the tallest thing that can
            // appear here, so reserving its height keeps the cards below from
            // shifting down when a PR lands mid-workout.
            minHeight: 22,
        },
        liveStatsText: {
            fontSize: 12.5,
            fontFamily: FONTS.medium,
            color: theme.textSecondary,
            fontVariant: ['tabular-nums'],
        },
        liveStatsDivider: {
            width: 1,
            height: 12,
            backgroundColor: safeBorder,
        },
        livePRPill: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: theme.overlayInput,
            paddingHorizontal: 8,
            // Fixed height rather than vertical padding, so it can never grow
            // the row it sits in (see liveStatsRow.minHeight).
            height: 22,
            borderRadius: RADIUS.pill,
            marginLeft: 2,
        },
        livePRPillText: {
            fontSize: 11.5,
            fontFamily: FONTS.bold,
            color: theme.primary,
        },
        scrollContent: {
            padding: 16,
            paddingBottom: 40,
        },
        exerciseWrapper: {
            marginBottom: 0,
        },
        addExerciseButton: {
            backgroundColor: theme.overlayInput,
            paddingVertical: 15,
            borderRadius: RADIUS.m,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 24,
        },
        addExerciseText: {
            color: safePrimary,
            fontSize: 16,
            fontFamily: FONTS.semiBold,
        },
        finishButtonContainer: {
            marginBottom: 16,
            borderRadius: 12,
            ...SHADOWS.medium,
        },
        finishButton: {
            paddingVertical: 16,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
        },
        finishButtonText: {
            fontSize: 18,
            fontFamily: FONTS.bold,
            color: theme.textAlternate,
            letterSpacing: 0.5,
        },
        clearButton: {
            paddingVertical: 12,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 8,
        },
        clearButtonText: {
            fontSize: 15,
            fontFamily: FONTS.medium,
            color: safeDanger,
            opacity: 0.8,
        },
        footer: {
            padding: 16,
        },
        restTimerButton: {
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: theme.overlayInput,
            alignItems: 'center',
            justifyContent: 'center',
        },
        timerInfoButton: {
            padding: 4,
            justifyContent: 'center',
            alignItems: 'center',
        }
    });
};
export default Current;