const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

const purchasesMockPath = path.resolve(
  __dirname,
  "__mocks__/react-native-purchases.ts",
);

const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
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
