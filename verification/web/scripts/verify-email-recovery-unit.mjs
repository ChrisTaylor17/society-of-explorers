// Exact cached SDK and canonical recovery source proof; no provider operations.
import assert from 'node:assert/strict';
import { lstat, readFile, writeFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const runtime = '/Users/christaylor/Documents/Codex/2026-11-03/soe-supporter/runtime/web/node_modules/';
const sha = value => createHash('sha256').update(value).digest('hex');
async function bytes(file) { const s = await lstat(file); assert(s.isFile() && !s.isSymbolicLink() && (!s.size || s.blocks), 'Refuse linked/offloaded input ' + file); return readFile(file); }
const sources = ['lib/auth/emailRecovery.ts', 'lib/ids/uuid.ts', 'app/auth/recovery/Recovery.tsx', 'app/auth/recovery/page.tsx', 'app/auth/recovery/recovery.module.css',
  'verification/web/tests/email-recovery.test.mjs', 'verification/web/scripts/verify-email-recovery-unit.mjs', 'verification/web/scripts/deny-build-network.cjs', 'eslint.config.mjs'];
const sdkFiles = ['index.js', 'AuthClient.js', 'AuthAdminApi.js', 'GoTrueClient.js', 'GoTrueAdminApi.js', 'lib/fetch.js', 'lib/constants.js', 'lib/version.js', 'lib/helpers.js', 'lib/errors.js', 'lib/base64url.js', 'lib/types.js', 'lib/local-storage.js', 'lib/locks.js', 'lib/polyfills.js', 'lib/web3/ethereum.js', 'lib/webauthn.js', 'lib/webauthn.errors.js'];
const runtimePaths = { node: await realpath(process.execPath), typescript: runtime + 'typescript/lib/typescript.js', eslint: runtime + 'eslint/bin/eslint.js',
  'auth-package': runtime + '@supabase/auth-js/package.json', 'tslib-package': runtime + 'tslib/package.json', tslib: runtime + 'tslib/tslib.js',
  ...Object.fromEntries(sdkFiles.map(name => ['auth:' + name, runtime + '@supabase/auth-js/dist/main/' + name])) };
assert.equal(JSON.parse(await bytes(runtimePaths['auth-package'])).version, '2.99.3');
assert.equal(JSON.parse(await bytes(runtimePaths['tslib-package'])).version, '2.8.1');
async function sourceHashes() { const result = {}; for (const name of sources) result[name] = sha(await bytes(root + name)); return result; }
async function runtimeHashes() { const result = {}; for (const [name, path] of Object.entries(runtimePaths)) result[name] = { path, sha256: sha(await bytes(path)) }; return result; }
const before = await sourceHashes(), runtimeBefore = await runtimeHashes(), guard = root + 'verification/web/scripts/deny-build-network.cjs';
const groups = [
  { name: 'email-recovery-unit', args: ['--require', guard, '--test', 'verification/web/tests/email-recovery.test.mjs'], expected: 19 },
  { name: 'email-recovery-unit-lint', args: ['--require', guard, runtimePaths.eslint, 'lib/auth/emailRecovery.ts', 'app/auth/recovery/Recovery.tsx', 'app/auth/recovery/page.tsx', 'verification/web/tests/email-recovery.test.mjs', 'verification/web/scripts/verify-email-recovery-unit.mjs'] },
];
const checks = []; let cleanup = null, sdkRuntimeBound = false;
for (const group of groups) {
  const result = spawnSync(process.execPath, group.args, { cwd: root, env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' }, encoding: 'utf8', timeout: 60000, maxBuffer: 4000000 });
  const output = (result.stdout ?? '') + (result.stderr ?? ''), passed = Number(output.match(/^# pass (\d+)$/m)?.[1] ?? 0), log = 'verification/web/evidence/' + group.name + '.log';
  await writeFile(root + log, output);
  if (group.expected) {
    const proof = JSON.parse(output.match(/EMAIL_RECOVERY_PROOF (\{[^\n]+\})/)?.[1] ?? 'null');
    if (proof) { cleanup = { fixtures: proof.fixtures, closed: proof.closed, providerCalls: proof.providerCalls, syntheticOnly: proof.syntheticOnly };
      sdkRuntimeBound = Object.entries(proof.runtimeHashes).every(([path, hash]) => Object.values(runtimeBefore).some(value => value.path === path && value.sha256 === hash)); }
  }
  checks.push({ name: group.name, ok: result.status === 0 && (!group.expected || passed === group.expected), exitCode: result.status,
    expectedTests: group.expected ?? null, passedTests: group.expected ? passed : null, command: [process.execPath, ...group.args], cwd: root, log, logSha256: sha(output) });
  console.log(group.name, checks.at(-1).ok ? 'PASS' : 'FAIL', group.expected ? `${passed}/${group.expected}` : '');
}
const after = await sourceHashes(), runtimeAfter = await runtimeHashes(), sourceUnchanged = JSON.stringify(before) === JSON.stringify(after), runtimeUnchanged = JSON.stringify(runtimeBefore) === JSON.stringify(runtimeAfter);
const clean = cleanup?.fixtures === 30 && cleanup.closed === cleanup.fixtures && cleanup.providerCalls === 0;
const receipt = { status: checks.every(c => c.ok) && sourceUnchanged && runtimeUnchanged && clean && sdkRuntimeBound ? 'PASS' : 'FAIL', verifiedAt: new Date().toISOString(),
  tests: 19, checks, cleanup, providerCalls: cleanup?.providerCalls ?? null, sdkRuntimeBound, sourceUnchanged, runtimeUnchanged, sourceHashes: after, runtimeHashes: runtimeAfter,
  limits: ['Actual cached AuthClient2.99.3 and canonical controller; browser storage, locks, time and provider HTTP are synthetic in these unit cases.',
    'No email was sent and no real provider, account, deployment or native device was contacted. Hosted redirect allowlisting, mail delivery and production behavior remain unverified.',
    'The browser proof separately exercises real Web Locks, StrictMode, DOM callbacks and BroadcastChannel isolation. Unit tests do not claim browser integration.',
    'Recovery is memory-only after one local verifier claim. Provider writes already dispatched may finish after timeout or leaving; no durable write journal, delivery ordering or password-success claim is provided.'] };
await writeFile(root + 'verification/web/evidence/email-recovery-unit.json', JSON.stringify(receipt, null, 2) + '\n');
if (receipt.status !== 'PASS') process.exitCode = 1;
