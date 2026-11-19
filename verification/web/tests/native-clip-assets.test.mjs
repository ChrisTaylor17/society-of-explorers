import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, open, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { offlineApp } from './support/offline-app.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = name => readFile(join(root, name));
const registry = JSON.parse(await read('lib/clips/registry.json'));
const catalog = JSON.parse(await read('platforms/native/clip-catalog.json'));
const packager = 'platforms/native/prepare-clip-assets.cjs';
const policy = 'lib/clips/review-policy.cjs';
const load = path => createRequire(import.meta.url)(path).packageClipAssets;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function workspace(t) {
  const temp = await mkdtemp(join(await realpath('/tmp'), 'soe-native-clips-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  return temp;
}
async function packagingFixture(t) {
  const temp = await workspace(t);
  const files = [packager, policy, 'platforms/native/clip-catalog.json', 'lib/clips/registry.json'];
  for (const record of registry) {
    files.push(...[record.asset, record.captions, record.inspection].map(item => 'content/clips/' + item.path));
    const source = 'content/clips/' + record.source.path;
    try { await stat(join(root, source)); files.push(source); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  for (const file of new Set(files)) {
    const target = join(temp, file);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(root, file), target);
  }
  return temp;
}

test('phone credit, transcript, rights and file pins match the verified web clips', async () => {
  const { approvedMedia } = offlineApp().load('lib/clips/server.ts');
  const approved = await approvedMedia();
  assert.deepEqual(catalog.videos.map(clip => clip.id), ['how-a-circle-works', 'night-sky-traffic', 'telescope-first-tilt', 'which-height', 'new-species']);
  for (const clip of catalog.videos) {
    const web = approved.find(item => item.id === clip.id);
    assert(web);
    for (const key of ['title', 'description', 'credit', 'sourcePage', 'durationMs', 'transcript']) assert.equal(clip[key], web[key], key);
    assert.deepEqual(clip.attribution, JSON.parse(JSON.stringify(web.attribution ?? null)));
    assert.equal(clip.mediaSHA256, web.media.sha256);
    assert.equal(clip.mediaBytes, web.media.bytes);
    assert.equal(clip.captionsSHA256, web.captions.sha256);
  }
});

test('the shared packaging step copies exactly the five pinned derivatives and can safely rerun', async t => {
  const dest = join(await workspace(t), 'resources');
  const pack = load(join(root, packager));
  for (let attempt = 0; attempt < 2; attempt++) {
    pack(dest);
    assert.deepEqual((await readdir(dest)).sort(), ['soe_circle_intro.mp4', 'soe_elt_tilt.mp4', 'soe_new_species.mp4', 'soe_night_sky.mp4', 'soe_which_height.mp4']);
    for (const clip of catalog.videos) assert.equal(hash(await readFile(join(dest, clip.resource + '.mp4'))), clip.mediaSHA256);
  }
  const extra = join(dest, 'unreviewed.mp4');
  await writeFile(extra, 'Synthetic extra clip');
  assert.throws(() => pack(dest), /Unexpected SoE clip resource/);
  assert.equal(await readFile(extra, 'utf8'), 'Synthetic extra clip');
});

test('a tampered derivative prevents all media from entering a new build', async t => {
  const temp = await packagingFixture(t);
  const changed = join(temp, 'content/clips/night-sky-traffic.mp4');
  const bytes = await readFile(changed);
  bytes[bytes.length - 1] ^= 1;
  await writeFile(changed, bytes);
  const dest = join(temp, 'resources');
  assert.throws(() => load(join(temp, packager))(dest), /SoE clip bytes changed/);
  await assert.rejects(stat(dest), { code: 'ENOENT' });
});

test('repinning a changed rights receipt cannot bypass the shared web and phone review', async t => {
  const temp = await packagingFixture(t);
  const { verifyClip } = offlineApp().load('lib/clips/server.ts');
  const pack = load(join(temp, packager));
  const registryPath = join(temp, 'lib/clips/registry.json'), catalogPath = join(temp, 'platforms/native/clip-catalog.json');
  const originalRegistry = await readFile(registryPath), originalCatalog = await readFile(catalogPath);
  const scenarios = [
    ['expired approval', 'night-sky-traffic', (_entry, facts) => { facts.rights.validUntil = '2026-11-01T00:00:00Z'; }],
    ['withdrawn approval', 'night-sky-traffic', (_entry, facts) => { facts.rights.decision = 'withdrawn'; }],
    ['US-only component', 'night-sky-traffic', (_entry, facts) => { facts.rights.components[0].territories = ['US']; }],
    ['no commercial permission', 'night-sky-traffic', (_entry, facts) => { facts.rights.components[0].permissions = ['display', 'excerpt', 'reencode', 'captions']; }],
    ['no excerpt permission', 'night-sky-traffic', entry => { entry.review.permissions = ['display', 'reencode', 'captions', 'commercial']; }],
    ['no source credit inspection', 'night-sky-traffic', (_entry, facts) => { facts.checks = facts.checks.filter(check => check !== 'visible-source-credit'); }],
    ['first-party external assets', 'how-a-circle-works', (_entry, facts) => { facts.externalAssets = true; }],
    ['unreviewed source pair', 'night-sky-traffic', (entry, facts, clip) => {
      entry.source.pageUrl = 'https://example.invalid/unreviewed'; entry.source.mediaUrl = 'https://example.invalid/unreviewed.mp4';
      facts.rights.sourcePage = entry.source.pageUrl; facts.rights.sourceMedia = entry.source.mediaUrl; clip.sourcePage = entry.source.pageUrl;
    }],
    ['future review date', 'night-sky-traffic', (entry, facts) => { entry.review.checkedAt = '2099-01-01T00:00:00Z'; facts.rights.checkedAt = entry.review.checkedAt; }],
    ['source pin differs from inspection', 'night-sky-traffic', (_entry, facts) => { facts.sourceSha256 = '0'.repeat(64); }],
    ['wrong component policy', 'night-sky-traffic', (_entry, facts) => { facts.rights.components[0].policyUrl = 'https://example.invalid/license'; }],
    ['unknown review mode', 'night-sky-traffic', entry => { entry.review.mode = 'trust-me'; }],
  ];
  for (const [name, id, mutate] of scenarios) await t.test(name, async () => {
    const entries = JSON.parse(originalRegistry), phone = JSON.parse(originalCatalog);
    const entry = entries.find(item => item.id === id), clip = phone.videos.find(item => item.id === id);
    const inspectionPath = join(temp, 'content/clips', entry.inspection.path), originalInspection = await readFile(inspectionPath);
    try {
      const facts = JSON.parse(originalInspection); mutate(entry, facts, clip);
      const changed = Buffer.from(JSON.stringify(facts));
      await writeFile(inspectionPath, changed); entry.inspection.bytes = changed.length; entry.inspection.sha256 = hash(changed);
      await writeFile(registryPath, JSON.stringify(entries)); await writeFile(catalogPath, JSON.stringify(phone));
      assert.equal(await verifyClip(entry, { territory: null }, join(temp, 'content/clips')), null);
      const dest = join(temp, 'refused-' + id);
      assert.throws(() => pack(dest), /SoE clip/);
      await assert.rejects(stat(dest), { code: 'ENOENT' });
    } finally {
      await writeFile(inspectionPath, originalInspection); await writeFile(registryPath, originalRegistry); await writeFile(catalogPath, originalCatalog);
    }
  });
});

test('time-limited permission stays web-only because bundled phone clips work offline', async t => {
  const temp = await packagingFixture(t), entries = structuredClone(registry);
  const entry = entries.find(item => item.id === 'night-sky-traffic');
  const inspectionPath = join(temp, 'content/clips', entry.inspection.path), facts = JSON.parse(await readFile(inspectionPath));
  facts.rights.validUntil = new Date(Date.now() + 86_400_000).toISOString();
  const bytes = Buffer.from(JSON.stringify(facts)); entry.inspection.bytes = bytes.length; entry.inspection.sha256 = hash(bytes);
  await writeFile(inspectionPath, bytes); await writeFile(join(temp, 'lib/clips/registry.json'), JSON.stringify(entries));
  const { verifyClip } = offlineApp().load('lib/clips/server.ts');
  assert(await verifyClip(entry, { territory: null }, join(temp, 'content/clips')));
  const dest = join(temp, 'time-limited-resources');
  assert.throws(() => load(join(temp, packager))(dest), /SoE clip/);
  await assert.rejects(stat(dest), { code: 'ENOENT' });
});

test('duplicate review identities and changed source bytes stop a phone build', async t => {
  const temp = await packagingFixture(t), pack = load(join(temp, packager));
  const entries = structuredClone(registry), registryPath = join(temp, 'lib/clips/registry.json');
  entries.push(structuredClone(entries[0])); await writeFile(registryPath, JSON.stringify(entries));
  assert.throws(() => pack(join(temp, 'duplicate')), /SoE clip/);
  await writeFile(registryPath, JSON.stringify(registry));
  const originalSource = join(temp, 'content/clips/eso2607d-source.mp4'), changed = await readFile(originalSource);
  changed[changed.length - 1] ^= 1; await writeFile(originalSource, changed);
  assert.throws(() => pack(join(temp, 'changed-source')), /SoE clip bytes changed/);
  await assert.rejects(stat(join(temp, 'changed-source')), { code: 'ENOENT' });
});

test('a web review that expires while media is read refuses the completed bytes', async t => {
  const temp = await packagingFixture(t), entries = structuredClone(registry);
  const entry = entries.find(item => item.id === 'night-sky-traffic');
  const inspectionPath = join(temp, 'content/clips', entry.inspection.path), facts = JSON.parse(await readFile(inspectionPath));
  let now = Date.now(); const expires = now + 1_000;
  facts.rights.validUntil = new Date(expires).toISOString();
  const bytes = Buffer.from(JSON.stringify(facts)); entry.inspection.bytes = bytes.length; entry.inspection.sha256 = hash(bytes);
  await writeFile(inspectionPath, bytes);
  const app = offlineApp(); let crossedExpiry = false;
  app.setMock('node:fs/promises', () => ({ realpath, open: async (filename, ...args) => {
    const handle = await open(filename, ...args);
    return { stat: () => handle.stat(), close: () => handle.close(), read: async (...readArgs) => {
      const result = await handle.read(...readArgs);
      if (filename.endsWith('/' + entry.asset.path)) { now = expires; crossedExpiry = true; }
      return result;
    } };
  } }));
  const { verifyClip } = app.load('lib/clips/server.ts');
  assert.equal(await verifyClip(entry, { territory: null, get now() { return now; } }, join(temp, 'content/clips')), null);
  assert.equal(crossedExpiry, true);
});
