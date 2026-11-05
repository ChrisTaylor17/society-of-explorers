'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { memberConfig } = require('../android/member-config.cjs');
const { packageClipAssets } = require('../prepare-clip-assets.cjs');
const sceneClass = 'SoeMemberSceneDelegate';
const callbackType = 'org.soe.member.email';
const sceneRole = 'UIWindowSceneSessionRoleApplication';
const defaultScene = '$(PRODUCT_MODULE_NAME).SceneDelegate';
const delegateDeclaration = /^class AppDelegate: (?:ExpoAppDelegate|SoeMemberAppDelegate), ExpoReactNativeFactoryProvider \{$/gm;
const ownedDelegate = 'class AppDelegate: SoeMemberAppDelegate, ExpoReactNativeFactoryProvider {';
const expoImport = /^(?:internal )?import Expo$/m;

function patchAppDelegate(source) {
  const normalized = source.replace(/\r\n/g, '\n');
  if (Array.from(normalized.matchAll(delegateDeclaration)).length !== 1 || !expoImport.test(normalized)
      || !normalized.includes('return super.application(application, didFinishLaunchingWithOptions: launchOptions)')
      || /\.startReactNative\s*\(|func\s+application\([\s\S]*?\b(?:open\s+\w+:\s*URL|(?:continue|didUpdate)\s+\w+:\s*NSUserActivity)/.test(normalized)) {
    throw Error('Expected the Expo SDK 58 scene-based AppDelegate for SoE.');
  }
  const result = normalized.replace(delegateDeclaration, ownedDelegate);
  return /^import SoeMember$/m.test(result) ? result : result.replace(expoImport, '$&\nimport SoeMember');
}

function publicString(info, key) {
  if (!Object.hasOwn(info, key)) return '';
  const value = info[key];
  if (typeof value !== 'string' || value.trim() !== value) throw Error('Invalid installed SoE policy.');
  return value;
}

function configureInfoPlist(info, bundleID) {
  if (typeof bundleID !== 'string' || bundleID.length > 255 || bundleID.trim() !== bundleID
      || !/^[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+)+$/.test(bundleID)) {
    throw Error('A valid iOS bundle identifier is required for SoE.');
  }
  const policy = memberConfig(publicString(info, 'SoeMemberOrigin'), publicString(info, 'SoeMemberStorageKey'),
    publicString(info, 'SoeProviderOrigin'), publicString(info, 'SoePublishableKey'));
  const readerOrigin = Object.hasOwn(info, 'SoeReaderOrigin') ? publicString(info, 'SoeReaderOrigin') : policy.origin;
  if (readerOrigin) memberConfig(readerOrigin, 'reader');
  const manifest = info.UIApplicationSceneManifest;
  const configs = manifest?.UISceneConfigurations;
  const scenes = configs?.[sceneRole];
  if (manifest?.UIApplicationSupportsMultipleScenes !== false || !Array.isArray(scenes) || scenes.length !== 1
      || Object.keys(configs).length !== 1 || ![defaultScene, sceneClass].includes(scenes[0]?.UISceneDelegateClassName)) {
    throw Error('Expected the Expo SDK 58 single-window scene manifest for SoE.');
  }
  const types = info.CFBundleURLTypes ?? [];
  if (!Array.isArray(types) || types.some(type => !Array.isArray(type?.CFBundleURLSchemes)
      || type.CFBundleURLSchemes.some(scheme => typeof scheme !== 'string'))) {
    throw Error('Invalid iOS URL type configuration.');
  }
  const callbackScheme = bundleID.toLowerCase() + '.email';
  const urlTypes = types.filter(type => type.CFBundleURLName !== callbackType);
  if (urlTypes.some(type => type.CFBundleURLSchemes.some(scheme => scheme.toLowerCase() === callbackScheme))) {
    throw Error('The SoE email callback scheme already belongs to another URL type.');
  }
  if (policy.providerOrigin) {
    urlTypes.push({ CFBundleURLName: callbackType, CFBundleTypeRole: 'Editor', CFBundleURLSchemes: [callbackScheme] });
  }
  const result = {
    ...info,
    UIApplicationSceneManifest: {
      ...manifest,
      UISceneConfigurations: { [sceneRole]: [{ ...scenes[0], UISceneDelegateClassName: sceneClass }] },
    },
  };
  if (readerOrigin) result.SoeReaderOrigin = readerOrigin;
  if (urlTypes.length || Object.hasOwn(info, 'CFBundleURLTypes')) result.CFBundleURLTypes = urlTypes;
  return result;
}

function packageReaderPins(projectRoot) {
  projectRoot = fs.realpathSync(projectRoot);
  const catalog = path.resolve(projectRoot, '../../lib/books/source-reader-catalog.json');
  const stat = fs.lstatSync(catalog);
  if (!stat.isFile() || !stat.blocks || stat.size < 1 || stat.size > 262144 || fs.realpathSync(catalog) !== catalog) {
    throw Error('The canonical SoE reader catalog must be a resident bounded file.');
  }
  const pod = path.join(projectRoot, 'ios-source');
  if (!fs.lstatSync(pod).isDirectory()) throw Error('Invalid SoE reader pod directory.');
  const generated = path.join(pod, 'generated');
  fs.mkdirSync(generated, { recursive: true });
  if (!fs.lstatSync(generated).isDirectory()) throw Error('Invalid SoE reader resource directory.');
  const temp = fs.mkdtempSync(path.join(generated, '.catalog-'));
  const staging = path.join(temp, 'source-reader-catalog.json');
  try {
    const bytes = fs.readFileSync(catalog);
    if (bytes.length !== stat.size) throw Error('The canonical SoE reader catalog changed while packaging.');
    fs.writeFileSync(staging, bytes, { flag: 'wx' });
    fs.renameSync(staging, path.join(generated, 'source-reader-catalog.json'));
  } finally {
    if (fs.existsSync(staging)) fs.unlinkSync(staging);
    fs.rmdirSync(temp);
  }
}

function withSoeIOSHost(config) {
  const { withAppDelegate, withDangerousMod, withInfoPlist } = require('expo/config-plugins');
  const bundleID = config.ios?.bundleIdentifier;
  config = withInfoPlist(config, mod => {
    // Before prebuild the introspection placeholder has no scene manifest.
    if (mod.modRequest.introspect) return mod;
    mod.modResults = configureInfoPlist(mod.modResults, bundleID);
    return mod;
  });
  config = withAppDelegate(config, mod => {
    if (mod.modResults.language !== 'swift') throw Error('SoE requires the Swift iOS application delegate.');
    mod.modResults.contents = patchAppDelegate(mod.modResults.contents);
    return mod;
  });
  return withDangerousMod(config, ['ios', mod => {
    packageReaderPins(mod.modRequest.projectRoot);
    packageClipAssets(path.join(fs.realpathSync(mod.modRequest.projectRoot), 'ios-source', 'generated', 'clips'));
    return mod;
  }]);
}

module.exports = withSoeIOSHost;
module.exports.configureInfoPlist = configureInfoPlist;
module.exports.patchAppDelegate = patchAppDelegate;
module.exports.packageReaderPins = packageReaderPins;
