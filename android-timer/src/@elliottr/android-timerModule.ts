import { NativeModule, requireNativeModule } from 'expo';

import { @elliottr/android-timerModuleEvents } from './@elliottr/android-timer.types';

declare class @elliottr/android-timerModule extends NativeModule<@elliottr/android-timerModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<@elliottr/android-timerModule>('@elliottr/android-timer');
