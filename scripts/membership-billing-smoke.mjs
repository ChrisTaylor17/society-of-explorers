#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const root = process.cwd();
const ts = createRequire(import.meta.url)('typescript');

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

const files = {
  join: read('app/join/page.tsx'),
  joinContent: read('lib/join/content.ts'),
  billingUi: read('app/billing/SupporterBilling.tsx'),
  supporterContracts: read('lib/supporter/contracts.ts'),
  supporterConfig: read('lib/supporter/config.ts'),
  structuredData: read('lib/join/structuredData.ts'),
  stripeMode: read('lib/payments/stripeMode.ts'),
  login: read('app/login/page.tsx'),
  loginForm: read('lib/auth/loginForm.ts'),
  callback: read('app/auth/callback/route.ts'),
  checkout: read('app/api/checkout/route.ts'),
  authenticatedMember: read('lib/getAuthenticatedMember.ts'),
  webhook: read('app/api/stripe/webhook/route.ts'),
  legacyBilling: read('lib/payments/legacyBilling.ts'),
  legacyConfig: read('lib/payments/legacyBillingConfig.ts'),
  legacyProvider: read('lib/payments/legacyBillingProvider.ts'),
  legacyRepository: read('lib/payments/legacyBillingRepository.ts'),
  memberLookup: read('lib/payments/memberLookup.ts'),
  package: read('package.json'),
  operator: read('scripts/operator-smoke.mjs'),
  handoff: read('docs/soe-current-thread-handoff.md'),
};

// Compare parsed code tokens, not source layout. The existing TypeScript parser
// handles template boundaries and retains literal contents and token boundaries.
// This makes only the strict server wiring checks insensitive to formatting;
// it does not turn these static checks into behavioral payment verification.
function codeTokens(source) {
  const parsed = ts.createSourceFile('billing-smoke.ts', source, ts.ScriptTarget.Latest, true);
  const tokens = [];
  function visit(node) {
    const children = node.getChildren(parsed);
    if (children.length) children.forEach(visit);
    else if (node.kind !== ts.SyntaxKind.EndOfFileToken) {
      const token = node.getText(parsed);
      if (token) tokens.push(token);
    }
  }
  visit(parsed);
  return tokens.join(' ');
}

const serverCode = Object.fromEntries(
  ['webhook', 'legacyBilling', 'legacyConfig', 'legacyProvider', 'legacyRepository', 'memberLookup']
    .map((name) => [name, codeTokens(files[name])]),
);
const hasCode = (name, snippet) => serverCode[name].includes(codeTokens(snippet));
const codeIndex = (name, snippet) => serverCode[name].indexOf(codeTokens(snippet));

