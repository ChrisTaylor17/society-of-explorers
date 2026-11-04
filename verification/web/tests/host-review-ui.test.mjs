import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { offlineApp } from './support/offline-app.mjs';

const require = createRequire(path.resolve('../../package.json'));
const tooling = createRequire(path.resolve('tooling/package.json'));
const { JSDOM } = tooling('jsdom');
const id = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';
const decisionId = '33333333-3333-4333-8333-333333333333';
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function result(title = 'Tuesday Readers', circleId = id, nextCursor = null) {
  return { items: [{ circle: { id: circleId, title, hidden: true }, decisions: [{
    id: decisionId, action: 'hide', reason: 'safety', summary: 'Meet in a public venue before relisting this circle.', created_at: '2026-11-03T12:00:00Z',
  }] }], nextCursor };
}

async function mount({ respond = () => Response.json(result()), credentials = async () => ({ Authorization: 'Bearer OFFLINE_TEST' }), strict = false, harness = false, subscribeError = false } = {}) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://offline.invalid/circles/review', pretendToBeVisual: true });
  const previous = {};
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  }
  const React = require('react'), { createRoot } = require('react-dom/client'), { act } = React;
  const app = offlineApp(), requests = [], credentialCalls = [], deadlines = [], authListeners = new Set();
  let unsubscribeCount = 0, retireCount = 0, controls;
  app.context.window = dom.window; app.context.document = dom.window.document;
  app.context.setTimeout = (fn, ms) => {
    if (ms === 15_000) { const deadline = { fn, cleared: false }; deadlines.push(deadline); return deadline; }
    return setTimeout(fn, ms);
  };
  app.context.clearTimeout = handle => {
    if (handle && typeof handle === 'object' && 'cleared' in handle) handle.cleared = true;
    else clearTimeout(handle);
  };
  app.context.fetch = (url, options) => { requests.push({ url, options }); return Promise.resolve(respond(url, options)); };
  app.setMock('@/lib/circles/client', () => ({ circleHeaders: json => { credentialCalls.push(json); return credentials(json); } }));
  app.setMock('./client', () => ({ circleHeaders: json => { credentialCalls.push(json); return credentials(json); } }));
  app.setMock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { onAuthStateChange(listener) {
    if (subscribeError) throw new Error('Offline subscription unavailable');
    authListeners.add(listener);
    return { data: { subscription: { unsubscribe() { unsubscribeCount++; authListeners.delete(listener); } } } };
  } } }) }));
  app.setMock('next/link', () => ({ __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) }));
  const useReviewAccess = app.load('lib/circles/useReviewAccess.ts').useReviewAccess;
  function Harness() {
    const [draft, setDraft] = React.useState('Private reviewer draft');
    const clear = React.useCallback(() => { retireCount++; setDraft(''); }, []);
    controls = useReviewAccess(clear);
    return React.createElement('div', null,
      React.createElement('span', { 'data-draft': true }, draft),
      React.createElement('span', { 'data-active': true }, String(controls.active)),
      React.createElement('span', { 'data-busy': true }, String(controls.busy)));
  }
  const View = harness ? Harness : app.load('app/circles/review/HostReviews.tsx').default;
  const root = createRoot(document.getElementById('root'));
  await act(async () => root.render(strict ? React.createElement(React.StrictMode, null, React.createElement(View)) : React.createElement(View)));
  const button = label => [...document.querySelectorAll('button')].find(el => el.textContent === label);
  const click = async label => { assert.ok(button(label), label); await act(async () => button(label).click()); };
  const event = async (name, target = dom.window) => { await act(async () => target.dispatchEvent(new dom.window.Event(name))); };
  const auth = async name => { await act(async () => { for (const fn of [...authListeners]) fn(name); }); };
  const visibility = async value => {
    Object.defineProperty(dom.window.document, 'visibilityState', { value, configurable: true });
    await event('visibilitychange', dom.window.document);
  };
  const timeout = async () => { const pending = deadlines.findLast(item => !item.cleared); assert.ok(pending); await act(async () => pending.fn()); };
  const cleanup = async () => {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  };
  return { app, dom, act, requests, credentialCalls, deadlines, authListeners, click, event, auth, visibility, timeout, cleanup,
    button, controls: () => controls, retireCount: () => retireCount, unsubscribeCount: () => unsubscribeCount,
    text: () => document.body.textContent, status: () => document.querySelector('[role="status"]')?.textContent };
}

