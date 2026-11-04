import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { offlineApp } from './support/offline-app.mjs';
const require = createRequire(path.resolve('../../package.json'));
const { JSDOM } = createRequire(path.resolve('tooling/package.json'))('jsdom');
const circleId = '11111111-1111-4111-8111-111111111111', messageId = '22222222-2222-4222-8222-222222222222';
const reportId = '33333333-3333-4333-8333-333333333333', decisionId = '44444444-4444-4444-8444-444444444444';
const stamp = '2026-11-03T12:00:00Z', hash = 'a'.repeat(64), text = 'A checked message with a safety concern.';
const original = { id: messageId, member_name: 'Reader', content: text, created_at: stamp, is_mine: false };
const safety = (mine = false, visibility = 'visible', revision = 2) => ({ circleId, message: { ...original, is_mine: mine, content: visibility === 'visible' ? text : null, visibility }, revision, contentHash: mine || visibility === 'visible' ? hash : null, canReport: !mine && visibility === 'visible', canWithdraw: mine && visibility !== 'withdrawn', explanations: [] });
const detail = (visibility = 'visible', revision = 2) => ({ circle: { id: circleId, title: 'Private reading circle' }, message: { ...original, visibility }, revision, contentHash: hash, reports: [{ id: reportId, reason: 'safety', note: 'Private exact safety allegation.', created_at: stamp }], decisions: [], complete: true });
const queue = { items: [{ circleId, messageId, circleTitle: 'Private reading circle', visibility: 'visible', openReports: 1, revision: 2 }], nextCursor: null };
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }

async function mount({ view = 'actions', respond = () => Response.json(safety()), credentials = async () => ({}), props = {}, strict = true } = {}) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://offline.invalid/circles/contributions', pretendToBeVisual: true });
  const previous = {};
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous[key] = Object.getOwnPropertyDescriptor(globalThis, key); Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  }
  const React = require('react'), { createRoot } = require('react-dom/client'), { act } = React;
  const app = offlineApp(), requests = [], listeners = new Set(), deadlines = [];
  app.context.window = dom.window; app.context.document = dom.window.document;
  app.context.setTimeout = (fn, ms) => { if (ms === 15000) { const handle = { fn, cleared: false }; deadlines.push(handle); return handle; } return setTimeout(fn, ms); };
  app.context.clearTimeout = handle => handle && 'cleared' in Object(handle) ? handle.cleared = true : clearTimeout(handle);
  app.context.fetch = (url, options) => { requests.push({ url, options }); return Promise.resolve(respond(url, options)); };
  app.setMock('./client', () => ({ circleHeaders: credentials }));
  app.setMock('@/lib/circles/client', () => ({ circleHeaders: credentials }));
  app.setMock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { onAuthStateChange(listener) { listeners.add(listener); return { data: { subscription: { unsubscribe() { listeners.delete(listener); } } } }; } } }) }));
  app.setMock('next/link', () => ({ __esModule: true, default: ({ children, ...p }) => React.createElement('a', p, children) }));
  for (const specifier of ['./safety.module.css', '../messages/safety.module.css', '@/app/circles/messages/safety.module.css', '../circles/passages/passage.module.css']) app.setMock(specifier, () => ({ __esModule: true, default: new Proxy({}, { get: (_t, key) => String(key) }) }));
  const View = app.load(view === 'actions' ? 'app/circles/messages/MessageActions.tsx' : view === 'contributions' ? 'app/circles/contributions/Contributions.tsx' : 'app/moderation/messages/MessageReviews.tsx').default;
  const root = createRoot(document.getElementById('root'));
  const render = async (nextProps = props) => act(async () => root.render(React.createElement(strict ? React.StrictMode : React.Fragment, null, React.createElement(View, view === 'actions' ? { circleId, message: original, ...nextProps } : nextProps))));
  await render();
  const button = name => [...document.querySelectorAll('button')].find(el => el.textContent === name);
  const click = async name => { assert.ok(button(name), name); await act(async () => button(name).click()); };
  const edit = async (label, value) => { const el = [...document.querySelectorAll('label')].find(el => el.textContent === label); assert.ok(el, label); const control = document.getElementById(el.htmlFor); await act(async () => { Object.getOwnPropertyDescriptor(control.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLTextAreaElement.prototype, 'value').set.call(control, value); control.dispatchEvent(new dom.window.Event(control.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }); };
  const confirm = async () => act(async () => document.querySelector('input[type="checkbox"]').click());
  const event = async (name, target = dom.window) => act(async () => target.dispatchEvent(new dom.window.Event(name)));
  const auth = async name => act(async () => { for (const listener of [...listeners]) listener(name); });
  const cleanup = async () => { await act(async () => root.unmount()); dom.window.close(); for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } };
  return { app, act, dom, requests, listeners, deadlines, render, button, click, edit, confirm, event, auth, cleanup, text: () => document.body.textContent };
}

