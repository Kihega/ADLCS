// babel.config.js — required by Metro/Expo bundler
// Without this file Metro cannot transform TypeScript, JSX, or
// inline process.env.EXPO_PUBLIC_* variables.  Hermes will then
// crash with "import.meta is not supported" on the first file
// that uses environment variables.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        "babel-preset-expo",
        {
          // Enables process.env.EXPO_PUBLIC_* inlining for Hermes
          // (replaces the deprecated unstable_transformImportMeta flag)
          jsxImportSource: "react",
        },
      ],
    ],
  };
};
