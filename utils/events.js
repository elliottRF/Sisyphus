// Lightweight event emitter for cross-component communication.
// Used to trigger graph refreshes only when specific actions occur.

const listeners = {};

export const AppEvents = {
  REFRESH_HOME: 'REFRESH_HOME',
  WORKOUT_COMPLETED: 'WORKOUT_COMPLETED',
  WORKOUT_DATA_IMPORTED: 'WORKOUT_DATA_IMPORTED',
  BODYWEIGHT_DATA_IMPORTED: 'BODYWEIGHT_DATA_IMPORTED',
  SHOW_CUSTOM_ALERT: 'SHOW_CUSTOM_ALERT',
};

export function emit(event, data) {
  if (listeners[event]) {
    listeners[event].forEach(cb => cb(data));
  }
}

export function on(event, callback) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(callback);
}

export function off(event, callback) {
  if (!listeners[event]) return;
  listeners[event] = listeners[event].filter(cb => cb !== callback);
}