test('message controls read fresh access explicitly, project private fields away, and escape text', async () => {
  const payload = safety(); payload.message.content = '<img src=x onerror=bad()> check this'; payload.reporter = 'PRIVATE_REPORTER'; payload.reports = ['PRIVATE_REPORT'];
  const a = await mount({ respond: () => Response.json(payload) });
  try {
    assert.equal(a.requests.length, 0); assert.equal(a.listeners.size, 1); assert.equal(a.button('Send private report'), undefined);
    await a.click('Check message actions');
    assert.equal(document.activeElement.textContent, 'Current message actions');
    assert.equal(a.requests[0].options.method, 'GET'); assert.equal(a.requests[0].options.cache, 'no-store'); assert.equal(a.requests[0].options.redirect, 'error');
    assert.match(a.text(), /<img src=x onerror=bad\(\)>/); assert.equal(document.querySelector('img'), null); assert.doesNotMatch(a.text(), /PRIVATE_REPORT/);
    assert.equal(a.button('Send private report').disabled, true);
  } finally { await a.cleanup(); }
});

test('fresh hidden snapshot redacts a stale conversation body and never offers report controls', async () => {
  const a = await mount({ respond: () => Response.json(safety(false, 'hidden', 3)) });
  try {
    assert.match(a.text(), /A checked message/); await a.click('Check message actions');
    assert.doesNotMatch(a.text(), /A checked message/); assert.match(a.text(), /Message hidden from member views/); assert.equal(a.button('Send private report'), undefined);
    await a.click('Close message actions'); assert.doesNotMatch(a.text(), /A checked message/);
    await a.render(); assert.doesNotMatch(a.text(), /A checked message/);
  } finally { await a.cleanup(); }
});

test('a newer portable tombstone replaces a previously checked visible body', async () => {
  const a = await mount();
  try {
    await a.click('Check message actions'); assert.match(a.text(), /A checked message/);
    await a.render({ message: { ...original, content: '[Post hidden after human review.]' } });
    assert.doesNotMatch(a.text(), /A checked message|Current message loaded/); assert.match(a.text(), /Post hidden after human review/);
  } finally { await a.cleanup(); }
});

test('withdrawal requires a fresh snapshot and confirmation; a bound receipt keeps the body removed', async () => {
  const a = await mount({ props: { message: { ...original, is_mine: true } }, respond: (_url, options) => {
    if (options.method !== 'POST') return Response.json(safety(true));
    const sent = JSON.parse(options.body); return Response.json({ requestId: sent.requestId, circleId, messageId, state: safety(true, 'withdrawn', 3), withdrawn: true, replayed: false });
  } });
  try {
    await a.click('Check message actions'); assert.match(a.text(), /not physical erasure/); assert.equal(a.button('Withdraw my message').disabled, true);
    await a.confirm(); await a.act(async () => { a.button('Withdraw my message').click(); a.button('Withdraw my message').click(); });
    const posts = a.requests.filter(r => r.options.method === 'POST'); assert.equal(posts.length, 1);
    const payload = JSON.parse(posts[0].options.body); assert.equal(payload.expectedRevision, 2); assert.equal(payload.contentHash, hash); assert.match(payload.requestId, /^[0-9a-f-]{36}$/);
    assert.match(a.text(), /Withdrawal confirmed/); assert.doesNotMatch(a.text(), /A checked message/); assert.match(a.text(), /Message withdrawn by its author/);
  } finally { await a.cleanup(); }
});

