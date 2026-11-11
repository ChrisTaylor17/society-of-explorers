import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { offlineApp } from './support/offline-app.mjs';

const require = createRequire(path.resolve('../../package.json'));
const { JSDOM } = createRequire(path.resolve('tooling/package.json'))('jsdom');
const MEMBER = '11111111-1111-4111-8111-111111111111', OTHER = '22222222-2222-4222-8222-222222222222';
const REQUEST = '33333333-3333-4333-8333-333333333333', CIRCLE = '44444444-4444-4444-8444-444444444444';
const reference = (memberId = MEMBER, requestId = REQUEST) => ({ version: 1, memberId, requestId });
const key = member => `soe.circle-creation.v1:${member}`;
const draft = { title: 'PRIVATE_DRAFT_TITLE', description: 'PRIVATE_DRAFT_DESCRIPTION', format: 'online', city: null, region: null,
  venueName: null, venueType: 'online', weekday: 2, time: '19:00', timezone: 'UTC', startDate: '2026-11-20', maxMembers: 8,
  onlineUrl: 'https://meeting.invalid/PRIVATE_MEETING_URL' };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const successfulPost = body => ({ memberId: body.expectedMemberId, requestId: body.requestId, circleId: CIRCLE, replayed: false,
  receipt: { action: 'create', joined: true, completed: false, date: null, status: null },
  state: { revision: 1, isMember: true, isHost: true, hidden: false, completed: false, ended: false,
    canJoin: false, canLeave: true, canRsvp: true, canComplete: true, canReadConversation: true } });

