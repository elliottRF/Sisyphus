import * as React from 'react';

import { @elliottr/android-timerViewProps } from './@elliottr/android-timer.types';

export default function @elliottr/android-timerView(props: @elliottr/android-timerViewProps) {
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
