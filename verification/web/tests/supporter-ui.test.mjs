import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { offlineApp } from './support/offline-app.mjs';
import { supporterApp, IDS } from './support/supporter-app.mjs';
const require = createRequire(path.resolve('../../package.json'));
const { JSDOM } = createRequire(path.resolve('tooling/package.json'))('jsdom');
const requestId = '11111111-1111-4111-8111-111111111111', otherId = '22222222-2222-4222-8222-222222222222';
const offer = (open = false) => ({ offerId: 'soe-supporter-monthly-v1', termsVersion: 'supporter-2026-11-03-v1', amount: 1000, currency: 'usd', interval: 'month', salesOpen: open, managementAvailable: true, mode: 'test' });
const status = (extra = {}) => ({ revision: 3, reviewToken: 'a'.repeat(64), status: 'none', mode: 'test', canCheckout: true, canManage: false, legacy: false, cancelAtPeriodEnd: false, currentPeriodEnd: null, pendingAttempt: null, ...extra });
const receipt = (request, operation = 'checkout', extra = {}) => ({ requestId: request.requestId, attemptId: request.requestId, operation, mode: request.expectedMode, reviewToken: request.reviewToken, revision: request.expectedRevision + 1, url: operation === 'checkout' ? 'https://checkout.stripe.com/c/pay/cs_test_fixture' : 'https://billing.stripe.com/p/session/bps_test_fixture', replayed: false, outcome: 'ready', ...extra });
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
async function mount({ mode = 'join', fullPage = false, attemptId = null, respond, credentials = async () => ({}), strict = true, url = 'https://offline.invalid/join?intent=supporter' } = {}) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url, pretendToBeVisual: true });
  const previous = {};
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous[key] = Object.getOwnPropertyDescriptor(globalThis, key); Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  }
  const React = require('react'), { createRoot } = require('react-dom/client'), { act } = React;
  const app = offlineApp(), requests = [], listeners = new Set(), deadlines = [];
  app.context.window = dom.window; app.context.document = dom.window.document;
  app.context.setTimeout = (fn, ms) => { if (ms === 15000) { const item = { fn, cleared: false }; deadlines.push(item); return item; } return setTimeout(fn, ms); };
  app.context.clearTimeout = item => item && 'cleared' in Object(item) ? item.cleared = true : clearTimeout(item);
  app.context.fetch = (url, options) => {
    requests.push({ url, options });
    return Promise.resolve(respond ? respond(url, options) : Response.json(url.endsWith('/offer') ? offer() : status()));
  };
  app.setMock('./client', () => ({ circleHeaders: credentials }));
  app.setMock('@/lib/circles/client', () => ({ circleHeaders: credentials }));
  app.setMock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { onAuthStateChange(listener) { listeners.add(listener); return { data: { subscription: { unsubscribe() { listeners.delete(listener); } } } }; } } }) }));
  app.setMock('next/link', () => ({ __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) }));
  for (const name of ['./supporter.module.css', '../supporter.module.css', '../billing/supporter.module.css', './safety.module.css']) app.setMock(name, () => ({ __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) }));
  const View = app.load(fullPage ? 'app/join/page.tsx' : 'app/billing/SupporterBilling.tsx').default;
  const root = createRoot(document.getElementById('root'));
  const render = async () => act(async () => root.render(React.createElement(strict ? React.StrictMode : React.Fragment, null, React.createElement(View, fullPage ? {} : { mode, attemptId }))));
  await render();
  const button = label => [...document.querySelectorAll('button')].find(element => element.textContent === label);
  const click = async label => { assert.ok(button(label), label); await act(async () => button(label).click()); };
  const confirm = async () => act(async () => document.querySelector('input[type="checkbox"]').click());
  const event = async (name, target = dom.window) => act(async () => target.dispatchEvent(new dom.window.Event(name)));
  const auth = async name => act(async () => { for (const listener of [...listeners]) listener(name); });
  const cleanup = async () => { await act(async () => root.unmount()); dom.window.close(); for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } };
  return { app, dom, requests, listeners, deadlines, act, render, button, click, confirm, event, auth, cleanup, text: () => document.body.textContent };
}
const normal = (url, options) => Response.json(url.endsWith('/offer') ? offer(true) : options.method === 'POST' ? receipt(JSON.parse(options.body), url.endsWith('/portal') ? 'portal' : 'checkout') : status());
async function prepareCheckout(a) { await a.click('Check supporter options'); await a.click('Review supporter subscription'); await a.confirm(); }
const writes = a => a.requests.filter(request => request.options.method === 'POST');

