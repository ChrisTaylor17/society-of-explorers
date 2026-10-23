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
  packageJson: read('package.json'),
  operatorSmoke: read('scripts/operator-smoke.mjs'),
  operatorDoc: read('docs/soe-operator-system.md'),
  runbook: read('docs/92b-capital-launch-runbook.md'),
  handoff: read('docs/soe-current-thread-handoff.md'),
};

const checks = [
  {
    name: '92B checkout derives price and label from the exact server-side tier id',
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
    name: '92B browser checkout sends intent, not an authoritative price or label',
    ok:
      files.page.includes('tierId: tier.id') &&
      !files.page.includes('tier: tier.name') &&
      !files.page.includes('amount: tier.amount'),
  },
  {
    name: '92B checkout validates email and keeps attribution classification-only',
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
    name: '92B checkout returns private no-store JSON and validates Stripe-hosted destinations',
    ok:
      files.checkout.includes("import { privateJson } from '@/lib/http/routeError'") &&
      files.checkout.includes("url.protocol === 'https:' && url.hostname === 'checkout.stripe.com'") &&
      files.checkout.includes('if (!isStripeCheckoutUrl(session.url))') &&
      files.checkout.includes("privateJson({ error: 'Checkout is unavailable right now' }") &&
      files.checkout.includes('return privateJson({ url: session.url })') &&
      !files.checkout.includes('NextResponse'),
  },
  {
    name: 'funding page exposes recoverable checkout failures and validates navigation',
    ok:
      files.page.includes('const [checkoutError, setCheckoutError]') &&
      files.page.includes('isStripeCheckoutUrl(data.url)') &&
      files.page.includes('Checkout could not start.') &&
      files.page.includes('role="alert"') &&
      files.page.includes('aria-live="polite"'),
  },
  {
    name: 'funding hero presents a direct, honest path to reviewed pledge tiers',
    ok:
      files.page.includes('href="#pledge-tiers"') &&
      files.page.includes('PLEDGE FROM $25') &&
      files.page.includes('id="pledge-tiers"') &&
      files.page.includes("scrollMarginTop: '72px'") &&
      files.page.indexOf('{/* ═══ PLEDGE TIERS ═══ */}') <
        files.page.indexOf('<section id="pledge-tiers"') &&
      files.page.includes('No equity or financial return') &&
      files.page.includes('Patron benefits follow verified payment'),
  },
  {
    name: 'pledge dialog has labels, Escape support, focus recovery, and modal semantics',
    ok:
      files.page.includes('role="dialog"') &&
      files.page.includes('aria-modal="true"') &&
      files.page.includes('aria-labelledby="pledge-dialog-title"') &&
      files.page.includes('aria-describedby="pledge-dialog-description"') &&
      files.page.includes("event.key !== 'Escape'") &&
      files.page.includes('emailInputRef.current?.focus()') &&
      files.page.includes('pledgeOpenerRef.current?.focus()') &&
      files.page.includes('htmlFor="pledge-email"'),
  },
  {
    name: 'return banner waits for verified fulfillment instead of claiming payment completion',
    ok:
      files.page.includes('Payment confirmation may take a moment') &&
      files.page.includes('fulfilled benefits follow the verified payment event') &&
      !files.page.includes('Your pledge has been received'),
  },
  {
    name: 'untracked direct-wallet payment instructions are disabled',
    ok:
      files.page.includes('Crypto pledging is not enabled') &&
      files.page.includes('Please do not send funds directly to a wallet') &&
      !files.page.includes('0x22fEA1dd7626f0eB50861daDC01F60f7336f135c') &&
      !files.page.includes('All crypto pledges receive bonus'),
  },
  {
    name: 'funding progress is fetched and returned without caching or raw failure details',
    ok:
      files.page.includes("fetch('/api/92b/progress', { cache: 'no-store' })") &&
      files.progress.includes("'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate'") &&
      files.progress.includes("'Surrogate-Control': 'no-store'") &&
      files.progress.includes("'X-Robots-Tag': 'noindex, nofollow, noarchive'") &&
      files.progress.includes("console.warn('[92b/progress] aggregate lookup failed')") &&
      !files.progress.includes("console.error('92B progress error:', err)"),
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
