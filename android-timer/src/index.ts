// Reexport the native module. On web, it will be resolved to ElliottrAndroidTimerModule.web.ts
// and on native platforms to ElliottrAndroidTimerModule.ts
export { default } from './ElliottrAndroidTimerModule';
export { default as ElliottrAndroidTimerView } from './ElliottrAndroidTimerView';
export * from  './ElliottrAndroidTimer.types';