test('join shows the free community and proposed monthly support without automatic account reads or sales claims', async () => {
  const a = await mount({ fullPage: true });
  try {
    assert.ok(document.querySelector('main#main h1')); assert.match(a.text(), /\$10 USD per month|same free reading and Circle access|Everyone is welcome/);
    assert.match(a.text(), /New supporter purchases are currently closed/);
    assert.ok(document.querySelector('a[href="/great-books"]')); assert.ok(document.querySelector('a[href="/billing"]'));
    assert.equal(a.requests.every(request => request.url === '/api/supporter/offer' && request.options.method === 'GET' && request.options.credentials === 'omit'), true);
    assert.equal(writes(a).length, 0); assert.equal(a.listeners.size, 1);
    const ld = a.app.load('lib/join/structuredData.ts').membershipOffersJsonLd(); assert.equal(ld['@type'], 'WebPage'); assert.doesNotMatch(JSON.stringify(ld), /Offer|InStock|Product/);
    assert.doesNotMatch(a.text(), /Unlimited Council|everything.*forever|priority placement|Your payment went through/);
  } finally { await a.cleanup(); }
});

test('closed sales and malformed public offers block checkout while existing management remains reachable', async () => {
  for (const malformed of [false, true]) {
    const a = await mount({ respond: url => Response.json(url.endsWith('/offer') ? malformed ? { ...offer(true), amount: 900 } : offer(false) : status()) });
    try {
      await a.click('Check supporter options'); assert.equal(a.button('Review supporter subscription').disabled, true);
      assert.ok(document.querySelector('a[href="/billing"]')); assert.equal(writes(a).length, 0);
      if (malformed) assert.ok(a.button('Retry public availability'));
    } finally { await a.cleanup(); }
  }
});

test('checkout needs fresh account state, a focused review and confirmation before one bound POST; navigation stays manual', async () => {
  const a = await mount({ respond: normal });
  try {
    await a.click('Check supporter options'); await a.click('Review supporter subscription');
    assert.equal(a.requests.filter(request => request.url.endsWith('/status')).length, 2); assert.equal(writes(a).length, 0);
    assert.equal(document.activeElement.textContent, 'Review optional monthly support'); assert.equal(a.button('Confirm and prepare checkout').disabled, true);
    assert.match(a.text(), /proposing a \$10 USD monthly supporter subscription/); assert.match(a.text(), /final amount, any displayed tax, recurring terms/);
    await a.confirm(); const submit = a.button('Confirm and prepare checkout'); await a.act(async () => { submit.click(); submit.click(); });
    assert.equal(writes(a).length, 1); const sent = JSON.parse(writes(a)[0].options.body);
    assert.deepEqual(Object.keys(sent).sort(), ['expectedMode', 'expectedRevision', 'offerId', 'requestId', 'reviewToken', 'termsVersion']); assert.equal(sent.expectedRevision, 3); assert.match(sent.requestId, /^[a-f0-9-]{36}$/); assert.equal(sent.expectedMode, 'test'); assert.equal(sent.reviewToken, 'a'.repeat(64));
    assert.ok(document.querySelector('a[href="https://checkout.stripe.com/c/pay/cs_test_fixture"]')); assert.equal(new URL(a.dom.window.location.href).hostname, 'offline.invalid');
    assert.match(a.text(), /A subscription or payment has not been confirmed/); assert.doesNotMatch(a.text(), /Your payment went through/);
  } finally { await a.cleanup(); }
});

