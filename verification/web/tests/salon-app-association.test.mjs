import assert from 'node:assert/strict';
import test from 'node:test';
import { offlineApp } from './support/offline-app.mjs';

const origin = 'https://salons.example.test';
const appleId = 'ABCDEFGHIJ.org.soe.fixture';
const androidPackage = 'org.soe.fixture';
const fingerprint = new Array(32).fill('AA').join(':');

test('the configured association keeps existing Reel paths and adds only the salon invitation namespace', async () => {
  const app = offlineApp();
  Object.assign(app.context.process.env, { SOE_REEL_LINK_ORIGIN: origin, SOE_REEL_IOS_APP_ID: appleId,
    SOE_REEL_ANDROID_PACKAGE: androidPackage, SOE_REEL_ANDROID_CERT_SHA256: fingerprint });
  const ios = app.load('app/.well-known/apple-app-site-association/route.ts').GET;
  const android = app.load('app/.well-known/assetlinks.json/route.ts').GET;
  const iosResult = ios(new Request(origin + '/.well-known/apple-app-site-association'));
  assert.equal(iosResult.status, 200);
  assert.deepEqual(await iosResult.json(), { applinks: { details: [{ appIDs: [appleId], components: [
    { '/': '/clips/watch/night-sky-traffic' }, { '/': '/clips/watch/telescope-first-tilt' },
    { '/': '/clips/watch/which-height' }, { '/': '/clips/watch/new-species' }, { '/': '/circles/invite/*' },
  ] }] } });
  const androidResult = android(new Request(origin + '/.well-known/assetlinks.json'));
  assert.equal(androidResult.status, 200);
  assert.deepEqual(await androidResult.json(), [{ relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: androidPackage, sha256_cert_fingerprints: [fingerprint] } }]);
  assert.equal(ios(new Request('https://different.test/.well-known/apple-app-site-association')).status, 404);
  delete app.context.process.env.SOE_REEL_LINK_ORIGIN;
  assert.equal(android(new Request(origin + '/.well-known/assetlinks.json')).status, 404);
});