test('unconfirmed report reply supports manual exact retry and never silently resends', async () => {
  let posts = 0;
  const a = await mount({ respond: (_url, options) => { if (options.method !== 'POST') return Response.json(safety()); posts++; const sent = JSON.parse(options.body); return posts === 1 ? Response.json({ received: true }) : Response.json({ requestId: sent.requestId, circleId, messageId, state: safety(), received: true, replayed: true }); } });
  try {
    await a.click('Check message actions'); await a.edit('Report reason', 'safety'); await a.edit('Private report details (optional)', 'Private report details'); await a.confirm(); await a.click('Send private report');
    assert.equal(posts, 1); assert.match(a.text(), /could not be confirmed/); assert.doesNotMatch(a.text(), /Private report detailsPrivate report details/);
    await a.event('focus'); assert.equal(posts, 1); await a.click('Retry exact report'); assert.equal(posts, 2);
    const requests = a.requests.filter(r => r.options.method === 'POST'); assert.equal(requests[0].options.body, requests[1].options.body); assert.match(a.text(), /Report received/);
  } finally { await a.cleanup(); }
});

test('receipt for another request is never claimed as a confirmed withdrawal', async () => {
  const a = await mount({ respond: (_url, options) => options.method === 'POST' ? Response.json({ requestId: reportId, circleId, messageId, state: safety(true, 'withdrawn', 3), withdrawn: true, replayed: false }) : Response.json(safety(true)) });
  try { await a.click('Check message actions'); await a.confirm(); await a.click('Withdraw my message'); assert.doesNotMatch(a.text(), /Withdrawal confirmed/); assert.match(a.text(), /could not be confirmed/); }
  finally { await a.cleanup(); }
});

test('auth and inactivity erase private draft, uncertain retry, and suppress late replies', async () => {
  for (const retire of [a => a.event('blur'), a => a.auth('SIGNED_OUT'), a => a.event('storage')]) {
    const pending = deferred();
    const a = await mount({ respond: (_url, options) => options.method === 'POST' ? pending.promise : Response.json(safety()) });
    try {
      await a.click('Check message actions'); await a.edit('Report reason', 'safety'); await a.edit('Private report details (optional)', 'PRIVATE_DRAFT'); await a.confirm(); await a.click('Send private report');
      const sent = JSON.parse(a.requests.at(-1).options.body); await retire(a); assert.equal(a.requests.at(-1).options.signal.aborted, true);
      await a.act(async () => pending.resolve(Response.json({ requestId: sent.requestId, circleId, messageId, received: true, replayed: false, state: safety() })));
      assert.doesNotMatch(a.text(), /PRIVATE_DRAFT|Report received|A checked message/); assert.equal(a.button('Retry exact report'), undefined);
      const count = a.requests.length; await a.event('focus'); assert.equal(a.requests.length, count);
    } finally { pending.resolve(Response.json({})); await a.cleanup(); }
  }
});

test('credential and keyed message lifetime fences prevent stale requests and details', async () => {
  const credentials = deferred();
  const a = await mount({ credentials: () => credentials.promise });
  try { await a.click('Check message actions'); await a.event('blur'); await a.act(async () => credentials.resolve({})); assert.equal(a.requests.length, 0); }
  finally { credentials.resolve({}); await a.cleanup(); }
  const delayed = deferred(); const b = await mount({ respond: () => delayed.promise });
  try {
    await b.click('Check message actions'); const signal = b.requests[0].options.signal;
    await b.render({ message: { ...original, id: reportId, content: 'Another message' } }); assert.equal(signal.aborted, true);
    await b.act(async () => delayed.resolve(Response.json(safety()))); assert.doesNotMatch(b.text(), /A checked message|Current message loaded/); assert.match(b.text(), /Another message/);
  } finally { delayed.resolve(Response.json({})); await b.cleanup(); }
});

test('own contributions explicitly load and paginate by replacement, and 403 clears all content', async () => {
  let deny = false;
  const a = await mount({ view: 'contributions', respond: url => deny ? Response.json({ error: 'PRIVATE_SERVER_ERROR' }, { status: 403 }) : Response.json(url.includes('?after=') ? { items: [], nextCursor: null } : { items: [safety(true)], nextCursor: messageId }) });
  try {
    assert.equal(a.requests.length, 0); await a.click('Load my posted messages'); assert.match(a.text(), /A checked message/);
    await a.click('Next page of my messages'); assert.doesNotMatch(a.text(), /A checked message/); assert.match(a.text(), /No posted messages were returned/);
    await a.click('Load my posted messages'); deny = true; await a.click('Load my posted messages'); assert.doesNotMatch(a.text(), /A checked message|PRIVATE_SERVER_ERROR/); assert.match(a.text(), /not available for this account/);
  } finally { await a.cleanup(); }
});

