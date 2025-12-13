import * as React from 'react';

import { ElliottrAndroidTimerViewProps } from './ElliottrAndroidTimer.types';

export default function ElliottrAndroidTimerView(props: ElliottrAndroidTimerViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
