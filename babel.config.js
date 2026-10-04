module.exports = function (api) {
  api.cache(true);
  return {
    // Uniwind needs no Babel plugin — it transforms CSS in Metro and augments
    // React Native's own component types, so `className` works on the stock
    // components without a custom JSX runtime.
    presets: ["babel-preset-expo"],
  };
};
