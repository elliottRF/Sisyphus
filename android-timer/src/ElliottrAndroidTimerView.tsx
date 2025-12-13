import { requireNativeView } from 'expo';
import * as React from 'react';

import { ElliottrAndroidTimerViewProps } from './ElliottrAndroidTimer.types';

const NativeView: React.ComponentType<ElliottrAndroidTimerViewProps> =
  requireNativeView('ElliottrAndroidTimer');

export default function ElliottrAndroidTimerView(props: ElliottrAndroidTimerViewProps) {
  return <NativeView {...props} />;
}
