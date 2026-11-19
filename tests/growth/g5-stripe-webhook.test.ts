// G5: HTTP dispatch and signature boundaries for /api/stripe/webhook. Strict
// membership payment proof is exercised by the HTTP -> PostgreSQL + adapter
// tests, not this module mock. Actual capital-pledge handling stays covered here.
// All fixtures are synthetic and use the real Stripe signature helper offline.
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

// This exact-module mock proves the route delegates; it does not prove the
// classifier, provider verification, SQL transactions or membership outcomes.
const legacyState = {
  candidateChecks: [] as any[],
  calls: [] as { event: any; rawBytes: Uint8Array }[],
  result: { received: true } as { received: true; ignored?: string },
  error: null as Error | null,
};

installMocks({
  stripe: () => ({ default: FakeStripe }),
  '@/lib/supabase/admin': () => ({ getSupabaseAdmin: () => fakeSupabase }),
  '@/lib/payments/legacyBilling': () => ({
    isLegacyBillingCandidate: (event: any) => {
      legacyState.candidateChecks.push(event);
      return event.data.object.metadata?.type === 'membership' ||
        event.type.startsWith('customer.subscription.') || event.type.startsWith('invoice.');
    },
    processLegacyBillingEvent: async (event: any, rawBytes: Uint8Array) => {
      legacyState.calls.push({ event, rawBytes: rawBytes.slice() });
      if (legacyState.error) throw legacyState.error;
      return legacyState.result;
    },
  }),
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

function deliver(event: any, opts: { secret?: string; header?: string; payload?: string } = {}) {
  const payload = opts.payload ?? JSON.stringify(event);
  const header = opts.header ?? realWebhooks.generateTestHeaderString({ payload, secret: opts.secret ?? WEBHOOK_SECRET });
  const req = new Request('https://app.example.test/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': header },
    body: payload,
  });
  return route.POST(req as any);
}

function membershipEvent(mutate?: (session: any, event: any) => void) {
  const event = fixture('checkout.session.completed.membership.json');
  mutate?.(event.data.object, event);
  return event;
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
  legacyState.candidateChecks = [];
  legacyState.calls = [];
  legacyState.result = { received: true };
  legacyState.error = null;
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

// ---------- strict membership dispatch ----------
// Retired assumptions from the original G5 suite:
// - G5c-o price/amount/test-mode tier grants and G5j/l/ac email fallbacks are not
//   payment proof. Strict HTTP -> PostgreSQL + adapter tests require live-mode,
//   configured price/currency/quantity and an unambiguous member binding.
// - G5s missing-ledger success is intentionally replaced by fail-closed 503.
// - G5x unpaid retention and G5v-aa lifecycle mutation are decided from verified
//   current billing facts by that processor, never by this route or a mock DB.
// - G5n/ab preserve legacy Oracle access without manufacturing lifetime proof;
//   G5o/p/r/u purchase, delayed-payment, replay and retry outcomes need SQL tests.

test('G5c signed membership is delegated with exact raw UTF-8 bytes before any old receipt or member write', async () => {
  const event = membershipEvent((session) => { session.metadata.note = 'Synthetic café — fixture'; });
  event.account = 'acct_test_fixture_owner';
  const payload = `  ${JSON.stringify(event)}\n`;
  // An old completion receipt cannot bypass stricter payment verification.
  sb.tables.stripe_webhook_events = [{ event_id: event.id, outcome: 'updated' }];
  const response = await deliver(event, { payload });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ received: true });
  expect(legacyState.candidateChecks).toEqual([expect.objectContaining({ id: event.id, type: event.type, livemode: event.livemode, data: event.data })]);
  expect(legacyState.calls).toHaveLength(1);
  expect(legacyState.calls[0].event).toEqual(expect.objectContaining({ id: event.id, type: event.type, livemode: event.livemode, data: event.data }));
  expect(legacyState.calls[0].event.account).toBe(event.account);
  expect(legacyState.calls[0].rawBytes).toBeInstanceOf(Uint8Array);
  expect(Array.from(legacyState.calls[0].rawBytes)).toEqual(Array.from(new TextEncoder().encode(payload)));
  expect(ada().tier).toBe('free');
  expect(sb.writes).toEqual([]);
  expect(sb.listUsersCalls).toEqual([]);
  expect(stripeState.calls).toEqual([]);
});

