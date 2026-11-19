// Root cached SDK execution only; no native dependency walk or installation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
assert(process.execArgv.some(value => value.endsWith('/deny-build-network.cjs')), 'Startup network denial required');
const ROOT = fileURLToPath(new URL('../../../', import.meta.url)), require = createRequire(path.join(ROOT, 'package.json'));
function read(file) { const s = fs.lstatSync(file); assert(s.isFile() && !s.isSymbolicLink() && (!s.size || s.blocks), 'Refuse linked/offloaded source ' + file); return fs.readFileSync(file); }
const sha = value => createHash('sha256').update(value).digest('hex'), runtime = new Set();
for (const extension of ['.js', '.json']) {
  const original = Module._extensions[extension];
  Module._extensions[extension] = (module, file) => { read(file); runtime.add(file); return original(module, file); };
}
const authMeta = JSON.parse(read(path.join(ROOT, 'node_modules/@supabase/auth-js/package.json'))), tslibMeta = JSON.parse(read(path.join(ROOT, 'node_modules/tslib/package.json')));
assert.equal(authMeta.version, '2.99.3'); assert.equal(tslibMeta.version, '2.8.1');
require('@supabase/auth-js'); require('typescript');
const nativePackage = JSON.parse(read(path.join(ROOT, 'platforms/native/package.json'))), nativeLock = JSON.parse(read(path.join(ROOT, 'platforms/native/package-lock.json'))), rootLock = JSON.parse(read(path.join(ROOT, 'package-lock.json')));
assert.equal(nativePackage.dependencies['@supabase/auth-js'], '2.99.3'); assert.equal(nativeLock.packages[''].dependencies['@supabase/auth-js'], '2.99.3');
for (const name of ['node_modules/@supabase/auth-js', 'node_modules/tslib']) assert.deepEqual(nativeLock.packages[name], rootLock.packages[name]);
const names = new Set(), roots = ['platforms/native/src/auth/owned-auth.ts', 'platforms/native/src/auth/native-auth-ports.ts', 'platforms/native/src/circles/verified-member-session.ts',
  'platforms/tests/owned-auth.test.mjs', 'platforms/tests/load-source.mjs', 'platforms/native/package.json', 'platforms/native/package-lock.json',
  'verification/web/scripts/run-owned-auth-tests.mjs', 'verification/web/scripts/deny-build-network.cjs', 'node_modules/@supabase/auth-js/package.json', 'node_modules/tslib/package.json', 'node_modules/typescript/package.json'];
function visit(name) {
  if (names.has(name)) return; names.add(name); const data = read(path.join(ROOT, name));
  if (!/\.[cm]?[jt]sx?$/.test(name) || name.startsWith('node_modules/')) return;
  for (const match of data.toString().matchAll(/(?:from\s*|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g)) {
    const spec = match[1]; if (!spec.startsWith('.') && !spec.startsWith('@/')) continue;
    const relative = spec.startsWith('@/') ? spec.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(name), spec));
    assert(!relative.startsWith('../'));
    const candidate = (path.extname(relative) ? [relative] : ['.ts', '.tsx', '.mjs', '.js'].map(ext => relative + ext)).find(file => fs.existsSync(path.join(ROOT, file)));
    assert(candidate, 'Missing source ' + relative); visit(candidate);
  }
}
for (const name of roots) visit(name);
for (const file of runtime) assert(file.startsWith(ROOT) || file.startsWith('/Users/christaylor/Documents/Codex/2026-11-03/soe-supporter/runtime/web/node_modules/'), 'Unrecognized cached runtime dependency: ' + file);
const hashes = () => Object.fromEntries([...names].sort().map(name => [name, sha(read(path.join(ROOT, name)))]));
const runtimeHashes = () => Object.fromEntries([...runtime].sort().map(file => [file, sha(read(file))]));
const before = hashes(), runtimeBefore = runtimeHashes(), startedAt = new Date().toISOString(), args = ['--require', './verification/web/scripts/deny-build-network.cjs', '--test', 'platforms/tests/owned-auth.test.mjs'];
const result = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { cwd: ROOT, env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; const timer = setTimeout(() => child.kill('SIGKILL'), 30000);
  child.stdout.on('data', value => { output += value; }); child.stderr.on('data', value => { output += value; });
  child.once('error', error => { clearTimeout(timer); reject(error); }); child.once('close', code => { clearTimeout(timer); resolve({ code, output }); });
});
const log = 'verification/web/evidence/owned-auth-sdk-tests.log'; fs.writeFileSync(path.join(ROOT, log), result.output);
assert.equal(result.code, 0, result.output.slice(-6000));
for (const line of ['# tests 24\n', '# pass 24\n', '# fail 0\n', '# skipped 0\n']) assert(result.output.includes(line), line);
const after = hashes(); assert.deepEqual(after, before, 'Owned auth proof inputs changed');
const runtimeAfter = runtimeHashes(); assert.deepEqual(runtimeAfter, runtimeBefore, 'Loaded SDK/runtime changed');
const receipt = { status: 'PASS', startedAt, finishedAt: new Date().toISOString(), total: 24, passed: 24, failed: 0, skipped: 0, sourceCount: names.size,
  sourcesBefore: before, sourcesAfter: after, unchanged: true, command: [process.execPath, ...args], log: { path: log, sha256: sha(read(path.join(ROOT, log))) },
  runtime: { node: process.version, executable: process.execPath, executableSHA256: sha(read(process.execPath)), authSDK: authMeta.version, tslib: tslibMeta.version,
    loadedModuleCount: runtime.size, hashesBefore: runtimeBefore, hashesAfter: runtimeAfter, unchanged: true },
  scope: 'Actual cached AuthClient 2.99.3, owned-auth TypeScript, native auth/member ports and verified owner execute with synthetic provider replies and a native epoch/storage/handle double. Exact native package/lock metadata is copied from the materialized root lock without installation.',
  limits: ['No issued credentials, provider calls, mail, production data, package install or download.', 'No native SDK bundle, Kotlin/Hermes/Codegen compilation, hardware keystore, real networking or device acceptance claim.',
    'Background or timeout can follow an already-dispatched protected storage write; the write may finish, but in-memory authority is cleared and explicit resume requires fresh exact-token verification.',
    'Explicit durable local clear is independently confirmed or marked unknown. It does not revoke provider sessions.', 'Node startup denies external networking; child environment contains only PATH. No raw provider/client errors or credentials enter controller models.'] };
fs.writeFileSync(path.join(ROOT, 'verification/web/evidence/owned-auth-sdk-tests.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ status: 'PASS', tests: 24, sourceCount: names.size, runtimeModules: runtime.size, unchanged: true }));