test('nested message denial clears the entire cached contribution page', async () => {
  const second = safety(true); second.message = { ...second.message, id: reportId, content: 'Another private contribution' };
  const a = await mount({ view: 'contributions', respond: url => url === '/api/circles/contributions' ? Response.json({ items: [safety(true), second], nextCursor: null }) : Response.json({ error: 'PRIVATE_SERVER_DETAIL' }, { status: 401 }) });
  try {
    await a.click('Load my posted messages'); assert.match(a.text(), /Another private contribution/); await a.click('Check message actions');
    assert.doesNotMatch(a.text(), /A checked message|Another private contribution|PRIVATE_SERVER_DETAIL/); assert.match(a.text(), /Sign in to load your posted messages/);
  } finally { await a.cleanup(); }
});

test('reviewer uses exact fresh evidence, bound receipt, and fresh read after hide decision', async () => {
  let current = detail();
  const a = await mount({ view: 'review', respond: (url, options) => {
    if (url === '/api/admin/circles/messages') return Response.json(queue);
    if (options.method !== 'POST') return Response.json(current);
    const sent = JSON.parse(options.body); current = detail('hidden', 3);
    return Response.json({ requestId: sent.requestId, circleId, messageId, decision: { id: decisionId, action: sent.action, reason: sent.reason, summary: sent.summary, created_at: stamp, report_count: 1 }, safety: { revision: 3, visibility: 'hidden' }, replayed: false });
  } });
  try {
    assert.equal(a.requests.length, 0); await a.click('Load assigned message reviews'); await a.click('Review message in Private reading circle');
    assert.equal(document.activeElement.textContent, 'Private reading circle');
    await a.edit('Moderator restriction', 'hide'); await a.edit('Reason based on conduct', 'safety'); await a.edit('Exact evidence excerpt', 'A checked message'); await a.edit('Author-facing explanation', 'Please remove the unsafe conduct before reposting.'); await a.confirm(); await a.click('Save message decision');
    const posts = a.requests.filter(r => r.options.method === 'POST'); assert.equal(posts.length, 1); const sent = JSON.parse(posts[0].options.body);
    assert.equal(sent.contentHash, hash); assert.equal(sent.expectedRevision, 2); assert.equal(sent.evidenceExcerpt, 'A checked message');
    assert.equal(a.requests.at(-1).options.method, 'GET'); assert.match(a.text(), /Decision confirmed/); assert.match(a.text(), /hidden from member views/); assert.equal(document.querySelector('textarea').value, '');
  } finally { await a.cleanup(); }
});

test('restore of an author-withdrawn message stays withdrawn and never claims it is visible', async () => {
  let revised = false;
  const a = await mount({ view: 'review', respond: (url, options) => {
    if (url === '/api/admin/circles/messages') return Response.json({ ...queue, items: [{ ...queue.items[0], visibility: 'withdrawn' }] });
    if (options.method !== 'POST') return Response.json(detail('withdrawn', revised ? 3 : 2));
    const sent = JSON.parse(options.body); revised = true; return Response.json({ requestId: sent.requestId, circleId, messageId, decision: { id: decisionId, action: 'restore', reason: 'resolved', summary: sent.summary, created_at: stamp, report_count: 1 }, safety: { revision: 3, visibility: 'withdrawn' }, replayed: false });
  } });
  try {
    await a.click('Load assigned message reviews'); await a.click('Review message in Private reading circle'); await a.edit('Moderator restriction', 'restore'); await a.edit('Reason based on conduct', 'resolved'); await a.edit('Author-facing explanation', 'Moderator restriction lifted; author withdrawal remains.'); await a.confirm(); await a.click('Save message decision');
    assert.match(a.text(), /Decision confirmed/); assert.match(a.text(), /author withdrew this message/); assert.doesNotMatch(a.text(), /This message is visible/);
  } finally { await a.cleanup(); }
});

