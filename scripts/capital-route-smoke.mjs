#!/usr/bin/env node

const DEFAULT_BASE_URL = 'http://localhost:3000';
const ROUTE_TIMEOUT_MS = 8_000;
const baseUrl = process.env.CAPITAL_ROUTE_SMOKE_BASE_URL || DEFAULT_BASE_URL;

function assertLocalBaseUrl(value) {
  const url = new URL(value);
  const allowedHosts = new Set(['localhost', '127.0.0.1', '::1']);
  if (!allowedHosts.has(url.hostname)) {
    throw new Error(`Refusing to smoke-test non-local host: ${url.hostname}`);
  }
  return url;
}

const base = assertLocalBaseUrl(baseUrl);

const checks = [
  { label: '92B campaign page', path: '/92b/fund', expected: 200 },
  { label: 'Capital Command Center shell', path: '/capital', expected: 200 },
  { label: 'Capital Launch Room shell', path: '/capital/launch-room', expected: 200 },
  { label: 'Capital Approvals shell', path: '/capital/approvals', expected: 200 },
  { label: 'Capital Patron Brief shell', path: '/capital/patron-brief', expected: 200 },
  { label: 'Capital Scenarios shell', path: '/capital/scenarios', expected: 200 },
  { label: 'Capital Outreach Lab shell', path: '/capital/outreach-lab', expected: 200 },
  { label: 'Capital Weekly Review shell', path: '/capital/weekly-review', expected: 200 },
  { label: 'Capital Window Kit shell', path: '/capital/window-kit', expected: 200 },
  { label: 'Capital Pipeline shell', path: '/capital/pipeline', expected: 200 },
  { label: 'Admin command API unauthenticated boundary', path: '/api/admin/capital', expected: 401 },
  { label: 'Launch Room API unauthenticated boundary', path: '/api/admin/capital/launch-room', expected: 401 },
  { label: 'Approvals API unauthenticated boundary', path: '/api/admin/capital/approvals', expected: 401 },
  { label: 'Patron Brief API unauthenticated boundary', path: '/api/admin/capital/patron-brief', expected: 401 },
  { label: 'Scenarios API unauthenticated boundary', path: '/api/admin/capital/scenarios', expected: 401 },
  { label: 'Outreach Lab API unauthenticated boundary', path: '/api/admin/capital/outreach-lab', expected: 401 },
  { label: 'Weekly Review API unauthenticated boundary', path: '/api/admin/capital/weekly-review', expected: 401 },
  { label: 'Window Kit API unauthenticated boundary', path: '/api/admin/capital/window-kit', expected: 401 },
  { label: 'Pipeline API unauthenticated boundary', path: '/api/admin/capital/pipeline', expected: 401 },
];

async function checkRoute({ label, path, expected }) {
  const url = new URL(path, base);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(ROUTE_TIMEOUT_MS),
    });
    return {
      label,
      path,
      expected,
      received: response.status,
      ok: response.status === expected,
    };
  } catch (error) {
    return {
      label,
      path,
      expected,
      received: 'error',
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

const results = [];
for (const check of checks) {
  results.push(await checkRoute(check));
}

console.log(`Capital Route Smoke: ${base.origin}`);

for (const result of results) {
  const status = result.ok ? 'PASS' : 'FAIL';
  const detail = result.detail ? ` (${result.detail})` : '';
  console.log(`${status} ${result.label}: expected ${result.expected}, received ${result.received}${detail}`);
}

if (results.some((result) => !result.ok)) {
  process.exitCode = 1;
}
