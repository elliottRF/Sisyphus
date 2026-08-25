import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

// One vocabulary for the whole app, so the same kind of moment always feels the
// same. Before this, filling a row buzzed harder than completing a set.
//
//   select  - choosing between options (set type, a preset, a page)
//   tap     - frequent, low-stakes confirmations (ticking a set, starting rest)
//   commit  - deliberate one-off actions (fill row, start workout, save)
//   success - something worth celebrating (PR, workout saved, import done)
//   warn    - a destructive path is about to open
//   fail    - the thing you asked for didn't happen
//
// Every call is fire-and-forget and swallows its own errors: haptics are never
// important enough to interrupt an interaction, and some devices/emulators have
// no vibrator at all.

export const HAPTICS_KEY = 'settings_haptics';

let enabled = true;

AsyncStorage.getItem(HAPTICS_KEY)
    .then((v) => { if (v !== null) enabled = v === 'true'; })
    .catch(() => {});

export const setHapticsEnabled = (value) => {
    enabled = value;
    AsyncStorage.setItem(HAPTICS_KEY, value ? 'true' : 'false').catch(() => {});
};

export const getHapticsEnabled = () => enabled;

const run = (fn) => {
    if (!enabled) return;
    try { fn()?.catch?.(() => {}); } catch (e) { /* no vibrator, or unsupported */ }
};

export const select = () => run(() => Haptics.selectionAsync());
export const tap = () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
export const commit = () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
export const success = () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
export const warn = () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
export const fail = () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
