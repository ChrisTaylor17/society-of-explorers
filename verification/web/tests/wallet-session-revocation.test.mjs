import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { Wallet } from 'ethers';
import { NextRequest, NextResponse } from 'next/server.js';
import { SiweMessage } from 'siwe';
import { offlineApp } from './support/offline-app.mjs';

const ORIGIN = 'https://wallet-test.invalid';
const INTENT = '11111111-1111-4111-8111-111111111112';
const NEW_INTENT = '22222222-2222-4222-8222-222222222223';
const KEY = '33333333-3333-4333-8333-333333333334';

function selected(member, value, intent = INTENT) {
  return {
    soe_wallet_id: value,
    soe_auth_provider: 'wallet',
    soe_auth_intent: intent,
    soe_auth_selection_v1: `v1.${intent}.wallet.${member}`,
  };
}

function request(path, cookies, origin = ORIGIN, payload) {
  const headers = new Headers({ cookie: Object.entries(cookies).map(([key, value]) => `${key}=${value}`).join('; ') });
  if (path === 'logout') payload = { scope: 'browser', requestId: KEY };
  if (payload) {
    headers.set('content-type', 'application/json');
    headers.set('origin', origin);
  }
  return new NextRequest(`${ORIGIN}/api/auth/${path}`, {
    headers, ...(payload ? { method: 'POST', body: JSON.stringify(payload) } : {}),
  });
}

function fixture(address = '0x' + 'ab'.repeat(20)) {
  const app = offlineApp(), id = app.fakes.ADA;
  const db = app.fakes.resetDb({ members: [{ id, display_name: 'Local wallet fixture', wallet_address: address.toLowerCase() }] });
  const state = { override: null, calls: [], revoked: new Set() };
  const baseRpc = db.rpc.bind(db);
  db.rpc = (name, args) => {
    if (name === 'soe_wallet_challenge_consume') return baseRpc(name, args);
    assert.equal(name, 'soe_wallet_session_access');
    assert.deepEqual(Object.keys(args).sort(), ['p_digest', 'p_expires_at', 'p_revoke']);
    assert.match(args.p_digest, /^[a-f0-9]{64}$/);
    assert(Number.isSafeInteger(args.p_expires_at));
    assert.equal(typeof args.p_revoke, 'boolean');
    return { async abortSignal(signal) {
      assert(signal instanceof AbortSignal);
      state.calls.push(args);
      if (state.override) return state.override;
      if (args.p_revoke) state.revoked.add(args.p_digest);
      return { data: args.p_revoke || !state.revoked.has(args.p_digest), error: null };
    } };
  };
  app.setMock('next/server', () => ({ NextResponse }));
  app.setMock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => db }));
  app.setMock('@/lib/auth/walletSessionStore', () => app.load('lib/auth/walletSessionStore.ts'));
  return { app, id, db, state, wallet: app.load('lib/auth/walletSession.ts'),
    member: cookies => app.load('app/api/auth/member/route.ts').GET(request('member', cookies)),
    logout: (cookies, origin) => app.load('app/api/auth/logout/route.ts').POST(request('logout', cookies, origin)) };
}

test('a copied wallet session cannot be replayed after browser sign-out', async () => {
  const f = fixture();
  const sameSecond = Date.now();
  const value = await f.wallet.createWalletSessionValue(f.id, sameSecond);
  const independent = await f.wallet.createWalletSessionValue(f.id, sameSecond);
  assert.notEqual(independent, value);
  const captured = selected(f.id, value);
  assert.equal((await f.member(captured)).status, 200);
  const logout = await f.logout({ ...captured, soe_auth_intent: NEW_INTENT });
  assert.equal(logout.status, 200);
  assert.equal((await logout.json()).remoteRevocation, 'wallet_session_revoked');
  assert.equal(logout.cookies.get('soe_auth_provider').value, 'signed_out');
  assert.equal(logout.cookies.get('soe_wallet_id').maxAge, 0);
  const fingerprint = createHmac('sha256', f.app.context.process.env.NEXTAUTH_SECRET)
    .update(`wallet-session-access|${value}`).digest('hex');
  assert.deepEqual([...f.state.revoked], [fingerprint]);
  assert.equal(f.state.calls[1].p_expires_at, Number(value.split('.')[2]));
  assert.equal((await f.member(captured)).status, 401);
  assert.equal((await f.member(selected(f.id, independent))).status, 200);
});

