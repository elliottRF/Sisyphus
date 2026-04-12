import { requireNativeModule } from 'expo-modules-core';

const Native = requireNativeModule('AndroidTimerModule');

function AndroidTimerModule() {
    return null;
}

AndroidTimerModule.startTimer = (s, m) => {
    try {
        return Native.startTimer(s, m);
    } catch (e) {
        // Fallback for older native binaries that only expect 1 argument
        return Native.startTimer(s);
    }
};
AndroidTimerModule.stopTimer = () => Native.stopTimer();
AndroidTimerModule.getRemaining = () => Native.getRemaining();

export default AndroidTimerModule;
