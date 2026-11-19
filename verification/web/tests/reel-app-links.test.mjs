import assert from 'node:assert/strict';
import test from 'node:test';
import { offlineApp } from './support/offline-app.mjs';

const origin = 'https://circles.test';
const apple = '/.well-known/apple-app-site-association', android = '/.well-known/assetlinks.json';
const appId = 'AAA1111111.org.soe.circle', pkg = 'org.soe.circle', cert = Array(32).fill('AB').join(':');
const config = {
  SOE_REEL_LINK_ORIGIN: origin, SOE_REEL_IOS_APP_ID: appId,
  SOE_REEL_ANDROID_PACKAGE: pkg, SOE_REEL_ANDROID_CERT_SHA256: cert,
};

function fixture(env = {}) {
  const app = offlineApp();
  Object.assign(app.context.process.env, env);
  return (path, base = origin, init) => app.load('app' + path + '/route.ts').GET(new Request(base + path, init));
}

test('both association routes stay unavailable until the exact release values are supplied', () => {
  for (const env of [{}, { SOE_REEL_LINK_ORIGIN: origin }, { ...config, SOE_REEL_LINK_ORIGIN: 'https://circles.test:444' }]) {
    const get = fixture(env);
    for (const path of [apple, android]) {
      const reply = get(path);
      assert.equal(reply.status, 404);
      assert.equal(reply.headers.get('cache-control'), 'no-store');
      assert.deepEqual(reply.headers.getSetCookie(), []);
    }
  }
});

test('the configured HTTPS origin serves only public app and certificate identities', async () => {
  const get = fixture(config);
  const ios = get(apple);
  assert.equal(ios.status, 200);assert.match(ios.headers.get('content-type'), /^application\/json/);
  assert.deepEqual(await ios.json(), { applinks: { details: [{
    appIDs: [appId], components: [
      { '/': '/clips/watch/night-sky-traffic' }, { '/': '/clips/watch/telescope-first-tilt' }, { '/': '/clips/watch/which-height' }, { '/': '/clips/watch/new-species' },
      { '/': '/circles/invite/*' },
    ],
  }] } });
  const other = get(android);
  assert.equal(other.status, 200);assert.match(other.headers.get('content-type'), /^application\/json/);
  assert.deepEqual(await other.json(), [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: [cert] },
  }]);
  assert.equal(other.headers.get('location'), null);
  assert.deepEqual(other.headers.getSetCookie(), []);
});

test('alias, plaintext origin and invalid bundle or fingerprint cannot claim an association', () => {
  const get = fixture(config);
  for (const url of ['https://other.test', 'http://circles.test', 'https://circles.test:444']) {
    for (const path of [apple, android]) {
      assert.equal(get(path, url, { headers: { host: 'circles.test', 'x-forwarded-host': 'circles.test' } }).status, 404);
    }
  }
  for (const app of ['org.soe.circle', 'aAA1111111.org.soe.circle', appId+'\n']) {
    assert.equal(fixture({ ...config, SOE_REEL_IOS_APP_ID: app })(apple).status, 404);
  }
  for (const fingerprint of [cert+'\n', cert.slice(0, -3), 'private-signing-key', '']) {
    assert.equal(fixture({ ...config, SOE_REEL_ANDROID_CERT_SHA256: fingerprint })(android).status, 404);
  }
  assert.equal(fixture({ ...config, SOE_REEL_ANDROID_PACKAGE: pkg+'\n' })(android).status, 404);
});
