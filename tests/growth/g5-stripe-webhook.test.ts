// G5: /api/stripe/webhook membership + pledge handling, driven by Stripe-shaped
// fixtures (tests/growth/fixtures/stripe) signed with the real stripe signature
// helper. No live keys, no network.
import { test, expect, beforeEach } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installMocks } from '../security/fakes';

// Real stripe library (loaded by file path so the 'stripe' module mock below does not
// replace it) supplies genuine signature generation and verification.
const realStripeModule = require(join(process.cwd(), 'node_modules/stripe/cjs/stripe.cjs.node.js'));
const RealStripe = realStripeModule.default || realStripeModule.Stripe || realStripeModule;
const realWebhooks = new RealStripe(['sk', 'test', 'signing', 'only'].join('_')).webhooks;
const WEBHOOK_SECRET = 'whsec_test_fixture_secret';

const FIXTURES = join(process.cwd(), 'tests/growth/fixtures/stripe');
const fixture = (name: string) => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));

// ---------- fake Stripe API (only the calls the webhook makes) ----------
const stripeState = {
  lineItems: {} as Record<string, any>,
  lineItemsError: false,
  subscriptions: {} as Record<string, any>,
  activeByCustomer: {} as Record<string, any[]>,
  customers: {} as Record<string, any>,
  calls: [] as string[],
};
class FakeStripe {
  webhooks = realWebhooks;
  checkout = {
    sessions: {
      listLineItems: async (id: string) => {
        stripeState.calls.push(`listLineItems:${id}`);
        if (stripeState.lineItemsError) throw new Error('stripe api unavailable');
        return stripeState.lineItems[id] ?? { object: 'list', data: [], has_more: false };
      },
    },
  };
  subscriptions = {
    retrieve: async (id: string) => {
      stripeState.calls.push(`subscriptions.retrieve:${id}`);
      const sub = stripeState.subscriptions[id];
      if (!sub) throw new Error('No such subscription');
      return sub;
    },
    list: async ({ customer }: any) => {
      stripeState.calls.push(`subscriptions.list:${customer}`);
      return { object: 'list', data: stripeState.activeByCustomer[customer] ?? [], has_more: false };
    },
  };
  customers = {
    retrieve: async (id: string) => {
      stripeState.calls.push(`customers.retrieve:${id}`);
      return stripeState.customers[id] ?? { id, object: 'customer', deleted: true };
    },
  };
}

// ---------- fake Supabase admin client ----------
type Row = Record<string, any>;
const sb = {
  tables: {} as Record<string, Row[]>,
  tableErrors: {} as Record<string, { code: string; message: string }>,
  authUsers: [] as { id: string; email: string }[],
  listUsersCalls: [] as { page: number; perPage: number }[],
  writes: [] as { table: string; op: string; data: any }[],
};

class Query {
  private filters: ((r: Row) => boolean)[] = [];
  private op: 'select' | 'update' | 'insert' | 'upsert' = 'select';
  private payload: any;
  private returnRows = false;
  private singleMode: 'maybe' | 'one' | null = null;
  constructor(private table: string) {}
  select(_cols?: string) { if (this.op !== 'select') this.returnRows = true; return this; }
  eq(col: string, val: any) { this.filters.push((r) => r[col] === val); return this; }
  in(col: string, vals: any[]) { this.filters.push((r) => vals.includes(r[col])); return this; }
  update(data: any) { this.op = 'update'; this.payload = data; return this; }
  insert(data: any) { this.op = 'insert'; this.payload = data; return this; }
  upsert(data: any, _opts?: any) { this.op = 'upsert'; this.payload = data; return this; }
  maybeSingle() { this.singleMode = 'maybe'; return this; }
  single() { this.singleMode = 'one'; return this; }
  then(resolve: (v: any) => any, reject?: (e: any) => any) { return Promise.resolve(this.run()).then(resolve, reject); }
  private run() {
    const err = sb.tableErrors[this.table];
    if (err) return { data: null, error: err };
    const rows = (sb.tables[this.table] ||= []);
    const match = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === 'select') {
      if (this.singleMode) return { data: match[0] ?? null, error: this.singleMode === 'one' && !match[0] ? { code: 'PGRST116', message: 'no rows' } : null };
      return { data: match.map((r) => ({ ...r })), error: null };
    }
    if (this.op === 'update') {
      for (const r of match) Object.assign(r, this.payload);
      sb.writes.push({ table: this.table, op: 'update', data: { ...this.payload, ids: match.map((r) => r.id) } });
      return { data: this.returnRows ? match.map((r) => ({ id: r.id })) : null, error: null };
    }
    const list = Array.isArray(this.payload) ? this.payload : [this.payload];
    for (const item of list) {
      if (this.op === 'upsert' && this.table === 'stripe_webhook_events') {
        const existing = rows.find((r) => r.event_id === item.event_id);
        if (existing) { Object.assign(existing, item); continue; }
      }
      rows.push({ ...item });
    }
    sb.writes.push({ table: this.table, op: this.op, data: this.payload });
    return { data: null, error: null };
  }
}

