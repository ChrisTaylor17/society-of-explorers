#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

const route = read('app/api/image-proxy/route.ts');
const labyrinth = read('app/labyrinth/page.tsx');
const packageJson = read('package.json');
const operatorSmoke = read('scripts/operator-smoke.mjs');
const operatorDocs = read('docs/soe-operator-system.md');
const handoff = read('docs/soe-current-thread-handoff.md');

const checks = [
  {
    name: 'image proxy is origin and upload-path allowlisted',
    ok:
      route.includes("const ALLOWED_ORIGIN = 'https://www.giovannidecunto.com'") &&
      route.includes("const ALLOWED_PATH_PREFIX = '/wp-content/uploads/'") &&
      route.includes("upstreamUrl.origin !== ALLOWED_ORIGIN") &&
      route.includes('!upstreamUrl.pathname.startsWith(ALLOWED_PATH_PREFIX)'),
  },
  {
    name: 'image proxy is bounded, timeout-limited, and no-redirect',
    ok:
      route.includes('UPSTREAM_TIMEOUT_MS') &&
      route.includes('MAX_IMAGE_BYTES') &&
      route.includes("redirect: 'error'") &&
      route.includes('AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)') &&
      route.includes('readLimitedBody(res.body, MAX_IMAGE_BYTES)') &&
      route.includes('ImageTooLargeError'),
  },
  {
    name: 'image proxy only serves expected raster image types',
    ok:
      route.includes('ALLOWED_CONTENT_TYPES') &&
      route.includes("'image/jpeg'") &&
      route.includes("'image/png'") &&
      route.includes("'image/webp'") &&
      route.includes("'image/gif'") &&
      route.includes('normalizeContentType') &&
      !route.includes("startsWith('image/')"),
  },
  {
    name: 'image proxy responses include safe cache, sniffing, and same-origin embed headers',
    ok:
      route.includes('imageProxyError') &&
      route.includes("headers: { Referer: ALLOWED_REFERER }") &&
      route.includes("'Cache-Control': ERROR_CACHE_CONTROL") &&
      route.includes("'Cache-Control': IMAGE_CACHE_CONTROL") &&
      route.includes("'X-Content-Type-Options': 'nosniff'") &&
      route.includes("const CROSS_ORIGIN_RESOURCE_POLICY = 'same-origin'") &&
      route.includes("'Cross-Origin-Resource-Policy': CROSS_ORIGIN_RESOURCE_POLICY"),
  },
  {
    name: 'Labyrinth image callers still use the proxy with encoded allowlisted URLs',
    ok:
      labyrinth.includes('/api/image-proxy?url=${encodeURIComponent(url)}') &&
      labyrinth.includes('https://www.giovannidecunto.com/wp-content/uploads/'),
  },
  {
    name: 'package, operator smoke, and docs include image proxy guard',
    ok:
      packageJson.includes('"image-proxy:smoke"') &&
      operatorSmoke.includes("npm', 'run', 'image-proxy:smoke'") &&
      operatorDocs.includes('Image proxy') &&
      handoff.includes('image proxy'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nImage proxy smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nImage proxy smoke passed.');
