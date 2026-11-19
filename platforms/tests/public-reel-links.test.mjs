import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceLoader } from './load-source.mjs';

const origin = 'https://circles.test', path = '/clips/watch/';
const urls = ['night-sky-traffic', 'telescope-first-tilt', 'which-height'].map(id => origin + path + id);
const { observePublicAppLinks } = sourceLoader()('platforms/native/src/circles/public-reel-links.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

function fixture(initial = Promise.resolve(null), installedOrigin = origin) {
  let listener;
  const received = [];
  const off = observePublicAppLinks({
    getInitialURL: () => initial,
    addEventListener: (name, current) => {
      assert.equal(name, 'url');
      listener = current;
      return { remove: () => { listener = undefined; } };
    },
  }, installedOrigin, (link, cold) => received.push([link.kind === 'reel' ? link.reel : link.circleId, cold]));
  return { received, off, send: url => listener?.({ url }), subscribed: () => Boolean(listener) };
}

test('cold and warm delivery accept the exact three reviewed public addresses', async () => {
  const f = fixture(Promise.resolve(urls[0]));
  try {
    await tick();
    for (const url of urls.slice(1)) f.send(url);
    await tick();
    assert.deepEqual(f.received, [['night-sky-traffic', true], ['telescope-first-tilt', false], ['which-height', false]]);
  } finally { f.off(); }
});

test('different origins and unreviewed paths never become a Reel choice', async () => {
  const f = fixture();
  try {
    for (const url of ['http://circles.test'+path+'which-height', 'https://other.test'+path+'which-height',
      urls[0]+'?next=/dashboard', urls[0]+'#reel', urls[0]+'/', urls[0]+'\n',
      'https://user:pass@circles.test'+path+'which-height', 'https://circles.test:443'+path+'which-height',
      'https://circles.test/clips/./watch/which-height', origin+path+'%77hich-height',
      origin+path+'new-reel', origin+path+'constructor', origin+'/circles/secret',
      'org.soe.email://auth/callback?code=fixture', '', null]) f.send(url);
    await tick();
    assert.deepEqual(f.received, []);
  } finally { f.off(); }
});

test('a newer valid warm link wins over a late startup URL', async () => {
  const initial = deferred(), f = fixture(initial.promise);
  try {
    f.send(urls[1]);
    initial.resolve(urls[2]);
    await tick();
    assert.deepEqual(f.received, [['telescope-first-tilt', false]]);
  } finally { f.off(); }
});

test('retirement removes the listener and refuses a held launch reply', async () => {
  const initial = deferred(), f = fixture(initial.promise);
  f.off();
  initial.resolve(urls[0]);
  f.send(urls[1]);
  await tick();
  assert.equal(f.subscribed(), false);
  assert.deepEqual(f.received, []);
});

test('a build without an approved public origin never subscribes to links', async () => {
  for (const origin of ['', 'https://circles.test/path', 'http://circles.test']) {
    const f = fixture(Promise.resolve(urls[0]), origin);
    assert.equal(f.subscribed(), false);
    await tick();
    assert.deepEqual(f.received, []);
    f.off();
  }
});

const circle = '11111111-aaaa-4111-8111-111111111111';
const invite = origin + '/circles/invite/' + circle;

test('a fresh salon link replaces a late Reel launch and accepts only the installed canonical address', async () => {
  const initial = deferred(), f = fixture(initial.promise);
  try {
    for (const invalid of [invite + '/', invite + '?from=other', invite + '#extra', invite + '\n',
      invite.replace('https:', 'http:'), invite.replace('circles.test', 'wrong.test'),
      invite.replace('/invite/', '/'), invite.replace('aaaa', 'AAAA'), invite.replace('4111', '0111'),
      invite.replace('8111', '7111'), invite.replace('aaaa', '%61aaa')]) f.send(invalid);
    assert.deepEqual(f.received, []);
    f.send(invite);
    initial.resolve(urls[0]);
    await tick();
    assert.deepEqual(f.received, [[circle, false]]);
  } finally { f.off(); }
});