const fakeSupabase = {
  from: (table: string) => new Query(table),
  auth: {
    admin: {
      listUsers: async ({ page = 1, perPage = 50 }: { page?: number; perPage?: number } = {}) => {
        sb.listUsersCalls.push({ page, perPage });
        const start = (page - 1) * perPage;
        const users = sb.authUsers.slice(start, start + perPage);
        const nextPage = start + perPage < sb.authUsers.length ? page + 1 : null;
        return { data: { users, aud: 'authenticated', nextPage, lastPage: Math.ceil(sb.authUsers.length / perPage), total: sb.authUsers.length }, error: null };
      },
    },
  },
};

// Pledge ledger: de-duplicate on Checkout Session id like the real ledger.
const ledgerSessions = new Set<string>();
const emailsSent: any[] = [];

installMocks({
  stripe: () => ({ default: FakeStripe }),
  '@/lib/supabase/admin': () => ({ getSupabaseAdmin: () => fakeSupabase }),
  '@/lib/capital/pledgeLedger': () => ({
    recordPaidPledge: async ({ session }: any) => {
      const isNew = !ledgerSessions.has(session.id);
      ledgerSessions.add(session.id);
      return { isNew, status: 'paid' };
    },
  }),
  '@/lib/email/resend': () => ({ getResend: () => ({ emails: { send: async (m: any) => { emailsSent.push(m); return { id: 'x' }; } } }) }),
});

const route = await import('../../app/api/stripe/webhook/route.ts');

// ---------- helpers ----------
const ADA_MEMBER = '11111111-1111-4111-8111-111111111111';
const ADA_AUTH = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PRICE_ENV: Record<string, string> = {
  STRIPE_TEST_PRICE_SEEKER: 'price_test_fixture_seeker',
  STRIPE_TEST_PRICE_SCHOLAR: 'price_test_fixture_scholar',
  STRIPE_TEST_PRICE_PHILOSOPHER: 'price_test_fixture_philosopher',
  STRIPE_TEST_PRICE_ORACLE: 'price_test_fixture_oracle',
};
const ENV_KEYS = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_SEEKER', 'STRIPE_PRICE_SCHOLAR', 'STRIPE_PRICE_PHILOSOPHER', 'STRIPE_PRICE_ORACLE', ...Object.keys(PRICE_ENV), 'CAPITAL_WEBHOOK_EMAIL_NOTIFICATIONS_ENABLED', 'RESEND_API_KEY'];

function members(): Row[] { return sb.tables.members; }
function ada(): Row { return members().find((m) => m.id === ADA_MEMBER)!; }
function memberUpdates() { return sb.writes.filter((w) => w.table === 'members' && w.op === 'update'); }

function deliver(event: any, opts: { secret?: string; header?: string } = {}) {
  const payload = JSON.stringify(event);
  const header = opts.header ?? realWebhooks.generateTestHeaderString({ payload, secret: opts.secret ?? WEBHOOK_SECRET });
  const req = { text: async () => payload, headers: new Headers({ 'stripe-signature': header }), nextUrl: new URL('https://app.example.test/api/stripe/webhook'), method: 'POST' } as any;
  return route.POST(req);
}

