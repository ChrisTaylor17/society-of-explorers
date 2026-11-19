import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const android = path.join(root, 'platforms/native/android');
const { validateReleaseConfig } = createRequire(import.meta.url)(path.join(android, 'release-policy.cjs'));
const { reelLinkHost } = createRequire(import.meta.url)(path.join(android, 'member-config.cjs'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const guard = path.join(root, 'verification/web/scripts/deny-build-network.cjs');

test('Reel App Links stay in the release overlay and match the installed HTTPS policy', () => {
  const manifest = variant => fs.readFileSync(path.join(android, 'app/src', variant, 'AndroidManifest.xml'), 'utf8');
  const release = manifest('release');
  const activity = fs.readFileSync(path.join(android, 'app/src/main/java/com/anonymous/soesyntheticdemo/MainActivity.kt'), 'utf8');
  const policy = fs.readFileSync(path.join(android, 'app/src/main/java/com/anonymous/soesyntheticdemo/PublicReelLink.kt'), 'utf8');
  const swift = fs.readFileSync(path.join(root, 'platforms/native/ios-member/SoePublicReelLink.swift'), 'utf8');
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'platforms/native/clip-catalog.json'), 'utf8'));
  const ids = catalog.videos.filter(clip => clip.attribution).map(clip => clip.id).sort();
  assert.deepEqual([...release.matchAll(/android:path="\/clips\/watch\/([^"]+)"/g)].map(match => match[1]).sort(), ids);
  for (const source of [policy, swift]) {
    assert.deepEqual([...source.matchAll(/slug == "([^"]+)"/g)].map(match => match[1]).sort(), ids);
  }
  assert.match(release, /android:autoVerify="\$\{soeReelLinkVerify\}"/);
  assert.match(release, /android:host="\$\{soeReelLinkHost\}"/);
  for (const variant of ['main', 'debug', 'synthetic']) assert.doesNotMatch(manifest(variant), /\/clips\/watch\//);
  assert.match(activity, /BuildConfig\.SOE_REEL_LINKS_ENABLED && incoming\.action == Intent\.ACTION_VIEW/);
  assert.match(activity, /data = reel\?\.let \{ Uri\.parse\(it\) \}\s+clipData = null/);
  assert.match(activity, /EmailLinkLifecycle\.capture\(applicationContext, raw\)/);
  assert.match(activity, /if \(BuildConfig\.SOE_REEL_LINKS_ENABLED\) putString\("soeReelLinkOrigin", BuildConfig\.SOE_MEMBER_ORIGIN\)/);
  assert.equal(reelLinkHost('https://circles.test'), 'circles.test');
  for (const origin of ['', 'https://127.0.0.1', 'https://circle', 'https://circles.test:444', 'http://circles.test']) {
    assert.throws(() => reelLinkHost(origin));
  }
});

function fixture(run) {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'soe-android-policy-'));
  const storeFile = path.join(dir, 'owned-release.jks');
  // This is not a signing key or an APK. It exercises descriptor byte policy.
  const store = Buffer.from('synthetic-keystore-fixture-not-a-real-key');
  fs.writeFileSync(storeFile, store, { mode: 0o600 });
  const descriptor = path.join(dir, 'release.json');
  const value = {
    version: 1, applicationId: 'org.societyofexplorers.circle',
    applicationIdOwnership: 'owner-confirmed', signingKeyOwnership: 'owner-confirmed',
    storeFile, storeSha256: sha(store), keyAlias: 'owned-release',
    storePassword: 'fixture-secret-store', keyPassword: 'fixture-secret-key',
  };
  const write = (data = value) => fs.writeFileSync(descriptor, JSON.stringify(data), { mode: 0o600 });
  write();
  try { return run({ dir, storeFile, descriptor, value, write }); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('release is blocked without an explicit descriptor; no environment fallback', () => {
  assert.throws(() => validateReleaseConfig(), /EXPLICIT_CONFIG_REQUIRED/);
});

test('explicit synthetic descriptor passes byte policy without returning passwords', () => fixture(f => {
  const result = validateReleaseConfig(f.descriptor);
  assert.equal(result.applicationId, f.value.applicationId);
  assert.equal(result.storeSha256, f.value.storeSha256);
  assert.equal(result.configSha256, sha(fs.readFileSync(f.descriptor)));
  assert.equal(JSON.stringify(result).includes('fixture-secret'), false);
  assert.equal(Object.hasOwn(result, 'storePassword'), false);
}));

test('placeholder, malformed and unconfirmed application identities fail closed', () => fixture(f => {
  for (const applicationId of ['com.anonymous.soesyntheticdemo', 'com.example.circle', 'com.owner.synthetic', 'single', 'com.1owner.app', 'org.owner.app\n']) {
    f.write({ ...f.value, applicationId });
    assert.throws(() => validateReleaseConfig(f.descriptor), /OWNED_APPLICATION_ID_REQUIRED/);
  }
  for (const key of ['applicationIdOwnership', 'signingKeyOwnership']) {
    f.write({ ...f.value, [key]: 'pending' });
    assert.throws(() => validateReleaseConfig(f.descriptor), /OWNERSHIP_CONFIRMATION_REQUIRED/);
  }
  f.write({ ...f.value, unknown: true });
  assert.throws(() => validateReleaseConfig(f.descriptor), /CONFIG_FIELDS_INVALID/);
}));

test('default debug alias, passwords, filenames and renamed bundled key are rejected', () => fixture(f => {
  for (const change of [{ keyAlias: 'androiddebugkey' }, { storePassword: 'android' }, { keyPassword: '' }, { keyPassword: 'secret\n' }, { storeFile: path.join(f.dir, 'debug.keystore') }]) {
    f.write({ ...f.value, ...change });
    assert.throws(() => validateReleaseConfig(f.descriptor), /NON_DEBUG_/);
  }
  const debug = fs.readFileSync(path.join(android, 'app/debug.keystore'));
  fs.writeFileSync(f.storeFile, debug);
  f.write({ ...f.value, storeSha256: sha(debug) });
  assert.throws(() => validateReleaseConfig(f.descriptor), /DEBUG_KEYSTORE_FORBIDDEN/);
}));

test('key replacement and descriptor replacement after configuration are rejected', () => fixture(f => {
  const original = validateReleaseConfig(f.descriptor);
  fs.writeFileSync(f.storeFile, 'different-synthetic-keystore');
  assert.throws(() => validateReleaseConfig(f.descriptor), /KEYSTORE_HASH_MISMATCH/);
  f.write({ ...f.value, storeSha256: sha(fs.readFileSync(f.storeFile)) });
  assert.throws(() => validateReleaseConfig(f.descriptor, { expectedSha256: original.configSha256 }), /CONFIG_CHANGED/);
}));

test('signing files require external private regular files without symlink aliases', () => fixture(f => {
  fs.chmodSync(f.descriptor, 0o644);
  assert.throws(() => validateReleaseConfig(f.descriptor), /CONFIG_PRIVATE_PERMISSIONS_REQUIRED/);
  fs.chmodSync(f.descriptor, 0o600);
  fs.chmodSync(f.storeFile, 0o644);
  assert.throws(() => validateReleaseConfig(f.descriptor), /KEYSTORE_PRIVATE_PERMISSIONS_REQUIRED/);
  fs.chmodSync(f.storeFile, 0o600);
  assert.throws(() => validateReleaseConfig(f.descriptor, { repositoryRoot: f.dir }), /CONFIG_MUST_BE_OUTSIDE_CHECKOUT/);
  const alias = path.join(f.dir, 'link.json');
  fs.symlinkSync(f.descriptor, alias);
  assert.throws(() => validateReleaseConfig(alias), /CONFIG_REGULAR_FILE_REQUIRED/);
  const keyAlias = path.join(f.dir, 'link.jks');
  fs.symlinkSync(f.storeFile, keyAlias);
  f.write({ ...f.value, storeFile: keyAlias });
  assert.throws(() => validateReleaseConfig(f.descriptor), /KEYSTORE_REGULAR_FILE_REQUIRED/);
}));

test('actual CLI rejects malformed secret-bearing JSON with sanitized output', () => fixture(f => {
  fs.writeFileSync(f.descriptor, '{"secret":"never-print-this-secret",BAD');
  const result = spawnSync(process.execPath, ['--require', guard, path.join(android, 'release-policy.cjs'), f.descriptor], {
    env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' }, encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'SOE_RELEASE_CONFIG_JSON_INVALID\n');
}));

test('actual CLI emits only non-secret metadata and rejects a stale configuration pin', () => fixture(f => {
  const invoke = (...extra) => spawnSync(process.execPath, ['--require', guard, path.join(android, 'release-policy.cjs'), f.descriptor, ...extra], {
    env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' }, encoding: 'utf8',
  });
  const valid = invoke();
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(valid.stdout.includes('fixture-secret'), false);
  const metadata = JSON.parse(valid.stdout);
  assert.equal(metadata.applicationId, f.value.applicationId);
  f.write({ ...f.value, keyAlias: 'changed-owned-alias' });
  const stale = invoke(metadata.configSha256);
  assert.equal(stale.status, 1);
  assert.equal(stale.stdout, '');
  assert.equal(stale.stderr, 'SOE_RELEASE_CONFIG_CHANGED\n');
}));

function parseXml(relative) {
  const filename = path.join(android, relative);
  const result = spawnSync('/usr/bin/python3', ['-c',
    'import sys,json,xml.etree.ElementTree as E\ndef tree(e):return {"tag":e.tag,"attrs":e.attrib,"children":[tree(c) for c in e]}\nprint(json.dumps(tree(E.parse(sys.argv[1]).getroot())))', filename], { encoding: 'utf8', env: {} });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
const androidAttr = name => `{http://schemas.android.com/apk/res/android}${name}`;
const toolsAttr = name => `{http://schemas.android.com/tools}${name}`;
const domains = ['root', 'file', 'database', 'sharedpref', 'external', 'device_root', 'device_file', 'device_database', 'device_sharedpref'];
function assertNoBackup(section) {
  assert.deepEqual(section.children.map(child => child.attrs.domain).sort(), [...domains].sort());
  for (const child of section.children) {
    assert.equal(child.tag, 'exclude');
    assert.equal(child.attrs.path, '.');
  }
}

test('parsed main manifest requests only internet and network state and disables backup with both resource formats', () => {
  const xml = parseXml('app/src/main/AndroidManifest.xml');
  assert.deepEqual(xml.children.filter(e => e.tag === 'uses-permission').map(e => e.attrs[androidAttr('name')]).sort(),
    ['android.permission.ACCESS_NETWORK_STATE', 'android.permission.INTERNET']);
  const app = xml.children.find(e => e.tag === 'application');
  assert.equal(app.attrs[androidAttr('allowBackup')], 'false');
  assert.equal(app.attrs[androidAttr('fullBackupContent')], '@xml/soe_backup_rules');
  assert.equal(app.attrs[androidAttr('dataExtractionRules')], '@xml/soe_data_extraction_rules');
  assert.equal(Object.hasOwn(app.attrs, androidAttr('backupAgent')), false);
});

test('parsed old/new backup rules cover every app domain and reject missing credential exclusions', () => {
  const legacy = parseXml('app/src/main/res/xml/soe_backup_rules.xml');
  assert.equal(legacy.tag, 'full-backup-content');
  assertNoBackup(legacy);
  const modern = parseXml('app/src/main/res/xml/soe_data_extraction_rules.xml');
  assert.equal(modern.tag, 'data-extraction-rules');
  assert.deepEqual(modern.children.map(e => e.tag), ['cloud-backup', 'device-transfer']);
  for (const section of modern.children) {
    assertNoBackup(section);
    const mutant = structuredClone(section);
    mutant.children = mutant.children.filter(e => e.attrs.domain !== 'sharedpref');
    assert.throws(() => assertNoBackup(mutant));
  }
});

test('release removes transitive storage/overlay requests while local debug fixtures remain explicit', () => {
  const release = parseXml('app/src/release/AndroidManifest.xml');
  const removed = release.children.filter(e => e.tag === 'uses-permission');
  assert.deepEqual(removed.map(e => e.attrs[androidAttr('name')]).sort(), ['READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'SYSTEM_ALERT_WINDOW', 'VIBRATE'].map(p => 'android.permission.' + p).sort());
  assert.ok(removed.every(e => e.attrs[toolsAttr('node')] === 'remove'));
  assert.equal(release.children.find(e => e.tag === 'application').attrs[androidAttr('usesCleartextTraffic')], 'false');
  for (const kind of ['debug', 'debugOptimized']) {
    const debug = parseXml(`app/src/${kind}/AndroidManifest.xml`);
    assert.equal(debug.children.find(e => e.tag === 'uses-permission').attrs[androidAttr('name')], 'android.permission.SYSTEM_ALERT_WINDOW');
  }
  const synthetic = parseXml('app/src/synthetic/AndroidManifest.xml');
  assert.equal(synthetic.children.find(e => e.tag === 'application').attrs[androidAttr('allowBackup')], 'false');
});

test('Gradle source wiring guards every release task and assigns no debug release signer (static, not AGP execution)', () => {
  const gradle = fs.readFileSync(path.join(android, 'app/build.gradle'), 'utf8');
  assert.match(gradle, /tasks\.configureEach/);
  assert.match(gradle, /task\.name\.toLowerCase\(java\.util\.Locale\.ROOT\)\.contains\('release'\)/);
  assert.match(gradle, /task\.dependsOn\(verifySoeReleaseConfiguration\)/);
  assert.match(gradle, /notCompatibleWithConfigurationCache/);
  assert.match(gradle, /doLast \{ validateSoeRelease\(soeReleaseMetadata\?\.configSha256\) \}/);
  const release = gradle.split('        release {')[1].split('\n        }')[0];
  assert.match(release, /signingConfig signingConfigs\.soeOwnedRelease/);
  assert.equal(release.includes('signingConfigs.debug'), false);
  assert.match(release, /debuggable false/);
  assert.match(gradle, /applicationId soeReleaseMetadata\?\.applicationId/);
  assert.equal(fs.readFileSync(path.join(android, 'release-policy.cjs'), 'utf8').includes('process.env'), false);
});