// Actual hook/form/strict parsers in React DOM. Only identity, delivery, clocks
// and optional child reading editor are synthetic; no browser/provider request.
async function mount({ respond, stored, storage, views = 1, form = false, strict = true } = {}) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://offline.invalid/circles/start', pretendToBeVisual: true });
  if (stored) for (const [name, value] of Object.entries(stored)) dom.window.sessionStorage.setItem(name, value);
  if (storage) Object.defineProperty(dom.window, 'sessionStorage', { get: () => storage, configurable: true });
  const previous = {};
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous[name] = Object.getOwnPropertyDescriptor(globalThis, name); Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
  }
  const React = require('react'), { act } = React, { createRoot } = require('react-dom/client'), app = offlineApp();
  const requests = [], listeners = new Set(), deadlines = [], controls = [];
  let member = MEMBER, canCreate = true, recorded = null, generation = 0;
  Object.assign(app.context, { window: dom.window, document: dom.window.document, navigator: dom.window.navigator });
  app.context.setTimeout = (fn, ms) => { if (ms !== 15000) return setTimeout(fn, ms); const entry = { fn, cleared: false }; deadlines.push(entry); return entry; };
  app.context.clearTimeout = timer => { if (timer && typeof timer === 'object' && 'cleared' in timer) timer.cleared = true; else clearTimeout(timer); };
  app.context.fetch = async (url, options = {}) => {
    const call = { url, options }; requests.push(call);
    const custom = respond ? await respond(call, { member, recorded }) : undefined;
    if (custom !== undefined) return custom;
    if (url === '/api/auth/member') return member ? Response.json({ member: { id: member }, auth: { provider: 'supabase', subject: member } }) : Response.json({ error: 'Sign in' }, { status: 401 });
    if (url === '/api/circles/start') return Response.json({ memberId: member, canCreate, activeHosted: canCreate ? 0 : 3, maxActiveHosted: 3 });
    if (url.startsWith('/api/circles/start/receipt?')) return Response.json({ memberId: member, requestId: new URL(url, 'https://offline.invalid').searchParams.get('requestId'), circleId: recorded });
    if (url === '/api/circles' && options.method === 'POST') return Response.json({ error: 'Synthetic lost reply' }, { status: 503 });
    return Response.json({ error: 'Synthetic unavailable detail' }, { status: 503 });
  };
  app.setMock('@/lib/circles/client', () => ({ circleHeaders: async () => ({ Authorization: 'Bearer SYNTHETIC_ONLY' }) }));
  app.setMock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { onAuthStateChange(listener) {
    listeners.add(listener); return { data: { subscription: { unsubscribe() { listeners.delete(listener); } } } };
  } } }) }));
  app.setMock('next/link', () => ({ __esModule: true, default: props => React.createElement('a', props) }));
  app.setMock('../participation.module.css', () => ({ __esModule: true, default: {} }));
  app.setMock('../ReadingProgramEditor', () => ({ __esModule: true, default: () => null, emptyReadingProgramDraft: () => ({ custom: false, metadata: null, program: null }) }));
  app.setMock('../ReadingProgramSummary', () => ({ __esModule: true, default: () => null }));
  const hook = app.load('lib/circles/useCircleHosting.ts').useCircleHosting;
  const Form = form ? app.load('app/circles/start/StartCircleForm.tsx').default : null;
  function Harness({ index }) {
    const [privateDraft, setPrivateDraft] = React.useState('PRIVATE_DRAFT');
    const clear = React.useCallback(() => setPrivateDraft(''), [setPrivateDraft]);
    const current = hook(clear);
    React.useLayoutEffect(() => { controls[index] = current; });
    return React.createElement('div', null, privateDraft, React.createElement('span', { role: 'status' }, current.notice));
  }
  const root = createRoot(document.getElementById('root'));
  const render = async () => { await act(async () => root.render(React.createElement(strict ? React.StrictMode : React.Fragment, null,
    form ? React.createElement(Form, { key: generation }) : Array.from({ length: views }, (_, index) => React.createElement(Harness, { index, key: `${generation}:${index}` }))))); };
  await render();
  const call = async (name, ...args) => { await act(async () => controls[0][name](...args)); };
  const event = async name => { await act(async () => dom.window.dispatchEvent(new dom.window.Event(name))); };
  return { app, dom, act, requests, controls: (index = 0) => controls[index], call, event,
    posts: () => requests.filter(r => r.options.method === 'POST'),
    readbacks: () => requests.filter(r => r.url.startsWith('/api/circles/start/receipt?')),
    record: id => { recorded = id; }, quota: allowed => { canCreate = allowed; },
    setMember: id => { member = id; },
    async identity(id) { member = id; await act(async () => { for (const listener of [...listeners]) listener('SIGNED_IN'); }); },
    async remount() { generation++; await render(); },
    async timeout() { const timer = deadlines.findLast(x => !x.cleared); assert.ok(timer); await act(async () => timer.fn()); },
    async prepare(index = 0) { await act(async () => controls[index].load()); await act(async () => controls[index].review(draft)); assert.equal(controls[index].phase, 'review'); await act(async () => controls[index].check(true)); },
    async cleanup() { await act(async () => root.unmount()); dom.window.close(); for (const [name, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } },
  };
}

test('a lost creation reply survives a real hook remount as opaque IDs with no automatic read or resend', async () => {
  const f = await mount();
  try {
    assert.equal(f.requests.length, 0); await f.prepare(); await f.call('confirm');
    const sent = JSON.parse(f.posts()[0].options.body), raw = f.dom.window.sessionStorage.getItem(key(MEMBER));
    assert.deepEqual(JSON.parse(raw), reference(MEMBER, sent.requestId)); assert.doesNotMatch(raw, /PRIVATE|https|title|description|reading/);
    const before = f.requests.length; await f.remount(); assert.equal(f.requests.length, before); assert.equal(f.controls().uncertain, false);
    await f.call('load'); assert.equal(f.controls().phase, 'unknown'); assert.equal(f.controls().canRetry, false);
    assert.equal(f.controls().canCheckReceipt, true); await f.call('review', draft); await f.call('confirm'); assert.equal(f.posts().length, 1);
    f.record(CIRCLE); await f.call('checkReceipt'); assert.equal(f.controls().created, CIRCLE); assert.equal(f.posts().length, 1);
    assert.equal(f.dom.window.sessionStorage.getItem(key(MEMBER)), null);
    const call = f.readbacks()[0]; assert.equal(call.options.method ?? 'GET', 'GET'); assert.equal(call.options.cache, 'no-store');
    assert.equal(call.options.redirect, 'error'); assert.equal(call.options.headers.get('x-soe-expected-member'), MEMBER);
  } finally { await f.cleanup(); }
});

