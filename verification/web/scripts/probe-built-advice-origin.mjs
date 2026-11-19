import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

// Temporary two-request diagnostic. No product/origin guard override, credentials,
// provider configuration, database transport or browser Origin spoofing.
const root = path.resolve('.'), port = 3199, origin = `http://127.0.0.1:${port}`;
const advicePath = '/api/admin/circles/11111111-1111-4111-8111-111111111111/messages/22222222-2222-4222-8222-222222222222/advice';
const require = createRequire(import.meta.url), pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const receipt = 'evidence/probe-built-advice-origin.json';
const evidence = { status: 'RUNNING', startedAt: new Date().toISOString(), scope: 'Actual frozen built Next route, two browser POST requests only; request header allowlist only, no credentials/provider/DB or production calls; no Origin injection.', requests: [], responses: [], externalRequestsBlocked: [], unexpectedApiRequests: [], pageErrors: [], cleanupErrors: [] };
let server, serverError, browser, ownedBrowserPid, failed;
function persist() { fs.mkdirSync('evidence', { recursive: true }); fs.writeFileSync(receipt, JSON.stringify(evidence, null, 2) + '\n'); }
function read(file, encoding) { const info = fs.statSync(file); assert.ok(info.blocks, 'Refusing zero-block file: ' + file); return fs.readFileSync(file, encoding); }
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function bounded(label, work, milliseconds = 5000) {
  let timer;
  try { return await Promise.race([Promise.resolve().then(work), new Promise((_, reject) => { timer = setTimeout(() => reject(Error(label + ' exceeded deadline')), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
async function portOpen() { return new Promise(resolve => { const socket = net.createConnection({ host: '127.0.0.1', port }); const done = value => { socket.destroy(); resolve(value); }; socket.setTimeout(500, () => done(false)); socket.once('connect', () => done(true)); socket.once('error', () => done(false)); }); }
function ownedChrome() {
  const prefix = process.env.SOE_BROWSER_EXECUTABLE + ' ';
  return execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' }).split('\n').map(line => line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/)).filter(match => match && Number(match[2]) === process.pid && match[3].startsWith(prefix)).map(match => Number(match[1]));
}
function signalOwnedChrome(signal) {
  if (!ownedBrowserPid || !ownedChrome().includes(ownedBrowserPid)) return;
  const group = Number(execFileSync('/bin/ps', ['-p', String(ownedBrowserPid), '-o', 'pgid='], { encoding: 'utf8' }).trim());
  process.kill(group === ownedBrowserPid ? -ownedBrowserPid : ownedBrowserPid, signal);
  (evidence.ownedBrowserSignals ??= []).push({ pid: ownedBrowserPid, signal });
}
persist();
try {
  assert.ok([...process.execArgv, process.env.NODE_OPTIONS || ''].join(' ').includes('deny-build-network.cjs'));
  assert.equal(await portOpen(), false, 'Owned port3199 must be free');
  evidence.buildId = read('../../.next/BUILD_ID', 'utf8').trim();
  evidence.runnerSha256 = hash(read('scripts/probe-built-advice-origin.mjs'));
  for (const file of ['../../node_modules/next/dist/bin/next', process.env.SOE_PLAYWRIGHT_PACKAGE + '/package.json', process.env.SOE_BROWSER_EXECUTABLE]) assert.ok(fs.statSync(file).blocks, 'Refusing zero-block runtime');
  const env = Object.fromEntries(['PATH', 'HOME', 'USER', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  Object.assign(env, { NEXT_TELEMETRY_DISABLED: '1', NODE_OPTIONS: '--require ' + path.join(root, 'scripts/deny-build-network.cjs'), NEXT_PUBLIC_SUPABASE_URL: 'https://offline.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'OFFLINE_PUBLIC_BUILD_PLACEHOLDER_NOT_A_CREDENTIAL' });
  const log = fs.openSync('evidence/probe-built-advice-origin-server.log', 'w');
  server = spawn('node', ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: path.resolve(root, '../..'), env, detached: true, stdio: ['ignore', log, log] }); fs.closeSync(log);
  server.once('error', error => { serverError = error; });
  for (let index = 0; index < 100; index++) { if (await portOpen()) break; if (serverError || server.exitCode !== null || index === 99) throw serverError || Error('Owned Next server did not start'); await pause(100); }
  browser = await require(process.env.SOE_PLAYWRIGHT_PACKAGE).chromium.launch({ headless: true, executablePath: process.env.SOE_BROWSER_EXECUTABLE, timeout: 15000 });
  evidence.chromiumVersion = browser.version();
  const pids = ownedChrome(); assert.equal(pids.length, 1); ownedBrowserPid = pids[0]; evidence.ownedBrowserPid = ownedBrowserPid;
  const context = await browser.newContext({ viewport: { width: 320, height: 800 } });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { evidence.externalRequestsBlocked.push(url.origin + url.pathname); return route.abort(); }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname !== advicePath || request.method() !== 'POST' || evidence.requests.length >= 2) { evidence.unexpectedApiRequests.push(url.pathname); return route.abort(); }
    const headers = await request.allHeaders();
    // Do not store or print other header values, including credentials.
    assert.equal(Boolean(headers.authorization || headers.cookie), false, 'No credentials permitted');
    evidence.requests.push({ url: url.origin + url.pathname, method: request.method(), origin: headers.origin ?? null, secFetchSite: headers['sec-fetch-site'] ?? null, host: headers.host ?? null, refererPresent: Object.hasOwn(headers, 'referer'), referer: headers.referer ?? null });
    persist(); return route.continue();
  });
  const page = await context.newPage(); page.on('pageerror', error => evidence.pageErrors.push(String(error)));
  await page.goto(origin + '/circles/message-ai-policy', { waitUntil: 'networkidle', timeout: 10000 });
  await page.getByRole('heading', { name: 'Optional AI review of your message', exact: true }).waitFor();
  for (const mode of ['omit-no-referrer', 'omit-default-referrer']) {
    const value = await bounded(mode, () => page.evaluate(async ({ pathname, noReferrer }) => {
      const options = { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' }, credentials: 'omit', redirect: 'error', cache: 'no-store' };
      if (noReferrer) options.referrerPolicy = 'no-referrer';
      const response = await fetch(pathname, options);
      const body = await response.json();
      const known = ['Use this site to submit the request.', 'AI advice is unavailable. Human review remains available.'];
      return { status: response.status, cacheControl: response.headers.get('cache-control'), body: body && Object.keys(body).length === 1 && known.includes(body.error) ? body : '[unexpected body omitted]' };
    }, { pathname: advicePath, noReferrer: mode === 'omit-no-referrer' }));
    evidence.responses.push({ mode, ...value }); persist();
  }
  assert.equal(evidence.requests.length, 2); assert.deepEqual(evidence.externalRequestsBlocked, []); assert.deepEqual(evidence.unexpectedApiRequests, []); assert.deepEqual(evidence.pageErrors, []);
  evidence.status = 'CLEANING_UP';
} catch (error) { failed = error; evidence.status = 'FAIL'; evidence.error = String(error.stack || error); }
finally {
  persist();
  if (browser) try { await bounded('Owned browser close', () => browser.close()); } catch (error) {
    evidence.cleanupErrors.push(String(error));
    try { signalOwnedChrome('SIGTERM'); for (let index = 0; index < 20 && ownedChrome().includes(ownedBrowserPid); index++) await pause(50); if (ownedChrome().includes(ownedBrowserPid)) signalOwnedChrome('SIGKILL'); } catch (cleanupError) { evidence.cleanupErrors.push(String(cleanupError)); }
  }
  if (server?.pid) {
    try { process.kill(-server.pid, 'SIGTERM'); } catch {}
    for (let index = 0; index < 50 && await portOpen(); index++) await pause(100);
    evidence.ownedServerStopped = !(await portOpen()); if (!evidence.ownedServerStopped) evidence.cleanupErrors.push('Owned Next server did not stop');
  }
  if (evidence.cleanupErrors.length) failed ??= Error('Owned cleanup failed');
  evidence.status = failed ? 'FAIL' : 'PASS'; evidence.finishedAt = new Date().toISOString(); persist();
  process.stdout.write(JSON.stringify({ status: evidence.status, buildId: evidence.buildId, responses: evidence.responses, cleanupErrors: evidence.cleanupErrors, ownedServerStopped: evidence.ownedServerStopped }) + '\n');
  if (failed) { process.stderr.write(String(failed.stack || failed) + '\n'); process.exitCode = 1; }
}
