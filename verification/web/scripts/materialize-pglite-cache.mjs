// Restore an already-cached test dependency into an owned local cache. This is
// not an install/download and never mutates the shared runtime or product tree.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = path.resolve('.');
assert.equal(path.basename(root), 'soe-passages');
const require = createRequire('/opt/homebrew/lib/node_modules/npm/package.json');
const cache = require('cacache');
const key = 'make-fetch-happen:request-cache:https://registry.npmjs.org/@electric-sql/pglite/-/pglite-0.4.1.tgz';
const expected = 'sha512-mZ9NzzUSYPOCnxHH1oAHPRzoMFJHY472raDKwXl/+6oPbpdJ7g8LsCN4FSaIIfkiCKHhb3iF/Zqo3NYxaIhU7Q==';
const entry = await cache.get(path.join(process.env.HOME, '.npm/_cacache'), key);
assert.equal(entry.integrity, expected);
assert.equal('sha512-' + createHash('sha512').update(entry.data).digest('base64'), expected);
const owned = path.join(process.env.HOME, '.cache/soe-passages-test-runtime');
fs.mkdirSync(owned, { recursive: true });
const archive = path.join(owned, 'pglite-0.4.1.tgz');
if (!fs.existsSync(archive)) fs.writeFileSync(archive, entry.data, { flag: 'wx' });
assert.ok(fs.readFileSync(archive).equals(entry.data));
const target = path.join(owned, 'pglite-0.4.1');
assert.equal(fs.existsSync(target), false, 'Owned runtime already exists; verify it rather than overwrite it');
fs.mkdirSync(target);
const inventory = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n');
assert.ok(inventory.every(name => name.startsWith('package/') && !name.split('/').includes('..')));
execFileSync('tar', ['-xzf', archive, '--strip-components=1', '-C', target]);
const metadata = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
assert.equal(metadata.name, '@electric-sql/pglite'); assert.equal(metadata.version, '0.4.1');
const modules = path.join(root, 'tooling/node_modules');
assert.ok(fs.lstatSync(modules).isSymbolicLink());
const previous = fs.realpathSync(modules);
const overlay = path.join(owned, 'node_modules'); fs.mkdirSync(overlay);
for (const name of fs.readdirSync(previous)) {
  if (name === '@electric-sql') {
    const scope = path.join(overlay, name); fs.mkdirSync(scope);
    for (const child of fs.readdirSync(path.join(previous, name))) fs.symlinkSync(child === 'pglite' ? target : path.join(previous, name, child), path.join(scope, child));
  } else fs.symlinkSync(path.join(previous, name), path.join(overlay, name));
}
fs.unlinkSync(modules); fs.symlinkSync(overlay, modules);
const report = { status: 'PASS', purpose: 'Existing exact PGlite 0.4.1 restored from integrity-verified npm cache after shared package became dataless',
  package: metadata.name, version: metadata.version, archiveIntegrity: expected, archiveBytes: entry.data.length,
  network: 'Denied from process startup; no package install or download', ownedRuntime: owned,
  ownToolingLink: modules, previousSharedTarget: previous, sharedRuntimeChanged: false, candidateChanged: false };
fs.writeFileSync(path.join(root, 'evidence/materialized-test-runtime.json'), JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify(report) + '\n');