test('G5d strict processor acknowledgement is returned without a legacy membership fallback', async () => {
  legacyState.result = { received: true, ignored: 'test_mode' };
  const response = await deliver(membershipEvent());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(legacyState.result);
  expect(legacyState.calls).toHaveLength(1);
  expect(memberUpdates()).toEqual([]);
  expect(sb.tables.stripe_webhook_events).toEqual([]);
  expect(stripeState.calls).toEqual([]);
});

test('G5e every processor refusal is a private generic 503, including a numeric status on an error', async () => {
  const error = new Error('synthetic-sensitive-billing-detail') as Error & { status: number };
  error.status = 409;
  legacyState.error = error;
  const response = await deliver(membershipEvent());
  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toContain('private');
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(await response.text()).not.toContain('synthetic-sensitive-billing-detail');
  expect(legacyState.calls).toHaveLength(1);
  expect(sb.writes).toEqual([]);
  expect(sb.listUsersCalls).toEqual([]);
  expect(stripeState.calls).toEqual([]);
});

test('G5f missing strict ledger cannot fall back to the old missing-table success path', async () => {
  sb.tableErrors.stripe_webhook_events = { code: 'PGRST205', message: "Could not find the table 'public.stripe_webhook_events' in the schema cache" };
  legacyState.error = new Error('Synthetic strict receipt unavailable');
  const response = await deliver(membershipEvent());
  expect(response.status).toBe(503);
  expect(legacyState.calls).toHaveLength(1);
  expect(ada().tier).toBe('free');
  expect(sb.writes).toEqual([]);
  expect(stripeState.calls).toEqual([]);
});

test('G5g processor retry re-enters strict processing and never records a legacy membership receipt', async () => {
  legacyState.error = new Error('Synthetic transaction unavailable');
  expect((await deliver(membershipEvent())).status).toBe(503);
  legacyState.error = null;
  expect((await deliver(membershipEvent())).status).toBe(200);
  expect(legacyState.calls).toHaveLength(2);
  expect(sb.writes).toEqual([]);
  expect(ada().tier).toBe('free');
});

test('G5h membership with an invalid binding is delegated without an auth-email scan', async () => {
  legacyState.error = new Error('Synthetic member binding conflict');
  const event = membershipEvent((session) => { session.metadata.member_id = 'not-a-uuid'; });
  expect((await deliver(event)).status).toBe(503);
  expect(legacyState.calls[0].event).toEqual(expect.objectContaining({ id: event.id, data: { object: event.data.object } }));
  expect(sb.listUsersCalls).toEqual([]);
  expect(sb.writes).toEqual([]);
});

test('G5i delayed payment and subscription lifecycle events are owned by the strict processor', async () => {
  ada().tier = 'oracle';
  const unpaid = membershipEvent((session) => { session.payment_status = 'unpaid'; });
  const paid = membershipEvent((session, event) => {
    event.type = 'checkout.session.async_payment_succeeded';
    session.payment_status = 'paid';
  });
  const invoice = { id: 'evt_test_invoice_paid', type: 'invoice.paid', livemode: false, data: { object: { id: 'in_test_paid', object: 'invoice' } } };
  const events = [unpaid, paid, fixture('customer.subscription.updated.json'), fixture('customer.subscription.deleted.json'), invoice];
  for (const event of events) expect((await deliver(event)).status).toBe(200);
  expect(legacyState.calls.map((call) => call.event.id)).toEqual(events.map((event) => event.id));
  // This only proves the route cannot overwrite access. Real lifetime evidence
  // and unpaid/subscription decisions are tested with the actual SQL processor.
  expect(ada().tier).toBe('oracle');
  expect(sb.writes).toEqual([]);
  expect(stripeState.calls).toEqual([]);
});

