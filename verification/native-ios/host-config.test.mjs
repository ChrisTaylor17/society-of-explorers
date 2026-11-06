import assert from 'node:assert/strict';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { configureInfoPlist, packageReaderPins, patchAppDelegate } from '../../platforms/native/plugins/with-soe-ios-host.cjs';

const appID = 'org.soe.syntheticHost';
const scheme = 'org.soe.synthetichost.email';
const role = 'UIWindowSceneSessionRoleApplication';
const template = () => ({
  UIApplicationSceneManifest: {
    UIApplicationSupportsMultipleScenes: false,
    UISceneConfigurations: {
      [role]: [{ UISceneConfigurationName: 'Default Configuration',
        UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate' }],
    },
  },
});
const member = { SoeMemberOrigin: 'https://soe.invalid', SoeMemberStorageKey: 'soe-session' };
const provider = { SoeProviderOrigin: 'https://auth.invalid', SoePublishableKey: 'sb_publishable_syntheticHostTestKey00' };
const publicURLType = { CFBundleURLName: 'expo', CFBundleURLSchemes: ['expo-test'] };

test('the unconfigured local shell installs the owned scene with no auth scheme or reader origin', () => {
  const input = template();
  const output = configureInfoPlist(input, appID);
  assert.equal(output.UIApplicationSceneManifest.UISceneConfigurations[role][0].UISceneDelegateClassName, 'SoeMemberSceneDelegate');
  assert.equal(input.UIApplicationSceneManifest.UISceneConfigurations[role][0].UISceneDelegateClassName, '$(PRODUCT_MODULE_NAME).SceneDelegate');
  assert.equal(output.CFBundleURLTypes, undefined);
  assert.equal(output.SoeReaderOrigin, undefined);
});

test('installed public configuration adds one dedicated callback and preserves other URL types', () => {
  const output = configureInfoPlist({ ...template(), ...member, ...provider, CFBundleURLTypes: [publicURLType] }, appID);
  assert.deepEqual(output.CFBundleURLTypes, [publicURLType, {
    CFBundleURLName: 'org.soe.member.email', CFBundleTypeRole: 'Editor', CFBundleURLSchemes: [scheme],
  }]);
  assert.equal(output.SoeReaderOrigin, member.SoeMemberOrigin);
  assert.deepEqual(configureInfoPlist(output, appID), output);
  const { SoeProviderOrigin, SoePublishableKey, ...memberOnly } = output;
  assert.deepEqual(configureInfoPlist(memberOnly, appID).CFBundleURLTypes, [publicURLType]);
});

test('a separately configured public reader needs neither a member nor an auth provider', () => {
  const output = configureInfoPlist({ ...template(), SoeReaderOrigin: 'https://reader.invalid' }, appID);
  assert.equal(output.SoeReaderOrigin, 'https://reader.invalid');
  assert.equal(output.CFBundleURLTypes, undefined);
  assert.throws(() => configureInfoPlist({ ...template(), SoeReaderOrigin: 'https://reader.invalid/content' }, appID));
});

test('malformed, incomplete, or privileged settings never become installed policy', () => {
  for (const settings of [
    { ...provider }, { ...member, SoeProviderOrigin: provider.SoeProviderOrigin },
    { ...member, SoeMemberStorageKey: 'soe-session\n' }, { ...member, SoeMemberOrigin: null },
    { ...member, ...provider, SoePublishableKey: 'sb_secret_syntheticHostTestKey00' },
    { ...member, SoeMemberOrigin: 'https://soe.invalid:443' },
  ]) assert.throws(() => configureInfoPlist({ ...template(), ...settings }, appID));
  assert.throws(() => configureInfoPlist(template(), 'org.soe.\n'));
});

test('a competing owner for the reserved scheme or malformed URL types stops host configuration', () => {
  for (const CFBundleURLTypes of [
    [{ ...publicURLType, CFBundleURLSchemes: [scheme.toUpperCase()] }],
    [{ ...publicURLType, CFBundleURLSchemes: [3] }],
    [{}],
  ]) assert.throws(() => configureInfoPlist({ ...template(), ...member, ...provider, CFBundleURLTypes }, appID));
});

test('missing, multiple, or drifted scene configurations stop prebuild', () => {
  assert.throws(() => configureInfoPlist({}, appID));
  for (const mutate of [
    manifest => { manifest.UIApplicationSupportsMultipleScenes = true; },
    manifest => { manifest.UISceneConfigurations[role].push({}); },
    manifest => { manifest.UISceneConfigurations[role][0].UISceneDelegateClassName = 'OtherScene'; },
    manifest => { manifest.UISceneConfigurations.UIWindowSceneSessionRoleExternalDisplay = []; },
  ]) {
    const input = template();
    mutate(input.UIApplicationSceneManifest);
    assert.throws(() => configureInfoPlist(input, appID));
  }
});

test('the SDK 58 app delegate patch binds the factory to the main actor and updates older generated hosts', () => {
  const source = `internal import Expo
import React
class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {
  func launch() {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`;
  const output = patchAppDelegate(source.replaceAll('\n', '\r\n'));
  assert.match(output, /^import SoeMember$/m);
  assert.match(output, /AppDelegate: SoeMemberAppDelegate, @MainActor ExpoReactNativeFactoryProvider/);
  assert.equal(patchAppDelegate(output), output);
  assert.equal(patchAppDelegate(output.replace(', @MainActor ExpoReactNativeFactoryProvider', ', ExpoReactNativeFactoryProvider')), output);
  assert.throws(() => patchAppDelegate(source.replace('return super', 'factory.startReactNative()\nreturn super')));
  assert.throws(() => patchAppDelegate(source + '\nfunc application(_ app: UIApplication, open url: URL) {}'));
  assert.throws(() => patchAppDelegate(source.replace('ExpoAppDelegate', 'OtherAppDelegate')));
  assert.throws(() => patchAppDelegate(source + source));
});

test('the app config activates the host plugin and both podspecs resolve from the iOS-only module', () => {
  const root = new URL('../../platforms/native/', import.meta.url);
  const read = file => {
    const url = new URL(file, root);
    const stat = lstatSync(url);
    assert(stat.isFile() && stat.blocks > 0, 'expected a resident leaf');
    return readFileSync(url, 'utf8');
  };
  assert(read('app.json').includes('./plugins/with-soe-ios-host.cjs'));
  const moduleRoot = 'modules/soe-native-ios/';
  const local = JSON.parse(read(moduleRoot + 'expo-module.config.json'));
  assert.deepEqual(local.platforms, ['ios']);
  assert.deepEqual(local.apple.modules, []);
  assert.equal(JSON.parse(read(moduleRoot + 'package.json')).name, 'soe-native-ios');
  assert.equal(local.apple.podspecPath.length, 2);
  assert.match(read(moduleRoot + local.apple.podspecPath[0]), /s\.name = 'SoeMember'/);
  assert.match(read(moduleRoot + local.apple.podspecPath[1]), /'SoeSourceReaderPins' => \['generated\/source-reader-catalog.json'\]/);
});

test('both user activity update paths suppress reserved URLs before Expo forwarding (source check)', () => {
  const url = new URL('../../platforms/native/ios-member/SoeMemberAppDelegates.swift', import.meta.url);
  const stat = lstatSync(url);
  assert(stat.isFile() && stat.blocks > 0);
  const text = readFileSync(url, 'utf8');
  for (const handler of ['application', 'scene']) {
    const update = new RegExp(`func ${handler}\\([^\\n]+didUpdate userActivity: NSUserActivity\\) \\{([\\s\\S]*?)\\n    \\}`);
    const body = text.match(update)?.[1];
    assert(body);
    const guard = body.indexOf('SoeMemberIOSHost.consumeEmailLink(url, capture: false) { return }');
    assert(guard >= 0 && guard < body.indexOf(`super.${handler}(`));
  }
});

test('reader packaging copies the exact canonical bytes into the pod and repeats cleanly', () => {
  const root = mkdtempSync(join(tmpdir(), 'soe-ios-pins-'));
  try {
    const native = join(root, 'platforms/native');
    const reader = join(native, 'ios-source');
    const target = join(reader, 'generated/source-reader-catalog.json');
    const source = join(root, 'lib/books/source-reader-catalog.json');
    mkdirSync(reader, { recursive: true });
    mkdirSync(resolve(source, '..'), { recursive: true });
    const canonical = new URL('../../lib/books/source-reader-catalog.json', import.meta.url);
    const stat = lstatSync(canonical);
    assert(stat.isFile() && stat.blocks > 0);
    const pins = readFileSync(canonical);
    writeFileSync(source, pins);
    packageReaderPins(native);
    packageReaderPins(native);
    assert.deepEqual(readFileSync(target), pins);
    rmSync(source);
    symlinkSync(canonical, source);
    assert.throws(() => packageReaderPins(native), /resident bounded file/);
    assert.deepEqual(readFileSync(target), pins);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
