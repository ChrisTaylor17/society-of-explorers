import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

assert(process.execArgv.some(value => value.endsWith('/deny-build-network.cjs')));
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(path.join(root, 'package.json'));
const read = name => {
  const file = path.isAbsolute(name) ? name : path.join(root, name);
  const info = fs.lstatSync(file);
  assert(info.isFile() && !info.isSymbolicLink() && (!info.size || info.blocks), 'Nonresident or linked input: ' + name);
  return fs.readFileSync(file);
};
const sha = name => createHash('sha256').update(read(name)).digest('hex');
const runtime = new Set([process.execPath]);
for (const extension of ['.js', '.json']) {
  const original = Module._extensions[extension];
  Module._extensions[extension] = (module, file) => { read(file); runtime.add(file); return original(module, file); };
}
require('typescript'); require('next/server');
const sources = [
  'app/auth/callback/route.ts', 'lib/auth/callbackSession.ts', 'lib/auth/provider.ts', 'lib/auth/redirectPath.ts', 'proxy.ts',
  'platforms/tests/load-source.mjs', 'verification/web/tests/email-recovery-callback.test.mjs',
  'verification/web/scripts/verify-email-recovery-callback.mjs', 'verification/web/scripts/deny-build-network.cjs',
];
const hashes = names => Object.fromEntries([...names].sort().map(name => [name, sha(name)]));
const before = hashes(sources), runtimeBefore = hashes(runtime), startedAt = new Date().toISOString();
const args = ['--require', './verification/web/scripts/deny-build-network.cjs', '--test', 'verification/web/tests/email-recovery-callback.test.mjs'];
const result = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { cwd: root, env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  const timer = setTimeout(() => child.kill('SIGKILL'), 30000);
  child.stdout.on('data', value => { output += value; }); child.stderr.on('data', value => { output += value; });
  child.once('error', error => { clearTimeout(timer); reject(error); });
  child.once('close', code => { clearTimeout(timer); resolve({ code, output }); });
});
const log = 'verification/web/evidence/email-recovery-callback.log';
fs.writeFileSync(path.join(root, log), result.output);
assert.equal(result.code, 0, result.output.slice(-3000));
for (const line of ['# tests 11\n', '# pass 11\n', '# fail 0\n', '# skipped 0\n']) assert(result.output.includes(line));
assert.deepEqual(hashes(sources), before); assert.deepEqual(hashes(runtime), runtimeBefore);
const receipt = {
  status: 'PASS', startedAt, finishedAt: new Date().toISOString(), tests: 11, providerCalls: 0,
  scope: 'Actual callback handler, purpose parser, provider cookie writer and NextResponse; explicit SSR AuthClient exchange/user-proof double. Recovery proxy headers execute without auth.',
  limits: ['No real provider code exchange, hosted AMR compatibility, email delivery or browser callback acceptance.'],
  sourceHashes: before, runtimeHashes: runtimeBefore, sourceUnchanged: true, runtimeUnchanged: true,
  log: { path: log, sha256: sha(log) },
};
fs.writeFileSync(path.join(root, 'verification/web/evidence/email-recovery-callback.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ status: 'PASS', tests: 11, sourceInputs: sources.length, runtimeInputs: runtime.size, providerCalls: 0 }));
