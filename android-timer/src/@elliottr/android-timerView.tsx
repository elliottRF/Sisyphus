import { requireNativeView } from 'expo';
import * as React from 'react';

import { @elliottr/android-timerViewProps } from './@elliottr/android-timer.types';

const NativeView: React.ComponentType<@elliottr/android-timerViewProps> =
  requireNativeView('@elliottr/android-timer');

export default function @elliottr/android-timerView(props: @elliottr/android-timerViewProps) {
  return <NativeView {...props} />;
}
