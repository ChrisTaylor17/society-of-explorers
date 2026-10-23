#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

const files = {
  join: read('app/join/page.tsx'),
  login: read('app/login/page.tsx'),
  callback: read('app/auth/callback/route.ts'),
  checkout: read('app/api/checkout/route.ts'),
  authenticatedMember: read('lib/getAuthenticatedMember.ts'),
  webhook: read('app/api/stripe/webhook/route.ts'),
  package: read('package.json'),
  operator: read('scripts/operator-smoke.mjs'),
  handoff: read('docs/soe-current-thread-handoff.md'),
};

const checks = [
  {
    name: 'join page exposes the four paid membership tiers at the intended prices',
    ok:
      files.join.includes("id: 'seeker', name: 'Seeker', price: '$19'") &&
      files.join.includes("id: 'scholar', name: 'Scholar', price: '$49'") &&
      files.join.includes("id: 'philosopher', name: 'Philosopher', price: '$99'") &&
      files.join.includes("id: 'oracle', name: 'Oracle', price: '$499'"),
  },
  {
    name: 'checkout maps every displayed paid tier to an environment price',
    ok:
      files.checkout.includes("new Set(['seeker', 'scholar', 'philosopher', 'oracle'])") &&
      ['SEEKER', 'SCHOLAR', 'PHILOSOPHER', 'ORACLE'].every((tier) =>
        files.checkout.includes(`process.env.STRIPE_PRICE_${tier}`),
      ),
  },
  {
    name: 'checkout validates input and requires an authenticated member before Stripe work',
    ok:
      files.checkout.includes('body = await req.json()') &&
      files.checkout.includes("return privateJson({ error: 'Invalid request body' }, 400)") &&
      files.checkout.includes('if (!MEMBERSHIP_TIERS.has(tier))') &&
      files.checkout.includes('const authenticated = await getAuthenticatedMember(req)') &&
      files.checkout.includes("return privateJson({ error: 'Sign in before choosing a paid membership' }, 401)") &&
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
      files.join.includes('body: JSON.stringify({ tier })') &&
      !files.join.includes('body: JSON.stringify({ tier, email })'),
  },
  {
    name: 'checkout responses are private and navigation is restricted to Stripe Checkout',
    ok:
      files.checkout.includes("'Cache-Control': 'private, no-store, max-age=0'") &&
      files.checkout.includes("url.hostname === 'checkout.stripe.com'") &&
      files.join.includes("url.hostname === 'checkout.stripe.com'") &&
      files.join.includes("cache: 'no-store'"),
  },
  {
    name: 'join page shows recoverable checkout failures instead of failing silently',
    ok:
      files.join.includes('if (!res.ok)') &&
      files.join.includes('setCheckoutError') &&
      files.join.includes('role="alert"') &&
      files.join.includes('Your membership was not changed.'),
  },
  {
    name: 'signed-out paid intent survives auth without automatically starting checkout',
    ok:
      files.join.includes('/login?next=${encodeURIComponent(membershipReturnPath(tier))}') &&
      files.join.includes("params.get('intent') !== 'membership'") &&
      files.join.includes('if (!session?.member)') &&
      files.join.includes('router.replace(`/login?next=${encodeURIComponent(membershipReturnPath(tier))}`)') &&
      files.join.includes('choose it again when you are ready to open secure checkout') &&
      files.join.includes('if (accessToken) headers.Authorization = `Bearer ${accessToken}`') &&
      files.login.includes('router.replace(requestedNextPath())') &&
      files.login.includes('redirectTo: authCallbackUrl(nextPath)') &&
      files.login.includes('else router.push(requestedNextPath())') &&
      files.login.includes('router.push(requestedNextPath())'),
  },
  {
    name: 'auth return destinations stay same-origin and reject backslash parser bypasses',
    ok:
      files.login.includes("candidate.startsWith('//') || candidate.includes('\\\\')") &&
      files.login.includes("parsed.origin !== 'http://localhost'") &&
      files.callback.includes("candidate.includes('\\\\')") &&
      files.callback.includes("parsed.origin !== 'http://localhost'"),
  },
  {
    name: 'only membership checkout sessions can grant membership entitlements',
    ok:
      files.webhook.includes("if (session.metadata?.type !== 'membership')") &&
      files.webhook.includes('Ignored non-membership checkout session type'),
  },
  {
    name: 'fallback pricing maps monthly 49 to Scholar, monthly 99 to Philosopher, and one-time 499 to Oracle',
    ok:
      files.webhook.includes("if (!interval) return dollars >= 499 ? 'oracle' : 'seeker';") &&
      files.webhook.includes("if (dollars >= 99) return 'philosopher';") &&
      files.webhook.includes("if (dollars >= 49) return 'scholar';"),
  },
  {
    name: 'paid entitlement and cancellation writes require persisted member rows',
    ok:
      files.webhook.includes(".select('id')") &&
      files.webhook.includes("throw new Error('Paid membership has no matching member')") &&
      files.webhook.includes("throw new Error('Cancelled membership has no matching member')"),
  },
  {
    name: 'membership fulfillment failures return retryable webhook errors',
    ok:
      files.webhook.includes("console.error('[webhook] Stripe event processing failed')") &&
      files.webhook.includes("NextResponse.json({ error: 'Processing failed' }, { status: 500 })") &&
      !files.webhook.includes("Still return 200 so Stripe doesn't retry"),
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
