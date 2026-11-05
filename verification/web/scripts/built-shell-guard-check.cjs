/* eslint-disable @typescript-eslint/no-require-imports -- This CommonJS fixture exercises the synchronous startup preload. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const state = globalThis.__soeBuiltShellGuard;
assert(state, 'Startup guard required');
(async () => {
  const port = Number(new URL(state.origin).port);
  const checks = [
    ['fetch', () => fetch('https://example.invalid')],
    ['http', () => http.get('http://example.invalid')],
    ['other-loopback', () => require('node:net').connect({ host: '127.0.0.1', port: port + 1 })],
    ['unix-socket', () => require('node:net').connect({ path: '/tmp/not-authorized' })],
    ['dns', () => require('node:dns').lookup('example.invalid', () => {})],
    ['subprocess', () => require('node:child_process').spawn('curl', ['https://example.invalid'])],
    ['public-listener', () => http.createServer().listen(port, '0.0.0.0')],
  ];
  for (const [, work] of checks) assert.throws(work, /BUILT_SHELL_NETWORK_DENIED/);
  const server = http.createServer((req, res) => res.end('local-only'));
  try {
    await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
    assert.equal(await (await fetch(state.origin)).text(), 'local-only');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  const result = { status: 'PASS', origin: state.origin, deniedChecks: checks.map(([name]) => name), exactLoopbackFetch: 'PASS', actualExternalRequests: 0 };
  fs.writeFileSync('verification/web/evidence/built-shell-guard-check.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
})().catch(error => { console.error(error); process.exitCode = 1; });