test('host outcomes require an explicit read, remain public-safe text, and survive Strict Mode with one auth subscription', async () => {
  const payload = result('<img src=x onerror=bad()>');
  Object.assign(payload.items[0].decisions[0], { report_count: 51, reporter: 'PRIVATE_REPORTER', evidence: 'PRIVATE_EVIDENCE' });
  payload.items[0].decisions[0].summary = '<script>unsafe()</script> Use a public meeting venue.';
  const a = await mount({ strict: true, respond: () => Response.json(payload) });
  try {
    assert.equal(a.requests.length, 0); assert.equal(a.authListeners.size, 1); assert.equal(a.unsubscribeCount(), 1);
    await a.click('Load my review outcomes');
    assert.match(a.text(), /<img src=x onerror=bad\(\)>/); assert.match(a.text(), /<script>unsafe\(\)<\/script>/);
    assert.equal(document.querySelector('img,script'), null); assert.doesNotMatch(a.text(), /PRIVATE_REPORTER|PRIVATE_EVIDENCE|51/);
    assert.match(a.text(), /Hidden from public listings/); assert.ok(document.querySelector('time[datetime="2026-11-03T12:00:00Z"]'));
    const request = a.requests[0]; assert.equal(request.options.method, 'GET'); assert.equal(request.options.cache, 'no-store'); assert.equal(request.options.redirect, 'error');
    assert.equal(request.options.headers.get('Authorization'), 'Bearer OFFLINE_TEST');
    assert.equal(document.querySelector('[aria-label="Your circle review outcomes"]').getAttribute('aria-busy'), 'false');
    assert.equal(a.button('Refresh my review outcomes').style.minHeight, '44px');
  } finally { await a.cleanup(); }
});

test('host pagination immediately replaces its private page and never merges histories across reads', async () => {
  const pending = deferred();
  const a = await mount({ respond: url => url.includes('?after=') ? pending.promise : Response.json(result('First page private title', id, id)) });
  try {
    await a.click('Load my review outcomes'); await a.click('Next page of hosted circles');
    assert.doesNotMatch(a.text(), /First page private title/); assert.match(a.status(), /Loading/);
    assert.equal(a.requests.at(-1).url, `/api/circles/review?after=${id}`);
    await a.act(async () => pending.resolve(Response.json(result('Second page title', secondId))));
    assert.match(a.text(), /Second page title/); assert.doesNotMatch(a.text(), /First page private title/);
    assert.equal(a.dom.window.location.search, ''); assert.equal(a.dom.window.localStorage.length, 0); assert.equal(a.dom.window.sessionStorage.length, 0);
    await a.click('Refresh my review outcomes'); assert.equal(a.requests.at(-1).url, '/api/circles/review');
  } finally { pending.resolve(Response.json(result())); await a.cleanup(); }
});

test('401 and 403 erase previously loaded outcomes and do not reveal server error payloads', async () => {
  for (const status of [401, 403]) {
    let deny = false;
    const a = await mount({ respond: () => deny ? Response.json({ error: 'PRIVATE_SERVER_DETAIL' }, { status }) : Response.json(result('Private hosted circle')) });
    try {
      await a.click('Load my review outcomes'); deny = true; await a.click('Refresh my review outcomes');
      assert.doesNotMatch(a.text(), /Private hosted circle|PRIVATE_SERVER_DETAIL|Meet in a public venue/);
      assert.match(a.status(), status === 401 ? /Sign in/ : /not available for this account/);
      assert.equal(!!document.querySelector('a[href="/login?next=/circles/review"]'), status === 401);
    } finally { await a.cleanup(); }
  }
});

