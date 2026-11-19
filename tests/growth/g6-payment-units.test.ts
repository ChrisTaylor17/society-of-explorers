// G6: unit tests for membership tier mapping, paged member lookup, webhook idempotency
// and the project-pledge live gate.
import { test, expect } from 'bun:test';
import { resolveMembershipTier, shouldPreserveExistingTier, tierForExactAmount, tierForPriceId } from '../../lib/payments/membershipTier.ts';
import { findAuthUserIdByEmail, findMembersForPayment } from '../../lib/payments/memberLookup.ts';
import { isMissingTableError, markEventProcessed, wasEventProcessed } from '../../lib/payments/webhookIdempotency.ts';
import { projectPledgeStripe } from '../../lib/capital/projectPledgeStripe.ts';

const ENV = { STRIPE_PRICE_SEEKER: 'price_live_s', STRIPE_TEST_PRICE_ORACLE: 'price_test_o' };

test('G6a price id mapping (live and test ids), nothing for blanks', () => {
  expect(tierForPriceId('price_live_s', ENV)).toBe('seeker');
  expect(tierForPriceId('price_test_o', ENV)).toBe('oracle');
  expect(tierForPriceId('', ENV)).toBeNull();
  expect(tierForPriceId(null, {})).toBeNull();
  expect(tierForPriceId('price_live_s', {})).toBeNull();
});

test('G6b exact published prices only', () => {
  expect(tierForExactAmount(1900, 'month')).toBe('seeker');
  expect(tierForExactAmount(4900, 'month')).toBe('scholar');
  expect(tierForExactAmount(9900, 'month')).toBe('philosopher');
  expect(tierForExactAmount(49900, null)).toBe('oracle');
  for (const [a, i] of [[0, 'month'], [null, 'month'], [undefined, null], [1899, 'month'], [4900, 'year'], [49900, 'month'], [4900, null], [NaN, null], [-1900, 'month']] as const) {
    expect(tierForExactAmount(a as any, i as any)).toBeNull();
  }
});

test('G6c resolution reasons never fall back to a paid tier', () => {
  expect(resolveMembershipTier({ priceId: 'price_live_s', amountCents: 0 }, ENV)).toEqual({ ok: true, tier: 'seeker', via: 'price_id' });
  expect(resolveMembershipTier({ priceId: 'price_old', amountCents: 9900, interval: 'month' }, ENV)).toEqual({ ok: true, tier: 'philosopher', via: 'exact_amount' });
  expect(resolveMembershipTier({}, ENV)).toEqual({ ok: false, reason: 'missing_price' });
  expect(resolveMembershipTier({ amountCents: 0 }, ENV)).toEqual({ ok: false, reason: 'zero_amount' });
  expect(resolveMembershipTier({ priceId: 'price_x', amountCents: null }, ENV)).toEqual({ ok: false, reason: 'unknown_price' });
  expect(resolveMembershipTier({ priceId: 'price_x', amountCents: 2500, interval: 'month' }, ENV)).toEqual({ ok: false, reason: 'unknown_price' });
});

test('G6d lifetime Oracle is preserved against any non-Oracle change', () => {
  expect(shouldPreserveExistingTier('oracle', 'free')).toBe(true);
  expect(shouldPreserveExistingTier('oracle', 'seeker')).toBe(true);
  expect(shouldPreserveExistingTier('oracle', 'oracle')).toBe(false);
  expect(shouldPreserveExistingTier('seeker', 'free')).toBe(false);
  expect(shouldPreserveExistingTier(null, 'seeker')).toBe(false);
});

function pagedAuth(users: { id: string; email: string }[], opts: { error?: boolean; noNextPage?: boolean } = {}) {
  const calls: number[] = [];
  return {
    calls,
    client: {
      auth: { admin: { listUsers: async ({ page, perPage }: any) => {
        calls.push(page);
        if (opts.error) return { data: null, error: { message: 'boom' } };
        const slice = users.slice((page - 1) * perPage, page * perPage);
        return { data: { users: slice, ...(opts.noNextPage ? {} : { nextPage: page * perPage < users.length ? page + 1 : null }) }, error: null };
      } } },
    } as any,
  };
}
const many = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `u${i}`, email: `user${i}@example.test` }));

test('G6e paged lookup finds users beyond the first page, case-insensitively', async () => {
  const { client, calls } = pagedAuth([...many(25), { id: 'target', email: 'Late@Example.test' }]);
  expect(await findAuthUserIdByEmail(client, ' late@example.TEST ', { perPage: 10 })).toBe('target');
  expect(calls).toEqual([1, 2, 3]);
});

test('G6f paged lookup stops at the last page (short page or nextPage null)', async () => {
  const a = pagedAuth(many(20));
  expect(await findAuthUserIdByEmail(a.client, 'nobody@example.test', { perPage: 10 })).toBeNull();
  expect(a.calls).toEqual([1, 2]);
  const b = pagedAuth(many(15), { noNextPage: true });
  expect(await findAuthUserIdByEmail(b.client, 'nobody@example.test', { perPage: 10 })).toBeNull();
  expect(b.calls).toEqual([1, 2]);
});

test('G6g paged lookup errors are thrown, and the page cap fails loudly', async () => {
  await expect(findAuthUserIdByEmail(pagedAuth([], { error: true }).client, 'a@example.test')).rejects.toThrow('Membership auth lookup failed');
  await expect(findAuthUserIdByEmail(pagedAuth(many(100)).client, 'x@example.test', { perPage: 10, maxPages: 3 })).rejects.toThrow('page limit');
  expect(await findAuthUserIdByEmail(pagedAuth([]).client, '  ')).toBeNull();
});

