// Wraps app.json so we can conditionally include native-only config plugins.
// EAS builds for iOS/Android always have these packages installed, so the
// plugins run as expected. Web/Replit preview environments may skip the native
// dependency, in which case loading the plugin throws a PluginError.
//
// Plugins guarded here:
//   - react-native-purchases   (RevenueCat — iOS/Android IAP)
//   - expo-apple-authentication (Sign In with Apple — iOS only)

const NATIVE_ONLY_PLUGINS = [
  "react-native-purchases",
  "expo-apple-authentication",
];

function isAvailable(pkg) {
  try {
    // For react-native-purchases the entry point is app.plugin.js; for others
    // require.resolve on the package name itself is sufficient.
    require.resolve(pkg.includes("/") ? pkg : `${pkg}/app.plugin`);
    return true;
  } catch {
    try {
      require.resolve(pkg);
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = ({ config }) => {
  const unavailable = NATIVE_ONLY_PLUGINS.filter((p) => !isAvailable(p));

  if (unavailable.length === 0) {
    return config;
  }

  return {
    ...config,
    plugins: (config.plugins || []).filter((plugin) => {
      const name = Array.isArray(plugin) ? plugin[0] : plugin;
      return !unavailable.includes(name);
    }),
  };
};
