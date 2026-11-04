import { readFile } from 'node:fs/promises';
import { PGlite } from '../../tooling/node_modules/@electric-sql/pglite/dist/index.js';

export const IDS = {
  actor: '11111111-1111-4111-8111-111111111111',
  other: '22222222-2222-4222-8222-222222222222',
  absent: '33333333-3333-4333-8333-333333333333',
};
export const SCOPE = 'test:acct_FictionalOne';
export const CONFIG_HASH = 'a'.repeat(64);
export const OFFER = 'soe-supporter-monthly-v1';
export const TERMS = 'supporter-2026-11-03-v1';
let sequence = 0;
export function requestId() { return `aaaaaaaa-aaaa-4aaa-8aaa-${String(++sequence).padStart(12, '0')}`; }
export function eventId() { return `evt_Fictional${++sequence}`; }

export async function createDb() {
  const db = new PGlite();
  await db.waitReady;
  await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE TABLE public.members(id uuid PRIMARY KEY,tier text NOT NULL DEFAULT 'free');
    GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
    GRANT SELECT(id) ON public.members TO service_role;`);
  await db.query('INSERT INTO members(id,tier) VALUES($1,$2),($3,$4)', [IDS.actor, 'free', IDS.other, 'oracle']);
  await db.exec(await readFile(new URL('../../../../docs/sql/supporter-billing.sql', import.meta.url), 'utf8'));
  return db;
}

// Real SQL in a disposable single-session PostgreSQL engine. Promise.all tests
// prove serialized SQL outcomes; independent backend waits require true PG QA.
export async function asRole(db, role, fn) {
  if (!['anon', 'authenticated', 'service_role'].includes(role)) throw new Error('Invalid fixture role');
  return db.transaction(async tx => { await tx.exec(`SET LOCAL ROLE ${role}`); return fn(tx); });
}
export async function rpc(db, name, args = [], role = 'service_role') {
  if (!/^soe_supporter_[a-z_]+$/.test(name)) throw new Error('Invalid fixture RPC');
  return asRole(db, role, async tx => {
    const result = await tx.query(`SELECT public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) AS result`, args);
    return result.rows[0].result;
  });
}
export function read(db, actor = IDS.actor, scope = SCOPE) { return rpc(db, 'soe_supporter_read', [actor, scope]); }
export function begin(db, { actor = IDS.actor, scope = SCOPE, key = requestId(), revision = 0, offer = OFFER, terms = TERMS, hash = CONFIG_HASH } = {}) {
  return rpc(db, 'soe_supporter_checkout_begin', [actor, scope, key, revision, offer, terms, hash]);
}
export function customer(db, state, id = 'cus_FictionalOne', actor = IDS.actor, scope = SCOPE) {
  return rpc(db, 'soe_supporter_checkout_customer', [actor, scope, state.attempt.requestId, id]);
}
export function complete(db, state, { actor = IDS.actor, scope = SCOPE, sessionId = 'cs_test_FictionalOne', url = 'https://checkout.stripe.com/c/pay/fictional' } = {}) {
  return rpc(db, 'soe_supporter_checkout_complete', [actor, scope, state.attempt.requestId, state.customerId, sessionId, url, state.attempt.expiresAt]);
}
export function snapshot(overrides = {}) {
  return { id: 'sub_FictionalOne', status: 'active', cancelAtPeriodEnd: false,
    currentPeriodStart: '2026-11-03T00:00:00.000Z', currentPeriodEnd: '2026-12-03T00:00:00.000Z', paid: true, ...overrides };
}
export function apply(db, state, { scope = SCOPE, event = eventId(), hash = CONFIG_HASH, account = state.accountId,
  customerId = state.customerId, revision = state.revision, kind = 'subscription', value = snapshot(),
  request = null, status = null, sessionId = null, url = null, expiry = null,
  subscriptionId = status === 'completed' ? value?.id ?? 'sub_FictionalOne' : null } = {}) {
  return rpc(db, 'soe_supporter_apply_event', [scope, event, hash, account, customerId, revision, kind,
    value === null ? null : JSON.stringify(value), request, status, sessionId, url, expiry, subscriptionId]);
}