function membershipEvent(mutate?: (session: any, event: any) => void) {
  const event = fixture('checkout.session.completed.membership.json');
  mutate?.(event.data.object, event);
  return event;
}

function lineItems(price: { id: string; unit_amount: number | null; interval?: string | null }, amountTotal?: number | null) {
  const li = fixture('checkout.session.line_items.seeker.json');
  li.data[0].price.id = price.id;
  li.data[0].price.unit_amount = price.unit_amount;
  li.data[0].price.recurring = price.interval === null ? null : { interval: price.interval ?? 'month', interval_count: 1, usage_type: 'licensed' };
  li.data[0].amount_total = amountTotal === undefined ? price.unit_amount : amountTotal;
  return li;
}

function subscriptionWith(status: string, priceId: string, unitAmount: number, extra: Record<string, any> = {}) {
  const sub = fixture('customer.subscription.updated.json').data.object;
  sub.status = status;
  sub.items.data[0].price.id = priceId;
  sub.items.data[0].price.unit_amount = unitAmount;
  return { ...sub, ...extra };
}

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.STRIPE_SECRET_KEY = ['sk', 'test', 'fixture'].join('_');
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  Object.assign(process.env, PRICE_ENV);
  sb.tables = {
    members: [
      { id: ADA_MEMBER, supabase_auth_id: ADA_AUTH, tier: 'free', stripe_customer_id: null, exp_tokens: 0 },
      { id: '44444444-4444-4444-8444-444444444444', supabase_auth_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', tier: 'scholar', stripe_customer_id: 'cus_test_other', exp_tokens: 0 },
    ],
    stripe_webhook_events: [],
  };
  sb.tableErrors = {};
  sb.authUsers = [{ id: ADA_AUTH, email: 'ada@example.test' }];
  sb.listUsersCalls = [];
  sb.writes = [];
  stripeState.lineItems = { cs_test_fixture_seeker: fixture('checkout.session.line_items.seeker.json') };
  stripeState.lineItemsError = false;
  stripeState.subscriptions = {};
  stripeState.activeByCustomer = {};
  stripeState.customers = { cus_test_fixture_ada: { id: 'cus_test_fixture_ada', object: 'customer', email: 'ada@example.test' } };
  stripeState.calls = [];
  ledgerSessions.clear();
  emailsSent.length = 0;
});

// ---------- signature ----------
test('G5a bad signature is rejected with 400 and nothing is written', async () => {
  const r = await deliver(membershipEvent(), { secret: 'whsec_test_wrong' });
  expect(r.status).toBe(400);
  expect(sb.writes.length).toBe(0);
});

test('G5b missing webhook secret is a 500 Misconfigured, as before', async () => {
  delete process.env.STRIPE_WEBHOOK_SECRET;
  const r = await deliver(membershipEvent());
  expect(r.status).toBe(500);
  expect(await r.json()).toEqual({ error: 'Misconfigured' });
});

// ---------- tier mapping ----------
test('G5c checkout maps the configured price id to its tier and uses member_id, no auth user scan', async () => {
  const r = await deliver(membershipEvent());
  expect(r.status).toBe(200);
  expect(ada().tier).toBe('seeker');
  expect(ada().stripe_customer_id).toBe('cus_test_fixture_ada');
  expect(sb.listUsersCalls.length).toBe(0);
});

test('G5d live price ids (STRIPE_PRICE_<TIER>) map too', async () => {
  process.env.STRIPE_PRICE_SCHOLAR = 'price_live_fixture_scholar';
  stripeState.lineItems.cs_test_fixture_seeker = lineItems({ id: 'price_live_fixture_scholar', unit_amount: 4900 });
  expect((await deliver(membershipEvent())).status).toBe(200);
  expect(ada().tier).toBe('scholar');
});

test('G5e an unconfigured (legacy) price at exactly a published price still maps: $49/month -> scholar', async () => {
  stripeState.lineItems.cs_test_fixture_seeker = lineItems({ id: 'price_legacy_2025_scholar', unit_amount: 4900 });
  expect((await deliver(membershipEvent())).status).toBe(200);
  expect(ada().tier).toBe('scholar');
});

