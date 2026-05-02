// Wraps app.json so we can conditionally include the react-native-purchases
// config plugin. EAS builds for iOS/Android always have the package installed,
// so the plugin runs as expected. Web/Replit preview environments may skip the
// native dependency, in which case loading the plugin throws:
//   PluginError: Failed to resolve plugin for module react-native-purchases

module.exports = ({ config }) => {
  let purchasesPluginAvailable = false;
  try {
    require.resolve("react-native-purchases/app.plugin.js");
    purchasesPluginAvailable = true;
  } catch {
    // Package or its plugin entry is not installed in this environment.
  }

  if (purchasesPluginAvailable) {
    return config;
  }

  return {
    ...config,
    plugins: (config.plugins || []).filter((plugin) => {
      const name = Array.isArray(plugin) ? plugin[0] : plugin;
      return name !== "react-native-purchases";
    }),
  };
};
