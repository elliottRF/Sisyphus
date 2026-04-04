import { requireNativeModule } from 'expo-modules-core';

const Native = requireNativeModule('AndroidTimerModule');

function AndroidTimerModule() {
    return null;
}

AndroidTimerModule.startTimer = (s, m) => Native.startTimer(s, m);
AndroidTimerModule.stopTimer = () => Native.stopTimer();
AndroidTimerModule.getRemaining = () => Native.getRemaining();

export default AndroidTimerModule;