test('G5f a $0 line item never grants a paid tier (old code defaulted to seeker)', async () => {
  stripeState.lineItems.cs_test_fixture_seeker = lineItems({ id: 'price_unknown_free', unit_amount: 0 }, 0);
  const r = await deliver(membershipEvent());
  expect(r.status).toBe(200);
  expect(ada().tier).toBe('free');
  expect(memberUpdates().length).toBe(0);
  expect(sb.tables.stripe_webhook_events[0].outcome).toBe('skipped_unknown_price');
});

test('G5g missing line items never grant a paid tier', async () => {
  stripeState.lineItems.cs_test_fixture_seeker = { object: 'list', data: [], has_more: false };
  expect((await deliver(membershipEvent())).status).toBe(200);
  expect(ada().tier).toBe('free');
  expect(memberUpdates().length).toBe(0);
});

test('G5h unknown price/amount is logged and skipped (e.g. $25/month, or $49 one-time)', async () => {
  for (const [price, total] of [[{ id: 'price_mystery', unit_amount: 2500 }, 2500], [{ id: 'price_mystery2', unit_amount: 4900, interval: null }, 4900]] as const) {
    stripeState.lineItems.cs_test_fixture_seeker = lineItems(price as any, total);
    const r = await deliver(membershipEvent((_s, e) => { e.id = `evt_test_${price.id}`; }));
    expect(r.status).toBe(200);
  }
  expect(ada().tier).toBe('free');
  expect(memberUpdates().length).toBe(0);
});

test('G5i a Stripe line-item API failure returns 500 (retry) instead of guessing from the amount', async () => {
  stripeState.lineItemsError = true;
  const r = await deliver(membershipEvent());
  expect(r.status).toBe(500);
  expect(ada().tier).toBe('free');
  expect(sb.tables.stripe_webhook_events.length).toBe(0);
});

// ---------- member lookup ----------
test('G5j legacy session (no member id, no stored customer) finds a member on page 3 of auth users', async () => {
  const filler = Array.from({ length: 2400 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, email: `filler${i}@example.test` }));
  sb.authUsers = [...filler, { id: ADA_AUTH, email: 'Ada@Example.test' }];
  const r = await deliver(membershipEvent((s) => { delete s.metadata.member_id; s.client_reference_id = null; s.customer = 'cus_test_new'; }));
  expect(r.status).toBe(200);
  expect(ada().tier).toBe('seeker');
  expect(ada().stripe_customer_id).toBe('cus_test_new');
  expect(sb.listUsersCalls.map((c) => c.page)).toEqual([1, 2, 3]);
});

test('G5k a stored Stripe customer id is used before any auth user scan', async () => {
  ada().stripe_customer_id = 'cus_test_fixture_ada';
  const r = await deliver(membershipEvent((s) => { delete s.metadata.member_id; s.client_reference_id = null; }));
  expect(r.status).toBe(200);
  expect(ada().tier).toBe('seeker');
  expect(sb.listUsersCalls.length).toBe(0);
});

test('G5l a non-UUID or unknown member_id falls back to email lookup', async () => {
  const r = await deliver(membershipEvent((s) => { s.metadata.member_id = 'not-a-uuid'; s.client_reference_id = null; }));
  expect(r.status).toBe(200);
  expect(ada().tier).toBe('seeker');
  expect(sb.listUsersCalls.length).toBe(1);
});

test('G5m paid checkout with no matching member returns 500 so Stripe retries', async () => {
  sb.authUsers = [];
  const r = await deliver(membershipEvent((s) => { delete s.metadata.member_id; s.client_reference_id = null; s.customer = 'cus_test_nobody'; }));
  expect(r.status).toBe(500);
  expect(sb.tables.stripe_webhook_events.length).toBe(0);
});

test('G5n a lifetime Oracle member is not overwritten by a subscription checkout', async () => {
  ada().tier = 'oracle';
  const r = await deliver(membershipEvent());
  expect(r.status).toBe(200);
  expect(ada().tier).toBe('oracle');
  expect(memberUpdates().length).toBe(0);
});

