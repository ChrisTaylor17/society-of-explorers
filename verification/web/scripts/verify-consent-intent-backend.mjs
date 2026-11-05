// Source-bound offline SQL/actual-handler evidence, with no provider operations.
import assert from 'node:assert/strict';
import { lstat, readFile, writeFile, realpath } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url)), web = fileURLToPath(new URL('../', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function bytes(path) { const s = await lstat(path); assert(s.isFile() && !s.isSymbolicLink() && (!s.size || s.blocks), 'Refuse linked/offloaded input ' + path); return readFile(path); }
const runtimePaths = {
 node: await realpath(process.execPath),
 typescript: '/Users/christaylor/Documents/Codex/2026-11-03/soe-supporter/runtime/web/node_modules/typescript/lib/typescript.js',
 eslint: '/Users/christaylor/Documents/Codex/2026-11-03/soe-supporter/runtime/web/node_modules/eslint/bin/eslint.js',
 ...Object.fromEntries(['package.json', 'dist/index.js', 'dist/chunk-QDPEV33M.js', 'dist/chunk-QY3QWFKW.js', 'dist/pglite.wasm', 'dist/pglite.data', 'dist/pglite.js'].map(name => ['pglite:' + name, '/Users/christaylor/.cache/soe-passages-test-runtime/pglite-0.4.1/' + name])),
};
async function runtimeHashes() { const hashes = {}; for (const [name, path] of Object.entries(runtimePaths)) hashes[name] = { path, sha256: digest(await bytes(path)) }; return hashes; }
const runtimesBefore = await runtimeHashes();
await bytes(root + 'verification/web/tests/support/current-message-ai-consent-app.mjs');
const { currentConsentSourceHashes } = await import('../tests/support/current-message-ai-consent-app.mjs');
const extra = ['verification/web/scripts/verify-consent-intent-backend.mjs', 'verification/web/scripts/deny-build-network.cjs', 'verification/web/tests/message-ai-consent-intent.test.mjs', 'verification/web/tests/message-ai-consent-api.test.mjs', 'verification/web/tests/support/offline-app.mjs', 'tests/security/fakes.ts', 'eslint.config.mjs', 'docs/integration/circle-message-consent-intent.md', 'docs/integration/production-migration-plan.md',
 'app/api/circles/contributions/route.ts', 'app/api/circles/[circleId]/messages/[messageId]/route.ts', 'app/api/circles/[circleId]/messages/[messageId]/ai-consent/route.ts', 'app/api/admin/circles/messages/route.ts', 'app/api/admin/circles/[circleId]/messages/[messageId]/route.ts', 'app/api/admin/circles/[circleId]/messages/[messageId]/advice/route.ts'];
async function hashes() {
 const result = await currentConsentSourceHashes(), seen = new Set();
 async function bind(name) {
  if (seen.has(name)) return; seen.add(name); const content = await bytes(root + name); result[name] = digest(content);
  if (!/\.(?:ts|tsx)$/.test(name)) return;
  for (const match of content.toString().matchAll(/(?:import|export)\s[^;]*?\sfrom\s*['"]([^'"]+)['"]/g)) {
   const spec = match[1]; if (!spec.startsWith('.') && !spec.startsWith('@/')) continue;
   if (['@/lib/supabase/admin', '@/lib/supabase/server'].includes(spec)) continue;
   const target = spec.startsWith('@/') ? spec.slice(2) : fileURLToPath(new URL(spec, new URL(name, new URL('../../../', import.meta.url)))).slice(root.length);
   const candidate = /\.(?:ts|tsx|json)$/.test(target) ? target : ['.ts', '.tsx', '.json'].map(ext => target + ext).find(file => existsSync(root + file));
   assert(candidate, 'Missing local dependency ' + target); await bind(candidate);
  }
 }
 for (const name of extra) await bind(name); return result;
}
const before = await hashes(), guard = root + 'verification/web/scripts/deny-build-network.cjs';
const env = { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' };
const groups = [
 { name: 'consent-intent-backend', cwd: web, args: ['--require', guard, '--test', 'tests/message-ai-consent-intent.test.mjs', 'tests/message-ai-consent-api.test.mjs'], expected: 26 },
 { name: 'consent-intent-backend-lint', cwd: root, args: ['--require', guard, runtimePaths.eslint, 'app/api/circles/[circleId]/messages/[messageId]/ai-consent/route.ts', 'verification/web/tests/message-ai-consent-intent.test.mjs', 'verification/web/tests/support/message-ai-consent-intent-db.mjs', 'verification/web/tests/support/current-message-ai-consent-app.mjs', 'verification/web/scripts/verify-consent-intent-backend.mjs'] },
];
const checks = []; let cleanup = null;
for (const group of groups) {
 const result = spawnSync(process.execPath, group.args, { cwd: group.cwd, env, encoding: 'utf8', timeout: 120000, maxBuffer: 8000000 });
 const output = (result.stdout ?? '') + (result.stderr ?? ''), passed = Number(output.match(/^# pass (\d+)$/m)?.[1] ?? 0);
 if (group.expected) cleanup = JSON.parse(output.match(/CONSENT_INTENT_CLEANUP (\{[^\n]+\})/)?.[1] ?? 'null');
 const log = 'verification/web/evidence/' + group.name + '.log'; await writeFile(root + log, output);
 checks.push({ name: group.name, ok: result.status === 0 && (!group.expected || passed === group.expected), exitCode: result.status, expectedTests: group.expected ?? null, passedTests: group.expected ? passed : null, cwd: group.cwd, command: [process.execPath, ...group.args], log, logSha256: digest(Buffer.from(output)) });
 console.log(group.name, checks.at(-1).ok ? 'PASS' : 'FAIL', group.expected ? `${passed}/${group.expected}` : '');
}
const afterHashes = await hashes(), afterRuntimes = await runtimeHashes(), sourceUnchanged = JSON.stringify(before) === JSON.stringify(afterHashes), runtimeUnchanged = JSON.stringify(runtimesBefore) === JSON.stringify(afterRuntimes);
const clean = cleanup?.created === 15 && cleanup.closed === cleanup.created && cleanup.providerCalls === 0;
const receipt = { status: checks.every(check => check.ok) && sourceUnchanged && runtimeUnchanged && clean ? 'PASS' : 'FAIL', verifiedAt: new Date().toISOString(), sourceUnchanged, runtimeUnchanged, nodeVersion: process.version, tests: 26, checks, cleanup, providerCalls: cleanup?.providerCalls ?? null, sourceHashes: afterHashes, runtimeHashes: afterRuntimes,
 limits: ['Actual SQL and current HTTP handlers; identity/PostgREST and provider adapters are synthetic. No provider call, installation, live SQL or deployment.', 'PGlite has one backend: held-before-dispatch and sequential CAS/rollback are proven; independent-session row-lock scheduling and hosted schema cache remain unverified.', 'All disposable test databases are closed by awaited test cleanup hooks. Original consent SQL, original fixtures and baseline evidence are preserved.', 'Web author permission safety only; native/Quest author/reviewer parity is unchanged.'] };
await writeFile(root + 'verification/web/evidence/consent-intent-backend.json', JSON.stringify(receipt, null, 2) + '\n');
if (receipt.status !== 'PASS') process.exitCode = 1;
