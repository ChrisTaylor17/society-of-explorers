import { createServer, request as forward } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { createWorld } from '../prototypes/soe-join-revoke/src/world.js';
import { createHttp } from '../prototypes/soe-join-revoke/src/http.js';
import { payloadHash } from '../prototypes/soe-join-revoke/src/hash.js';

const { values } = parseArgs({ options: {
  'output-dir': { type: 'string' }, prefix: { type: 'string', default: 'soe-runtime' },
  port: { type: 'string', default: '8787' }, 'trap-port': { type: 'string', default: '8788' },
} });
if (!values['output-dir']) throw new Error('Pass --output-dir explicitly; artifacts are never written into the source tree implicitly.');
if (!/^[a-zA-Z0-9_-]+$/.test(values.prefix)) throw new Error('Invalid evidence prefix');
const outputDir = resolve(values['output-dir']); await mkdir(outputDir, { recursive: true });
const port = (value) => { if (!/^\d+$/.test(value) || Number(value) > 65535) throw new Error('Invalid loopback port'); return Number(value); };
const outputFile = (suffix) => join(outputDir, values.prefix + suffix);
// Test transport only. The product backend source remains unchanged.
let world = createWorld({ allowFaults: false });
const forwardingWorld = new Proxy({}, { get(_target, name) { const value = world[name]; return typeof value === 'function' ? value.bind(world) : value; } });
const backend = createHttp(forwardingWorld);
const address = new URL((await backend.listen(0)).url);
let sequence = 0;
const requests = [];
const audit = [];
let runtimeReport = null;
let backendAvailable = true;
const redirectHits = [];
const landingHits = [];
const originHits = [];
const trap = createServer(async (req, res) => {
  redirectHits.push({ method: req.method, path: new URL(req.url, 'http://127.0.0.1').pathname, authorization: Boolean(req.headers.authorization), cookie: Boolean(req.headers.cookie) });
  req.resume(); send(res, { status: 'captured' });
});
await new Promise(resolve => trap.listen(port(values['trap-port']), '127.0.0.1', resolve));
const trapOrigin = `http://127.0.0.1:${trap.address().port}`;
let gatewayOrigin;
function send(res, body) { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); }
async function body(req) {
  let text = '';
  for await (const chunk of req) { text += chunk; if (text.length > 100000) throw new Error('Test payload too large'); }
  return text ? JSON.parse(text) : {};
}
const gateway = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://127.0.0.1').pathname;
  const entry = { sequence: ++sequence, at: new Date().toISOString(), method: req.method, path };
  requests.push(entry);
  try {
    if (req.method === 'POST' && path === '/__runtime/start-run') {
      world = createWorld({ allowFaults: false }); audit.length = 0; runtimeReport = null; backendAvailable = true; redirectHits.length = 0; landingHits.length = 0; originHits.length = 0;
      send(res, { status: 'ok', prototype: true }); return;
    }
    const redirectMatch = /^\/__runtime\/redirect\/(301|302|303|307|308)\/(cross|same)$/.exec(path);
    if (redirectMatch) {
      originHits.push({ method: req.method, path, code: Number(redirectMatch[1]) });
      req.resume();
      res.writeHead(Number(redirectMatch[1]), { location: redirectMatch[2] === 'cross' ? trapOrigin + '/capture' : gatewayOrigin + '/__runtime/redirect-landing', 'cache-control': 'no-store' }); res.end(); return;
    }
    if (path === '/__runtime/redirect-landing') {
      landingHits.push({ method: req.method, authorization: Boolean(req.headers.authorization), cookie: Boolean(req.headers.cookie) });
      req.resume(); send(res, { status: 'landed' }); return;
    }
    if (req.method === 'POST' && path === '/__runtime/redirect-reset') { redirectHits.length = 0; landingHits.length = 0; originHits.length = 0; send(res, { status: 'ok' }); return; }
    if (req.method === 'GET' && path === '/__runtime/redirect-stats') { send(res, { redirectHits, landingHits, originHits }); return; }
    if (req.method === 'POST' && path === '/__runtime/backend-state') { backendAvailable = (await body(req)).available === true; send(res, { status: 'ok', available: backendAvailable }); return; }
    if (req.method === 'POST' && path === '/__runtime/reset') {
      world = createWorld({ allowFaults: false }); send(res, { status: 'ok', prototype: true }); return;
    }
    if (req.method === 'POST' && path === '/__runtime/expire') {
      world.setNow(() => Date.now() + 8 * 86400000); send(res, { status: 'ok' }); return;
    }
    if (req.method === 'GET' && path === '/__runtime/counts') { send(res, { status: 'ok', requests }); return; }
    if (req.method === 'POST' && path === '/__runtime/audit') {
      const event = await body(req); audit.push({ ...event, received_at_utc: new Date().toISOString(), sequence });
      await writeFile(outputFile('-native-lifecycle-audit.json'), JSON.stringify(audit, null, 2)+'\n');
      send(res, { status: 'recorded' }); return;
    }
    if (req.method === 'GET' && path === '/__runtime/audit') { send(res, { audit }); return; }
    if (req.method === 'GET' && path === '/__runtime/report') { send(res, { report: runtimeReport }); return; }
    if (req.method === 'POST' && path === '/__runtime/host-revoke') {
      const ada = await world.signIn('ada', 'synthetic-ada');
      const plan = await world.plan(ada.token, 'plan-riverside');
      const input = { permissionId: plan.data.other.myGrantId };
      const result = await world.write(ada.token, 'revoke', { personId: 'ada', idempotencyKey: 'native-lifecycle-host-revoke', payloadHash: payloadHash(input), body: input });
      send(res, result); return;
    }
    if (req.method === 'POST' && path === '/__runtime/report') {
      const report = await body(req);
      if (report?.scope !== 'Android synthetic runtime controller checks' || !Array.isArray(report.tests)) throw new Error('Not a runtime report');
      runtimeReport = { ...report, received_at_utc: new Date().toISOString(), native_transport_user_agent: req.headers['user-agent'], server_requests: requests };
      await writeFile(outputFile('-native-runtime-report.json'), JSON.stringify(runtimeReport, null, 2)+'\n');
      send(res, { status: 'recorded' }); return;
    }
    if (!path.startsWith('/api/')) { res.writeHead(404); res.end(); return; }
    if (!backendAvailable) { res.writeHead(503, { 'content-type': 'application/json' }); res.end(JSON.stringify({ status: 'unavailable', blocker: 'Synthetic backend deliberately unavailable' })); return; }
    const upstream = forward({ hostname: '127.0.0.1', port: Number(address.port), path: req.url, method: req.method, headers: req.headers }, response => {
      entry.status = response.statusCode;
      res.writeHead(response.statusCode, response.headers); response.pipe(res);
    });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(upstream);
  } catch (error) { res.writeHead(500); res.end(JSON.stringify({ status: 'unavailable', blocker: String(error) })); }
});
await new Promise(resolve => gateway.listen(port(values.port), '127.0.0.1', resolve));
gatewayOrigin = `http://127.0.0.1:${gateway.address().port}`;
console.log(JSON.stringify({ status: 'listening', url: gatewayOrigin, trap_url: trapOrigin, output_dir: outputDir, synthetic_only: true, no_tokens_logged: true }));
async function stop() { gateway.close(); trap.close(); await backend.close(); process.exit(0); }
process.on('SIGTERM', stop); process.on('SIGINT', stop);