test('G5o an Oracle one-time purchase upgrades a subscriber', async () => {
  ada().tier = 'seeker';
  stripeState.lineItems.cs_test_fixture_seeker = lineItems({ id: 'price_test_fixture_oracle', unit_amount: 49900, interval: null });
  expect((await deliver(membershipEvent((s) => { s.mode = 'payment'; s.metadata.tier = 'oracle'; }))).status).toBe(200);
  expect(ada().tier).toBe('oracle');
});

test('G5p unpaid (delayed payment) checkout grants nothing until async_payment_succeeded', async () => {
  const r1 = await deliver(membershipEvent((s) => { s.payment_status = 'unpaid'; }));
  expect(r1.status).toBe(200);
  expect(ada().tier).toBe('free');
  const r2 = await deliver(membershipEvent((s, e) => { e.id = 'evt_test_fixture_async_ok'; e.type = 'checkout.session.async_payment_succeeded'; s.payment_status = 'paid'; }));
  expect(r2.status).toBe(200);
  expect(ada().tier).toBe('seeker');
});

test('G5q non-membership checkout types never touch membership tiers', async () => {
  const r = await deliver(membershipEvent((s) => { s.metadata.type = 'merch'; }));
  expect(r.status).toBe(200);
  expect(memberUpdates().length).toBe(0);
  expect(stripeState.calls.length).toBe(0);
});

// ---------- idempotency ----------
test('G5r the same event id delivered twice is processed once', async () => {
  expect((await deliver(membershipEvent())).status).toBe(200);
  ada().tier = 'free'; // if the replay were processed it would be written again
  const r2 = await deliver(membershipEvent());
  expect(r2.status).toBe(200);
  expect(await r2.json()).toEqual({ received: true, duplicate: true });
  expect(ada().tier).toBe('free');
  expect(memberUpdates().length).toBe(1);
  expect(sb.tables.stripe_webhook_events).toEqual([
    expect.objectContaining({ event_id: 'evt_test_fixture_checkout_seeker', event_type: 'checkout.session.completed', livemode: false, outcome: 'updated' }),
  ]);
});

test('G5s before the idempotency migration is applied the webhook still works (no table = old behaviour)', async () => {
  sb.tableErrors.stripe_webhook_events = { code: 'PGRST205', message: "Could not find the table 'public.stripe_webhook_events' in the schema cache" };
  expect((await deliver(membershipEvent())).status).toBe(200);
  expect(ada().tier).toBe('seeker');
  expect((await deliver(membershipEvent())).status).toBe(200);
});

test('G5t an idempotency lookup failure (not a missing table) is a retryable 500', async () => {
  sb.tableErrors.stripe_webhook_events = { code: '08006', message: 'connection failure' };
  const r = await deliver(membershipEvent());
  expect(r.status).toBe(500);
  expect(ada().tier).toBe('free');
});

test('G5u a failed attempt is not marked processed, so the retry succeeds', async () => {
  stripeState.lineItemsError = true;
  expect((await deliver(membershipEvent())).status).toBe(500);
  stripeState.lineItemsError = false;
  expect((await deliver(membershipEvent())).status).toBe(200);
  expect(ada().tier).toBe('seeker');
});

// ---------- subscription lifecycle ----------
test('G5v subscription.updated uses the current subscription and maps its price', async () => {
  const event = fixture('customer.subscription.updated.json');
  stripeState.subscriptions.sub_test_fixture_ada = event.data.object;
  expect((await deliver(event)).status).toBe(200);
  expect(ada().tier).toBe('philosopher');
});

test('G5w subscription.updated that is now canceled (out-of-order delivery) returns the member to free', async () => {
  ada().tier = 'philosopher';
  const event = fixture('customer.subscription.updated.json'); // payload still says active
  stripeState.subscriptions.sub_test_fixture_ada = subscriptionWith('canceled', 'price_test_fixture_philosopher', 9900);
  expect((await deliver(event)).status).toBe(200);
  expect(ada().tier).toBe('free');
});