test('a delayed original write remains unknown across remount and absence; later read confirms without a second POST', async () => {
  const wait = deferred(); const f = await mount({ respond: call => call.options.method === 'POST' ? wait.promise : undefined });
  try {
    await f.prepare(); await f.call('confirm'); await f.timeout(); await f.remount(); await f.call('load'); await f.call('checkReceipt');
    assert.equal(f.controls().phase, 'unknown'); assert.match(f.controls().notice, /may still complete/); assert.equal(f.controls().canRetry, false);
    await f.call('load'); await f.call('review', draft); assert.equal(f.posts().length, 1);
    f.record(CIRCLE); await f.act(async () => wait.resolve(Response.json(successfulPost(JSON.parse(f.posts()[0].options.body)))));
    assert.equal(f.controls().created, null); await f.call('checkReceipt'); assert.equal(f.controls().created, CIRCLE); assert.equal(f.posts().length, 1);
  } finally { wait.resolve(Response.json({ error: 'Released' }, { status: 503 })); await f.cleanup(); }
});

test('a valid creation receipt with failed detail read recovers after remount without its private body or available quota', async () => {
  const f = await mount({ respond: call => call.options.method === 'POST' ? Response.json(successfulPost(JSON.parse(call.options.body))) : undefined });
  try {
    await f.prepare(); await f.call('confirm'); assert.equal(f.controls().phase, 'unknown');
    await f.remount(); f.quota(false); await f.call('load'); assert.equal(f.controls().canCheckReceipt, true);
    f.record(CIRCLE); const before = f.requests.length; await f.call('checkReceipt');
    assert.equal(f.controls().created, CIRCLE); assert.equal(f.posts().length, 1);
    assert.equal(f.requests.slice(before).some(r => r.url === '/api/circles/start'), false);
  } finally { await f.cleanup(); }
});

test('Close and identity retirement hide private state but preserve each account reference for a later verified return', async () => {
  const f = await mount();
  try {
    await f.prepare(); await f.call('confirm'); const raw = f.dom.window.sessionStorage.getItem(key(MEMBER));
    await f.call('close'); assert.equal(f.controls().uncertain, false); assert.equal(f.dom.window.sessionStorage.getItem(key(MEMBER)), raw);
    await f.call('load'); assert.equal(f.controls().phase, 'unknown'); assert.equal(f.controls().canRetry, false);
    await f.identity(OTHER); assert.equal(f.controls().uncertain, false); assert.equal(f.controls().created, null);
    await f.call('load'); assert.equal(f.controls().phase, 'editing'); assert.equal(f.controls().canCheckReceipt, false);
    assert.equal(f.dom.window.sessionStorage.getItem(key(MEMBER)), raw); assert.equal(f.readbacks().length, 0);
    await f.identity(MEMBER); await f.call('load'); assert.equal(f.controls().phase, 'unknown');
    f.setMember(null); await f.call('load'); assert.equal(f.controls().uncertain, false); assert.equal(f.controls().canCheckReceipt, false);
  } finally { await f.cleanup(); }
});

test('same-mount exact retries retain one key; a later definite refusal cannot erase an earlier unknown attempt', async () => {
  let refuse = false;
  const f = await mount({ respond: call => call.options.method === 'POST' && refuse ? Response.json({ error: 'Unavailable', outcome: 'not_attempted' }, { status: 503 }) : undefined });
  try {
    await f.prepare(); await f.call('confirm'); const body = f.posts()[0].options.body; refuse = true;
    await f.call('load'); await f.call('retryRequest'); await f.call('check', true); await f.call('confirm');
    assert.equal(f.posts().length, 2); assert.equal(f.posts()[1].options.body, body);
    assert.equal(f.controls().phase, 'unknown'); assert.ok(f.dom.window.sessionStorage.getItem(key(MEMBER)));
  } finally { await f.cleanup(); }
});

