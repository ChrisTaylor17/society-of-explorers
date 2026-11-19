// Source-bound actual SDK/SSR proof; all HTTP and browser surfaces are synthetic.
import assert from 'node:assert/strict';
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { root, loadWebAccount, runtimeBindings, sourceBindings } from '../tests/web-account-loader.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
async function bytes(path) { const info = await lstat(path); assert(info.isFile() && !info.isSymbolicLink() && (!info.size || info.blocks), 'Refuse linked/offloaded input: ' + path); return readFile(path); }
const runtime = '/Users/christaylor/Documents/Codex/2026-11-03/soe-supporter/runtime/web/node_modules/';
const node = await realpath(process.execPath), eslint = runtime + 'eslint/bin/eslint.js', guard = root + 'verification/web/scripts/deny-build-network.cjs';
loadWebAccount();
const sources = [...new Set([...Object.keys(sourceBindings), 'verification/web/tests/web-account-loader.mjs', 'verification/web/tests/web-account.test.mjs',
  'verification/web/scripts/verify-web-account-unit.mjs', 'verification/web/scripts/deny-build-network.cjs', 'eslint.config.mjs'])];
const runtimes = [...new Set([...Object.keys(runtimeBindings()), node, eslint, runtime + '@supabase/auth-js/package.json', runtime + '@supabase/ssr/package.json',
  runtime + '@supabase/ssr/dist/module/cookies.js', runtime + '@supabase/ssr/dist/module/utils/helpers.js'])];
assert.equal(JSON.parse(await bytes(runtime + '@supabase/auth-js/package.json')).version, '2.99.3');
assert.equal(JSON.parse(await bytes(runtime + '@supabase/ssr/package.json')).version, '0.9.0');
async function hashes(paths, prefix = '') { const result = {}; for (const path of paths) result[path] = sha(await bytes(prefix + path)); return result; }
const before = await hashes(sources, root), runtimeBefore = await hashes(runtimes);
const groups = [
  { name: 'web-account-unit', args: ['--require', guard, '--test', 'verification/web/tests/web-account.test.mjs'], expected: 20 },
  { name: 'web-account-unit-lint', args: ['--require', guard, eslint, 'lib/auth/webAccount.ts', 'verification/web/tests/web-account-loader.mjs', 'verification/web/tests/web-account.test.mjs', 'verification/web/scripts/verify-web-account-unit.mjs'] },
];
const checks = []; let proof = null;
for (const group of groups) {
  const result = spawnSync(node, group.args, { cwd: root, env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' }, encoding: 'utf8', timeout: 60000, maxBuffer: 4000000 });
  const output = (result.stdout ?? '') + (result.stderr ?? ''), passed = Number(output.match(/^# pass (\d+)$/m)?.[1] ?? 0), log = 'verification/web/evidence/' + group.name + '.log';
  await writeFile(root + log, output);
  if (group.expected) proof = JSON.parse(output.match(/WEB_ACCOUNT_PROOF (\{[^\n]+\})/)?.[1] ?? 'null');
  checks.push({ name: group.name, ok: result.status === 0 && (!group.expected || passed === group.expected), exitCode: result.status,
    expectedTests: group.expected ?? null, passedTests: group.expected ? passed : null, command: [node, ...group.args], cwd: root, log, logSha256: sha(output) });
  console.log(group.name, checks.at(-1).ok ? 'PASS' : 'FAIL', group.expected ? `${passed}/${group.expected}` : '');
}
const after = await hashes(sources, root), runtimeAfter = await hashes(runtimes);
const sourceUnchanged = JSON.stringify(before) === JSON.stringify(after), runtimeUnchanged = JSON.stringify(runtimeBefore) === JSON.stringify(runtimeAfter);
const sdkRuntimeBound = !!proof && Object.entries(proof.runtimeHashes).every(([path, hash]) => runtimeBefore[path] === hash);
const testedSourcesBound = !!proof && Object.entries(proof.sourceBindings).every(([path, hash]) => before[path] === hash);
const cleanup = proof && { fixtures: proof.fixtures, closed: proof.closed, observers: proof.cleanupObservers, timers: proof.cleanupTimers, providerCalls: proof.providerCalls };
const cleanupPassed = cleanup?.fixtures === 60 && cleanup.closed === cleanup.fixtures && cleanup.observers === 0 && cleanup.timers === 0 && cleanup.providerCalls === 0;
const receipt = { status: checks.every(check => check.ok) && sourceUnchanged && runtimeUnchanged && sdkRuntimeBound && testedSourcesBound && cleanupPassed ? 'PASS' : 'FAIL',
  verifiedAt: new Date().toISOString(), tests: 20, checks, cleanup, sourceUnchanged, runtimeUnchanged, sdkRuntimeBound, testedSourcesBound,
  sourceHashes: after, runtimeHashes: runtimeAfter,
  limits: ['Canonical controller and actual cached AuthClient2.99.3/SSR0.9 cookie storage execute. The pinned CJS SSR helper stands in for its ESM distribution entry; both entry bytes are bound, and separate browser composition exercises the production import.',
    'Provider HTTP, cookies, clocks, current-intent ownership, notifications and navigation are explicit synthetic boundaries in these controller tests. Canonical server routes, browser cookie transport and live providers are not exercised here.',
    'Google tests use the actual SDK authorization URL and secure S256 verifier generation, without visiting Google. Wallet UI/provider round trips are covered separately, apart from the no-listener-after-close controller case here.',
    'Timers and subscription cleanup cover controller-owned fixtures. DOM, real browser BroadcastChannel, production mail, credentials, database permissions and deployed behavior remain outside this proof.',
    'A late HTTP response may still overwrite browser session cookies; server current-intent selection receipts must independently prevent that response from selecting a retired account. These unit tests claim local publication/navigation fencing only.'] };
await writeFile(root + 'verification/web/evidence/web-account-unit.json', JSON.stringify(receipt, null, 2) + '\n');
if (receipt.status !== 'PASS') process.exitCode = 1;
