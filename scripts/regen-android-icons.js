// Regenerate the Android images that are derived from assets/, using the same
// generators `expo prebuild` uses:
//
//   mipmap-*/ic_launcher*.webp        launcher + adaptive icon
//   drawable-*/splashscreen_logo.png  splash screen
//   drawable-*/notification_icon.png  expo-notifications' small icon
//
// Why not just run prebuild: it rewrites the whole android/ directory, and this
// project has hand-made changes in there -- the release signingConfig that
// throws rather than silently falling back to the debug key, among others. This
// calls the pieces that matter and leaves everything else alone.
//
//   node scripts/regen-android-icons.js
//
// Run it whenever assets/icon.png or assets/adaptive.png changes. NOTHING does
// this automatically in a bare workflow, which is how the shipped builds ended
// up carrying a launcher icon, a splash and a notification icon four days older
// than the artwork.
const path = require('path');
const {
  setIconAsync,
} = require('@expo/prebuild-config/build/plugins/icons/withAndroidIcons');
// Loaded by absolute path: expo-splash-screen's package `exports` field does
// not expose its plugin build, so a bare specifier is refused.
const splashDir = path.dirname(require.resolve('expo-splash-screen/package.json'));
const {
  setSplashImageDrawablesAsync,
} = require(path.join(splashDir, 'plugin/build/withAndroidSplashImages'));
const {
  getAndroidSplashConfig,
} = require(path.join(splashDir, 'plugin/build/getAndroidSplashConfig'));
const {
  setNotificationIconAsync,
} = require('expo-notifications/plugin/build/withNotificationsAndroid');

const projectRoot = path.resolve(__dirname, '..');
const app = require(path.join(projectRoot, 'app.json')).expo;
const abs = (p) => (p ? path.resolve(projectRoot, p) : null);

/** The options object for a plugin entry in app.json's `plugins` array. */
function pluginProps(name) {
  const entry = (app.plugins || []).find(
    (p) => p === name || (Array.isArray(p) && p[0] === name)
  );
  return Array.isArray(entry) ? entry[1] || {} : {};
}

(async () => {
  // ── Launcher + adaptive icon ──────────────────────────────────────────────
  const adaptive = app.android?.adaptiveIcon || {};
  const foreground = abs(adaptive.foregroundImage);
  console.log('launcher icon   :', abs(app.icon));
  console.log('adaptive fg     :', foreground);
  // The keys have to match setIconAsync's signature exactly. It reads
  //
  //     const adaptiveForegroundImage = foregroundImage ?? legacyIcon;
  //
  // so a misspelt key does not throw -- it silently falls back to the square
  // legacy icon, and the adaptive foreground comes out full-bleed and opaque
  // instead of the padded transparent artwork. Which is precisely what
  // happened when this passed `adaptiveIcon` instead of `foregroundImage`.
  await setIconAsync(projectRoot, {
    icon: abs(app.icon),
    foregroundImage: foreground,
    backgroundColor: adaptive.backgroundColor ?? null,
    backgroundImage: abs(adaptive.backgroundImage),
    monochromeImage: abs(adaptive.monochromeImage),
    isAdaptive: Boolean(foreground),
  });

  // ── Splash screen ─────────────────────────────────────────────────────────
  const splash = pluginProps('expo-splash-screen');
  if (splash.image) {
    const resolved = { ...splash, image: abs(splash.image) };
    console.log('splash image    :', resolved.image);
    await setSplashImageDrawablesAsync(getAndroidSplashConfig(resolved), projectRoot);
  }

  // ── expo-notifications small icon ─────────────────────────────────────────
  const notif = pluginProps('expo-notifications');
  if (notif.icon) {
    console.log('notification    :', abs(notif.icon));
    await setNotificationIconAsync(projectRoot, abs(notif.icon));
  }

  console.log('done');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