test('unavailable, malformed and repeated-cursor replies are not presented as empty histories', async () => {
  for (const reply of [() => Response.json({ items: [], nextCursor: null }, { status: 503 }), () => Response.json({ items: 'invalid', nextCursor: null }), () => new Response('not json'), () => { throw new Error('Offline transport unavailable'); }]) {
    const a = await mount({ respond: reply });
    try { await a.click('Load my review outcomes'); assert.match(a.status(), /could not be loaded/); assert.doesNotMatch(a.text(), /No hosted circles/); }
    finally { await a.cleanup(); }
  }
  const a = await mount({ respond: () => Response.json(result('Same cursor', id, id)) });
  try {
    await a.click('Load my review outcomes'); await a.click('Next page of hosted circles'); assert.match(a.status(), /could not be loaded/);
  } finally { await a.cleanup(); }
  const empty = await mount({ respond: () => Response.json({ items: [], nextCursor: null }) });
  try { await empty.click('Load my review outcomes'); assert.match(empty.status(), /No hosted circles are available/); }
  finally { await empty.cleanup(); }
});

test('blur, pagehide, hidden, auth and storage retire private outcomes; resume never reads automatically', async () => {
  for (const retire of [a => a.event('blur'), a => a.event('pagehide'), a => a.visibility('hidden'), a => a.auth('SIGNED_OUT'), a => a.event('storage')]) {
    const a = await mount();
    try {
      await a.click('Load my review outcomes'); await a.auth('INITIAL_SESSION'); assert.match(a.text(), /Tuesday Readers/);
      const before = a.requests.length; await retire(a);
      assert.doesNotMatch(a.text(), /Tuesday Readers|Meet in a public venue/); assert.match(a.status(), /cleared/);
      await a.visibility('visible'); await a.event('focus'); assert.equal(a.requests.length, before);
      await a.click('Load my review outcomes'); assert.equal(a.requests.length, before + 1); assert.match(a.text(), /Tuesday Readers/);
    } finally { await a.cleanup(); }
  }
});

test('retirement while credentials are pending prevents transport even after focus resumes', async () => {
  const credential = deferred(); let calls = 0;
  const a = await mount({ credentials: () => ++calls === 1 ? credential.promise : Promise.resolve({ Authorization: 'Bearer FRESH' }) });
  try {
    await a.click('Load my review outcomes'); assert.equal(a.requests.length, 0); await a.event('blur'); await a.event('focus');
    await a.act(async () => credential.resolve({ Authorization: 'Bearer OLD' })); assert.equal(a.requests.length, 0);
    await a.click('Load my review outcomes'); assert.equal(a.requests.length, 1); assert.equal(a.requests[0].options.headers.get('Authorization'), 'Bearer FRESH');
  } finally { credential.resolve({}); await a.cleanup(); }
});

test('late transport and body replies cannot restore an auth-retired private view', async () => {
  const response = deferred(), body = deferred(); let next = 0;
  const a = await mount({ respond: () => ++next === 1 ? response.promise : { status: 200, json: () => body.promise } });
  try {
    await a.click('Load my review outcomes'); const signal = a.requests[0].options.signal; await a.auth('TOKEN_REFRESHED'); assert.equal(signal.aborted, true);
    await a.act(async () => response.resolve(Response.json(result('Retired network result')))); assert.doesNotMatch(a.text(), /Retired network result/);
    await a.click('Load my review outcomes'); await a.event('storage');
    await a.act(async () => body.resolve(result('Retired body result'))); assert.doesNotMatch(a.text(), /Retired body result/);
  } finally { response.resolve(Response.json(result())); body.resolve(result()); await a.cleanup(); }
});

test('immediate hook fence blocks duplicate writes and permits a fresh read from a result callback', async () => {
  const mutation = deferred(), reading = deferred(), results = [], failures = [];
  const a = await mount({ harness: true, respond: (_url, init) => init.method === 'POST' ? mutation.promise : reading.promise });
  try {
    await a.act(async () => {
      void a.controls().perform('/offline/decide', { method: 'POST', body: '{}' }, reply => {
        results.push(reply.status);
        void a.controls().perform('/offline/fresh-detail', { method: 'GET' }, value => results.push(value.status), sent => failures.push(sent));
      }, sent => failures.push(sent));
      void a.controls().perform('/offline/duplicate', { method: 'POST', body: '{}' }, () => results.push('duplicate'), sent => failures.push(sent));
    });
    assert.equal(a.requests.length, 1); assert.equal(a.credentialCalls[0], true);
    await a.act(async () => mutation.resolve(Response.json({ receipt: true })));
    assert.equal(a.requests.length, 2); assert.equal(a.requests[1].url, '/offline/fresh-detail'); assert.equal(a.controls().busy, true);
    await a.act(async () => { void a.controls().perform('/offline/third', {}, () => {}, () => {}); }); assert.equal(a.requests.length, 2);
    await a.act(async () => reading.resolve(Response.json({ detail: true })));
    assert.deepEqual(results, [200, 200]); assert.deepEqual(failures, []); assert.equal(a.controls().busy, false);
  } finally { mutation.resolve(Response.json({})); reading.resolve(Response.json({})); await a.cleanup(); }
});