test('only explicit first-attempt rejection clears its marker; proxy status and malformed error bodies remain unknown', async () => {
  for (const [status, body, clears] of [[400, { error: 'Invalid', outcome: 'not_attempted' }, true], [503, { error: 'Disabled', outcome: 'not_attempted' }, true],
    [429, { error: 'Gateway' }, false], [403, { error: 'Proxy', outcome: 'unknown' }, false], [503, { error: 'Disabled', outcome: 'not_attempted', unexpected: true }, false]]) {
    const f = await mount({ respond: call => call.options.method === 'POST' ? Response.json(body, { status }) : undefined });
    try {
      await f.prepare(); await f.call('confirm'); assert.equal(f.posts().length, 1);
      assert.equal(f.dom.window.sessionStorage.getItem(key(MEMBER)) === null, clears);
      assert.equal(f.controls().phase, clears ? 'idle' : 'unknown');
    } finally { await f.cleanup(); }
  }
});

test('unavailable storage, malformed references and failed write readback refuse new POSTs', async () => {
  const values = new Map(); let failReadback = false;
  const storage = { getItem: key => { if (failReadback) throw Error('Unavailable'); return values.get(key) ?? null; },
    setItem: (key, value) => { values.set(key, value); failReadback = true; }, removeItem: key => values.delete(key) };
  const f = await mount({ storage });
  try {
    await f.prepare(); await f.call('confirm'); assert.equal(f.posts().length, 0); assert.equal(f.controls().storageBlocked, true);
    assert.equal(values.size, 1); failReadback = false; await f.call('load');
    assert.equal(values.size, 0); assert.equal(f.controls().phase, 'editing'); assert.equal(f.readbacks().length, 0);
  } finally { await f.cleanup(); }
  for (const raw of ['invalid', JSON.stringify({ ...reference(), onlineUrl: 'PRIVATE' }), JSON.stringify(reference(OTHER))]) {
    const f = await mount({ stored: { [key(MEMBER)]: raw } });
    try { await f.call('load'); assert.equal(f.controls().storageBlocked, true); await f.call('review', draft); await f.call('confirm'); assert.equal(f.posts().length, 0); }
    finally { await f.cleanup(); }
  }
});

test('failed marker removal never unlocks new creation; confirmed Circle remains reachable while cleanup retries', async () => {
  const values = new Map([[key(MEMBER), JSON.stringify(reference())]]); let refuse = true;
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => { if (!refuse) values.delete(key); } };
  const f = await mount({ storage });
  try {
    f.record(CIRCLE); await f.call('load'); await f.call('checkReceipt');
    assert.equal(f.controls().created, CIRCLE); assert.equal(f.controls().storageBlocked, true); assert.equal(f.controls().canCheckReceipt, true);
    await f.call('close'); await f.call('load'); assert.equal(f.controls().phase, 'unknown'); assert.equal(f.posts().length, 0);
    refuse = false; await f.call('checkReceipt'); assert.equal(f.controls().created, CIRCLE); assert.equal(f.controls().storageBlocked, false); assert.equal(values.size, 0);
  } finally { await f.cleanup(); }
});

test('a definite first refusal retains its terminal fact across failed cleanup without requiring a receipt read', async () => {
  const values = new Map(); let refuseRemoval = true;
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => { if (!refuseRemoval) values.delete(key); } };
  const f = await mount({ storage, respond: call => call.options.method === 'POST'
    ? Response.json({ error: 'Service disabled', outcome: 'not_attempted' }, { status: 503 }) : undefined });
  try {
    await f.prepare(); await f.call('confirm'); assert.equal(f.controls().storageBlocked, true); assert.equal(values.size, 1);
    refuseRemoval = false; await f.call('load'); assert.equal(values.size, 0); assert.equal(f.controls().phase, 'editing');
    assert.equal(f.posts().length, 1); assert.equal(f.readbacks().length, 0);
  } finally { await f.cleanup(); }
});

test('inaccessible browser storage before any attempt does not claim a saved sent request or render a creation form', async () => {
  const f = await mount({ form: true, storage: { getItem() { throw Error('Browser storage denied'); }, setItem() { throw Error('Denied'); }, removeItem() { throw Error('Denied'); } } });
  try {
    const button = [...document.querySelectorAll('button')].find(el => el.textContent === 'Check hosting access');
    await f.act(async () => button.click()); assert.equal(f.posts().length, 0); assert.equal(document.querySelector('#circle-title'), null);
    assert.doesNotMatch(document.body.textContent, /A sent creation reference is kept/);
    assert.match(document.body.textContent, /browser storage is available/);
  } finally { await f.cleanup(); }
});

