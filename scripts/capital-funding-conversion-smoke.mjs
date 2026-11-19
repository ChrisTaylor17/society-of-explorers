import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

const files = {
  page: read('app/92b/fund/page.tsx'),
  checkout: read('app/api/92b/checkout/route.ts'),
  progress: read('app/api/92b/progress/route.ts'),
  releaseBlock: read('lib/capital/physicalSpaceReleaseBlock.ts'),
  browser: read('verification/web/scripts/browser-physical-space-hold.mjs'),
  packageJson: read('package.json'),
  operatorSmoke: read('scripts/operator-smoke.mjs'),
  operatorDoc: read('docs/soe-operator-system.md'),
  runbook: read('docs/92b-capital-launch-runbook.md'),
  handoff: read('docs/soe-current-thread-handoff.md'),
};

const checks = [
  {
    name: 'Retained legacy checkout derives price and label from the exact server-side tier id',
    ok:
      files.checkout.includes('const tierId = boundedText(body.tierId, 80).toLowerCase()') &&
      files.checkout.includes('const tierDefinition = getTierById(NINETY_TWO_B_TIERS, tierId)') &&
      files.checkout.includes("privateJson({ error: 'Unknown pledge tier' }") &&
      files.checkout.includes('const amountCents = dollarsToCents(tierDefinition.amount)') &&
      files.checkout.includes('tier_id: tierDefinition.id') &&
      files.checkout.includes('amount: String(tierDefinition.amount)') &&
      !files.checkout.includes('getTierByLabelOrAmount') &&
      !files.checkout.includes('Number(body.amount)'),
  },
  {
    name: 'current proposal page does not collect payment intent or personal data',
    ok: !files.page.includes('fetch(') && !files.page.includes('<form') && !files.page.includes('<input') &&
      !files.page.includes('window.location') && files.page.includes('Pledges are not open.'),
  },
  {
    name: 'Retained legacy checkout validates email and keeps attribution classification-only',
    ok:
      files.checkout.includes('normalizeEmail(body.email)') &&
      files.checkout.includes("const source = '92b_fund_page'") &&
      files.checkout.includes("new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'])") &&
      files.checkout.includes('normalizeAttributionToken') &&
      files.checkout.includes("/^[a-z0-9][a-z0-9._-]{0,63}$/.test(token)") &&
      files.checkout.includes('sanitizeUtm(body.utm)') &&
      files.checkout.includes('...(sanitizedUtm || {})') &&
      !files.page.includes("source: '92b_fund_page'"),
  },
  {
    name: 'Retained legacy checkout returns private no-store JSON and validates Stripe-hosted destinations',
    ok:
      files.checkout.includes("import { privateJson } from '@/lib/http/routeError'") &&
      files.checkout.includes("url.protocol === 'https:' && url.hostname === 'checkout.stripe.com'") &&
      files.checkout.includes('if (!isStripeCheckoutUrl(session.url))') &&
      files.checkout.includes("privateJson({ error: 'Checkout is unavailable right now' }") &&
      files.checkout.includes('return privateJson({ url: session.url })') &&
      !files.checkout.includes('NextResponse'),
  },
  {
    name: 'server hold precedes checkout parsing and progress lookup',
    ok: [files.checkout, files.progress].every(source => source.includes('if (unavailable) return unavailable;')) &&
      files.checkout.indexOf('const unavailable = physicalSpaceReleaseBlock()') < files.checkout.indexOf('const body = await safeRequestJson(req)') &&
      files.progress.indexOf('const unavailable = physicalSpaceReleaseBlock()') < files.progress.indexOf('const ledgerProgress = await getNinetyTwoBProgressFromLedger'),
  },
  {
    name: 'current campaign hold is private and cannot be opened with environment or body flags',
    ok: files.releaseBlock.includes("code: 'PHYSICAL_SPACE_ON_HOLD'") && files.releaseBlock.includes('{ status: 503 }') &&
      files.releaseBlock.includes('return privateJson') && !files.releaseBlock.includes('process.env') &&
      !files.releaseBlock.includes('return null') && !files.releaseBlock.includes('totalRaised:'),
  },
  {
    name: 'proposal distinguishes unavailable totals and historical allocation from payments',
    ok: files.page.includes('Verified campaign totals are not available here') && files.page.includes('earlier proposed budget, not money raised') &&
      files.page.includes('this page does not confirm a payment or accept a pledge'),
  },
  {
    name: 'old return links and direct-wallet instructions cannot open the campaign',
    ok: !files.page.includes('URLSearchParams') && !files.page.includes('useSearchParams') &&
      !files.page.includes('PAY WITH CARD') && !files.page.includes('0x22fEA1dd7626f0eB50861daDC01F60f7336f135c') &&
      !files.page.includes('All crypto pledges receive bonus'),
  },
  {
    name: 'the proposal directs readers to the existing online pilot and organizational review',
    ok: files.page.includes('href="/salons/pilot"') && files.page.includes('href="/structure"') &&
      files.page.includes('Tax-deductible giving is not promised'),
  },
  {
    name: 'compiled acceptance covers saved return links, seven HTTP refusals and non-JavaScript reading',
    ok: files.browser.includes('NONISSUED_RETURN_FIXTURE') && files.browser.includes('actualHttp.push') &&
      files.browser.includes('javaScriptEnabled: false') && files.browser.includes('PHYSICAL_SPACE_ON_HOLD'),
  },
  {
    name: 'funding conversion guard is wired into package, operator, and launch docs',
    ok:
      files.packageJson.includes('"capital:funding-conversion:smoke"') &&
      files.operatorSmoke.includes("command: ['npm', 'run', 'capital:funding-conversion:smoke']") &&
      files.operatorDoc.includes('Capital Funding Conversion') &&
      files.runbook.includes('npm run capital:funding-conversion:smoke') &&
      files.handoff.includes('npm run capital:funding-conversion:smoke'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nCapital funding conversion smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nCapital funding conversion smoke passed.');