test('auth intent survives sign-in and signup but returning never starts a private read or payment', async () => {
  const a = await mount({ respond: normal });
  try {
    for (const link of document.querySelectorAll('a[href^="/login"]')) assert.equal(new URL(link.href).searchParams.get('next'), '/join?intent=supporter');
    assert.equal(a.requests.every(request => request.url.endsWith('/offer')), true);
    await a.auth('SIGNED_IN'); await a.event('focus'); assert.equal(a.requests.every(request => request.url.endsWith('/offer')), true); assert.equal(writes(a).length, 0);
  } finally { await a.cleanup(); }
});

test('a fresh state change blocks a stale checkout review instead of creating another subscription', async () => {
  let reads = 0;
  const a = await mount({ respond: (url, options) => url.endsWith('/status') ? Response.json(++reads === 1 ? status() : status({ revision: 4, status: 'active', canCheckout: false, canManage: true })) : normal(url, options) });
  try { await a.click('Check supporter options'); await a.click('Review supporter subscription'); assert.match(a.text(), /billing options changed|currently active/); assert.equal(a.button('Confirm and prepare checkout'), undefined); assert.equal(writes(a).length, 0); }
  finally { await a.cleanup(); }
});

test('an uncertain reply preserves exactly the original request for manual retry without inventing a charge outcome', async () => {
  let count = 0;
  const a = await mount({ respond: (url, options) => {
    if (options.method !== 'POST') return normal(url, options);
    if (++count === 1) throw new Error('Unknown committed session'); return Response.json(receipt(JSON.parse(options.body), 'checkout', { replayed: true }));
  } });
  try {
    await prepareCheckout(a); await a.click('Confirm and prepare checkout'); assert.equal(count, 1); assert.match(a.text(), /request may have completed/); assert.doesNotMatch(a.text(), /Nothing was charged|membership was not changed/);
    await a.event('focus'); assert.equal(count, 1); await a.click('Retry exact billing request');
    assert.equal(count, 2); assert.equal(writes(a)[0].options.body, writes(a)[1].options.body); assert.ok(document.querySelector('a[href^="https://checkout.stripe.com/c/pay/"]'));
  } finally { await a.cleanup(); }
});

test('a fresh verified active status resolves an uncertain checkout and permits a separate manual portal review', async () => {
  let active = false;
  const a = await mount({ respond: (url, options) => {
    if (options.method === 'POST') throw new Error('Session reply lost');
    return url.endsWith('/status') && active ? Response.json(status({ status: 'active', canCheckout: false, canManage: true, pendingAttempt: null })) : normal(url, options);
  } });
  try {
    await prepareCheckout(a); await a.click('Confirm and prepare checkout'); assert.ok(a.button('Retry exact billing request'));
    active = true; await a.click('Check supporter options'); assert.equal(a.button('Retry exact billing request'), undefined); assert.equal(a.button('Review billing management').disabled, false);
    assert.equal(writes(a).length, 1); await a.click('Review billing management'); assert.ok(a.button('Confirm and prepare billing portal')); assert.equal(writes(a).length, 1);
  } finally { await a.cleanup(); }
});

test('a fresh read keeps an unknown checkout blocked but permits a server-authorized portal replacement', async () => {
  const a = await mount({ respond: (url, options) => options.method === 'POST' ? Promise.reject(new Error('Uncertain checkout')) : normal(url, options) });
  try { await prepareCheckout(a); await a.click('Confirm and prepare checkout'); await a.click('Check supporter options'); assert.ok(a.button('Retry exact billing request')); assert.equal(a.button('Review supporter subscription').disabled, true); assert.equal(writes(a).length, 1); }
  finally { await a.cleanup(); }
  const b = await mount({ mode: 'billing', respond: (_url, options) => options.method === 'POST' ? Promise.reject(new Error('Uncertain portal')) : Response.json(status({ status: 'active', canCheckout: false, canManage: true })) });
  try { await b.click('Load current billing status'); await b.click('Review billing management'); await b.confirm(); await b.click('Confirm and prepare billing portal'); assert.ok(b.button('Retry exact billing request')); await b.click('Load current billing status'); assert.equal(b.button('Retry exact billing request'), undefined); assert.equal(b.button('Review billing management').disabled, false); assert.equal(writes(b).length, 1); }
  finally { await b.cleanup(); }
});

