import { requireNativeModule } from 'expo-modules-core';

const Native = requireNativeModule('AndroidTimerModule');

function AndroidTimerModule() {
    return null;
}

AndroidTimerModule.startTimer = (s) => Native.startTimer(s);
AndroidTimerModule.stopTimer = () => Native.stopTimer();
AndroidTimerModule.getRemaining = () => Native.getRemaining();

export default AndroidTimerModule;
