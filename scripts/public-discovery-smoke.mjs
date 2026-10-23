#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

const files = {
  robots: read('app/robots.ts'),
  sitemap: read('app/sitemap.ts'),
  rootLayout: read('app/layout.tsx'),
  ninetyTwoBLayout: read('app/92b/layout.tsx'),
  fundLayout: read('app/92b/fund/layout.tsx'),
  ninetyTwoBPage: read('app/92b/page.tsx'),
  movementPodLayout: read('app/movement/pod/layout.tsx'),
  movementSovereigntyLayout: read('app/movement/sovereignty/layout.tsx'),
  movementMemoryLayout: read('app/movement/memory/layout.tsx'),
  movementPersonalAiLayout: read('app/movement/personal-ai/layout.tsx'),
  movementStudioLayout: read('app/movement/studio/layout.tsx'),
  movementVoiceCouncilLayout: read('app/movement/voice-council/layout.tsx'),
  preflight: read('scripts/capital-preflight.mjs'),
  package: read('package.json'),
  operatorSmoke: read('scripts/operator-smoke.mjs'),
  operatorDocs: read('docs/soe-operator-system.md'),
  handoff: read('docs/soe-current-thread-handoff.md'),
  runbook: read('docs/92b-capital-launch-runbook.md'),
};

const privateMovementLayouts = [
  files.movementPodLayout,
  files.movementSovereigntyLayout,
  files.movementMemoryLayout,
  files.movementPersonalAiLayout,
  files.movementStudioLayout,
  files.movementVoiceCouncilLayout,
];

const forbiddenPositiveClaims = [
  'The space is ours',
  'Currently under construction',
  'The lease is signed',
  'The construction is underway',
  'This is happening.',
];

const checks = [
  {
    name: 'robots route allows public discovery and excludes private surfaces',
    ok:
      files.robots.includes("import type { MetadataRoute } from 'next'") &&
      files.robots.includes('MetadataRoute.Robots') &&
      files.robots.includes("allow: '/'") &&
      files.robots.includes("'/api/'") &&
      files.robots.includes("'/capital/'") &&
      files.robots.includes("'/dashboard/'") &&
      files.robots.includes("'/movement/'") &&
      files.robots.includes("sitemap: `${siteUrl}/sitemap.xml`"),
  },
  {
    name: 'sitemap contains curated public routes without private paths',
    ok:
      files.sitemap.includes('MetadataRoute.Sitemap') &&
      files.sitemap.includes("path: '/92b/fund'") &&
      files.sitemap.includes("path: '/join'") &&
      files.sitemap.includes("path: '/movement'") &&
      !files.sitemap.includes("path: '/capital") &&
      !files.sitemap.includes("path: '/dashboard") &&
      !files.sitemap.includes("path: '/api"),
  },
  {
    name: 'root metadata provides a stable canonical base and title template',
    ok:
      files.rootLayout.includes("metadataBase: new URL('https://www.societyofexplorers.com')") &&
      files.rootLayout.includes("template: '%s | Society of Explorers'"),
  },
  {
    name: '92B routes have distinct canonical and social metadata',
    ok:
      files.ninetyTwoBLayout.includes("canonical: '/92b'") &&
      files.ninetyTwoBLayout.includes("url: '/92b'") &&
      files.fundLayout.includes("canonical: '/92b/fund'") &&
      files.fundLayout.includes("url: '/92b/fund'") &&
      files.fundLayout.includes('Patronage offers recognition, access, community, and artifacts, not financial returns.'),
  },
  {
    name: 'private Movement member tools carry noindex metadata',
    ok: privateMovementLayouts.every(
      (source) =>
        source.includes("import type { Metadata } from 'next'") &&
        source.includes('robots: {') &&
        source.includes('index: false') &&
        source.includes('follow: false'),
    ),
  },
  {
    name: '92B public copy is conditional and removes false location claims',
    ok:
      forbiddenPositiveClaims.every((claim) => !files.ninetyTwoBPage.includes(claim)) &&
      files.ninetyTwoBPage.includes('subject to lease status, repairs, access, and landlord alignment') &&
      files.ninetyTwoBPage.includes('A working vision, not a secured location or active buildout.') &&
      files.ninetyTwoBPage.includes('No buildout or opening date is promised.') &&
      files.ninetyTwoBPage.includes('This may begin here.'),
  },
  {
    name: 'capital preflight scans the full 92B path for false claims',
    ok:
      files.preflight.includes("'app/92b/page.tsx'") &&
      files.preflight.includes("'lease signed'") &&
      files.preflight.includes("'space is ours'") &&
      files.preflight.includes("'currently under construction'") &&
      files.preflight.includes("'construction is underway'"),
  },
  {
    name: 'public discovery guard is wired into package, operator, and launch docs',
    ok:
      files.package.includes('"public:discovery:smoke": "node scripts/public-discovery-smoke.mjs"') &&
      files.operatorSmoke.includes("label: 'Public discovery and 92B claims'") &&
      files.operatorSmoke.includes("'public:discovery:smoke'") &&
      files.operatorDocs.includes('public:discovery:smoke') &&
      files.handoff.includes('public:discovery:smoke') &&
      files.runbook.includes('public:discovery:smoke'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nPublic discovery smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nPublic discovery smoke passed.');