test('mismatched or absent private mode cannot turn a test offer into a live checkout review', async () => {
  for (const mode of [null, 'live']) {
    const a = await mount({ respond: url => Response.json(url.endsWith('/offer') ? offer(true) : status({ mode })) });
    try { await a.click('Check supporter options'); assert.ok(!a.button('Review supporter subscription') || a.button('Review supporter subscription').disabled); assert.equal(writes(a).length, 0); }
    finally { await a.cleanup(); }
  }
});

test('wrong receipt binding, old revision and unsafe destinations never become navigation links', async () => {
  for (const change of [{ requestId: otherId, attemptId: otherId }, { operation: 'portal', url: 'https://billing.stripe.com/p/session/bps_test' }, { mode: 'live' }, { reviewToken: 'b'.repeat(64) }, { revision: 2 }, { url: 'https://checkout.stripe.com.evil.invalid/c/pay/steal' }, { url: 'https://checkout.stripe.com:444/c/pay/steal' }, { url: 'https://user:pass@checkout.stripe.com/c/pay/steal' }]) {
    const a = await mount({ respond: (url, options) => options.method === 'POST' ? Response.json(receipt(JSON.parse(options.body), 'checkout', change)) : normal(url, options) });
    try { await prepareCheckout(a); await a.click('Confirm and prepare checkout'); assert.match(a.text(), /reply could not be confirmed/); assert.ok(a.button('Retry exact billing request')); assert.equal(document.querySelector('section[aria-label="Prepared Stripe session"]'), null); }
    finally { await a.cleanup(); }
  }
});

test('account, hidden, storage and inactive-window retirement clear private snapshots, confirmations, retries and session URLs', async () => {
  for (const retire of [a => a.auth('SIGNED_OUT'), a => a.event('blur'), a => a.event('storage'), async a => { Object.defineProperty(a.dom.window.document, 'visibilityState', { configurable: true, value: 'hidden' }); await a.event('visibilitychange', a.dom.window.document); }]) {
    const a = await mount({ respond: normal });
    try {
      await prepareCheckout(a); await a.click('Confirm and prepare checkout'); assert.ok(document.querySelector('section[aria-label="Prepared Stripe session"]'));
      await retire(a); assert.equal(document.querySelector('section[aria-label="Prepared Stripe session"]'), null); assert.equal(document.querySelector('section[aria-label="Your current billing status"]'), null); assert.equal(document.querySelector('input[type="checkbox"]'), null);
      const before = a.requests.length; await a.event('focus'); assert.equal(a.requests.length, before); assert.match(a.text(), /Private billing details.*cleared/);
    } finally { await a.cleanup(); }
  }
});

test('pending credentials and delayed receipts cannot cross identity retirement or unmount', async () => {
  const credential = deferred(); let waiting = false;
  const a = await mount({ respond: normal, credentials: () => waiting ? credential.promise : Promise.resolve({}) });
  try {
    await prepareCheckout(a); waiting = true; await a.click('Confirm and prepare checkout'); await a.auth('SIGNED_OUT');
    await a.act(async () => credential.resolve({ Authorization: 'Bearer STALE_ACCOUNT' })); assert.equal(writes(a).length, 0); assert.equal(document.querySelector('section[aria-label="Prepared Stripe session"]'), null);
  } finally { credential.resolve({}); await a.cleanup(); }
  const late = deferred(); const b = await mount({ respond: (url, options) => options.method === 'POST' ? late.promise : normal(url, options) });
  await prepareCheckout(b); await b.click('Confirm and prepare checkout'); const sent = JSON.parse(writes(b)[0].options.body); await b.cleanup(); late.resolve(Response.json(receipt(sent)));
});

