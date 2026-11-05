// Narrow local backend proof. It never applies SQL to an external database.
import assert from 'node:assert/strict';
import { lstat, readFile, writeFile, realpath } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const web = fileURLToPath(new URL('../', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function bytes(filename) {
  const info = await lstat(filename);
  assert(info.isFile() && !info.isSymbolicLink() && (!info.size || info.blocks), 'Refuse linked/offloaded input: ' + filename);
  return readFile(filename);
}
const runtimePaths = {
  node: await realpath(process.execPath),
  typescript: '/Users/christaylor/Documents/Codex/2026-11-03/soe-supporter/runtime/web/node_modules/typescript/lib/typescript.js',
  eslint: '/Users/christaylor/Documents/Codex/2026-11-03/soe-supporter/runtime/web/node_modules/eslint/bin/eslint.js',
  ...Object.fromEntries(['package.json', 'dist/index.js', 'dist/chunk-QDPEV33M.js', 'dist/chunk-QY3QWFKW.js', 'dist/pglite.wasm', 'dist/pglite.data', 'dist/pglite.js']
    .map(name => ['pglite:' + name, '/Users/christaylor/.cache/soe-passages-test-runtime/pglite-0.4.1/' + name])),
};
async function runtimeHashes() {
  const result = {};
  for (const [name, filename] of Object.entries(runtimePaths)) result[name] = { path: filename, sha256: digest(await bytes(filename)) };
  return result;
}
await bytes(root + 'verification/web/tests/support/circle-listing-receipt-db.mjs');
const { listingReceiptSourceHashes } = await import('../tests/support/circle-listing-receipt-db.mjs');
const tests = ['circle-listing-receipt', 'moderation-http', 'moderation-integration', 'review-coverage-api', 'review-coverage-integration'].map(name => `verification/web/tests/${name}.test.mjs`);
const production = ['lib/circles/moderation.ts', 'lib/circles/review-coverage-server.ts', 'app/api/admin/circles/reports/[circleId]/route.ts'];
const owned = [...tests, 'verification/web/tests/support/circle-listing-receipt-db.mjs', 'verification/web/tests/support/circle-listing-receipt-app.mjs', 'verification/web/scripts/verify-circle-listing-receipts.mjs'];
const extra = [...production, ...owned, 'verification/web/tests/support/moderation-db.mjs', 'verification/web/tests/support/review-coverage-app.mjs',
  'verification/web/tests/support/offline-app.mjs', 'tests/security/fakes.ts', 'eslint.config.mjs', 'verification/web/scripts/deny-build-network.cjs',
  'app/api/circles/report/route.ts', 'app/api/circles/review/route.ts', 'app/api/circles/[circleId]/review/route.ts',
  'app/api/admin/circles/reports/route.ts', 'app/api/admin/circles/reports/[circleId]/coverage/route.ts', 'app/api/admin/circles/reports/[circleId]/coverage/decision/route.ts',
  'app/api/admin/circles/messages/route.ts', 'app/api/admin/circles/[circleId]/messages/[messageId]/route.ts',
  'app/api/admin/circles/[circleId]/messages/[messageId]/coverage/route.ts', 'app/api/admin/circles/[circleId]/messages/[messageId]/coverage/decision/route.ts'];
async function sourceHashes() {
  const result = await listingReceiptSourceHashes(), seen = new Set();
  async function bind(name) {
    if (seen.has(name)) return; seen.add(name);
    const content = await bytes(root + name); result[name] = digest(content);
    if (!/\.(?:ts|tsx)$/.test(name)) return;
    for (const match of content.toString().matchAll(/(?:import|export)\s[^;]*?\sfrom\s*['"]([^'"]+)['"]/g)) {
      const spec = match[1];
      if (['@/lib/supabase/admin', '@/lib/supabase/server'].includes(spec) || (!spec.startsWith('.') && !spec.startsWith('@/'))) continue;
      const target = spec.startsWith('@/') ? spec.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(name), spec));
      const candidate = /\.(?:ts|tsx|json)$/.test(target) ? target : ['.ts', '.tsx', '.json'].map(ext => target + ext).find(file => existsSync(root + file));
      assert(candidate, 'Missing local dependency ' + target); await bind(candidate);
    }
  }
  for (const name of extra) await bind(name);
  return result;
}
const prefix = 'circle-listing-receipt-backend', target = root + 'verification/web/evidence/';
assert(!existsSync(target + prefix + '.json'), 'Archive the previous evidence before rerunning');
const before = await sourceHashes(), runtimeBefore = await runtimeHashes();
const guard = root + 'verification/web/scripts/deny-build-network.cjs';
const env = { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' };
const groups = [
  { name: 'tests', cwd: web, args: ['--require', guard, '--test', ...tests.map(name => name.replace('verification/web/', ''))], expected: 61 },
  { name: 'lint', cwd: root, args: ['--require', guard, runtimePaths.eslint, ...production, ...owned] },
];
const checks = []; let cleanup = [];
for (const group of groups) {
  const run = spawnSync(process.execPath, group.args, { cwd: group.cwd, env, encoding: 'utf8', timeout: 120000, maxBuffer: 8000000 });
  const output = (run.stdout ?? '') + (run.stderr ?? ''), passed = Number(output.match(/^# pass (\d+)$/m)?.[1] ?? 0);
  if (group.expected) cleanup = [...output.matchAll(/LISTING_(RECEIPT|MODERATION|COVERAGE)_CLEANUP (\{[^\n]+\})/g)].map(match => ({ scope: match[1], ...JSON.parse(match[2]) }));
  const log = `verification/web/evidence/${prefix}-${group.name}.log`;
  await writeFile(root + log, output);
  checks.push({ name: group.name, ok: run.status === 0 && (!group.expected || passed === group.expected), exitCode: run.status,
    expectedTests: group.expected ?? null, passedTests: group.expected ? passed : null, cwd: group.cwd,
    command: [process.execPath, ...group.args], log, logSha256: digest(Buffer.from(output)) });
  console.log(group.name, checks.at(-1).ok ? 'PASS' : 'FAIL', group.expected ? `${passed}/${group.expected}` : '');
}
const after = await sourceHashes(), runtimeAfter = await runtimeHashes();
const sourceUnchanged = JSON.stringify(before) === JSON.stringify(after), runtimeUnchanged = JSON.stringify(runtimeBefore) === JSON.stringify(runtimeAfter);
const clean = cleanup.length === 3 && cleanup.every(value => value.created === value.closed)
  && cleanup.reduce((sum, value) => sum + value.closed, 0) === 17 && cleanup.find(value => value.scope === 'RECEIPT')?.providerCalls === 0;
const receipt = { status: checks.every(check => check.ok) && sourceUnchanged && runtimeUnchanged && clean ? 'PASS' : 'FAIL',
  verifiedAt: new Date().toISOString(), baselineCheckpoint: '983ea67eb3fddf9613724ba1bceefd4547e75557', sourceUnchanged, runtimeUnchanged,
  nodeVersion: process.version, tests: 61, checks, cleanup, providerCalls: 0, sourceHashes: after, runtimeHashes: runtimeAfter,
  limits: [
    'Unapplied additive SQL drafts executed only in disposable PGlite databases. No live SQL, provider call, deployment, installation or credential use.',
    'Actual current HTTP handlers and database functions; identity/provider delivery and PostgREST transport are synthetic. The moderation HTTP suite uses the canonical member resolver with synthetic intent/selection cookies.',
    'PGlite owns one backend. Sequential authorization/CAS/replay/rollback are proven; independent PostgreSQL-session lock scheduling and hosted schema-cache behavior remain unverified.',
    'Response-loss tests discard an actual committed handler response before exact manual retry; they do not simulate a real network outage.',
    'Historical SQL, historical fixture modules and archived evidence remain unchanged. Current integration suites explicitly opt into the additive receipt contract.',
    'This receipt covers the listing backend contract only; registered-App, browser/headset, platform builds and production acceptance are separate proofs.',
  ] };
await writeFile(target + prefix + '.json', JSON.stringify(receipt, null, 2) + '\n');
console.log(receipt.status, Object.keys(after).length + ' sources', Object.keys(runtimeAfter).length + ' runtimes', '17 closed databases');
if (receipt.status !== 'PASS') process.exitCode = 1;
