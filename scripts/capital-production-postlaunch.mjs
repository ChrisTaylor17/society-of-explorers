#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const DEFAULT_BASE_URL = 'https://www.societyofexplorers.com';
const REQUEST_TIMEOUT_MS = 10_000;
const execFileAsync = promisify(execFile);

const args = process.argv.slice(2);
const soft = args.includes('--soft');
const json = args.includes('--json');
const baseUrlArg = args.find((arg) => arg.startsWith('--base-url='));
const deploymentArg = args.find((arg) => arg.startsWith('--vercel-deployment='));
const baseUrl = new URL(baseUrlArg ? baseUrlArg.slice('--base-url='.length) : DEFAULT_BASE_URL);
const vercelDeployment = deploymentArg?.slice('--vercel-deployment='.length);

if (baseUrl.protocol !== 'https:' && baseUrl.hostname !== 'localhost' && baseUrl.hostname !== '127.0.0.1') {
  throw new Error(`Refusing non-HTTPS production verifier base URL: ${baseUrl.href}`);
}

if (deploymentArg && !vercelDeployment) {
  throw new Error('Missing Vercel deployment after --vercel-deployment=');
}

const results = [];

function record(ok, label, detail) {
  results.push({ ok, label, detail });
}

function headerEntries(headers = {}) {
  if (headers instanceof Headers) {
    return Array.from(headers.entries());
  }

  return Object.entries(headers);
}

function parseIncludedResponse(rawOutput) {
  const output = rawOutput.replace(/\r\n/g, '\n');
  const matches = Array.from(output.matchAll(/^HTTP\/[^\n]*\s(\d{3})[^\n]*$/gm));
  const lastMatch = matches.at(-1);

  if (!lastMatch || lastMatch.index === undefined) {
    throw new Error('Vercel curl response did not include HTTP headers.');
  }

  const headerStart = lastMatch.index;
  const headerEnd = output.indexOf('\n\n', headerStart);

  if (headerEnd === -1) {
    throw new Error('Vercel curl response headers were incomplete.');
  }

  const headerBlock = output.slice(headerStart, headerEnd);
  const body = output.slice(headerEnd + 2);
  const [statusLine, ...headerLines] = headerBlock.split('\n');
  const status = Number(statusLine.match(/^HTTP\/\S+\s+(\d{3})/)?.[1]);
  const headers = new Map();

  for (const line of headerLines) {
    const separator = line.indexOf(':');
    if (separator === -1) {
      continue;
    }

    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    const previous = headers.get(name);
    headers.set(name, previous ? `${previous}, ${value}` : value);
  }

  return {
    body,
    response: {
      status,
      headers: {
        get(name) {
          return headers.get(name.toLowerCase()) || null;
        },
      },
    },
  };
}

async function requestViaVercelCurl(routePath, init = {}) {
  const curlArgs = [
    'vercel',
    'curl',
    routePath,
    '--deployment',
    vercelDeployment,
    '--',
    '--include',
    '--silent',
    '--show-error',
    '--max-time',
    String(Math.ceil(REQUEST_TIMEOUT_MS / 1000)),
  ];

  const method = init.method || 'GET';
  if (method !== 'GET') {
    curlArgs.push('--request', method);
  }

  for (const [name, value] of headerEntries(init.headers)) {
    curlArgs.push('--header', `${name}: ${value}`);
  }

  if (init.body !== undefined) {
    curlArgs.push('--data', typeof init.body === 'string' ? init.body : String(init.body));
  }

  try {
    const { stdout } = await execFileAsync('npx', curlArgs, {
      timeout: REQUEST_TIMEOUT_MS + 15_000,
      maxBuffer: 5 * 1024 * 1024,
    });

    return parseIncludedResponse(stdout);
  } catch (error) {
    const detail =
      error instanceof Error && 'stderr' in error && typeof error.stderr === 'string' && error.stderr
        ? error.stderr
        : error instanceof Error
          ? error.message
          : String(error);
    throw new Error(`Vercel curl failed for ${routePath}: ${detail}`);
  }
}

async function request(routePath, init = {}) {
  if (vercelDeployment) {
    return requestViaVercelCurl(routePath, init);
  }

  const response = await fetch(new URL(routePath, baseUrl), {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      ...(init.headers || {}),
    },
  });

  const body = await response.text();
  return { response, body };
}

function headerIncludes(response, name, expected) {
  return (response.headers.get(name) || '').toLowerCase().includes(expected.toLowerCase());
}

function bodyIncludes(body, expected) {
  return body.includes(expected);
}

async function verifyPage(routePath, label, checks) {
  try {
    const { response, body } = await request(routePath);
    record(response.status === 200, `${label} returns 200`, `received ${response.status}`);
    for (const check of checks) {
      record(check.ok(body, response), check.label, check.detail?.(body, response));
    }
  } catch (error) {
    record(false, `${label} request completed`, error instanceof Error ? error.message : String(error));
  }
}