test('the fifteen-second deadline includes JSON bodies and keeps late successful replies uncertain', async () => {
  const late = deferred(); let sent;
  const a = await mount({ respond: (url, options) => {
    if (options.method !== 'POST') return normal(url, options);
    sent = JSON.parse(options.body); return { status: 200, json: () => late.promise };
  } });
  try {
    await prepareCheckout(a); await a.click('Confirm and prepare checkout'); await a.act(async () => a.deadlines.filter(item => !item.cleared).at(-1).fn());
    assert.ok(a.button('Retry exact billing request')); await a.act(async () => late.resolve(receipt(sent))); assert.equal(document.querySelector('section[aria-label="Prepared Stripe session"]'), null); assert.equal(writes(a).length, 1);
  } finally { late.resolve(receipt(sent)); await a.cleanup(); }
});

test('legacy subscription management remains explicit and usable without new sales or a legacy-tier rename', async () => {
  const legacy = status({ status: 'none', legacy: true, canCheckout: false, canManage: true });
  const a = await mount({ mode: 'billing', respond: (url, options) => options.method === 'POST' ? Response.json(receipt(JSON.parse(options.body), 'portal')) : Response.json(legacy) });
  try {
    assert.equal(a.requests.length, 0); await a.click('Load current billing status'); assert.match(a.text(), /older membership|not been renamed or migrated/); assert.match(a.text(), /does not report the payment status of your older membership/); assert.doesNotMatch(a.text(), /No current subscription was found/);
    assert.equal(a.button('Review supporter subscription'), undefined); await a.click('Review billing management'); assert.equal(a.requests.length, 2); assert.equal(writes(a).length, 0);
    await a.confirm(); await a.click('Confirm and prepare billing portal'); assert.deepEqual(Object.keys(JSON.parse(writes(a)[0].options.body)).sort(), ['expectedMode', 'expectedRevision', 'requestId', 'reviewToken']);
    assert.ok(document.querySelector('a[href="https://billing.stripe.com/p/session/bps_test_fixture"]')); assert.equal(new URL(a.dom.window.location.href).hostname, 'offline.invalid');
  } finally { await a.cleanup(); }
});

test('unavailable, ambiguous and ending status are distinct from an empty history, and private errors are not rendered', async () => {
  for (const state of ['unavailable', 'review', 'attention', 'ending']) {
    const a = await mount({ mode: 'billing', respond: () => Response.json(status({ status: state, canCheckout: false, canManage: false, cancelAtPeriodEnd: state === 'ending', currentPeriodEnd: state === 'ending' ? '2026-12-03T00:00:00.000Z' : null })) });
    try { await a.click('Load current billing status'); assert.doesNotMatch(a.text(), /No current subscription was found/); assert.equal(a.button('Review billing management').disabled, true); if (state === 'ending') assert.match(a.text(), /December 3, 2026|Cancellation at the end/); }
    finally { await a.cleanup(); }
  }
  const b = await mount({ mode: 'billing', respond: () => Response.json({ error: 'PRIVATE_PROVIDER_ID' }, { status: 403 }) });
  try { await b.click('Load current billing status'); assert.doesNotMatch(b.text(), /PRIVATE_PROVIDER_ID|No current subscription/); assert.equal(document.querySelector('section[aria-label="Your current billing status"]'), null); }
  finally { await b.cleanup(); }
});

