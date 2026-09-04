// Lightweight event emitter for cross-component communication.
// Used to trigger graph refreshes only when specific actions occur.

const listeners = {};

export const AppEvents = {
  REFRESH_HOME: 'REFRESH_HOME',
  WORKOUT_COMPLETED: 'WORKOUT_COMPLETED',
  WORKOUT_DATA_IMPORTED: 'WORKOUT_DATA_IMPORTED',
  BODYWEIGHT_DATA_IMPORTED: 'BODYWEIGHT_DATA_IMPORTED',
  SHOW_CUSTOM_ALERT: 'SHOW_CUSTOM_ALERT',
  ONBOARDING_COMPLETED: 'ONBOARDING_COMPLETED',
};

// Listener-count diagnostics for the view-retention investigation. That bug is
// closed (it was Reanimated's, fixed in 4.5.1), so this no longer needs to run
// in release builds — where it was costing an O(listeners) tally, a string
// build and a bridge-crossing console.log on every workout mutation, import and
// settings-slider release.
//
// It stays behind one flag rather than being deleted: the canary only ever
// earned its keep on standalone builds, so if a retention bug is ever suspected
// again, set this to true, build, and read it back with
// `adb logcat -s ReactNativeJS`.
const LEAK_CANARY = __DEV__;

export function emit(event, data) {
  if (LEAK_CANARY && event !== AppEvents.SHOW_CUSTOM_ALERT) {
    // Listener counts are a leak canary. The per-label breakdown tells piled-up
    // screens apart: pr-graph×N is stacked exercise screens (drops when you
    // back out); any tab label at ×2+ means a duplicate (tabs) navigator.
    const byLabel = {};
    (listeners[event] || []).forEach(cb => {
      const label = cb.__label || 'unlabeled';
      byLabel[label] = (byLabel[label] || 0) + 1;
    });
    const breakdown = Object.entries(byLabel).map(([k, v]) => `${k}×${v}`).join(', ');
    console.log(`[AppEvents] ${event} → ${(listeners[event] || []).length} listener(s): ${breakdown}`);
  }
  if (listeners[event]) {
    listeners[event].forEach(cb => cb(data));
  }
}

const labelCount = (event, label) =>
  (listeners[event] || []).filter(cb => cb.__label === label).length;

export function on(event, callback, label) {
  if (!listeners[event]) listeners[event] = [];
  if (label) callback.__label = label;
  listeners[event].push(callback);
  // Mount trail: tab screens should only ever subscribe once each — a second
  // subscription means a duplicate (tabs) navigator just mounted, and this log
  // timestamps exactly which user action spawned it.
  if (LEAK_CANARY && label && label.endsWith('-tab') && event === AppEvents.WORKOUT_COMPLETED) {
    console.log(`[AppEvents] + ${label} subscribed (now ×${labelCount(event, label)})`);
  }
  if (listeners[event].length > 24) {
    console.warn(`[AppEvents] ${event} now has ${listeners[event].length} listeners — likely accumulating duplicate screens`);
  }
}

export function off(event, callback) {
  if (!listeners[event]) return;
  listeners[event] = listeners[event].filter(cb => cb !== callback);
  const label = callback.__label;
  if (LEAK_CANARY && label && label.endsWith('-tab') && event === AppEvents.WORKOUT_COMPLETED) {
    console.log(`[AppEvents] - ${label} unsubscribed (now ×${labelCount(event, label)})`);
  }
}