test('eligible legacy sessions retain access until revoked', async () => {
  const f = fixture();
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const v2Signature = createHmac('sha256', f.app.context.process.env.NEXTAUTH_SECRET)
    .update(`v2:${f.id}:${expiry}`).digest('hex');
  const v2 = `v2.${f.id}.${expiry}.${v2Signature}`;
  const beforeCutoff = Date.now() < Date.parse(f.wallet.LEGACY_V1_ACCEPT_UNTIL);
  const values = beforeCutoff ? [v2, await f.wallet.createLegacyV1WalletSessionValueForTests(f.id)] : [v2];
  for (const value of values) {
    const cookies = selected(f.id, value);
    assert.equal((await f.member(cookies)).status, 200);
    assert.equal((await f.logout(cookies)).status, 200);
    assert.equal((await f.member(cookies)).status, 401);
  }
});

test('unavailable or malformed ledger responses fail closed before member lookup', async () => {
  const f = fixture();
  const cookies = selected(f.id, await f.wallet.createWalletSessionValue(f.id));
  for (const response of [{ data: true, error: {} }, { data: 'true', error: null }, { data: null, error: null }]) {
    f.state.override = response;
    assert.equal((await f.member(cookies)).status, 401);
  }
  assert.equal(f.db.log.length, 0);
});

test('an unconfirmed revoke locks the browser and preserves a retryable credential', async () => {
  const f = fixture();
  const value = await f.wallet.createWalletSessionValue(f.id);
  const captured = selected(f.id, value);
  const pending = { soe_wallet_id: value, soe_auth_provider: 'signed_out', soe_auth_intent: NEW_INTENT };
  f.state.override = { data: null, error: { message: 'synthetic outage' } };
  const response = await f.logout({ ...captured, soe_auth_intent: NEW_INTENT });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    outcome: 'wallet_revocation_pending', scope: 'browser', requestId: KEY, remoteRevocation: 'not_confirmed',
  });
  assert.equal(response.cookies.get('soe_wallet_id'), undefined);
  assert.equal(response.cookies.get('soe_auth_provider').value, 'signed_out');
  const readback = await f.member(pending);
  assert.equal(readback.status, 401);
  assert.equal((await readback.json()).walletSignOutPending, true);
  assert.equal(f.state.calls.length, 1);
  assert.equal(f.db.log.length, 0);
  f.state.override = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const retry = await f.logout(pending);
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).remoteRevocation, 'wallet_session_revoked');
  }
  assert.equal(f.state.revoked.size, 1);
  assert.equal((await f.member(captured)).status, 401);
});

test('cross-origin sign-out and forged cookies cannot revoke a wallet credential', async () => {
  const f = fixture();
  const value = await f.wallet.createWalletSessionValue(f.id);
  assert.equal((await f.logout(selected(f.id, value), 'https://foreign.invalid')).status, 403);
  const response = await f.logout(selected(f.id, value + '.tampered'));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).remoteRevocation, 'not_confirmed');
  assert.equal(f.state.calls.length, 0);
  assert.equal((await f.member(selected(f.id, value))).status, 200);
});

test('verified wallet sign-in revokes a retained credential before replacing it', async () => {
  const signer = Wallet.createRandom();
  const f = fixture(signer.address);
  const old = await f.wallet.createWalletSessionValue(f.id);
  const nonce = 'Synthetic12345';
  const message = new SiweMessage({
    domain: new URL(ORIGIN).host, uri: ORIGIN, address: signer.address, chainId: 1, version: '1', nonce,
  }).prepareMessage();
  const cookie = await f.app.load('lib/auth/siweNonce.ts').signNonce(nonce, NEW_INTENT);
  const body = { address: signer.address, intent: NEW_INTENT, message, signature: await signer.signMessage(message) };
  const signin = f.app.load('app/api/auth/siwe/route.ts').POST;
  const response = await signin(request('siwe', {
    soe_wallet_id: old, soe_auth_provider: 'signed_out', soe_auth_intent: NEW_INTENT, soe_siwe_nonce: cookie,
  }, ORIGIN, body));
  assert.equal(response.status, 200, await response.clone().text());
  assert.deepEqual(f.state.calls.map(call => call.p_revoke), [false, true]);
  const replacement = response.cookies.get('soe_wallet_id').value;
  assert.notEqual(replacement, old);
  assert.equal((await f.member(selected(f.id, old))).status, 401);
  assert.equal((await f.member(selected(f.id, replacement, NEW_INTENT))).status, 200);
});
