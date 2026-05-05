const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Expose 'web' as a recognised platform so Metro tries module.web.tsx before
// module.tsx when bundling for web (Expo's getDefaultConfig only lists ios/android).
config.resolver.platforms = ["ios", "android", "web"];

const purchasesMockPath = path.resolve(
  __dirname,
  "__mocks__/react-native-purchases.ts",
);

// Expo's getDefaultConfig enables unstable_enablePackageExports, which causes
// Metro to resolve @clerk/clerk-react via its "import" export condition →
// dist/index.mjs. That ESM file chains into @clerk/shared/*.mjs chunks, and
// Metro 0.83.x fails to bundle that ESM graph for the web target. Force it to
// the CJS build instead, which bundles fine.
const clerkReactCjsPath = path.resolve(
  __dirname,
  "node_modules/@clerk/clerk-react/dist/index.js",
);

const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@clerk/clerk-react" && platform === "web") {
    return { type: "sourceFile", filePath: clerkReactCjsPath };
  }
  if (moduleName === "react-native-purchases" && platform === "web") {
    return { type: "sourceFile", filePath: purchasesMockPath };
  }
  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Metro's file watcher crashes (ENOENT) when pnpm leaves transient
// `*_tmp_<pid>` extract dirs behind under `node_modules/.pnpm/...`. This is
// known to happen on native add-ons and other large packages whose
// extract finishes after Metro has already started watching. Block those
// paths so a hot dep install can't tear down the dev server.
//
// Metro's `blockList` accepts a RegExp or an array of RegExps directly —
// no need for the (un-exported in newer metro-config) exclusionList helper.
const tmpBlock = /node_modules[\\/]\.pnpm[\\/].*_tmp_\d+([\\/].*)?$/;
const previousBlockList = config.resolver.blockList;
const previousList = Array.isArray(previousBlockList)
  ? previousBlockList
  : previousBlockList
    ? [previousBlockList]
    : [];
config.resolver.blockList = [tmpBlock, ...previousList];

module.exports = config;
