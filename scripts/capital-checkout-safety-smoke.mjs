import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function before(source, first, second) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  return firstIndex !== -1 && secondIndex !== -1 && firstIndex < secondIndex;
}

const checkoutRoutes = {
  ninetyTwoB: read('app/api/92b/checkout/route.ts'),
  projectPledge: read('app/api/projects/[id]/pledge/route.ts'),
  membership: read('app/api/checkout/route.ts'),
  merch: read('app/api/merch/checkout/route.ts'),
};

const docs = {
  handoff: read('docs/soe-current-thread-handoff.md'),
  operator: read('docs/soe-operator-system.md'),
  threatModel: read('docs/soe-privacy-threat-model.md'),
  runbook: read('docs/92b-capital-launch-runbook.md'),
  approvalPacket: read('docs/92b-stripe-approval-packet.md'),
  packageJson: read('package.json'),
  operatorSmoke: read('scripts/operator-smoke.mjs'),
};

const helper = read('lib/capital/checkoutSafety.ts');

const routeValues = Object.values(checkoutRoutes);

const checks = [
  {
    name: 'checkout safety helper blocks local live-mode Stripe sessions',
    ok:
      helper.includes('isLiveStripeSecretKey') &&
      helper.includes("value.startsWith('sk_live_')") &&
      helper.includes('blockLocalLiveStripeCheckout') &&
      helper.includes('live-mode Stripe checkout cannot be created from a local origin') &&
      helper.includes('requiredApproval'),
  },
  {
    name: 'checkout safety helper uses environment-aware return URL base',
    ok:
      helper.includes('NEXT_PUBLIC_SITE_URL') &&
      helper.includes('SITE_URL') &&
      helper.includes('req.nextUrl.origin') &&
      helper.includes("configured.replace(/\\/$/, '')"),
  },
  {
    name: 'all checkout routes call the safety guard before creating Stripe sessions',
    ok: routeValues.every(
      (source) =>
        source.includes('blockLocalLiveStripeCheckout') &&
        source.includes('getCheckoutBaseUrl') &&
        before(source, 'blockLocalLiveStripeCheckout', 'checkout.sessions.create'),
    ),
  },
  {
    name: 'checkout routes do not hard-code production success or cancel origins',
    ok: routeValues.every(
      (source) =>
        !source.includes('https://societyofexplorers.com') &&
        !source.includes('https://www.societyofexplorers.com') &&
        source.includes('success_url: `${baseUrl}') &&
        source.includes('cancel_url: `${baseUrl}'),
    ),
  },
  {
    name: 'checkout routes use Checkout Sessions, not deprecated Charges/Sources APIs',
    ok:
      routeValues.every((source) => source.includes('checkout.sessions.create')) &&
      routeValues.every((source) => !source.includes('.charges.') && !source.includes('.sources.')),
  },
  {
    name: 'local docs record checkout safety guard and approval boundary',
    ok:
      docs.handoff.includes('capital:checkout-safety:smoke') &&
      docs.operator.includes('Capital Checkout Safety') &&
      docs.threatModel.includes('local live-mode checkout sessions') &&
      docs.runbook.includes('npm run capital:checkout-safety:smoke') &&
      docs.approvalPacket.includes('capital:checkout-safety:smoke'),
  },
  {
    name: 'package and operator smoke run checkout safety guard',
    ok:
      docs.packageJson.includes('"capital:checkout-safety:smoke"') &&
      docs.operatorSmoke.includes("npm', 'run', 'capital:checkout-safety:smoke'"),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nCapital checkout safety smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nCapital checkout safety smoke passed.');
