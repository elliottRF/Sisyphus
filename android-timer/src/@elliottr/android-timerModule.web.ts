import { registerWebModule, NativeModule } from 'expo';

import { @elliottr/android-timerModuleEvents } from './@elliottr/android-timer.types';

class @elliottr/android-timerModule extends NativeModule<@elliottr/android-timerModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(@elliottr/android-timerModule, '@elliottr/android-timerModule');
