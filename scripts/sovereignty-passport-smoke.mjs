#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

const files = {
  passportRoute: read('app/api/movement/sovereignty/passport/route.ts'),
  passportLib: read('lib/movement/sovereigntyPassport.ts'),
  passportPage: read('app/movement/sovereignty/page.tsx'),
  handoff: read('docs/soe-current-thread-handoff.md'),
  threatModel: read('docs/soe-privacy-threat-model.md'),
  operatorSystem: read('docs/soe-operator-system.md'),
};

const checks = [
  {
    name: 'sovereignty passport includes shared memory consent readiness',
    ok:
      files.passportLib.includes('buildMemoryConsentReadiness') &&
      files.passportLib.includes('consent: {') &&
      files.passportLib.includes('active_facts_included: true') &&
      files.passportLib.includes('suppressed_or_expired_facts_included: false') &&
      files.passportLib.includes('raw_memory_content_included: false'),
  },
  {
    name: 'sovereignty passport route returns generic private failures',
    ok:
      files.passportRoute.includes('internalRouteError(') &&
      !files.passportRoute.includes('console.error') &&
      !files.passportRoute.includes('String(err)') &&
      !files.passportRoute.includes('details:'),
  },
  {
    name: 'sovereignty passport helper logs scoped generic failures',
    ok:
      files.passportLib.includes('reportSovereigntyFailure') &&
      !files.passportLib.includes('console.error') &&
      !files.passportLib.includes('String(err)') &&
      !files.passportLib.includes('String(error)') &&
      !files.passportLib.includes('error.message') &&
      !files.passportLib.includes('details:'),
  },
  {
    name: 'sovereignty passport privacy notes exclude raw memory content',
    ok:
      files.passportLib.includes('plaintext memory') &&
      files.passportLib.includes('suppressed or expired memory facts are not returned here'),
  },
  {
    name: 'sovereignty page displays consent mode and export scope',
    ok:
      files.passportPage.includes('CONSENT') &&
      files.passportPage.includes('Consent mode') &&
      files.passportPage.includes('Export scope') &&
      files.passportPage.includes('Suppressed included') &&
      files.passportPage.includes('consentModeLabel'),
  },
  {
    name: 'operator docs mention sovereignty consent readiness guard',
    ok:
      files.handoff.includes('sovereignty passport') &&
      files.handoff.includes('generic sovereignty helper failures') &&
      files.threatModel.includes('Sovereignty Passport') &&
      files.operatorSystem.includes('sovereignty:passport:smoke'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nSovereignty passport smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nSovereignty passport smoke passed.');
