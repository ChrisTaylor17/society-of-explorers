#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

const helper = read('lib/http/routeError.ts');
const practiceReflectRoute = read('app/api/practice/reflect/route.ts');
const packageJson = JSON.parse(read('package.json'));
const operatorSmoke = read('scripts/operator-smoke.mjs');

function cacheControlTokens() {
  const match = helper.match(/headers\.set\('cache-control',\s*'([^']+)'\)/);
  if (!match) return [];

  return match[1].split(',').map((token) => token.trim().toLowerCase());
}

const cacheTokens = cacheControlTokens();

const docs = [
  'docs/soe-operator-system.md',
  'docs/soe-privacy-threat-model.md',
  'docs/soe-current-thread-handoff.md',
  'docs/92b-capital-launch-runbook.md',
];

const checks = [
  {
    name: 'private route helper exposes private JSON and attachment helpers',
    ok:
      helper.includes('export function privateJson') &&
      helper.includes('export function privateEventStreamHeaders') &&
      helper.includes('export function privateAttachmentJson') &&
      helper.includes('export function internalRouteError'),
  },
  {
    name: 'privateEventStreamHeaders applies streaming-safe private headers',
    ok:
      helper.includes("headers.set('content-type', 'text/event-stream; charset=utf-8')") &&
      helper.includes("headers.set('cache-control', 'private, no-store, no-cache, max-age=0, must-revalidate, no-transform')") &&
      helper.includes("headers.set('connection', 'keep-alive')") &&
      helper.includes('applyPrivateHeaders(headers);'),
  },
  {
    name: 'privateJson wraps NextResponse.json with shared private headers',
    ok: /export function privateJson\(body: unknown, init: JsonInit = \{\}\) \{[\s\S]*?const response = NextResponse\.json\(body, init\);[\s\S]*?applyPrivateHeaders\(response\.headers\);[\s\S]*?return response;[\s\S]*?\}/.test(
      helper,
    ),
  },
  {
    name: 'privateAttachmentJson emits sanitized JSON downloads with shared private headers',
    ok:
      /export function privateAttachmentJson\(body: unknown, init: AttachmentInit\) \{[\s\S]*?const filename = sanitizeAttachmentFilename\(init\.filename\);[\s\S]*?new NextResponse\(JSON\.stringify\(body, null, 2\)/.test(
        helper,
      ) &&
      helper.includes('const headers = new Headers(init.headers);') &&
      helper.includes("headers.set('content-type', 'application/json; charset=utf-8');") &&
      helper.includes("headers.set('content-disposition', `attachment; filename=\"${filename}\"`);") &&
      /headers,\s*\}\);/.test(helper) &&
      /applyPrivateHeaders\(response\.headers\);[\s\S]*?return response;/.test(helper),
  },
  {
    name: 'attachment filenames are bounded to safe local JSON names',
    ok:
      /function sanitizeAttachmentFilename\(filename: string\): string \{[\s\S]*?filename[\s\S]*?\.trim\(\)/.test(
        helper,
      ) &&
      /\.replace\(\s*\/\[\\\\\\\/\]\+\/g,\s*'-'\s*\)/.test(helper) &&
      /\.replace\(\s*\/\[\\r\\n"\]\/g,\s*''\s*\)/.test(helper) &&
      /\.replace\(\s*\/\[\^A-Za-z0-9\._ -\]\+\/g,\s*'-'\s*\)/.test(helper) &&
      /\.replace\(\s*\/\\s\+\/g,\s*' '\s*\)/.test(helper) &&
      /\.replace\(\s*\/\^\[-\. \]\+\|\[-\. \]\+\$\/g,\s*''\s*\)/.test(helper) &&
      helper.includes("return cleaned || 'download.json';"),
  },
  {
    name: 'shared private headers disable browser and intermediary caching',
    ok:
      cacheTokens.includes('private') &&
      cacheTokens.includes('no-store') &&
      cacheTokens.includes('no-cache') &&
      cacheTokens.includes('max-age=0') &&
      cacheTokens.includes('must-revalidate') &&
      /headers\.set\('surrogate-control',\s*'no-store'\)/.test(helper) &&
      /headers\.set\('pragma',\s*'no-cache'\)/.test(helper) &&
      /headers\.set\('expires',\s*'0'\)/.test(helper),
  },
  {
    name: 'shared private headers block indexing and content sniffing',
    ok:
      /headers\.set\('content-security-policy',\s*"default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"\)/.test(helper) &&
      /headers\.set\('x-frame-options',\s*'DENY'\)/.test(helper) &&
      /headers\.set\('x-robots-tag',\s*'noindex,\s*nofollow,\s*noarchive'\)/.test(helper) &&
      /headers\.set\('x-content-type-options',\s*'nosniff'\)/.test(helper) &&
      /headers\.set\('referrer-policy',\s*'no-referrer'\)/.test(helper) &&
      /headers\.set\('cross-origin-resource-policy',\s*'same-origin'\)/.test(helper),
  },
  {
    name: 'Vary handling preserves existing values and dedupes auth/cookie tokens case-insensitively',
    ok:
      helper.includes("const current = headers.get('vary')") &&
      helper.includes("headers.set('vary', token)") &&
      helper.includes(".split(',')") &&
      helper.includes('.map((value) => value.trim())') &&
      helper.includes('.filter(Boolean)') &&
      helper.includes('value.toLowerCase() === token.toLowerCase()') &&
      helper.includes('values.push(token)') &&
      helper.includes("headers.set('vary', values.join(', '))") &&
      helper.includes("appendVary(headers, 'Cookie')") &&
      helper.includes("appendVary(headers, 'Authorization')"),
  },
  {
    name: 'internalRouteError returns private JSON errors',
    ok: /export function internalRouteError\(message: string, status = 500\) \{\s*return privateJson\(\{ error: message \}, \{ status \}\);\s*\}/.test(
      helper,
    ),
  },
  {
    name: 'practice reflection route reuses shared private event-stream headers',
    ok:
      practiceReflectRoute.includes("import { privateEventStreamHeaders } from '@/lib/http/routeError';") &&
      practiceReflectRoute.includes('headers: privateEventStreamHeaders()') &&
      !practiceReflectRoute.includes('function privateSseHeaders()'),
  },
  {
    name: 'package script exposes private route helper smoke',
    ok: packageJson.scripts?.['private:route-helper:smoke'] === 'node scripts/private-route-helper-smoke.mjs',
  },
  {
    name: 'operator smoke runs private route helper smoke',
    ok: operatorSmoke.includes("command: ['npm', 'run', 'private:route-helper:smoke']"),
  },
  {
    name: 'operator docs reference private route helper smoke',
    ok: docs.every((docPath) => read(docPath).includes('private:route-helper:smoke')),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nPrivate route helper smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nPrivate route helper smoke passed.');
