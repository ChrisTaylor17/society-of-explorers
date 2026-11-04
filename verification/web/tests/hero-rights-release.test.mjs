import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, lstatSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const archive = resolve(root, 'archive/unverified-hero-images');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const originalHashes = Object.entries(JSON.parse(read('docs/integration/web-import.json')).files)
  .filter(([path]) => /^public\/images\/hero-[a-z-]+\.jpeg$/.test(path));
const manifest = JSON.parse(read('archive/unverified-hero-images/manifest.json'));

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

test('all twelve archived originals retain independently pinned bytes and an unverified disposition', () => {
  assert.equal(originalHashes.length, 12);
  assert.equal(manifest.version, 1);
  assert.equal(manifest.assets.length, 12);
  assert.equal(new Set(manifest.assets.map((asset) => asset.originalPublicPath)).size, 12);
  const expectedArchivePaths = [];
  for (const [originalPath, expectedHash] of originalHashes) {
    const asset = manifest.assets.find((item) => item.originalPublicPath === originalPath);
    assert.ok(asset, originalPath);
    const expectedPath = `archive/unverified-hero-images/${originalPath.split('/').at(-1)}`;
    expectedArchivePaths.push(expectedPath);
    assert.equal(asset.archivePath, expectedPath);
    assert.equal(asset.sha256, expectedHash);
    assert.equal(asset.rightsStatus, 'not-verified');
    assert.equal(asset.publishable, false);
    assert.match(asset.introducedCommit, /^(15d0c253fabd1f1ac924a46a455c79eba2b76240|0f28773446905e8d18b906a6c090d7e5616f75b7)$/);
    const path = resolve(root, expectedPath);
    assert.ok(lstatSync(path).isFile(), `${expectedPath} must be a regular retained file`);
    const bytes = readFileSync(path);
    assert.equal(bytes.length, asset.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expectedHash);
    assert.equal(existsSync(resolve(root, originalPath)), false, originalPath);
  }
  assert.deepEqual(files(archive).filter((path) => path.endsWith('.jpeg')).map((path) => relative(root, path)).sort(), expectedArchivePaths.sort());
});

test('public files, active source and deployment configuration exclude the archived hero images', () => {
  const publicFiles = files(resolve(root, 'public'));
  assert.deepEqual(publicFiles.filter((path) => /\/hero-[^/]+\.jpe?g$/i.test(path)), []);
  const activeFiles = ['app', 'components', 'lib', 'public'].flatMap((dir) => files(resolve(root, dir)))
    .filter((path) => /\.(?:[cm]?[jt]sx?|css|html|json|svg|webmanifest)$/.test(path));
  for (const path of activeFiles) {
    const source = readFileSync(path, 'utf8');
    assert.doesNotMatch(source, /\/images\/hero-[\w-]+\.jpe?g/i, relative(root, path));
    assert.doesNotMatch(source, /archive\/unverified-hero-images/, relative(root, path));
  }
  const ignores = read('.vercelignore').split(/\r?\n/).map((line) => line.trim());
  assert.ok(ignores.includes('archive/unverified-hero-images/'));
  assert.doesNotMatch(read('next.config.ts'), /archive\/unverified-hero-images/);
});

test('the affected metadata uses the existing text share card and six backgrounds need no image URL', () => {
  for (const path of ['app/92b/layout.tsx', 'app/92b/fund/layout.tsx']) {
    const source = read(path);
    assert.match(source, /import \{ SHARE_OG_IMAGES, SHARE_TWITTER_IMAGES \} from '@\/lib\/site\/shareCard'/);
    assert.match(source, /images: SHARE_OG_IMAGES/);
    assert.match(source, /images: SHARE_TWITTER_IMAGES/);
  }
  for (const path of ['app/92b/page.tsx', 'app/92b/fund/page.tsx', 'app/renaissance/page.tsx', 'app/projects/page.tsx', 'app/salons/page.tsx', 'app/music-therapy/page.tsx']) {
    const source = read(path);
    assert.match(source, /backgroundImage: 'radial-gradient\([^'\n]+linear-gradient\(/, path);
    assert.doesNotMatch(source, /\/images\/hero-/);
  }
});
