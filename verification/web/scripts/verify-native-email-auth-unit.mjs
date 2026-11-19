// Exact cached SDK and canonical native email source proof; no provider operations.
import assert from 'node:assert/strict';
import { lstat, readFile, writeFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const runtime = '/Users/christaylor/Documents/Codex/2026-11-03/soe-supporter/runtime/web/node_modules/';
const sha = value => createHash('sha256').update(value).digest('hex');
async function bytes(file) { const s = await lstat(file); assert(s.isFile() && !s.isSymbolicLink() && (!s.size || s.blocks), 'Refuse linked/offloaded input ' + file); return readFile(file); }
const sources = ['platforms/native/src/auth/email-auth.ts', 'platforms/native/src/auth/email-auth-types.ts', 'platforms/native/src/auth/native-auth-ports.ts',
  'platforms/native/src/auth/owned-auth.ts', 'platforms/native/src/circles/native-ports.ts', 'platforms/native/src/circles/android-member.ts',
  'platforms/tests/email-auth.test.mjs', 'platforms/tests/native-auth-ports.test.mjs', 'platforms/tests/owned-auth.test.mjs', 'platforms/tests/load-source.mjs',
  'platforms/native/android/member-config.cjs', 'platforms/native/android/app/src/main/java/com/anonymous/soesyntheticdemo/member/MemberTransport.kt',
  'platforms/native/android/app/src/main/java/com/anonymous/soesyntheticdemo/member/MemberConfig.kt', 'platforms/native/android/app/src/main/java/com/anonymous/soesyntheticdemo/member/NativeSoeMemberModule.kt',
  'verification/web/scripts/verify-native-email-auth-unit.mjs', 'verification/web/scripts/deny-build-network.cjs', 'eslint.config.mjs'];
const sdkFiles = ['index.js', 'AuthClient.js', 'AuthAdminApi.js', 'GoTrueClient.js', 'GoTrueAdminApi.js', 'lib/fetch.js', 'lib/constants.js', 'lib/version.js', 'lib/helpers.js', 'lib/errors.js', 'lib/base64url.js', 'lib/types.js', 'lib/local-storage.js', 'lib/locks.js', 'lib/polyfills.js', 'lib/web3/ethereum.js', 'lib/webauthn.js', 'lib/webauthn.errors.js'];
const runtimePaths = { node: await realpath(process.execPath), typescript: runtime + 'typescript/lib/typescript.js', eslint: runtime + 'eslint/bin/eslint.js',
  'auth-package': runtime + '@supabase/auth-js/package.json', 'tslib-package': runtime + 'tslib/package.json', tslib: runtime + 'tslib/tslib.js',
  ...Object.fromEntries(sdkFiles.map(name => ['auth:' + name, runtime + '@supabase/auth-js/dist/main/' + name])) };
assert.equal(JSON.parse(await bytes(runtimePaths['auth-package'])).version, '2.99.3');
assert.equal(JSON.parse(await bytes(runtimePaths['tslib-package'])).version, '2.8.1');
async function sourceHashes() {
  const result = {};
  async function bind(name) {
    if (result[name]) return; const content = await bytes(root + name); result[name] = sha(content);
    if (!/\.(?:ts|tsx)$/.test(name)) return;
    for (const match of content.toString().matchAll(/(?:import|export)\s[^;]*?\sfrom\s*['"]([^'"]+)['"]/g)) {
      const spec = match[1]; if (!spec.startsWith('.') && !spec.startsWith('@/')) continue;
      const target = spec.startsWith('@/') ? spec.slice(2) : path.normalize(path.join(path.dirname(name), spec));
      assert(!target.startsWith('../') && !target.split('/').includes('node_modules'));
      const candidate = /\.(?:ts|tsx|json)$/.test(target) ? target : ['.ts', '.tsx', '.json'].map(ext => target + ext).find(file => existsSync(root + file));
      assert(candidate, 'Missing local import ' + target); await bind(candidate);
    }
  }
  for (const name of sources) await bind(name); return result;
}
async function runtimeHashes() { const result = {}; for (const [name, path] of Object.entries(runtimePaths)) result[name] = { path, sha256: sha(await bytes(path)) }; return result; }
const before = await sourceHashes(), runtimeBefore = await runtimeHashes(), guard = root + 'verification/web/scripts/deny-build-network.cjs';
const groups = [
  { name: 'native-email-auth-unit', args: ['--require', guard, '--test', 'platforms/tests/email-auth.test.mjs', 'platforms/tests/native-auth-ports.test.mjs', 'platforms/tests/owned-auth.test.mjs'], expected: 56 },
  { name: 'native-email-auth-unit-lint', args: ['--require', guard, runtimePaths.eslint, 'platforms/native/src/auth/email-auth.ts', 'platforms/native/src/auth/email-auth-types.ts', 'platforms/native/src/auth/native-auth-ports.ts', 'platforms/tests/email-auth.test.mjs', 'verification/web/scripts/verify-native-email-auth-unit.mjs'] },
];
const checks = []; let cleanup = null;
for (const group of groups) {
  const result = spawnSync(process.execPath, group.args, { cwd: root, env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' }, encoding: 'utf8', timeout: 60000, maxBuffer: 4000000 });
  const output = (result.stdout ?? '') + (result.stderr ?? ''), passed = Number(output.match(/^# pass (\d+)$/m)?.[1] ?? 0), log = 'verification/web/evidence/' + group.name + '.log';
  await writeFile(root + log, output);
  if (group.expected) {
    const proof = JSON.parse(output.match(/NATIVE_EMAIL_AUTH_CLEANUP (\{[^\n]+\})/)?.[1] ?? 'null');
    if (proof) cleanup = { fixtures: proof.fixtures, closed: proof.closed, providerCalls: proof.providerCalls, syntheticOnly: true };
  }
  checks.push({ name: group.name, ok: result.status === 0 && (!group.expected || passed === group.expected), exitCode: result.status,
    expectedTests: group.expected ?? null, passedTests: group.expected ? passed : null, command: [process.execPath, ...group.args], cwd: root, log, logSha256: sha(output) });
  console.log(group.name, checks.at(-1).ok ? 'PASS' : 'FAIL', group.expected ? `${passed}/${group.expected}` : '');
}
const after = await sourceHashes(), runtimeAfter = await runtimeHashes(), sourceUnchanged = JSON.stringify(before) === JSON.stringify(after), runtimeUnchanged = JSON.stringify(runtimeBefore) === JSON.stringify(runtimeAfter);
const sourceMismatches = Object.keys(before).filter(name => before[name] !== after[name]);
const clean = cleanup?.fixtures === 42 && cleanup.closed === cleanup.fixtures && cleanup.providerCalls === 0;
const receipt = { status: checks.every(c => c.ok) && sourceUnchanged && runtimeUnchanged && clean ? 'PASS' : 'FAIL', verifiedAt: new Date().toISOString(),
  tests: 56, checks, cleanup, providerCalls: cleanup?.providerCalls ?? null, sourceUnchanged, sourceMismatches, runtimeUnchanged, sourceHashes: after, runtimeHashes: runtimeAfter,
  limits: ['22 new actual cached AuthClient2.99.3/controller/native-JS-port cases plus24 existing actual-SDK and10 existing native-auth policy regressions.',
    'Native encrypted storage, callback capture, lifecycle and provider replies are synthetic in these tests. Native source checks in prior policy cases are static only; Kotlin/Android compilation and hardware execution are not claimed.',
    'No email sent, provider account operation, installation, hosted configuration, production data or deployment. Real redirect allowlisting, mail delivery and installed Android callback routing remain external acceptance gates.',
    'Pending links may survive background in native protected storage; claimed scopes and SDK sessions are memory-only. A password write dispatched before retirement may still finish; no provider ordering or password-success claim.'] };
await writeFile(root + 'verification/web/evidence/native-email-auth-unit.json', JSON.stringify(receipt, null, 2) + '\n');
if (receipt.status !== 'PASS') process.exitCode = 1;