function membersClient(rows: any[], authUsers: any[] = []) {
  const queries: string[] = [];
  return {
    queries,
    client: {
      from: () => ({ select: () => ({ eq: async (col: string, val: string) => { queries.push(col); return { data: rows.filter((r) => r[col] === val).map(({ id, tier }) => ({ id, tier })), error: null }; } }) }),
      auth: pagedAuth(authUsers).client.auth,
    } as any,
  };
}

test('G6h member lookup order: member id, then customer id, then auth email', async () => {
  const rows = [
    { id: '11111111-1111-4111-8111-111111111111', tier: 'free', stripe_customer_id: 'cus_a', supabase_auth_id: 'auth_a' },
    { id: '22222222-2222-4222-8222-222222222222', tier: 'seeker', stripe_customer_id: 'cus_b', supabase_auth_id: 'auth_b' },
  ];
  const m1 = membersClient(rows);
  expect((await findMembersForPayment(m1.client, { memberId: rows[0].id, customerId: 'cus_b' }))?.via).toBe('member_id');
  const m2 = membersClient(rows);
  expect(await findMembersForPayment(m2.client, { memberId: 'not-a-uuid', customerId: 'cus_b' })).toEqual({ rows: [{ id: rows[1].id, tier: 'seeker' }], via: 'customer_id' });
  expect(m2.queries).toEqual(['stripe_customer_id']);
  const m3 = membersClient(rows, [{ id: 'auth_a', email: 'a@example.test' }]);
  expect((await findMembersForPayment(m3.client, { customerId: 'cus_new', email: 'A@example.test' }))?.via).toBe('auth_email');
  const m4 = membersClient(rows);
  expect(await findMembersForPayment(m4.client, { email: 'ghost@example.test' })).toBeNull();
});

function eventsClient(result: { data?: any; error?: any }, upsertError: any = null) {
  const upserts: any[] = [];
  return {
    upserts,
    client: {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: result.data ?? null, error: result.error ?? null }) }) }),
        upsert: async (row: any, opts: any) => { upserts.push({ row, opts }); return { error: upsertError }; },
      }),
    } as any,
  };
}

test('G6i idempotency: processed / not processed / table missing / real error', async () => {
  expect(await wasEventProcessed(eventsClient({ data: { event_id: 'evt_1' } }).client, 'evt_1')).toEqual({ available: true, processed: true });
  expect(await wasEventProcessed(eventsClient({}).client, 'evt_1')).toEqual({ available: true, processed: false });
  expect(await wasEventProcessed(eventsClient({ error: { code: '42P01', message: 'relation "stripe_webhook_events" does not exist' } }).client, 'evt_1')).toEqual({ available: false, processed: false });
  await expect(wasEventProcessed(eventsClient({ error: { code: '08006', message: 'connection' } }).client, 'evt_1')).rejects.toThrow('idempotency lookup failed');
  expect(isMissingTableError({ code: 'PGRST205' })).toBe(true);
  expect(isMissingTableError(null)).toBe(false);
});

test('G6j idempotency mark upserts on event_id and never throws', async () => {
  const c = eventsClient({});
  await markEventProcessed(c.client, { id: 'evt_9', type: 'checkout.session.completed', livemode: false, created: 1792800000 }, 'updated');
  expect(c.upserts[0].opts).toEqual({ onConflict: 'event_id' });
  expect(c.upserts[0].row).toEqual(expect.objectContaining({ event_id: 'evt_9', event_type: 'checkout.session.completed', livemode: false, outcome: 'updated', stripe_created_at: '2026-10-24T00:00:00.000Z' }));
  await markEventProcessed(eventsClient({}, { code: '08006', message: 'down' }).client, { id: 'evt_10', type: 'x' }, 'ignored');
});

const LIVE = ['sk', 'live', 'FAKE'].join('_');
const TEST = ['sk', 'test', 'FAKE'].join('_');

test('G6k project pledges: production live key stays closed until PROJECT_PLEDGES_LIVE_ENABLED=true', () => {
  expect(projectPledgeStripe({ VERCEL_ENV: 'production', STRIPE_SECRET_KEY: LIVE })).toEqual(expect.objectContaining({ ok: false, status: 503, code: 'pledges_not_live' }));
  expect(projectPledgeStripe({ VERCEL_ENV: 'production', STRIPE_SECRET_KEY: LIVE, PROJECT_PLEDGES_LIVE_ENABLED: 'true' })).toEqual({ ok: true, key: LIVE, mode: 'live' });
});

test('G6l project pledges: preview uses a test key, never a live one', () => {
  expect(projectPledgeStripe({ VERCEL_ENV: 'preview', STRIPE_TEST_SECRET_KEY: TEST })).toEqual({ ok: true, key: TEST, mode: 'test' });
  expect(projectPledgeStripe({ VERCEL_ENV: 'preview', STRIPE_SECRET_KEY: LIVE, PROJECT_PLEDGES_LIVE_ENABLED: 'true' })).toEqual(expect.objectContaining({ ok: false, code: 'pledges_unconfigured' }));
  expect(projectPledgeStripe({ VERCEL_ENV: 'preview' })).toEqual(expect.objectContaining({ ok: false, status: 503, code: 'pledges_unconfigured' }));
});
