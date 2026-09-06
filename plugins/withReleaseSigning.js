const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Re-applies the release signing config to android/app/build.gradle on every prebuild.
 *
 * `expo prebuild` clears the android directory and regenerates build.gradle from
 * Expo's template. That template has no keystore handling and points the release
 * buildType at the DEBUG signing config, so without this the command silently
 * produces a debug-signed release APK — one the Play Store rejects, and which
 * cannot upgrade an already-installed copy. It also used to delete the keystore
 * itself, which is why release.keystore and keystore.properties now live at the
 * project root, outside anything prebuild touches.
 *
 * Paths are resolved from `rootProject` (the android/ directory), so '../' is the
 * project root.
 */

const LOADER = `
// Injected by plugins/withReleaseSigning.js — do not hand-edit, prebuild rewrites
// this file. Both the keystore and its properties live at the project root so
// that clearing android/ cannot remove them.
def keystorePropertiesFile = rootProject.file('../keystore.properties')
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
`;

const RELEASE_SIGNING_CONFIG = `        release {
            if (!keystorePropertiesFile.exists()) {
                // Fail loudly rather than quietly falling back to the debug key.
                throw new GradleException("keystore.properties not found at the project root — a release build would otherwise be debug-signed.")
            }
            storeFile rootProject.file("../\${keystoreProperties['storeFile']}")
            storePassword keystoreProperties['storePassword']
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
        }
`;

module.exports = function withReleaseSigning(config) {
    return withAppBuildGradle(config, (cfg) => {
        let src = cfg.modResults.contents;

        // Idempotent: prebuild can run the plugin against a file we already patched.
        if (!src.includes('keystorePropertiesFile')) {
            src = src.replace(
                /apply plugin: "com\.facebook\.react"\n/,
                (m) => m + LOADER
            );
        }

        if (!src.includes('signingConfigs.release')) {
            // Add a `release` block alongside the template's `debug` one.
            src = src.replace(
                /(signingConfigs \{[\s\S]*?\n)(    \})/,
                (_m, body, close) => body + RELEASE_SIGNING_CONFIG + close
            );
            // And point the release buildType at it instead of the debug key.
            src = src.replace(
                /(buildTypes \{[\s\S]*?release \{[\s\S]*?)signingConfig signingConfigs\.debug/,
                '$1signingConfig signingConfigs.release'
            );
        }

        cfg.modResults.contents = src;
        return cfg;
    });
};