test('credential and network deadlines settle independently of abort support without automatically repeating writes', async () => {
  for (const waitForCredentials of [true, false]) {
    const waiting = deferred(), failures = [], replies = [];
    const a = await mount({ harness: true, credentials: () => waitForCredentials ? waiting.promise : Promise.resolve({}), respond: () => waiting.promise });
    try {
      await a.act(async () => { void a.controls().perform('/offline/decide', { method: 'POST', body: '{}' }, value => replies.push(value), sent => failures.push(sent)); });
      await a.timeout(); assert.deepEqual(failures, [!waitForCredentials]); assert.equal(a.controls().busy, false);
      assert.equal(a.requests.length, waitForCredentials ? 0 : 1);
      if (!waitForCredentials) assert.equal(a.requests[0].options.signal.aborted, true);
      await a.act(async () => waiting.resolve(waitForCredentials ? {} : Response.json({ receipt: 'late' })));
      assert.deepEqual(replies, []); assert.deepEqual(failures, [!waitForCredentials]); assert.equal(a.requests.length, waitForCredentials ? 0 : 1);
    } finally { waiting.resolve({}); await a.cleanup(); }
  }
});

test('retirement clears reviewer drafts and unmount suppresses replies and removes owned subscriptions', async () => {
  const pending = deferred(), replies = [], failures = [];
  const a = await mount({ harness: true, strict: true, respond: () => pending.promise });
  await a.act(async () => { void a.controls().perform('/offline/read', {}, value => replies.push(value), sent => failures.push(sent)); });
  await a.event('blur'); assert.doesNotMatch(a.text(), /Private reviewer draft/); assert.equal(a.retireCount(), 1);
  await a.event('focus');
  await a.act(async () => { void a.controls().perform('/offline/read-again', {}, value => replies.push(value), sent => failures.push(sent)); });
  const signal = a.requests.at(-1).options.signal; await a.cleanup(); assert.equal(signal.aborted, true); assert.equal(a.authListeners.size, 0);
  pending.resolve(Response.json(result())); await Promise.resolve(); await Promise.resolve(); assert.deepEqual(replies, []); assert.deepEqual(failures, []);
});

test('an unavailable identity observer fails closed, and the host page never issues writes', async () => {
  const a = await mount({ subscribeError: true });
  try {
    assert.equal(a.button('Load my review outcomes').disabled, true); await a.event('focus'); await a.click('Load my review outcomes'); assert.equal(a.requests.length, 0);
    const source = fs.readFileSync('../../app/circles/review/HostReviews.tsx', 'utf8');
    assert.doesNotMatch(source, /method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)['"]|dangerouslySetInnerHTML|localStorage|sessionStorage|sendBeacon/);
    a.app.setMock('@/components/PublicNav', () => ({ __esModule: true, default: () => null }));
    a.app.setMock('@/components/PublicFooter', () => ({ __esModule: true, default: () => null }));
    const page = a.app.load('app/circles/review/page.tsx'); assert.equal(page.metadata.robots.index, false); assert.equal(page.metadata.robots.follow, false);
    const React = require('react');
    const html = require('react-dom/server').renderToStaticMarkup(React.createElement(page.default));
    assert.match(html, /<main id="main"/); assert.match(html, /Load review outcomes for the circles you host/);
    assert.doesNotMatch(html, /Tuesday Readers|Meet in a public venue/); assert.equal(a.requests.length, 0);
  } finally { await a.cleanup(); }
});