await verifyPage('/92b/fund', '92B funding page', [
  {
    label: 'funding page has current headline',
    ok: (body) => bodyIncludes(body, 'Fund the First Physical Node'),
  },
  {
    label: 'funding page has direct pledge CTA',
    ok: (body) => bodyIncludes(body, 'PLEDGE FROM $25'),
  },
  {
    label: 'funding page disables untracked crypto transfers',
    ok: (body) => bodyIncludes(body, 'Crypto pledging is not enabled'),
  },
  {
    label: 'funding page no longer serves old headline',
    ok: (body) => !bodyIncludes(body, 'Help build the first Renaissance space'),
  },
]);

await verifyPage('/92b', '92B proposal page', [
  {
    label: 'proposal copy remains conditional',
    ok: (body) => bodyIncludes(body, 'A working vision, not a secured location or active buildout.'),
  },
  {
    label: 'proposal avoids promised buildout date',
    ok: (body) => bodyIncludes(body, 'No buildout or opening date is promised.'),
  },
  {
    label: 'proposal avoids positive secured-location claims',
    ok: (body) =>
      !bodyIncludes(body, 'The space is ours') &&
      !bodyIncludes(body, 'The lease is signed') &&
      !bodyIncludes(body, 'Currently under construction') &&
      !bodyIncludes(body, 'The construction is underway'),
  },
]);

await verifyPage('/robots.txt', 'robots.txt', [
  {
    label: 'robots advertises production host',
    ok: (body) => bodyIncludes(body, 'Host: https://www.societyofexplorers.com'),
  },
  {
    label: 'robots advertises sitemap',
    ok: (body) => bodyIncludes(body, 'Sitemap: https://www.societyofexplorers.com/sitemap.xml'),
  },
  {
    label: 'robots excludes private capital and API surfaces',
    ok: (body) => bodyIncludes(body, 'Disallow: /api/') && bodyIncludes(body, 'Disallow: /capital/'),
  },
]);

await verifyPage('/sitemap.xml', 'sitemap.xml', [
  {
    label: 'sitemap includes 92B proposal',
    ok: (body) => bodyIncludes(body, '<loc>https://www.societyofexplorers.com/92b</loc>'),
  },
  {
    label: 'sitemap includes 92B funding page',
    ok: (body) => bodyIncludes(body, '<loc>https://www.societyofexplorers.com/92b/fund</loc>'),
  },
  {
    label: 'sitemap excludes private surfaces',
    ok: (body) => !bodyIncludes(body, '/capital/') && !bodyIncludes(body, '/api/'),
  },
]);

try {
  const { response, body } = await request('/api/92b/progress');
  record(response.status === 200, 'progress API returns 200', `received ${response.status}`);
  record(headerIncludes(response, 'cache-control', 'no-store'), 'progress API is no-store');
  record(headerIncludes(response, 'surrogate-control', 'no-store'), 'progress API disables surrogate caching');
  record(headerIncludes(response, 'x-robots-tag', 'noindex'), 'progress API is noindex');

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    payload = null;
  }
  record(Boolean(payload), 'progress API returns JSON');
  record(Number.isFinite(payload?.totalRaised), 'progress API totalRaised is numeric');
  record(Number.isFinite(payload?.backerCount), 'progress API backerCount is numeric');
  record(payload?.goal === 120000, 'progress API uses $120k goal');
  record(payload?.source === 'pledge_events', 'progress API is backed by pledge_events');
} catch (error) {
  record(false, 'progress API request completed', error instanceof Error ? error.message : String(error));
}

try {
  const { response, body } = await request('/api/92b/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  record(response.status === 400, 'invalid checkout returns 400 before Stripe session creation', `received ${response.status}`);
  record(headerIncludes(response, 'cache-control', 'private'), 'invalid checkout response is private');
  record(headerIncludes(response, 'cache-control', 'no-store'), 'invalid checkout response is no-store');
  record(headerIncludes(response, 'x-robots-tag', 'noindex'), 'invalid checkout response is noindex');
  record(bodyIncludes(body, 'Unknown pledge tier'), 'invalid checkout error remains generic');
} catch (error) {
  record(false, 'invalid checkout request completed', error instanceof Error ? error.message : String(error));
}

const passed = results.filter((result) => result.ok).length;
const failed = results.length - passed;

const target = vercelDeployment ? `${baseUrl.origin} via ${vercelDeployment}` : baseUrl.origin;

const report = {
  generatedAt: new Date().toISOString(),
  target,
  baseUrl: baseUrl.origin,
  vercelDeployment: vercelDeployment || null,
  soft,
  passed,
  failed,
  results,
};

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Capital Production Postlaunch Verification: ${target}`);
  console.log(`Summary: ${passed} pass, ${failed} fail${soft ? ' (soft mode)' : ''}`);

  for (const result of results) {
    const suffix = result.detail ? ` (${result.detail})` : '';
    console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.label}${suffix}`);
  }
}

if (failed > 0 && !soft) {
  process.exitCode = 1;
}
