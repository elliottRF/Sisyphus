// Regenerate ONLY the Android launcher icons from assets/, using the same
// generator `expo prebuild` uses.
//
// Why not just run prebuild: it rewrites the whole android/ directory, and this
// project has hand-made changes in there -- the release signingConfig that
// throws rather than silently falling back to the debug key, among others. This
// calls the one piece that matters and leaves everything else alone.
//
//   node scripts/regen-android-icons.js
//
// Run it whenever assets/icon.png or assets/adaptive.png changes. Nothing does
// this automatically in a bare workflow, which is how the shipped builds ended
// up carrying an icon four days older than the artwork.
const path = require('path');
const {
  setIconAsync,
} = require('@expo/prebuild-config/build/plugins/icons/withAndroidIcons');

const projectRoot = path.resolve(__dirname, '..');
const app = require(path.join(projectRoot, 'app.json')).expo;

const icon = app.icon && path.resolve(projectRoot, app.icon);
const adaptive = (app.android && app.android.adaptiveIcon) || {};
const foreground = adaptive.foregroundImage && path.resolve(projectRoot, adaptive.foregroundImage);
const background = adaptive.backgroundImage && path.resolve(projectRoot, adaptive.backgroundImage);
const backgroundColor = adaptive.backgroundColor != null ? adaptive.backgroundColor : null;
const monochrome = adaptive.monochromeImage && path.resolve(projectRoot, adaptive.monochromeImage);

(async () => {
  console.log('icon           :', icon);
  console.log('foreground     :', foreground);
  console.log('backgroundColor:', backgroundColor);
  await setIconAsync(projectRoot, {
    icon,
    backgroundColor,
    backgroundImage: background || null,
    isAdaptive: Boolean(foreground),
    adaptiveIcon: foreground || null,
    monochromeIcon: monochrome || null,
  });
  console.log('launcher icons regenerated');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