test('manual retry confirms a historical hide receipt after another reviewer restored the post', async () => {
  let posts = 0;
  const a = await mount({ view: 'review', respond: (url, options) => {
    if (url === '/api/admin/circles/messages') return Response.json(queue);
    if (options.method !== 'POST') return Response.json(detail('visible', posts > 1 ? 4 : 2));
    posts++; if (posts === 1) throw new Error('Lost saved receipt');
    const sent = JSON.parse(options.body); return Response.json({ requestId: sent.requestId, circleId, messageId, decision: { id: decisionId, action: 'hide', reason: 'safety', summary: sent.summary, created_at: stamp, report_count: 1 }, safety: { revision: 4, visibility: 'visible' }, replayed: true });
  } });
  try {
    await a.click('Load assigned message reviews'); await a.click('Review message in Private reading circle');
    await a.edit('Moderator restriction', 'hide'); await a.edit('Reason based on conduct', 'safety'); await a.edit('Exact evidence excerpt', 'A checked message'); await a.edit('Author-facing explanation', 'Please remove the unsafe conduct before reposting.'); await a.confirm(); await a.click('Save message decision');
    assert.match(a.text(), /reply was lost/); assert.equal(posts, 1); await a.click('Retry exact decision');
    const sent = a.requests.filter(request => request.options.method === 'POST'); assert.equal(sent[0].options.body, sent[1].options.body);
    assert.match(a.text(), /Decision confirmed/); assert.match(a.text(), /This message is visible/); assert.equal(a.button('Retry exact decision'), undefined);
  } finally { await a.cleanup(); }
});

test('the fifteen second request deadline includes credentials and reply body, preserving manual recovery', async () => {
  for (const phase of ['credentials', 'body']) {
    const pending = deferred();
    const a = await mount({ credentials: () => phase === 'credentials' ? pending.promise : Promise.resolve({}), respond: () => ({ status: 200, json: () => pending.promise }) });
    try {
      await a.click('Check message actions'); const deadline = a.deadlines.findLast(item => !item.cleared); assert.ok(deadline); await a.act(async () => deadline.fn());
      assert.match(a.text(), /could not be loaded/); assert.equal(a.button('Check message actions').disabled, false);
      assert.equal(a.requests.length, phase === 'credentials' ? 0 : 1);
      await a.act(async () => pending.resolve(phase === 'credentials' ? {} : safety())); assert.doesNotMatch(a.text(), /Current message loaded/);
    } finally { pending.resolve({}); await a.cleanup(); }
  }
});

test('reviewer incomplete cases and private failure never become an empty queue or saved decision', async () => {
  let fail = false;
  const a = await mount({ view: 'review', respond: url => fail ? Response.json({ error: 'PRIVATE_DETAIL' }, { status: 403 }) : Response.json(url === '/api/admin/circles/messages' ? queue : { ...detail(), complete: false }) });
  try {
    await a.click('Load assigned message reviews'); await a.click('Review message in Private reading circle'); assert.equal(document.querySelector('fieldset').disabled, true); assert.match(a.text(), /full case is not available/);
    fail = true; await a.click('Load assigned message reviews'); assert.doesNotMatch(a.text(), /Private reading circle|Private exact safety allegation|PRIVATE_DETAIL|No assigned message reviews/); assert.match(a.text(), /No eligible assignment/);
  } finally { await a.cleanup(); }
});

test('reviewer retirement clears evidence and draft, and new pages contain no private SSR data or member provisioning', async () => {
  const a = await mount({ view: 'review', respond: url => Response.json(url === '/api/admin/circles/messages' ? queue : detail()) });
  try {
    await a.click('Load assigned message reviews'); await a.click('Review message in Private reading circle'); await a.edit('Author-facing explanation', 'PRIVATE_AUTHOR_EXPLANATION'); await a.event('pagehide');
    assert.doesNotMatch(a.text(), /Private reading circle|Private exact safety allegation|PRIVATE_AUTHOR_EXPLANATION|A checked message/);
    const count = a.requests.length; await a.event('focus'); assert.equal(a.requests.length, count);
    for (const filename of ['app/circles/contributions/page.tsx', 'app/moderation/messages/page.tsx', 'app/circles/messages/CircleSafetyNav.tsx']) {
      const source = fs.readFileSync(path.join('../..', filename), 'utf8'); assert.doesNotMatch(source, /PublicNav|getMemberSession|ensure-member|dangerouslySetInnerHTML/);
    }
    for (const filename of ['app/circles/contributions/page.tsx', 'app/moderation/messages/page.tsx']) {
      const page = a.app.load(filename); assert.equal(page.metadata.robots.index, false); const markup = require('react-dom/server').renderToStaticMarkup(require('react').createElement(page.default)); assert.match(markup, /<main id="main"/); assert.doesNotMatch(markup, /Private reading circle|Private exact safety allegation/);
    }
  } finally { await a.cleanup(); }
});
