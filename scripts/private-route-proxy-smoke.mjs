#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

const proxySource = read('proxy.ts');
const packageJson = JSON.parse(read('package.json'));
const operatorSmoke = read('scripts/operator-smoke.mjs');
const docs = [
  'docs/soe-operator-system.md',
  'docs/soe-privacy-threat-model.md',
  'docs/soe-current-thread-handoff.md',
  'docs/92b-capital-launch-runbook.md',
];

const checks = [
  {
    name: 'private route proxy gates the expected member surfaces',
    ok:
      proxySource.includes("'/salon'") &&
      proxySource.includes("'/members'") &&
      proxySource.includes("'/book'") &&
      proxySource.includes("'/movement/memory'") &&
      proxySource.includes("'/movement/personal-ai'") &&
      proxySource.includes("'/movement/pod'") &&
      proxySource.includes("'/movement/sovereignty'") &&
      proxySource.includes("'/movement/studio'") &&
      proxySource.includes("'/movement/voice-council'") &&
      proxySource.includes("'/salon/:path*'") &&
      proxySource.includes("'/members/:path*'") &&
      proxySource.includes("'/book/:path*'") &&
      proxySource.includes("'/movement/memory/:path*'") &&
      proxySource.includes("'/movement/personal-ai/:path*'") &&
      proxySource.includes("'/movement/pod/:path*'") &&
      proxySource.includes("'/movement/sovereignty/:path*'") &&
      proxySource.includes("'/movement/studio/:path*'") &&
      proxySource.includes("'/movement/voice-council/:path*'"),
  },
  {
    name: 'private route proxy accepts Supabase session or wallet cookies',
    ok:
      proxySource.includes("cookie.name.startsWith('sb-') && cookie.name.includes('-auth-token')") &&
      proxySource.includes("req.cookies.get('soe_wallet_id')") &&
      proxySource.includes('if (!hasSupabaseSession && !walletId)'),
  },
  {
    name: 'private route proxy defines explicit no-store cache control',
    ok:
      proxySource.includes("const PRIVATE_RESPONSE_CACHE_CONTROL = 'private, no-store, no-cache, max-age=0, must-revalidate';") &&
      proxySource.includes("response.headers.set('cache-control', PRIVATE_RESPONSE_CACHE_CONTROL);") &&
      proxySource.includes("response.headers.set('surrogate-control', 'no-store');") &&
      proxySource.includes("response.headers.set('pragma', 'no-cache');") &&
      proxySource.includes("response.headers.set('expires', '0');"),
  },
  {
    name: 'private route proxy prevents indexing on gated pages',
    ok:
      proxySource.includes("const PRIVATE_RESPONSE_ROBOTS = 'noindex, nofollow, noarchive';") &&
      proxySource.includes("response.headers.set('x-robots-tag', PRIVATE_RESPONSE_ROBOTS);"),
  },
  {
    name: 'private route proxy sets browser privacy and same-origin resource headers',
    ok:
      proxySource.includes("const PRIVATE_RESPONSE_REFERRER_POLICY = 'no-referrer';") &&
      proxySource.includes("const PRIVATE_RESPONSE_CROSS_ORIGIN_RESOURCE_POLICY = 'same-origin';") &&
      proxySource.includes("response.headers.set('referrer-policy', PRIVATE_RESPONSE_REFERRER_POLICY);") &&
      proxySource.includes(
        "response.headers.set('cross-origin-resource-policy', PRIVATE_RESPONSE_CROSS_ORIGIN_RESOURCE_POLICY);",
      ) &&
      proxySource.includes("response.headers.set('x-content-type-options', 'nosniff');"),
  },
  {
    name: 'private route proxy varies protected responses by cookie presence',
    ok:
      proxySource.includes("function appendVaryCookie(headers: Headers)") &&
      proxySource.includes("headers.set('vary', 'Cookie');") &&
      proxySource.includes(".split(',')") &&
      proxySource.includes("value.toLowerCase() === 'cookie'") &&
      proxySource.includes("values.push('Cookie')") &&
      proxySource.includes("appendVaryCookie(response.headers);"),
  },
  {
    name: 'private route proxy applies privacy headers to both redirect and pass-through responses',
    ok:
      proxySource.includes('return applyPrivateRouteHeaders(NextResponse.redirect(new URL(\'/\', req.url)));') &&
      proxySource.includes('return applyPrivateRouteHeaders(NextResponse.next());'),
  },
  {
    name: 'package script exposes private route proxy smoke',
    ok: packageJson.scripts?.['private:route-proxy:smoke'] === 'node scripts/private-route-proxy-smoke.mjs',
  },
  {
    name: 'operator smoke runs private route proxy smoke',
    ok: operatorSmoke.includes("command: ['npm', 'run', 'private:route-proxy:smoke']"),
  },
  {
    name: 'operator docs reference private route proxy smoke',
    ok: docs.every((docPath) => read(docPath).includes('private:route-proxy:smoke')),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nPrivate route proxy smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nPrivate route proxy smoke passed.');