test('G5x subscription.updated with an unpaid/incomplete status leaves the tier unchanged', async () => {
  ada().tier = 'scholar';
  const event = fixture('customer.subscription.updated.json');
  stripeState.subscriptions.sub_test_fixture_ada = subscriptionWith('unpaid', 'price_test_fixture_philosopher', 9900);
  expect((await deliver(event)).status).toBe(200);
  expect(ada().tier).toBe('scholar');
  expect(memberUpdates().length).toBe(0);
});

test('G5y subscription.updated with an unknown price is skipped, never defaulted to seeker', async () => {
  ada().tier = 'scholar';
  const event = fixture('customer.subscription.updated.json');
  stripeState.subscriptions.sub_test_fixture_ada = subscriptionWith('active', 'price_mystery', 0);
  expect((await deliver(event)).status).toBe(200);
  expect(ada().tier).toBe('scholar');
});

test('G5z subscription.deleted returns a subscriber to free (found by stored customer id)', async () => {
  ada().tier = 'seeker';
  ada().stripe_customer_id = 'cus_test_fixture_ada';
  expect((await deliver(fixture('customer.subscription.deleted.json'))).status).toBe(200);
  expect(ada().tier).toBe('free');
  expect(members()[1].tier).toBe('scholar'); // other member untouched
});

test('G5aa subscription.deleted keeps the tier of another active membership subscription', async () => {
  ada().tier = 'philosopher';
  ada().stripe_customer_id = 'cus_test_fixture_ada';
  stripeState.activeByCustomer.cus_test_fixture_ada = [subscriptionWith('active', 'price_test_fixture_scholar', 4900, { id: 'sub_test_fixture_other' })];
  expect((await deliver(fixture('customer.subscription.deleted.json'))).status).toBe(200);
  expect(ada().tier).toBe('scholar');
});

test('G5ab subscription.deleted never removes a lifetime Oracle membership', async () => {
  ada().tier = 'oracle';
  ada().stripe_customer_id = 'cus_test_fixture_ada';
  expect((await deliver(fixture('customer.subscription.deleted.json'))).status).toBe(200);
  expect(ada().tier).toBe('oracle');
});

test('G5ac subscription.deleted falls back to the customer email (paged lookup)', async () => {
  ada().tier = 'seeker';
  expect((await deliver(fixture('customer.subscription.deleted.json'))).status).toBe(200);
  expect(ada().tier).toBe('free');
  expect(ada().stripe_customer_id).toBe('cus_test_fixture_ada');
});

test('G5ad subscription.deleted with no matching member returns 500 (retry), as before', async () => {
  sb.authUsers = [];
  expect((await deliver(fixture('customer.subscription.deleted.json'))).status).toBe(500);
});

// ---------- pledges unchanged ----------
test('G5ae project pledge: ledger-deduped, EXP found via paged lookup, no email in test mode', async () => {
  sb.tables.projects = [{ id: '22222222-2222-4222-8222-222222222222', amount_raised: 100, backer_count: 2 }];
  const filler = Array.from({ length: 1000 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, email: `f${i}@example.test` }));
  sb.authUsers = [...filler, { id: ADA_AUTH, email: 'grace@example.test' }];
  const event = fixture('checkout.session.completed.project_pledge.json');
  expect((await deliver(event)).status).toBe(200);
  expect(sb.tables.projects[0]).toEqual(expect.objectContaining({ amount_raised: 150, backer_count: 3 }));
  expect(ada().exp_tokens).toBeGreaterThan(0);
  expect(emailsSent.length).toBe(0);
  // A redelivery with a new event id (Stripe can do this) is still stopped by the ledger.
  event.id = 'evt_test_fixture_project_pledge_again';
  expect((await deliver(event)).status).toBe(200);
  expect(sb.tables.projects[0].amount_raised).toBe(150);
});

test('G5af unrelated event types are acknowledged and recorded as ignored', async () => {
  const event = { id: 'evt_test_fixture_invoice', object: 'event', type: 'invoice.paid', livemode: false, created: 1792800000, data: { object: { id: 'in_test', object: 'invoice' } } };
  expect((await deliver(event)).status).toBe(200);
  expect(sb.tables.stripe_webhook_events[0].outcome).toBe('ignored');
  expect(sb.writes.filter((w) => w.table !== 'stripe_webhook_events').length).toBe(0);
});