test('return URL flags never confirm payment; only an explicit own return read can show verified current state', async () => {
  for (const result of ['pending', 'review', 'confirmed']) {
    const returned = status({ status: result === 'confirmed' ? 'active' : result === 'pending' ? 'pending' : 'review', canCheckout: false, canManage: result === 'confirmed', returnState: result });
    const a = await mount({ mode: 'return', attemptId: requestId, url: `https://offline.invalid/billing/return?attempt=${requestId}&success=1&welcome=1`, respond: () => Response.json(returned) });
    try {
      assert.equal(a.requests.length, 0); assert.doesNotMatch(a.text(), /was verified|payment went through/);
      await a.click('Check this return attempt'); assert.equal(a.requests[0].url, `/api/supporter/return?attempt=${requestId}`); assert.equal(writes(a).length, 0);
      assert.match(a.text(), result === 'confirmed' ? /return attempt was verified/ : result === 'pending' ? /has not been confirmed/ : /could not be confirmed/);
      for (const link of document.querySelectorAll('a[href^="/login"]')) assert.equal(new URL(link.href).searchParams.get('next'), `/billing/return?attempt=${requestId}`);
    } finally { await a.cleanup(); }
  }
  const invalid = await mount({ mode: 'return' });
  try { assert.equal(invalid.button('Check this return attempt').disabled, true); assert.equal(invalid.requests.length, 0); assert.match(invalid.text(), /valid return attempt was not supplied/); }
  finally { await invalid.cleanup(); }
});

test('a pending attempt from another page is not turned into a guessed retry payload or a new checkout', async () => {
  const a = await mount({ respond: url => Response.json(url.endsWith('/offer') ? offer(true) : status({ status: 'pending', canCheckout: false, pendingAttempt: { requestId, attemptId: requestId, operation: 'checkout', expiresAt: '2026-11-03T23:30:00.000Z', retryUntil: '2026-11-04T23:00:00.000Z' } })) });
  try { await a.click('Check supporter options'); assert.equal(a.button('Review supporter subscription').disabled, true); assert.equal(a.button('Retry exact billing request'), undefined); assert.doesNotMatch(a.text(), new RegExp(requestId)); assert.ok(document.querySelector(`a[href="/billing/return?attempt=${requestId}"]`)); assert.ok(a.button('Review pending checkout recovery')); assert.equal(writes(a).length, 0); }
  finally { await a.cleanup(); }
});

test('reload recovery uses the durable pending checkout key with a fresh review even when new sales are closed', async () => {
  let resolved = false;
  const queued = status({ revision: 8, status: 'pending', canCheckout: false, pendingAttempt: { requestId, attemptId: requestId, operation: 'checkout', expiresAt: '2026-11-03T23:30:00.000Z', retryUntil: '2026-11-04T23:00:00.000Z' } });
  const a = await mount({ mode: 'billing', respond: (_url, options) => {
    if (options.method === 'POST') { resolved = true; const request = JSON.parse(options.body); return Response.json(receipt(request, 'checkout', { outcome: 'pending', url: null })); }
    return Response.json(resolved ? status({ revision: 9, canCheckout: false }) : queued);
  } });
  try {
    assert.equal(a.requests.length, 0); await a.click('Load current billing status'); await a.click('Review pending checkout recovery');
    assert.equal(a.requests.length, 2); assert.equal(a.button('Confirm pending checkout recovery').disabled, true); assert.equal(writes(a).length, 0);
    assert.match(a.text(), /same earlier \$10 USD monthly supporter request|new sales are closed/);
    await a.confirm(); await a.click('Confirm pending checkout recovery'); const sent = JSON.parse(writes(a)[0].options.body);
    assert.equal(sent.requestId, requestId); assert.equal(sent.expectedRevision, 8); assert.equal(sent.expectedMode, 'test'); assert.equal(sent.reviewToken, queued.reviewToken); assert.equal(sent.offerId, offer().offerId);
    await a.click('Load current billing status'); assert.equal(a.button('Retry exact billing request'), undefined); assert.match(a.text(), /No current subscription was found/); assert.equal(writes(a).length, 1);
  } finally { await a.cleanup(); }
});

test('public availability deadline is bounded, and the new pages use no member-provisioning helper or private SSR read', async () => {
  const late = deferred(); const a = await mount({ respond: () => late.promise });
  try { await a.act(async () => a.deadlines.filter(item => !item.cleared).at(-1).fn()); assert.ok(a.button('Retry public availability')); await a.act(async () => late.resolve(Response.json(offer(true)))); assert.ok(a.button('Retry public availability')); }
  finally { late.resolve(Response.json(offer())); await a.cleanup(); }
  for (const file of ['app/join/page.tsx', 'app/billing/page.tsx', 'app/billing/return/page.tsx', 'app/billing/SupporterBilling.tsx']) assert.doesNotMatch(fs.readFileSync(path.resolve('../..', file), 'utf8'), /getMemberSession|ensure-member|PublicNav|window\.location\.assign/);
});

