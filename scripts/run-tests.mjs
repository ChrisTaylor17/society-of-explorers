#!/usr/bin/env node
// Each suite gets its own process and a clean environment. One stalled suite
// cannot hide later results or turn a partial run into a successful report.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const groups = {
  security: ['tests/security', /\.test\.ts$/],
  growth: ['tests/growth', /^g.*\.test\.ts$/],
  web: ['verification/web/tests', /\.test\.mjs$/],
  platforms: ['platforms/tests', /\.test\.mjs$/],
};
const args = process.argv.slice(2);
const option = (name, fallback) => args.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const selected = option('groups', 'security,growth').split(',');
if (selected.some(group => !Object.hasOwn(groups, group))) throw new Error('Unknown test group');
const only = option('files', '').split(',').filter(Boolean);
const timeout = Number(option('timeout', '180'));
const concurrency = Number(option('concurrency', '2'));
if (!Number.isInteger(timeout) || timeout < 1 || timeout > 900 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new Error('Invalid bounded timeout or concurrency');
const name = option('output', 'test-run');
if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(name)) throw new Error('Invalid output name');
const files = selected.flatMap(group => fs.readdirSync(path.join(root, groups[group][0])).filter(name => groups[group][1].test(name)).sort().map(name => ({ group, file: `${groups[group][0]}/${name}` }))).filter(item => !only.length || only.includes(item.file));
if (only.some(file => !files.some(item => item.file === file)) || !files.length) throw new Error('No matching tracked test suite');
if (args.includes('--list')) { console.log(JSON.stringify(files, null, 2)); process.exit(0); }
const evidence = path.join(root, 'verification/web/evidence', name);
fs.mkdirSync(evidence, { recursive: true });
const guard = path.join(root, 'verification/web/scripts/deny-build-network.cjs');
const cleanEnv = Object.fromEntries(['PATH', 'HOME', 'USER', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
Object.assign(cleanEnv, { CI: '1', NODE_OPTIONS: `--require ${JSON.stringify(guard)}`, NEXT_TELEMETRY_DISABLED: '1' });
function usable(file) {
  try { const stat = fs.statSync(file); return stat.isFile() && (!stat.size || stat.blocks > 0) && Boolean(stat.mode & 0o111); } catch { return false; }
}
function bunBinary() {
  const packageName = os.platform() === 'darwin' ? `@oven/bun-darwin-${os.arch() === 'arm64' ? 'aarch64' : 'x64'}` : null;
  const candidates = [process.env.SOE_BUN_BIN, ...((process.env.PATH ?? '').split(path.delimiter).map(folder => path.join(folder, 'bun'))), path.join(root, 'node_modules/.bin/bun')];
  if (packageName) for (const folder of ['verification/web/runtime/node_modules', 'verification/web/tooling/finish-runtime/node_modules', 'verification/web/tooling/node_modules']) candidates.push(path.join(root, folder, packageName, 'bin/bun'));
  const binary = candidates.filter(Boolean).find(usable);
  if (!binary) throw new Error('Bun is unavailable locally. Install the project\'s locked verification tools or set SOE_BUN_BIN to an existing Bun executable. Nothing was installed automatically.');
  return binary;
}
let bun;
if (files.some(({ group }) => group === 'security' || group === 'growth')) bun = bunBinary();
const results = [];
function record(result) {
  results.push(result);
  const report = { completed: results.length === files.length, totalFiles: files.length, passedFiles: results.filter(row => row.status === 'passed').length, skippedFiles: results.filter(row => row.status === 'skipped').length, failedFiles: results.filter(row => !['passed', 'skipped'].includes(row.status)).length, externallyDenied: true, issuedCredentialsSupplied: false, results };
  fs.writeFileSync(path.join(evidence, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(result));
}
async function run({ group, file }) {
  const isBun = group === 'security' || group === 'growth';
  const cwd = group === 'web' ? path.join(root, 'verification/web') : root;
  const relative = group === 'web' ? file.slice('verification/web/'.length) : `./${file}`;
  const command = isBun ? bun : process.execPath;
  const argv = isBun ? ['test', '--no-env-file', '--no-install', '--preload', guard, relative] : ['--require', guard, '--test', '--test-concurrency=1', relative];
  const log = path.join(evidence, file.replaceAll('/', '__') + '.log');
  const fd = fs.openSync(log, 'w');
  const start = Date.now();
  const child = spawn(command, argv, { cwd, env: cleanEnv, stdio: ['ignore', fd, fd], detached: process.platform !== 'win32' });
  let expired = false;
  let settled = false;
  let killTimer;
  const stop = signal => { try { if (process.platform === 'win32') child.kill(signal); else process.kill(-child.pid, signal); } catch {} };
  const timer = setTimeout(() => { expired = true; stop('SIGTERM'); killTimer = setTimeout(() => stop('SIGKILL'), 3000); }, timeout * 1000);
  return new Promise(resolve => {
    const finish = (code, signal, error) => {
      if (settled) return; settled = true;
      if (expired) stop('SIGKILL');
      clearTimeout(timer); clearTimeout(killTimer); fs.closeSync(fd);
      const text = fs.readFileSync(log, 'utf8');
      const pass = isBun ? text.match(/\b(\d+) pass\b/) : text.match(/^# pass (\d+)$/m);
      const skip = isBun ? text.match(/\b(\d+) skip\b/) : text.match(/^# skipped (\d+)$/m);
      const fail = isBun ? text.match(/\b(\d+) fail\b/) : text.match(/^# fail (\d+)$/m);
      // Node treats a file containing no registered tests as one passing file
      // wrapper. That is process success, not an executed acceptance check.
      const subtests = [...text.matchAll(/^# Subtest: (.+)$/gm)].map(match => match[1]);
      const emptyNodeFile = !isBun && subtests.length === 1 && path.resolve(cwd, subtests[0]) === path.resolve(cwd, relative);
      const passedTests = emptyNodeFile ? 0 : Number(pass?.[1] ?? 0);
      const result = { group, file, status: expired ? 'timeout' : !error && code === 0 && passedTests > 0 && (!fail || Number(fail[1]) === 0) ? 'passed' : !error && code === 0 && Number(skip?.[1] ?? 0) > 0 && Number(fail?.[1] ?? 0) === 0 ? 'skipped' : 'failed', exitCode: code, signal, seconds: Math.round((Date.now() - start) / 10) / 100, passedTests, failedTests: Number(fail?.[1] ?? 0), skippedTests: Number(skip?.[1] ?? 0), log: path.relative(root, log), ...(error ? { error: error.message } : {}), ...(emptyNodeFile ? { error: 'No registered test cases executed' } : {}) };
      record(result); resolve();
    };
    child.once('error', error => finish(null, null, error));
    child.once('close', (code, signal) => { if (child.pid) finish(code, signal); });
  });
}
let next = 0;
await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, async () => { while (next < files.length) await run(files[next++]); }));
console.log(JSON.stringify({ report: path.relative(root, path.join(evidence, 'summary.json')), passed: results.every(row => ['passed', 'skipped'].includes(row.status)), files: results.length }));
process.exitCode = results.every(row => ['passed', 'skipped'].includes(row.status)) ? 0 : 1;