test('G5j non-membership checkout types do not enter the strict membership processor', async () => {
  const event = membershipEvent((session) => { session.metadata.type = 'merch'; });
  expect((await deliver(event)).status).toBe(200);
  expect(legacyState.candidateChecks).toEqual([expect.objectContaining({ id: event.id, type: event.type })]);
  expect(legacyState.calls).toEqual([]);
  expect(memberUpdates()).toEqual([]);
  expect(stripeState.calls).toEqual([]);
});

test('G5k signature rejection precedes classifier, processor, lookup and receipt work', async () => {
  const response = await deliver(membershipEvent(), { header: '' });
  expect(response.status).toBe(400);
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(legacyState.candidateChecks).toEqual([]);
  expect(legacyState.calls).toEqual([]);
  expect(sb.writes).toEqual([]);
  expect(stripeState.calls).toEqual([]);
});

test('G5l a signed malformed body is rejected before financial dispatch', async () => {
  const response = await deliver(null, { payload: '{"id":' });
  expect(response.status).toBe(400);
  expect(legacyState.candidateChecks).toEqual([]);
  expect(legacyState.calls).toEqual([]);
  expect(sb.writes).toEqual([]);
});

test('G5m a signed event without its object envelope is rejected before financial dispatch', async () => {
  const response = await deliver({ id: 'evt_test_missing_object', type: 'customer.subscription.updated', livemode: false, data: {} });
  expect(response.status).toBe(400);
  expect(legacyState.candidateChecks).toEqual([]);
  expect(legacyState.calls).toEqual([]);
  expect(sb.writes).toEqual([]);
});

test('G5n an oversized raw body is rejected before signature or financial work', async () => {
  const response = await deliver(null, { payload: 'x'.repeat(3 * 1024 * 1024) });
  expect(response.status).toBe(413);
  expect(legacyState.candidateChecks).toEqual([]);
  expect(legacyState.calls).toEqual([]);
  expect(sb.writes).toEqual([]);
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
  // invoice events belong to strict billing; use a genuinely unrelated event.
  const event = { id: 'evt_test_fixture_customer', object: 'event', type: 'customer.created', livemode: false, created: 1792800000, data: { object: { id: 'cus_test_unrelated', object: 'customer' } } };
  expect((await deliver(event)).status).toBe(200);
  expect(sb.tables.stripe_webhook_events[0].outcome).toBe('ignored');
  expect(sb.writes.filter((w) => w.table !== 'stripe_webhook_events').length).toBe(0);
  expect(legacyState.calls).toEqual([]);
});

test('G5ag supporter checkout and subscription events never enter legacy entitlement or receipt processing', async () => {
  ada().tier = 'oracle';
  for (const event of [membershipEvent(), fixture('customer.subscription.updated.json'), fixture('customer.subscription.deleted.json')]) {
    event.data.object.metadata = { type: 'soe_supporter_v1', supporter_account: 'opaque-account-fixture' };
    const response = await deliver(event);
    expect(response.status).toBe(200);
    expect((await response.json()).ignored).toBe('supporter_event');
    expect(ada().tier).toBe('oracle');
    expect(sb.writes.length).toBe(0);
    expect(stripeState.calls.length).toBe(0);
    expect(legacyState.candidateChecks).toEqual([]);
    expect(legacyState.calls).toEqual([]);
  }
});

test('G5ah fresh supporter filtering is delegated rather than downgraded from an older payload', async () => {
  ada().tier = 'oracle';
  const event = fixture('customer.subscription.updated.json');
  delete event.data.object.metadata.type;
  // This is the actual processor's acknowledgement after fresh-object filtering.
  // Its provider lookup and marker verification belong to the adapter/SQL tests.
  legacyState.result = { received: true, ignored: 'not_legacy_membership' };
  const response = await deliver(event);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(legacyState.result);
  expect(legacyState.calls).toHaveLength(1);
  expect(legacyState.calls[0].event).toEqual(expect.objectContaining({ id: event.id, data: { object: event.data.object } }));
  expect(ada().tier).toBe('oracle');
  expect(sb.writes).toEqual([]);
  expect(stripeState.calls).toEqual([]);
});