test('actual React → candidate HTTP → SQL recovers one lost checkout reply, verifies its webhook return, and prepares owned portal management', async () => {
  const system = await supporterApp({ salesEnabled: true }); let lose = true;
  const a = await mount({ respond: async (url, options) => {
    const response = await system.dispatch(url, options.method, options.body ? JSON.parse(options.body) : undefined);
    if (options.method === 'POST' && lose) { lose = false; await response.text(); throw new Error('Transport lost after persisted commit'); }
    return response;
  } });
  let sent;
  try {
    await prepareCheckout(a); await a.click('Confirm and prepare checkout'); assert.ok(a.button('Retry exact billing request'));
    await a.click('Retry exact billing request'); assert.equal(writes(a).length, 2); assert.equal(writes(a)[0].options.body, writes(a)[1].options.body);
    sent = JSON.parse(writes(a)[0].options.body); assert.equal(system.provider.sessions.size, 1); assert.equal((await system.db.query('SELECT count(*)::int n FROM supporter_checkout_attempts')).rows[0].n, 1);
    assert.ok(document.querySelector('a[href^="https://checkout.stripe.com/c/pay/"]')); await system.provider.markPaid(sent.requestId);
  } finally { await a.cleanup(); }
  const b = await mount({ mode: 'return', attemptId: sent.requestId, respond: (url, options) => system.dispatch(url, options.method, options.body ? JSON.parse(options.body) : undefined) });
  try {
    assert.equal(b.requests.length, 0); await b.click('Check this return attempt'); assert.match(b.text(), /return attempt was verified|currently active/);
    system.setSalesEnabled(false); await b.click('Review billing management'); await b.confirm(); await b.click('Confirm and prepare billing portal');
    assert.ok(document.querySelector('a[href^="https://billing.stripe.com/p/session/"]')); assert.equal((await system.db.query('SELECT tier FROM members WHERE id=$1', [IDS.actor])).rows[0].tier, 'free');
  } finally { await b.cleanup(); await system.close(); }
});

test('actual React → HTTP → SQL reconstructs only the own pending key after reload and resolves known expiration with sales closed', async () => {
  const system = await supporterApp({ salesEnabled: true });
  const respond = (url, options) => system.dispatch(url, options.method, options.body ? JSON.parse(options.body) : undefined);
  const a = await mount({ respond }); let oldKey;
  try { await prepareCheckout(a); await a.click('Confirm and prepare checkout'); oldKey = JSON.parse(writes(a)[0].options.body).requestId; assert.ok(document.querySelector('a[href^="https://checkout.stripe.com/c/pay/"]')); }
  finally { await a.cleanup(); }
  const session = system.provider.sessions.get(oldKey); session.status = 'expired'; session.url = null; system.setSalesEnabled(false);
  const b = await mount({ mode: 'billing', respond });
  try {
    await b.click('Load current billing status'); assert.ok(b.button('Review pending checkout recovery')); assert.equal(writes(b).length, 0);
    await b.click('Review pending checkout recovery'); await b.confirm(); await b.click('Confirm pending checkout recovery');
    assert.equal(JSON.parse(writes(b)[0].options.body).requestId, oldKey); assert.equal(system.provider.sessions.size, 1);
    await b.click('Load current billing status'); assert.match(b.text(), /No current subscription was found/); assert.equal(b.button('Retry exact billing request'), undefined);
    assert.equal((await system.db.query('SELECT status FROM supporter_checkout_attempts WHERE request_id=$1', [oldKey])).rows[0].status, 'expired');
  } finally { await b.cleanup(); await system.close(); }
});
