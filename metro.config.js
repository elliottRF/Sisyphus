const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push("db", "lottie");

// Metro crawls every directory under the project root and then fs.watch()es it.
// Two of those trees it has no business in, and both break it on Windows, where
// the fallback watcher has no guard against a directory disappearing between the
// crawl and the watch call:
//
//  1. Gradle output inside node_modules. expo-modules-autolinking ships an
//     Android Gradle plugin, and a Gradle build continually creates and deletes
//     Kotlin incremental-compile caches under its build/ folder. Metro finds one
//     while crawling, calls fs.watch() on it a moment later, and by then Gradle
//     has removed it -> ENOENT, uncaught, the process exits. That crash is also
//     what leaves the file-map disk cache half-written, which is why the next
//     start reports "Unable to deserialize cloned data".
//
//     Scoped to .../android/.../build/ on purpose: node_modules/<pkg>/build also
//     holds packages' compiled JS, which Metro genuinely needs to resolve.
//
//  2. .claude/worktrees — git worktrees live inside the project, and each holds a
//     full second copy of the app plus its own node_modules. Crawling it doubles
//     startup for no benefit, and Metro would resolve modules out of it.
config.resolver.blockList = [
    /[\\/]node_modules[\\/].*[\\/]android[\\/].*[\\/]build[\\/].*/,
    /[\\/]\.claude[\\/]worktrees[\\/].*/,
];

module.exports = config;
