import { requireNativeModule } from 'expo-modules-core';

const Native = requireNativeModule('AndroidTimerModule');

function AndroidTimerModule() {
    return null;
}

// The native side has gained arguments over time and a JS bundle can be
// newer than the binary it is running against, so fall back in order.
AndroidTimerModule.startTimer = (s, m, nextName, nextLoad) => {
    try {
        return Native.startTimer(s, m, nextName || '', nextLoad || '');
    } catch (e) {
        try {
            return Native.startTimer(s, m);
        } catch (e2) {
            return Native.startTimer(s);
        }
    }
};
AndroidTimerModule.stopTimer = () => Native.stopTimer();
AndroidTimerModule.getRemaining = () => Native.getRemaining();

export default AndroidTimerModule;
