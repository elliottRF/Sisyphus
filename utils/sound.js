import { AppState } from 'react-native';
import { createAudioPlayer } from 'expo-audio';

// One-shot sounds that clean up after themselves.
//
// expo-audio keeps every live player in a process-wide map and only takes one
// out when `remove()` is called on it. Two places in its Android module then
// replay whatever is in that map:
//
//   AUDIOFOCUS_LOSS_TRANSIENT / entering background
//       -> every player that is PLAYING is marked isPaused and paused
//   AUDIOFOCUS_GAIN / entering foreground
//       -> every player that is isPaused is played again
//
// So a clip interrupted before it finishes -- locking the phone, a call, a
// Bluetooth device connecting -- is left marked "paused", and if nothing ever
// removes it, it is still sitting in that map hours later. Every later focus
// gain plays it once more. Connecting a car stereo churns audio focus several
// times over, which is how finishing a workout and then getting in the car
// turned the finish chime into a loop that only a force-quit stopped: killing
// the process is the one thing that empties the map.
//
// `didJustFinish` cannot be the only thing that removes the player, because it
// only arrives when the clip actually finishes -- precisely not the case that
// causes this. So the player is also dropped when the app leaves the
// foreground (which is the moment the replay behaviour starts to matter, and
// nobody is listening to a finish chime they just locked the phone on), and on
// a timeout as a last resort.

/** Destroyers for players that are still alive, so background can drop them all. */
const live = new Set();

AppState.addEventListener('change', (state) => {
    if (state === 'active') return;
    // Copy first: each destroy mutates the set.
    Array.from(live).forEach((destroy) => destroy());
});

/**
 * Play a short sound once and make sure the player cannot outlive it.
 *
 * `maxMs` should comfortably exceed the clip; it is a backstop, not a timer.
 */
export const playOneShot = (source, { volume = 1, maxMs = 15000 } = {}) => {
    let player = null;
    let timeout = null;

    const destroy = () => {
        live.delete(destroy);
        if (timeout) {
            clearTimeout(timeout);
            timeout = null;
        }
        const dying = player;
        player = null;
        if (!dying) return;
        try {
            dying.remove();
        } catch (e) {
            // Already gone, or the native player has been torn down. Either
            // way it is out of expo-audio's map, which is the point.
        }
    };

    try {
        player = createAudioPlayer(source);
        player.volume = volume;
        player.addListener('playbackStatusUpdate', (status) => {
            if (status?.didJustFinish) destroy();
        });
        live.add(destroy);
        timeout = setTimeout(destroy, maxMs);
        player.play();
    } catch (e) {
        console.warn('Failed to play sound', e);
        destroy();
    }
};
