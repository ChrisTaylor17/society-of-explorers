// Actual cached wallet parsing and controller flow; injected wallet and HTTP.
import assert from 'node:assert/strict';
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { root, loadWebAccount, runtimeBindings, sourceBindings } from '../tests/web-account-loader.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
async function bytes(path) { const info = await lstat(path); assert(info.isFile() && !info.isSymbolicLink() && (!info.size || info.blocks), 'Refuse linked/offloaded input: ' + path); return readFile(path); }
const runtime = '/Users/christaylor/Documents/Codex/2026-11-03/soe-supporter/runtime/web/node_modules/';
const node = await realpath(process.execPath), eslint = runtime + 'eslint/bin/eslint.js', guard = root + 'verification/web/scripts/deny-build-network.cjs';
const require = createRequire(root + 'package.json');
assert.equal(JSON.parse(await bytes(runtime + 'ethers/package.json')).version, '6.17.0');
assert.equal(JSON.parse(await bytes(runtime + 'siwe/package.json')).version, '3.0.0');
loadWebAccount(); require('ethers'); require('siwe');
const sources = [...new Set([...Object.keys(sourceBindings), 'verification/web/tests/web-account-loader.mjs', 'verification/web/tests/web-wallet.test.mjs',
  'verification/web/scripts/verify-web-wallet-unit.mjs', 'verification/web/scripts/deny-build-network.cjs', 'eslint.config.mjs'])];
const runtimes = [...new Set([...Object.keys(runtimeBindings()), node, eslint, runtime + 'ethers/package.json', runtime + 'siwe/package.json', runtime + '@supabase/auth-js/package.json', runtime + '@supabase/ssr/package.json',
  runtime + '@supabase/ssr/dist/module/cookies.js', runtime + '@supabase/ssr/dist/module/utils/helpers.js'])];
async function hashes(paths, prefix = '') { const result = {}; for (const path of paths) result[path] = sha(await bytes(prefix + path)); return result; }
const before = await hashes(sources, root), runtimeBefore = await hashes(runtimes), checks = []; let proof = null;
for (const group of [
  { name: 'web-wallet-unit', args: ['--require', guard, '--test', 'verification/web/tests/web-wallet.test.mjs'], expected: 9 },
  { name: 'web-wallet-unit-lint', args: ['--require', guard, eslint, 'verification/web/tests/web-wallet.test.mjs', 'verification/web/scripts/verify-web-wallet-unit.mjs'] },
]) {
  const result = spawnSync(node, group.args, { cwd: root, env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' }, encoding: 'utf8', timeout: 60000, maxBuffer: 4000000 });
  const output = (result.stdout ?? '') + (result.stderr ?? ''), passed = Number(output.match(/^# pass (\d+)$/m)?.[1] ?? 0), log = 'verification/web/evidence/' + group.name + '.log';
  await writeFile(root + log, output);
  if (group.expected) proof = JSON.parse(output.match(/WEB_WALLET_PROOF (\{[^\n]+\})/)?.[1] ?? 'null');
  checks.push({ name: group.name, ok: result.status === 0 && (!group.expected || passed === group.expected), exitCode: result.status,
    expectedTests: group.expected ?? null, passedTests: group.expected ? passed : null, command: [node, ...group.args], cwd: root, log, logSha256: sha(output) });
  console.log(group.name, checks.at(-1).ok ? 'PASS' : 'FAIL', group.expected ? `${passed}/${group.expected}` : '');
}
const after = await hashes(sources, root), runtimeAfter = await hashes(runtimes), sourceUnchanged = JSON.stringify(before) === JSON.stringify(after), runtimeUnchanged = JSON.stringify(runtimeBefore) === JSON.stringify(runtimeAfter);
const sdkRuntimeBound = !!proof && Object.entries(proof.runtimeHashes).every(([path, hash]) => runtimeBefore[path] === hash), testedSourcesBound = !!proof && Object.entries(proof.sourceBindings).every(([path, hash]) => before[path] === hash);
const cleanup = proof && { fixtures: proof.fixtures, closed: proof.closed, timers: proof.remainingTimers, observers: proof.remainingObservers, walletListeners: proof.remainingListeners, providerCalls: proof.providerCalls };
const cleanupPassed = cleanup?.fixtures === 26 && cleanup.closed === cleanup.fixtures && cleanup.timers === 0 && cleanup.observers === 0 && cleanup.walletListeners === 0 && cleanup.providerCalls === 0;
const receipt = { status: checks.every(check => check.ok) && sourceUnchanged && runtimeUnchanged && sdkRuntimeBound && testedSourcesBound && cleanupPassed ? 'PASS' : 'FAIL',
  verifiedAt: new Date().toISOString(), tests: 9, checks, cleanup, sourceUnchanged, runtimeUnchanged, sdkRuntimeBound, testedSourcesBound, sourceHashes: after, runtimeHashes: runtimeAfter,
  limits: ['Canonical wallet controller executes actual ethers6.17 address normalization and siwe3 message construction. Injected wallet prompts, signatures, events, current-intent storage, HTTP replies and navigation are synthetic.',
    'These cases prove controller behavior for popup blur/return/Continue, lifecycle retirement, changed accounts/networks, identity disagreements, duplicate Continue and throwing event adapters. They do not prove cryptographic signature verification, canonical server handlers or a real wallet extension.',
    'The removal-error fixture deletes its synthetic listener before throwing, proving remaining cleanup continues. A real extension that refuses to remove a listener may retain that callback; local closed/intent ownership checks must keep it inert, and physical extension cleanup is not claimed.',
    'No wallet transaction, provider sign-in, live network, production account, production database or device operation occurred. Browser composition and hosted acceptance remain separate gates.'] };
await writeFile(root + 'verification/web/evidence/web-wallet-unit.json', JSON.stringify(receipt, null, 2) + '\n');
if (receipt.status !== 'PASS') process.exitCode = 1;
