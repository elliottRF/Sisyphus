import { requireNativeModule } from 'expo-modules-core';

const Native = requireNativeModule('AndroidTimerModule');

export default {
    startTimer: (s) => Native.startTimer(s),
    stopTimer: () => Native.stopTimer(),
    getRemaining: () => Native.getRemaining(),
};
