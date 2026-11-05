// Current canonical browser selection proof plus existing auth/SIWE regressions.
// Real cached Next/SIWE/crypto and local PGlite; provider identity is synthetic.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url)), web = path.join(root, 'verification/web'), require = createRequire(root + 'package.json');
assert(process.execArgv.some(value => value.endsWith('/deny-build-network.cjs')));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function bytes(file) { const s = fs.lstatSync(file); assert(s.isFile() && !s.isSymbolicLink() && (!s.size || s.blocks), 'Refuse nonresident or linked input: ' + file); return fs.readFileSync(file); }
const runtime = new Set([fs.realpathSync(process.execPath)]), sources = new Set();
for (const extension of ['.js', '.json']) { const original = Module._extensions[extension]; Module._extensions[extension] = (module, file) => { bytes(file); runtime.add(file); return original(module, file); }; }
require('typescript'); require('next/server'); require('siwe'); require('ethers');
const bun = path.join(root, 'verification/web/tooling/node_modules/@oven/bun-darwin-aarch64/bin/bun'); bytes(bun); runtime.add(bun);
// Bind both the browser ESM and Node CJS cached dependency closures. Bun's
// security suites run one file per process to avoid cross-file module mocks.
const baseline = JSON.parse(bytes(path.join(web, 'evidence/web-login-baseline-fixture/source-manifest.json')));
for (const file of Object.keys(baseline.runtimeHashes)) { bytes(path.isAbsolute(file) ? file : path.join(root, file)); runtime.add(path.isAbsolute(file) ? file : path.join(root, file)); }
const pglite = path.join(web, 'tooling/node_modules/@electric-sql/pglite/dist');
for (const entry of fs.readdirSync(pglite, { withFileTypes: true })) {
  if (entry.isFile() && /\.(?:[cm]?js|wasm|data)$/.test(entry.name)) { const file = path.join(pglite, entry.name); bytes(file); runtime.add(file); }
}
for (const name of ['verification/web/tests/support/public-profile-app.mjs', 'verification/web/tests/support/bearer-member-provisioning-app.mjs']) bytes(path.join(root, name));
process.chdir(web);
const { publicProfileAppHashes } = await import('../tests/support/public-profile-app.mjs');
const { provisioningHashes } = await import('../tests/support/bearer-member-provisioning-app.mjs');
const fixtureInputs = { ...await publicProfileAppHashes(), ...await provisioningHashes() };
for (const name of Object.keys(fixtureInputs)) sources.add(name);
const roots = [
  'lib/auth/browserIntent.ts', 'lib/auth/provider.ts', 'lib/getAuthenticatedMember.ts', 'lib/auth/siweNonce.ts', 'lib/auth/browserSignOut.ts', 'lib/auth/callbackSession.ts',
  'app/api/auth/provider/route.ts', 'app/api/auth/nonce/route.ts', 'app/api/auth/siwe/route.ts', 'app/auth/callback/route.ts', 'app/api/auth/ensure-member/route.ts', 'app/api/auth/logout/route.ts',
  'verification/web/tests/browser-intent.test.mjs', 'verification/web/tests/email-recovery-callback.test.mjs', 'verification/web/tests/account-security.test.mjs',
  'verification/web/tests/account-signout.test.mjs', 'verification/web/tests/bearer-member-provisioning.test.mjs', 'tests/security/s1-member-identity.test.ts',
  'tests/security/s3-siwe-nonce.test.ts', 'tests/security/s10-siwe-wallet-session.test.ts', 'tests/security/auth-request.ts',
  'verification/web/scripts/verify-browser-intent.mjs', 'verification/web/scripts/browser-intent-bun-guard.ts', 'verification/web/scripts/deny-build-network.cjs', 'eslint.config.mjs',
];
const visited = new Set();
function visit(name) {
  if (visited.has(name)) return; visited.add(name); sources.add(name); const text = bytes(path.join(root, name)).toString();
  if (!/\.[cm]?[jt]sx?$/.test(name)) return;
  const imports = [...text.matchAll(/(?:from\s*|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g)].map(match => match[1]);
  const loads = [...text.matchAll(/\.load\(['"]([^'"]+)['"]\)/g)].map(match => match[1]);
  for (const target of [...imports.map(spec => spec.startsWith('@/') ? spec.slice(2) : spec.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(name), spec)) : null), ...loads]) {
    if (!target || target.includes('/node_modules/') || target.startsWith('../')) continue;
    const candidate = (path.extname(target) ? [target] : ['.ts', '.tsx', '.mjs', '.js', '.json'].map(ext => target + ext)).find(value => fs.existsSync(path.join(root, value)));
    assert(candidate, 'Missing source: ' + target); visit(candidate);
  }
}
for (const name of roots) visit(name);
const sourceHashes = () => Object.fromEntries([...sources].sort().map(name => [name, sha(bytes(path.join(root, name)))]));
const runtimeHashes = () => Object.fromEntries([...runtime].sort().map(file => [file, sha(bytes(file))]));
const before = sourceHashes(), runtimeBefore = runtimeHashes(), startedAt = new Date().toISOString();
const guard = path.join(root, 'verification/web/scripts/deny-build-network.cjs');
const groups = [
  { name: 'browser-intent-current', cwd: root, executable: process.execPath, args: ['--require', guard, '--test', 'verification/web/tests/browser-intent.test.mjs', 'verification/web/tests/email-recovery-callback.test.mjs'], tests: 34 },
  { name: 'browser-intent-existing-account', cwd: web, executable: process.execPath, args: ['--require', guard, '--test', 'tests/account-security.test.mjs', 'tests/account-signout.test.mjs', 'tests/bearer-member-provisioning.test.mjs'], tests: 68 },
  ...[['s1', 's1-member-identity', 7], ['s3', 's3-siwe-nonce', 6], ['s10', 's10-siwe-wallet-session', 10]].map(([name, file, tests]) => ({ name: 'browser-intent-' + name, cwd: root, executable: bun,
    args: ['test', '--no-env-file', '--no-install', '--preload', guard, '--preload', './verification/web/scripts/browser-intent-bun-guard.ts', 'tests/security/' + file + '.test.ts'], tests, bun: true })),
  { name: 'browser-intent-lint', cwd: root, executable: process.execPath, args: ['--require', guard, 'node_modules/eslint/bin/eslint.js', ...roots.filter(name => !name.startsWith('tests/security/') && !name.endsWith('.cjs') && name !== 'eslint.config.mjs')], tests: null },
];
const checks = []; let proof = null;
for (const group of groups) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(group.executable, group.args, { cwd: group.cwd, env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; const timer = setTimeout(() => child.kill('SIGKILL'), 120000);
    child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
    child.once('error', error => { clearTimeout(timer); reject(error); }); child.once('close', code => { clearTimeout(timer); resolve({ code, output }); });
  });
  const passed = group.bun ? Number(result.output.match(/\n\s*(\d+) pass\n/)?.[1]) : Number(result.output.match(/^# pass (\d+)$/m)?.[1]);
  const failed = group.bun ? Number(result.output.match(/\n\s*(\d+) fail\n/)?.[1]) : Number(result.output.match(/^# fail (\d+)$/m)?.[1]);
  const log = 'verification/web/evidence/' + group.name + '.log'; fs.writeFileSync(path.join(root, log), result.output);
  if (group.name === 'browser-intent-current') proof = JSON.parse(result.output.match(/BROWSER_INTENT_PROOF (\{[^\n]+\})/)?.[1] ?? 'null');
  let bunInputsBound = true;
  if (group.bun) {
    const loaded = JSON.parse(result.output.match(/BROWSER_INTENT_BUN_INPUTS (\{[^\n]+\})/)?.[1] ?? 'null');
    bunInputsBound = !!loaded && loaded.loaded > 0 && Object.entries(loaded.hashes).every(([file, hash]) => before[path.relative(root, file)] === hash || runtimeBefore[file] === hash);
  }
  checks.push({ name: group.name, ok: result.code === 0 && (group.tests === null || passed === group.tests && failed === 0) && bunInputsBound,
    tests: group.tests, passed: group.tests === null ? null : passed, failed: group.tests === null ? null : failed, exitCode: result.code, bunInputsBound,
    cwd: group.cwd, command: [group.executable, ...group.args], log, logSha256: sha(bytes(path.join(root, log))) });
  console.log(group.name, checks.at(-1).ok ? 'PASS' : 'FAIL', group.tests === null ? '' : passed + '/' + group.tests);
}
const after = sourceHashes(), runtimeAfter = runtimeHashes();
const sourceUnchanged = JSON.stringify(before) === JSON.stringify(after), runtimeUnchanged = JSON.stringify(runtimeBefore) === JSON.stringify(runtimeAfter);
const proofBound = !!proof && Object.entries(proof.sourceHashes).every(([name, hash]) => after[name] === hash) && Object.entries(proof.runtimeHashes).every(([file, hash]) => runtimeAfter[file] === hash);
const cleanup = proof && { fixtures: proof.fixtures, closed: proof.closed, providerCalls: proof.providerCalls };
const receipt = { status: checks.every(check => check.ok) && sourceUnchanged && runtimeUnchanged && proofBound && cleanup?.fixtures === cleanup?.closed && cleanup?.providerCalls === 0 ? 'PASS' : 'FAIL',
  startedAt, finishedAt: new Date().toISOString(), tests: 125, checks, sourceUnchanged, runtimeUnchanged, proofBound, cleanup,
  sourceHashes: after, runtimeHashes: runtimeAfter, sourceCount: sources.size, runtimeCount: runtime.size,
  scope: ['Browser intent and subject receipt, exact canonical member resolver/provider/SIWE/OAuth/setup/logout handlers, actual Next cookies and SIWE cryptography.',
    'Existing account safety, logout retirement, local subject-unique provisioning SQL and actual signature canonicalization regressions are included.',
    'Supabase verification and transport are synthetic; local PGlite contains disposable fixtures only. The three Bun suites run in separate processes to avoid shared mock contamination.'],
  limits: ['No live account, OAuth grant, wallet extension, email, provider credential, production SQL or deployment was used.',
    'Cookies received from already-dispatched older responses can deny newer access. Their receipts cannot authorize an older identity under the newer browser intent.',
    'SIWE nonce remains stateless within one intent and lifetime; this proves intent binding, not server-side one-use consumption.',
    'A sign-out SDK cleanup already dispatched before a newer intent may still remove auth state; later completion cannot claim current logout success or deliberately start another cleanup.',
    'These route/controller fixtures do not establish real browser storage, network or deployment acceptance; the separate browser composition proof covers local browser behavior.'] };
fs.writeFileSync(path.join(web, 'evidence/browser-intent-verification.json'), JSON.stringify(receipt, null, 2) + '\n');
if (receipt.status !== 'PASS') process.exitCode = 1;
