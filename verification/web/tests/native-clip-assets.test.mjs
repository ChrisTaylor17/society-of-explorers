import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
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
const load = path => createRequire(import.meta.url)(path).packageClipAssets;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function workspace(t) {
  const temp = await mkdtemp(join(await realpath('/tmp'), 'soe-native-clips-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  return temp;
}

test('phone credit, transcript, rights and file pins match the verified web clips', async () => {
  const { approvedMedia } = offlineApp().load('lib/clips/server.ts');
  const approved = await approvedMedia();
  assert.deepEqual(catalog.videos.map(clip => clip.id), ['how-a-circle-works', 'night-sky-traffic']);
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

test('the shared packaging step copies exactly two pinned derivatives and can safely rerun', async t => {
  const dest = join(await workspace(t), 'resources');
  const pack = load(join(root, packager));
  for (let attempt = 0; attempt < 2; attempt++) {
    pack(dest);
    assert.deepEqual((await readdir(dest)).sort(), ['soe_circle_intro.mp4', 'soe_night_sky.mp4']);
    for (const clip of catalog.videos) assert.equal(hash(await readFile(join(dest, clip.resource + '.mp4'))), clip.mediaSHA256);
  }
  const extra = join(dest, 'unreviewed.mp4');
  await writeFile(extra, 'Synthetic extra clip');
  assert.throws(() => pack(dest), /Unexpected SoE clip resource/);
  assert.equal(await readFile(extra, 'utf8'), 'Synthetic extra clip');
});

test('a tampered derivative prevents all media from entering a new build', async t => {
  const temp = await workspace(t);
  const files = [packager, 'platforms/native/clip-catalog.json', 'lib/clips/registry.json'];
  for (const clip of catalog.videos) {
    const record = registry.find(item => item.id === clip.id);
    files.push(...[record.asset, record.captions, record.inspection].map(item => 'content/clips/' + item.path));
  }
  for (const file of files) {
    const target = join(temp, file);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(root, file), target);
  }
  const changed = join(temp, 'content/clips/night-sky-traffic.mp4');
  const bytes = await readFile(changed);
  bytes[bytes.length - 1] ^= 1;
  await writeFile(changed, bytes);
  const dest = join(temp, 'resources');
  assert.throws(() => load(join(temp, packager))(dest), /SoE clip bytes changed/);
  await assert.rejects(stat(dest), { code: 'ENOENT' });
});
