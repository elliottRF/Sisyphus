module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo auto-includes react-native-worklets/plugin (the
    // Reanimated 4 worklets transform). The old react-native-reanimated/plugin
    // must NOT be listed manually — on Reanimated 4.5 it no longer performs
    // the worklets transform and silently freezes all animations.
    presets: ['babel-preset-expo'],
  };
};
