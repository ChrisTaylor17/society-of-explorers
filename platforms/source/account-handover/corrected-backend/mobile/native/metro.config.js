const path = require("path");
const fs = require("fs");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const mobileRoot = path.resolve(projectRoot, "..");
const repoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);
// Metro must index the physical target when dependencies are linked from an
// isolated runtime outside the source roots. No machine-specific path is stored.
const dependenciesRoot = fs.realpathSync(path.resolve(projectRoot, "node_modules"));
config.watchFolders = [...new Set([mobileRoot, repoRoot, dependenciesRoot])];
config.resolver.nodeModulesPaths = [dependenciesRoot];

const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const name =
    moduleName.endsWith(".ts") && !moduleName.endsWith(".d.ts") ? moduleName.slice(0, -3) : moduleName;
  if (upstream) return upstream(context, name, platform);
  return context.resolveRequest(context, name, platform);
};

module.exports = config;