test('two mounted forms cannot replace each other’s unresolved marker at confirmation', async () => {
  const f = await mount({ views: 2 });
  try {
    await f.prepare(0); await f.prepare(1); await f.call('confirm');
    const raw = f.dom.window.sessionStorage.getItem(key(MEMBER));
    await f.act(async () => f.controls(1).confirm()); assert.equal(f.posts().length, 1); assert.equal(f.controls(1).phase, 'unknown');
    assert.equal(f.dom.window.sessionStorage.getItem(key(MEMBER)), raw);
  } finally { await f.cleanup(); }
});

test('late receipt responses cannot restore a retired or different-account view', async () => {
  const wait = deferred(); const f = await mount({ stored: { [key(MEMBER)]: JSON.stringify(reference()) },
    respond: call => call.url.startsWith('/api/circles/start/receipt?') ? wait.promise : undefined });
  try {
    await f.call('load'); await f.call('checkReceipt'); await f.identity(OTHER);
    await f.act(async () => wait.resolve(Response.json({ memberId: MEMBER, requestId: REQUEST, circleId: CIRCLE })));
    assert.equal(f.controls().created, null); assert.equal(f.controls().uncertain, false); assert.ok(f.dom.window.sessionStorage.getItem(key(MEMBER)));
  } finally { wait.resolve(Response.json({})); await f.cleanup(); }
});

test('wrong-owner/request, private extras and malformed recovery results preserve the marker', async () => {
  for (const result of [{ memberId: OTHER, requestId: REQUEST, circleId: CIRCLE }, { memberId: MEMBER, requestId: CIRCLE, circleId: CIRCLE },
    { memberId: MEMBER, requestId: REQUEST, circleId: CIRCLE, private: 'PRIVATE' }, { memberId: MEMBER, requestId: REQUEST }, null]) {
    const f = await mount({ stored: { [key(MEMBER)]: JSON.stringify(reference()) }, respond: call => call.url.startsWith('/api/circles/start/receipt?') ? Response.json(result) : undefined });
    try { await f.call('load'); await f.call('checkReceipt'); assert.equal(f.controls().phase, 'unknown'); assert.equal(f.controls().created, null); assert.ok(f.dom.window.sessionStorage.getItem(key(MEMBER))); }
    finally { await f.cleanup(); }
  }
  for (const response of [() => Response.json({ error: 'Unavailable' }, { status: 503 }), () => new Response('<html>Unavailable</html>')]) {
    const f = await mount({ stored: { [key(MEMBER)]: JSON.stringify(reference()) }, respond: call => call.url.startsWith('/api/circles/start/receipt?') ? response() : undefined });
    try { await f.call('load'); await f.call('checkReceipt'); assert.equal(f.controls().phase, 'unknown'); assert.equal(f.controls().created, null); assert.ok(f.dom.window.sessionStorage.getItem(key(MEMBER))); }
    finally { await f.cleanup(); }
  }
});

test('actual StartCircleForm exposes read-only recovery and usable My Circles navigation without a restored retry body', async () => {
  const f = await mount({ form: true, stored: { [key(MEMBER)]: JSON.stringify(reference()) } });
  try {
    const button = label => [...document.querySelectorAll('button')].find(el => el.textContent === label);
    await f.act(async () => button('Check hosting access').click());
    assert.ok(button('Check earlier creation result')); assert.equal(button('Review exact Circle creation retry'), undefined);
    assert.ok(document.querySelector('a[href="/circles/mine"]')); assert.equal(document.querySelector('#circle-title'), null);
    await f.act(async () => button('Check earlier creation result').click()); assert.match(document.body.textContent, /may still complete/);
    assert.equal(f.posts().length, 0); assert.equal(f.readbacks().length, 1);
  } finally { await f.cleanup(); }
});
