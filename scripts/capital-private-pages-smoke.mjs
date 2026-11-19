#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

const privatePages = [
  {
    page: 'app/capital/page.tsx',
    route: '/api/admin/capital',
    signInText: 'Sign in as an approved admin account to view this page.',
  },
  {
    page: 'app/capital/launch-room/page.tsx',
    route: '/api/admin/capital/launch-room',
    signInText: 'Sign in as an approved admin account to view the Launch Room.',
  },
  {
    page: 'app/capital/approvals/page.tsx',
    route: '/api/admin/capital/approvals',
    signInText: 'Sign in as an approved admin account to view the approval checklist.',
  },
  {
    page: 'app/capital/patron-brief/page.tsx',
    route: '/api/admin/capital/patron-brief',
    signInText: 'Sign in as an approved admin account to view the patron brief.',
  },
  {
    page: 'app/capital/scenarios/page.tsx',
    route: '/api/admin/capital/scenarios',
    signInText: 'Sign in as an approved admin account to view the scenario planner.',
  },
  {
    page: 'app/capital/outreach-lab/page.tsx',
    route: '/api/admin/capital/outreach-lab',
    signInText: 'Sign in as an approved admin account to view the Outreach Lab.',
  },
  {
    page: 'app/capital/weekly-review/page.tsx',
    route: '/api/admin/capital/weekly-review',
    signInText: 'Sign in as an approved admin account to view the weekly capital review.',
  },
  {
    page: 'app/capital/window-kit/page.tsx',
    route: '/api/admin/capital/window-kit',
    signInText: 'Sign in as an approved admin account to view this draft package.',
  },
  {
    page: 'app/capital/pipeline/page.tsx',
    route: '/api/admin/capital/pipeline',
    signInText: 'Sign in as an approved admin account to view the capital pipeline.',
  },
  {
    page: 'app/capital/ai-status/page.tsx',
    route: '/api/admin/ai/status',
    signInText: 'Sign in as an approved admin account to view AI status.',
  },
];

function fetchBlocks(source, route) {
  const blocks = [];
  const escapedRoute = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`fetch\\(['"]${escapedRoute}['"],\\s*\\{([\\s\\S]*?)\\n\\s*\\}\\)`, 'g');
  let match;
  while ((match = pattern.exec(source))) blocks.push(match[1]);
  return blocks;
}

const checks = [];

for (const item of privatePages) {
  const source = read(item.page);
  const blocks = fetchBlocks(source, item.route);

  checks.push({
    name: `${item.page} fetches its private admin route`,
    ok: blocks.length > 0,
  });
  checks.push({
    name: `${item.page} sends Supabase access token to private admin route`,
    ok:
      source.includes("import { getSupabaseAccessToken } from '@/lib/auth/getSession'") &&
      source.includes('const token = await getSupabaseAccessToken()') &&
      blocks.every((block) => block.includes('Authorization: `Bearer ${token}`')),
  });
  checks.push({
    name: `${item.page} uses no-store private admin fetches`,
    ok: blocks.length > 0 && blocks.every((block) => block.includes("cache: 'no-store'")),
  });
  checks.push({
    name: `${item.page} exits loading state on auth/API failure`,
    ok:
      source.includes('finally') &&
      source.includes('setLoading(false)'),
  });
  checks.push({
    name: `${item.page} fails closed with admin sign-in guidance`,
    ok: source.includes(item.signInText),
  });
}

const routeFiles = [
  'app/api/admin/capital/route.ts',
  'app/api/admin/capital/launch-room/route.ts',
  'app/api/admin/capital/approvals/route.ts',
  'app/api/admin/capital/patron-brief/route.ts',
  'app/api/admin/capital/scenarios/route.ts',
  'app/api/admin/capital/outreach-lab/route.ts',
  'app/api/admin/capital/weekly-review/route.ts',
  'app/api/admin/capital/window-kit/route.ts',
  'app/api/admin/capital/pipeline/route.ts',
  'app/api/admin/ai/status/route.ts',
];

const privateJsonHelper = read('lib/http/routeError.ts');

function privateHeaderSetPattern(headerName, valuePattern) {
  return new RegExp(`(?:response\\.headers|headers)\\.set\\('${headerName}',\\s*'${valuePattern}'\\)`);
}

function disablesResponseCaching(source) {
  if (source.includes("'cache-control': 'no-store'")) return true;
  return (
    source.includes("import { privateJson } from '@/lib/http/routeError'") &&
    source.includes('return privateJson') &&
    privateHeaderSetPattern('cache-control', "[^']*no-store[^']*").test(privateJsonHelper)
  );
}

function hasPrivateUnauthorized(source) {
  return (
    source.includes("privateJson({ error: 'Unauthorized' }") ||
    source.includes("commandCenterJson({ error: 'Unauthorized' }") ||
    source.includes("pipelineJson({ error: 'Unauthorized' }")
  );
}

for (const routeFile of routeFiles) {
  const source = read(routeFile);
  checks.push({
    name: `${routeFile} is admin-gated`,
    ok: source.includes('requireCapitalAdmin'),
  });
  checks.push({
    name: `${routeFile} returns private unauthorized responses`,
    ok: hasPrivateUnauthorized(source),
  });
  checks.push({
    name: `${routeFile} disables response caching`,
    ok: disablesResponseCaching(source),
  });
}

checks.push({
  name: 'private capital admin routes keep availability failure logs generic',
  ok: routeFiles.every((routeFile) => {
    const source = read(routeFile);
    return !source.includes('console.error') && !source.includes('error.message');
  }),
});

checks.push({
  name: 'private capital admin routes avoid raw NextResponse JSON responses',
  ok: routeFiles.every((routeFile) => !read(routeFile).includes('NextResponse.json')),
});

checks.push({
  name: 'operator docs include private capital page reliability guard',
  ok:
    read('docs/soe-operator-system.md').includes('capital:private-pages:smoke') &&
    read('docs/soe-current-thread-handoff.md').includes('capital:private-pages:smoke') &&
    read('docs/soe-privacy-threat-model.md').includes('capital:private-pages:smoke'),
});

checks.push({
  name: 'shared private route helper blocks indexing for authenticated responses',
  ok: privateHeaderSetPattern('x-robots-tag', 'noindex,\\s*nofollow,\\s*noarchive').test(privateJsonHelper),
});

checks.push({
  name: 'shared private route helper disables browser and intermediary caching',
  ok:
    privateHeaderSetPattern('cache-control', "[^']*private[^']*no-store[^']*no-cache[^']*must-revalidate[^']*").test(privateJsonHelper) &&
    privateHeaderSetPattern('surrogate-control', 'no-store').test(privateJsonHelper) &&
    privateHeaderSetPattern('pragma', 'no-cache').test(privateJsonHelper) &&
    privateHeaderSetPattern('expires', '0').test(privateJsonHelper),
});

checks.push({
  name: 'shared private route helper blocks content sniffing',
  ok: privateHeaderSetPattern('x-content-type-options', 'nosniff').test(privateJsonHelper),
});

checks.push({
  name: 'shared private route helper varies by auth and cookie context',
  ok:
    (privateJsonHelper.includes("appendVary(response, 'Cookie')") ||
      privateJsonHelper.includes("appendVary(headers, 'Cookie')")) &&
    (privateJsonHelper.includes("appendVary(response, 'Authorization')") ||
      privateJsonHelper.includes("appendVary(headers, 'Authorization')")) &&
    privateJsonHelper.includes('value.toLowerCase() === token.toLowerCase()'),
});

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nCapital private pages smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nCapital private pages smoke passed.');