const checks = [
  {
    name: 'new public offer is optional monthly support with free access and no legacy-tier sales',
    ok: files.joinContent.includes("id: 'supporter', name: 'Supporter', price: '$10'") &&
      files.joinContent.includes('same free reading and Circle access') &&
      !files.joinContent.includes("cta: 'BECOME A SEEKER'") &&
      !files.structuredData.includes("'https://schema.org/InStock'"),
  },
  {
    name: 'new supporter sales default closed and legacy sales have a separate explicit gate',
    ok: files.supporterConfig.includes("salesEnabled: env.SOE_SUPPORTER_SALES_ENABLED === 'true'") &&
      files.checkout.includes("SOE_LEGACY_MEMBERSHIP_SALES_ENABLED !== 'true'") &&
      files.checkout.indexOf("SOE_LEGACY_MEMBERSHIP_SALES_ENABLED !== 'true'") < files.checkout.indexOf('checkout.sessions.create'),
  },
  {
    name: 'existing legacy tiers retain their provider price mappings',
    ok:
      files.checkout.includes("new Set(['seeker', 'scholar', 'philosopher', 'oracle'])") &&
      ['SEEKER', 'SCHOLAR', 'PHILOSOPHER', 'ORACLE'].every((tier) =>
        files.stripeMode.includes(`'STRIPE_PRICE_${tier}'`),
      ) &&
      files.checkout.includes('membershipPriceId(') &&
      ['SEEKER', 'SCHOLAR', 'PHILOSOPHER', 'ORACLE'].every((tier) =>
        files.stripeMode.includes(`'STRIPE_TEST_PRICE_${tier}'`),
      ),
  },
  {
    name: 'checkout validates input and requires an authenticated member before Stripe work',
    ok:
      files.checkout.includes('body = await req.json()') &&
      files.checkout.includes("return privateJson({ error: 'Invalid request body' }, 400)") &&
      files.checkout.includes('if (!MEMBERSHIP_TIERS.has(tier))') &&
      files.checkout.includes('const authenticated = await getAuthenticatedMember(req)') &&
      files.checkout.includes("return privateJson({ error: 'Sign in before choosing a paid membership', code: 'sign_in_required' }, 401)") &&
      files.checkout.indexOf('if (!MEMBERSHIP_TIERS.has(tier))') <
        files.checkout.indexOf('checkout.sessions.create') &&
      files.checkout.indexOf('const authenticated = await getAuthenticatedMember(req)') <
        files.checkout.indexOf('checkout.sessions.create'),
  },
  {
    name: 'membership checkout derives email from the authenticated member instead of client input',
    ok:
      files.authenticatedMember.includes("display_name, email, bio") &&
      files.authenticatedMember.includes('email: string | null') &&
      files.checkout.includes('authenticated.member.email?.trim().toLowerCase()') &&
      files.checkout.includes('customer_email: email') &&
      !files.billingUi.includes('customer_email:') &&
      files.billingUi.includes('body: JSON.stringify(request.body)'),
  },
  {
    name: 'checkout responses are private and navigation is restricted to Stripe Checkout',
    ok:
      files.checkout.includes("'Cache-Control': 'private, no-store, max-age=0'") &&
      files.checkout.includes("url.hostname === 'checkout.stripe.com'") &&
      files.supporterContracts.includes("u.hostname === 'checkout.stripe.com'") &&
      files.supporterContracts.includes("u.hostname === 'billing.stripe.com'") &&
      files.billingUi.includes("cache: 'no-store'"),
  },
  {
    name: 'billing displays uncertain outcomes and manual exact retries without a false charge claim',
    ok: files.billingUi.includes('Retry exact billing request') &&
      files.billingUi.includes('The request may have completed.') &&
      files.billingUi.includes('parseSupporterReceipt(value, { requestId: request.body.requestId, operation: request.operation })') &&
      !files.billingUi.includes('Nothing was charged') &&
      !files.billingUi.includes('window.location.assign'),
  },
  {
    name: 'signed-out support intent survives auth without automatically starting checkout',
    ok: files.joinContent.includes("SUPPORTER_RETURN_PATH = '/join?intent=supporter'") &&
      files.joinContent.includes('encodeURIComponent(SUPPORTER_RETURN_PATH)') &&
      files.billingUi.includes('useReviewAccess(retire)') &&
      !files.billingUi.includes('getMemberSession') &&
      files.login.includes('router.replace(requestedNextPath())') &&
      files.login.includes('redirectTo: authCallbackUrl(nextPath)') &&
      files.login.includes('else router.push(nextPath)') &&
      files.login.includes('router.push(requestedNextPath())'),
  },
  {
    name: 'auth return destinations stay same-origin and reject backslash parser bypasses',
    ok:
      files.login.includes('getSafeNextPath(') &&
      files.loginForm.includes("candidate.startsWith('//') || candidate.includes('\\\\')") &&
      files.loginForm.includes("parsed.origin !== 'http://localhost'") &&
      files.callback.includes("candidate.includes('\\\\')") &&
      files.callback.includes("parsed.origin !== 'http://localhost'"),
  },
  // Retire the old amount/email and missing-ledger compatibility assertions:
  // those helpers are no longer evidence of membership payment authorization.
  // These are static wiring checks; actual financial/transactional behavior is
  // verified by the signed HTTP -> PostgreSQL and provider-adapter test suites.
  {
    name: 'verified raw membership events reach the strict processor before legacy receipts',
    ok:
      hasCode('webhook', "import { isLegacyBillingCandidate, processLegacyBillingEvent } from '@/lib/payments/legacyBilling'") &&
      hasCode('webhook', 'body = await readWebhookBody(req)') &&
      hasCode('webhook', 'webhooks.constructEvent(Buffer.from(body), sig, webhookSecret)') &&
      hasCode('webhook', 'if (isLegacyBillingCandidate(legacyEvent))') &&
      hasCode('webhook', 'processLegacyBillingEvent(legacyEvent, body)') &&
      codeIndex('webhook', 'webhooks.constructEvent(') < codeIndex('webhook', 'if (isLegacyBillingCandidate(legacyEvent))') &&
      codeIndex('webhook', 'processLegacyBillingEvent(legacyEvent, body)') < codeIndex('webhook', 'wasEventProcessed(getSupabaseAdmin(), event.id)'),
  },
  {
    name: 'legacy membership no longer grants from amount guesses, auth-email fallback or direct route writes',
    ok:
      !['resolveMembershipTier', 'findMembersForPayment', 'updateMemberTier', 'shouldPreserveExistingTier', 'ENTITLED_SUBSCRIPTION_STATUSES', 'checkout.sessions.listLineItems'].some((token) => hasCode('webhook', token)) &&
      hasCode('webhook', "import { findAuthUserIdByEmail } from '@/lib/payments/memberLookup'") &&
      hasCode('memberLookup', 'page += 1') &&
      hasCode('webhook', "session.metadata?.type === '92b_pledge'") &&
      hasCode('webhook', "session.metadata?.type === 'project_pledge'") &&
      hasCode('webhook', 'recordPaidPledge('),
  },
  {
    name: 'supporter ownership is excluded before legacy processing and rechecked against fresh objects',
    ok:
      hasCode('webhook', "if (eventObject.metadata?.type === 'soe_supporter_v1')") &&
      codeIndex('webhook', "if (eventObject.metadata?.type === 'soe_supporter_v1')") < codeIndex('webhook', 'if (isLegacyBillingCandidate(legacyEvent))') &&
      hasCode('legacyBilling', "if(!target)return {received:true,ignored:'not_legacy_membership'}") &&
      hasCode('legacyProvider', "if(m.type!=='membership')return null") &&
      hasCode('legacyBilling', 'p.target(event)'),
  },
  {
    name: 'strict billing verifies explicit account, mode, price, product, currency and quantity',
    ok:
      hasCode('legacyConfig', 'SOE_LEGACY_BILLING_MODE') &&
      hasCode('legacyConfig', 'SOE_LEGACY_BILLING_ACCOUNT_ID') &&
      hasCode('legacyConfig', 'SOE_LEGACY_BILLING_CATALOG_JSON') &&
      hasCode('legacyBilling', "event.livemode!==(c.mode==='live')") &&
      hasCode('legacyBilling', 'p.verifyAccount()') &&
      hasCode('legacyProvider', 'const entry=c.catalog.find(x=>x.priceId===p.id)') &&
      hasCode('legacyProvider', 'entry.productId!==product.id') &&
      hasCode('legacyProvider', 'p.currency!==entry.currency') &&
      hasCode('legacyProvider', 'p.unit_amount!==entry.amount') &&
      hasCode('legacyProvider', 'item.quantity!==1') &&
      hasCode('legacyProvider', "rec(p.recurring).interval_count!==1"),
  },
  {
    name: 'membership state and receipts persist through strict atomic RPCs without a REST-write fallback',
    ok:
      hasCode('legacyRepository', 'getSupabaseAdmin().rpc(name,args)') &&
      hasCode('legacyRepository', "rpc('soe_legacy_billing_event_state'") &&
      hasCode('legacyRepository', "rpc('soe_legacy_billing_apply_event'") &&
      hasCode('legacyRepository', 'p_expected_revision:state.revision') &&
      hasCode('legacyRepository', 'p_payload_hash:payloadHash') &&
      !hasCode('legacyRepository', ".from('members')") &&
      !hasCode('legacyBilling', 'wasEventProcessed(') &&
      !hasCode('legacyBilling', 'markEventProcessed('),
  },
  {
    name: 'strict membership failures return private retryable 503 while capital keeps its existing error path',
    ok:
      hasCode('webhook', 'return privateJson(await processLegacyBillingEvent(legacyEvent, body))') &&
      hasCode('webhook', "privateJson({ error: 'Legacy membership reconciliation could not be verified or persisted.' }, { status: 503 })") &&
      hasCode('webhook', "console.error('[webhook] Stripe event processing failed')") &&
      hasCode('webhook', "NextResponse.json({ error: 'Processing failed' }, { status: 500 })") &&
      !hasCode('webhook', "Still return 200 so Stripe doesn't retry"),
  },
  {
    name: 'membership billing guard is wired into package, operator, and handoff docs',
    ok:
      files.package.includes('"membership:billing:smoke": "node scripts/membership-billing-smoke.mjs"') &&
      files.operator.includes("command: ['npm', 'run', 'membership:billing:smoke']") &&
      files.handoff.includes('`membership:billing:smoke`'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nMembership billing smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nMembership billing smoke passed.');
