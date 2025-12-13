import { registerWebModule, NativeModule } from 'expo';

import { ElliottrAndroidTimerModuleEvents } from './ElliottrAndroidTimer.types';

class ElliottrAndroidTimerModule extends NativeModule<ElliottrAndroidTimerModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(ElliottrAndroidTimerModule, 'ElliottrAndroidTimerModule');
