/* eslint-disable @typescript-eslint/no-require-imports -- This CommonJS startup preload must run synchronously before application imports. */
// Local browser-baseline boundary. This is a Node API guard, not an OS firewall.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const port = Number(process.env.SOE_BUILT_SHELL_PORT);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw Error('BUILT_SHELL_PORT_REQUIRED');
const origin = `http://127.0.0.1:${port}`;
const state = { origin, pid: process.pid, denied: [], runtimeHashes: {}, startedAt: new Date().toISOString() };
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const bind = name => {
  const file = path.resolve(name), info = fs.lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size && !info.blocks) throw Error('BUILT_SHELL_UNAVAILABLE_RUNTIME');
  const digest = hash(fs.readFileSync(file));
  if (state.runtimeHashes[file] && state.runtimeHashes[file] !== digest) throw Error('BUILT_SHELL_RUNTIME_CHANGED');
  state.runtimeHashes[file] = digest;
};
bind(process.execPath); bind(__filename);
const deny = kind => { state.denied.push({ kind, at: new Date().toISOString() }); throw Error('BUILT_SHELL_NETWORK_DENIED:' + kind); };
const allowedUrl = value => { try { const u = new URL(typeof value === 'string' || value instanceof URL ? value : value.url); return u.origin === origin && !u.username && !u.password; } catch { return false; } };
const originalFetch = globalThis.fetch;
globalThis.fetch = function (input, options) { if (!allowedUrl(input)) return deny('fetch'); return originalFetch(input, options); };
const net = require('node:net');
const allowedSocket = args => {
  if (Array.isArray(args[0])) return allowedSocket(args[0]);
  const first = args[0];
  if (first && typeof first === 'object') return first.path === undefined && first.socketPath === undefined && first.host === '127.0.0.1' && Number(first.port) === port;
  return Number(first) === port && args[1] === '127.0.0.1';
};
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) { if (!allowedSocket(args)) return deny('tcp'); return connect.apply(this, args); };
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) { if (!allowedSocket(args)) return deny('listen'); return listen.apply(this, args); };
const http = require('node:http');
const allowedHttp = args => {
  let value = args[0];
  if (typeof value === 'string' || value instanceof URL) {
    if (!allowedUrl(value)) return false;
    const extra = args[1];
    if (!extra || typeof extra !== 'object') return true;
    value = { protocol: 'http:', hostname: '127.0.0.1', port, ...extra };
  }
  if (!value || typeof value !== 'object' || value.socketPath || value.protocol && value.protocol !== 'http:') return false;
  const host = value.hostname ?? value.host;
  return (host === '127.0.0.1' && Number(value.port) === port || host === '127.0.0.1:' + port && value.port === undefined)
    && !(typeof value.path === 'string' && /^[a-z]+:\/\//i.test(value.path));
};
for (const name of ['request', 'get']) { const original = http[name]; http[name] = function (...args) { if (!allowedHttp(args)) return deny('http'); return original.apply(this, args); }; }
for (const name of ['request', 'get']) require('node:https')[name] = () => deny('https');
require('node:tls').connect = () => deny('tls');
require('node:http2').connect = () => deny('http2');
require('node:dgram').createSocket = () => deny('udp');
const dns = require('node:dns');
for (const target of [dns, dns.promises]) for (const key of Object.keys(target)) if (key === 'lookup' || key === 'lookupService' || key.startsWith('resolve') || key === 'reverse') target[key] = () => deny('dns');
dns.lookup = (hostname, options, callback) => {
  if (hostname !== '127.0.0.1') return deny('dns');
  if (typeof options === 'function') { callback = options; options = {}; }
  queueMicrotask(() => options?.all ? callback(null, [{ address: hostname, family: 4 }]) : callback(null, hostname, 4));
};
dns.promises.lookup = async (hostname, options) => { if (hostname !== '127.0.0.1') return deny('dns'); return options?.all ? [{ address: hostname, family: 4 }] : { address: hostname, family: 4 }; };
for (const key of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) require('node:child_process')[key] = () => deny('child-process');
require('node:worker_threads').Worker = function () { return deny('worker-thread'); };
// Recheck leaves immediately before normal Node file reads, including streamed
// build assets; a cloud placeholder must never be materialized by this harness.
const resident = file => {
  if (typeof file === 'number') return;
  const info = fs.lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size && !info.blocks) return deny('unavailable-file');
};
for (const key of ['readFileSync', 'readFile', 'createReadStream']) { const original = fs[key]; fs[key] = function (file, ...args) { resident(file); return original.call(this, file, ...args); }; }
const readPromise = fs.promises.readFile;
fs.promises.readFile = function (file, ...args) { resident(file); return readPromise.call(this, file, ...args); };
const reads = flags => typeof flags === 'number' ? (flags & fs.constants.O_WRONLY) === 0 : typeof flags === 'string' && (flags.includes('r') || flags.includes('+'));
for (const key of ['openSync', 'open']) { const original = fs[key]; fs[key] = function (file, flags, ...args) { if (reads(flags) && fs.existsSync(file)) resident(file); return original.call(this, file, flags, ...args); }; }
const openPromise = fs.promises.open;
fs.promises.open = function (file, flags, ...args) { if (reads(flags) && fs.existsSync(file)) resident(file); return openPromise.call(this, file, flags, ...args); };
const modules = require('node:module');
for (const extension of ['.js', '.json', '.node']) {
  const loader = modules._extensions[extension];
  modules._extensions[extension] = function (mod, filename) { bind(filename); return loader(mod, filename); };
}
modules.syncBuiltinESMExports();
Object.defineProperty(globalThis, '__soeBuiltShellGuard', { value: state, writable: false });
const persist = () => { if (process.env.SOE_BUILT_SHELL_RUNTIME_RECEIPT) fs.writeFileSync(process.env.SOE_BUILT_SHELL_RUNTIME_RECEIPT, JSON.stringify(state, null, 2) + '\n'); };
process.on('SIGUSR2', persist);
process.on('exit', code => {
  state.exitCode = code; state.completedAt = new Date().toISOString();
  persist();
});
