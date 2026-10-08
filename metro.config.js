const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");

const config = getDefaultConfig(__dirname);

/*
 * `expo-sqlite` on web runs SQLite as WebAssembly inside a worker, and its
 * worker imports `wa-sqlite.wasm` directly. Metro's default `assetExts` has no
 * `wasm` entry — not Uniwind's doing; Expo's own default config omits it too —
 * so the import fails to resolve, the worker chunk is never emitted, and the
 * serializer aborts with "Worker chunk not found". The page then serves a blank
 * body, which reads as the unrelated Uniwind mount bug rather than as this.
 *
 * Native is unaffected either way: there the database is a native module and
 * nothing touches the wasm build.
 */
config.resolver.assetExts.push("wasm");

// `withUniwindConfig` must stay the outermost wrapper. The CSS entry's location
// also sets the root Tailwind scans for class names, so `src/global.css` means
// everything under `src/` is covered.
module.exports = withUniwindConfig(config, {
  cssEntryFile: "./src/global.css",
  dtsFile: "./src/uniwind-types.d.ts",
});
