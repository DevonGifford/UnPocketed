const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");

const config = getDefaultConfig(__dirname);

// `withUniwindConfig` must stay the outermost wrapper. The CSS entry's location
// also sets the root Tailwind scans for class names, so `src/global.css` means
// everything under `src/` is covered.
module.exports = withUniwindConfig(config, {
  cssEntryFile: "./src/global.css",
  dtsFile: "./src/uniwind-types.d.ts",
});
