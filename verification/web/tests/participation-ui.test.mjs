import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { offlineApp } from './support/offline-app.mjs';
const require = createRequire(path.resolve('../../package.json'));
const { JSDOM } = createRequire(path.resolve('tooling/package.json'))('jsdom');
const circleId = '11111111-1111-4111-8111-111111111111', otherId = '22222222-2222-4222-8222-222222222222';
const fixtureMember = '33333333-3333-4333-8333-333333333333';
const dates = ['2026-11-10', '2026-11-17', '2026-11-24', '2026-12-01'];
function detail({ member = false, host = false, hidden = false, ended = false, revision = 3, signed = true, full = false, id = circleId, title = 'Tuesday reading Circle' } = {}) {
  return { ready: true, revision, ended, circle: { id, title, description: 'Public text with welcoming conversation.', format: 'online', format_label: 'Online', city: null, region: null, venue_name: null, venue_label: 'Online', meeting_label: 'Tuesdays at 7 PM ET', weekday: 2, time: '19:00', timezone: 'America/New_York', start_date: '2026-11-10', first_meeting: '2026-11-10', next_meeting: ended || hidden ? null : dates[0], week: 1, reading: null, reading_program: null, program_length: 12, member_count: full ? 8 : 4, max_members: 8, spots_left: full || ended ? 0 : 4, status: ended ? 'completed' : 'forming', host_name: 'Volunteer host', going_next: ended || hidden ? null : 1, hidden, publicProfileId: null }, viewer: { signed_in: signed, is_member: member, is_host: host }, capabilities: { canJoin: signed && !member && !hidden && !ended && !full, canLeave: member, canRsvp: member && !hidden && !ended, canComplete: host && !ended, canReadConversation: member && !hidden }, meetings: ended || hidden ? [] : dates.map(date => ({ date, going: 1, my_status: null })), online_url: member && !hidden && !ended ? 'https://meet.example.invalid/PRIVATE_MEETING' : null };
}
function receipt(request, action, current, replayed = false) {
  const c = current.circle, v = current.viewer;
  const owner = ['rsvp', 'create', 'complete'].includes(action) ? { memberId: request.expectedMemberId } : {};
  return { ...owner, requestId: request.requestId, circleId: c.id, receipt: { action, joined: action === 'complete' ? v.is_member : action !== 'leave', completed: action === 'complete', date: request.date ?? null, status: request.status ?? null }, state: { revision: current.revision, isMember: v.is_member, isHost: v.is_host, hidden: c.hidden, completed: c.status === 'completed', ended: current.ended, ...current.capabilities }, replayed };
}
const hosting = (canCreate = true) => Response.json({ memberId: fixtureMember, canCreate, activeHosted: canCreate ? 0 : 3, maxActiveHosted: 3 });
function publicListing(url) {
  return Response.json({ id: new URL(url, 'https://offline.invalid').pathname.split('/').at(-1),
    title: 'Public Circle preview', description: null, format_label: 'Online', meeting_label: 'Tuesdays',
    host_name: 'An explorer', next_meeting: null });
}
const throughRoutes = server => (url, options) => server.dispatch(url, options.method,
  options.body ? JSON.parse(options.body) : undefined, Object.fromEntries(options.headers ?? []));
function summary(current) { const { ready, meetings, online_url, ...result } = current; return { ...result, kind: 'circle' }; }
function management({ member = true, host = false, hidden = false, revision = 3, title = 'Legacy Circle', complete = false } = {}) {
  return { kind: 'management', circle: { id: circleId, title, hidden }, revision, viewer: { signed_in: true, is_member: member, is_host: host }, capabilities: { canLeave: member, canComplete: host && !complete } };
}
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
async function mount({ view = 'detail', respond = () => Response.json(detail()), listing = publicListing, credentials = async () => ({}), memberId = fixtureMember, props = {}, strict = true } = {}) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://offline.invalid/circles/contributions', pretendToBeVisual: true });
  const previous = {};
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous[key] = Object.getOwnPropertyDescriptor(globalThis, key); Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  }
  const React = require('react'), { createRoot } = require('react-dom/client'), { act } = React;
  const app = offlineApp(), requests = [], memberRequests = [], publicRequests = [], listeners = new Set(), deadlines = [];
  app.context.window = dom.window; app.context.document = dom.window.document; app.context.navigator = dom.window.navigator;
  app.context.setTimeout = (fn, ms) => { if (ms === 15000) { const handle = { fn, cleared: false }; deadlines.push(handle); return handle; } return setTimeout(fn, ms); };
  app.context.clearTimeout = handle => handle && 'cleared' in Object(handle) ? handle.cleared = true : clearTimeout(handle);
  app.context.fetch = (url, init) => {
    const options = { ...init, method: init?.method ?? 'GET' };
    if (new URL(url, 'https://offline.invalid').searchParams.get('view') === 'listing') {
      publicRequests.push({ url, options });
      return Promise.resolve(listing(url, options));
    }
    if (url === '/api/auth/member') {
      memberRequests.push({ url, options });
      return Promise.resolve(Response.json({ member: { id: memberId }, auth: { provider: 'wallet', subject: memberId } }));
    }
    requests.push({ url, options });
    return Promise.resolve(respond(url, options));
  };
  app.setMock('./client', () => ({ circleHeaders: credentials }));
  app.setMock('@/lib/circles/client', () => ({ circleHeaders: credentials }));
  app.setMock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { onAuthStateChange(listener) { listeners.add(listener); return { data: { subscription: { unsubscribe() { listeners.delete(listener); } } } }; } } }) }));
  app.setMock('next/link', () => ({ __esModule: true, default: ({ children, ...p }) => React.createElement('a', p, children) }));
  for (const specifier of ['./safety.module.css', '../messages/safety.module.css', '@/app/circles/messages/safety.module.css', '../participation.module.css', '../reading-program.module.css', './reading-program.module.css', '../circles/passages/passage.module.css']) app.setMock(specifier, () => ({ __esModule: true, default: new Proxy({}, { get: (_t, key) => String(key) }) }));
  const View = app.load(view === 'detail' ? 'app/circles/[circleId]/CircleDetail.tsx' : view === 'start' ? 'app/circles/start/StartCircleForm.tsx' : 'app/circles/mine/MyCircles.tsx').default;
  const root = createRoot(document.getElementById('root'));
  const render = async (nextProps = props) => act(async () => root.render(React.createElement(strict ? React.StrictMode : React.Fragment, null, React.createElement(View, view === 'detail' ? { circleId, ...nextProps } : nextProps))));
  await render();
  const button = name => [...document.querySelectorAll('button')].find(el => el.textContent === name);
  const click = async name => { assert.ok(button(name), name); await act(async () => button(name).click()); };
  const edit = async (label, value) => { const el = [...document.querySelectorAll('label')].find(el => el.textContent === label); assert.ok(el, label); const control = document.getElementById(el.htmlFor); await act(async () => { Object.getOwnPropertyDescriptor(control.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : control.tagName === 'INPUT' ? dom.window.HTMLInputElement.prototype : dom.window.HTMLTextAreaElement.prototype, 'value').set.call(control, value); control.dispatchEvent(new dom.window.Event(control.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }); };
  const confirm = async () => act(async () => document.querySelector('input[type="checkbox"]').click());
  const event = async (name, target = dom.window) => act(async () => target.dispatchEvent(new dom.window.Event(name)));
  const auth = async name => act(async () => { for (const listener of [...listeners]) listener(name); });
  const cleanup = async () => { await act(async () => root.unmount()); dom.window.close(); for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } };
  return { app, act, dom, requests, memberRequests, publicRequests, listeners, deadlines, render, button, click, edit, confirm, event, auth, cleanup, text: () => document.body.textContent };
}

async function fillCreation(a) {
  await a.edit('Circle name', 'A welcoming reading Circle');
  await a.edit('Venue name', 'Main Street Public Library');
  await a.edit('City', 'Boston');
  await a.edit('First week starts', new Date().toISOString().slice(0, 10));
  await a.confirm();
}

test('Circle detail is an explicit current read with no provisioning or automatic mutation', async () => {
  const a = await mount();
  try {
    assert.equal(a.requests.length + a.memberRequests.length, 0);
    assert.ok(a.publicRequests.length > 0);
    assert.ok(a.publicRequests.every(({ options }) => options.method === 'GET' && options.credentials === 'omit'));
    assert.match(a.text(), /Public Circle preview/);
    await a.click('Load current Circle access');
    assert.equal(a.requests.length, 1); assert.equal(a.memberRequests.length, 1);
    assert.equal(a.memberRequests[0].options.cache, 'no-store');
    assert.equal(a.requests[0].options.headers.get('X-Soe-Expected-Member'), fixtureMember);
    assert.equal(a.requests[0].options.method, 'GET'); assert.equal(a.requests[0].options.cache, 'no-store'); assert.equal(a.requests[0].options.redirect, 'error');
    assert.match(a.text(), /Tuesday reading Circle/); assert.equal(document.querySelector('a[href*=PRIVATE_MEETING]'), null);
    assert.ok(document.querySelector(`a[href="/login?mode=signup&next=${encodeURIComponent('/circles/' + circleId)}"]`));
    assert.equal(a.requests.some(request => request.url.includes('ensure-member')), false);
  } finally { await a.cleanup(); }
});

test('join rechecks fresh state, requires confirmation, binds receipt and then reads current membership', async () => {
  let current = detail();
  const a = await mount({ respond: (url, options) => {
    if (options.method !== 'POST') return Response.json(current);
    assert.equal(url, `/api/circles/${circleId}/join`); const sent = JSON.parse(options.body); current = detail({ member: true, revision: 4 }); return Response.json(receipt(sent, 'join', current));
  } });
  try {
    await a.click('Load current Circle access'); await a.click('Join this Circle'); assert.equal(a.requests.length, 2); assert.equal(a.requests.every(request => request.options.method === 'GET'), true);
    assert.equal(document.activeElement.textContent, 'Review participation change'); assert.equal(a.button('Confirm join').disabled, true);
    await a.confirm(); const confirmation = a.button('Confirm join'); await a.act(async () => { confirmation.click(); confirmation.click(); });
    const posts = a.requests.filter(request => request.options.method === 'POST'); assert.equal(posts.length, 1); const sent = JSON.parse(posts[0].options.body); assert.equal(sent.expectedRevision, 3); assert.match(sent.requestId, /^[0-9a-f-]{36}$/);
    assert.equal(a.requests.at(-1).options.method, 'GET'); assert.match(a.text(), /You are currently a member/); assert.ok(a.button('Open the online meeting')); assert.equal(document.querySelector('a[href*=PRIVATE_MEETING]'), null); assert.match(a.text(), /Request confirmed/);
  } finally { await a.cleanup(); }
});

test('a seat lost during the fresh check prevents stale joining and sends no write', async () => {
  let reads = 0;
  const a = await mount({ respond: () => Response.json(detail({ full: ++reads > 1, revision: reads + 2 })) });
  try {
    await a.click('Load current Circle access'); await a.click('Join this Circle'); assert.match(a.text(), /no longer available/); assert.equal(a.button('Confirm join'), undefined); assert.equal(a.requests.filter(request => request.options.method === 'POST').length, 0);
  } finally { await a.cleanup(); }
});

test('lost join reply retries exactly once manually and historical joined event cannot revive current membership', async () => {
  let posts = 0, current = detail();
  const a = await mount({ respond: (_url, options) => {
    if (options.method !== 'POST') return Response.json(current);
    posts++; const sent = JSON.parse(options.body); if (posts === 1) throw new Error('Lost receipt after commit'); current = detail({ member: false, revision: 5 }); return Response.json(receipt(sent, 'join', current, true));
  } });
  try {
    await a.click('Load current Circle access'); await a.click('Join this Circle'); await a.confirm(); await a.click('Confirm join'); assert.equal(posts, 1); assert.match(a.text(), /reply could not be confirmed/);
    assert.equal(a.button('Retry exact participation request'), undefined);
    await a.event('focus'); await a.click('Load current Circle access'); assert.equal(posts, 1);
    await a.click('Retry exact participation request'); assert.equal(a.button('Confirm exact participation retry').disabled, true);
    await a.confirm(); await a.click('Confirm exact participation retry');
    const sent = a.requests.filter(request => request.options.method === 'POST'); assert.equal(sent[0].options.body, sent[1].options.body);
    assert.match(a.text(), /not currently a member/); assert.equal(a.button('Leave this Circle'), undefined); assert.ok(a.button('Join this Circle'));
  } finally { await a.cleanup(); }
});

test('hidden completed members can leave; leave receipt removes meeting access and never deletes posts', async () => {
  let current = detail({ member: true, hidden: true, ended: true });
  const a = await mount({ respond: (_url, options) => {
    if (options.method !== 'POST') return Response.json(current);
    const sent = JSON.parse(options.body); current = detail({ host: true, hidden: true, ended: true, revision: 4 }); return Response.json(receipt(sent, 'leave', current));
  } });
  try {
    await a.click('Load current Circle access'); assert.ok(a.button('Leave this Circle')); assert.equal(a.button('Join this Circle'), undefined); assert.equal(document.querySelector('a[href*=PRIVATE_MEETING]'), null); assert.equal(a.button('Going'), undefined);
    await a.click('Leave this Circle'); assert.match(a.text(), /posted messages remain/); await a.confirm(); await a.click('Confirm leave'); assert.match(a.text(), /not currently a member/); assert.equal(a.requests.some(request => request.options.method === 'DELETE'), false);
  } finally { await a.cleanup(); }
});

test('a host who left membership can complete without rejoining; completion keeps the wrap-up conversation for members', async () => {
  let current = detail({ host: true });
  const a = await mount({ respond: (_url, options) => {
    if (options.method !== 'POST') return Response.json(current);
    const sent = JSON.parse(options.body); current = detail({ host: true, ended: true, revision: 4 }); return Response.json(receipt(sent, 'complete', current));
  } });
  try {
    await a.click('Load current Circle access'); assert.ok(a.button('Complete this Circle')); await a.click('Complete this Circle'); assert.match(a.text(), /existing members can continue the conversation or leave/); await a.confirm(); await a.click('Confirm Circle completion'); assert.match(a.text(), /host completed this Circle/); assert.equal(a.button('Complete this Circle'), undefined);
  } finally { await a.cleanup(); }
  const b = await mount({ respond: () => Response.json(detail({ member: true, ended: true })) });
  try { await b.click('Load current Circle access'); assert.ok(b.button('Read circle conversation')); assert.equal(b.button('Going'), undefined); }
  finally { await b.cleanup(); }
});

test('RSVP confirms a fresh valid meeting date and refreshes current RSVP state', async () => {
  let current = detail({ member: true });
  const a = await mount({ respond: (_url, options) => {
    if (options.method !== 'POST') return Response.json(current);
    const sent = JSON.parse(options.body); current = detail({ member: true, revision: 4 }); current.meetings[0].my_status = 'going'; return Response.json(receipt(sent, 'rsvp', current));
  } });
  try {
    await a.click('Load current Circle access'); await a.click('Going'); assert.equal(a.button('Confirm RSVP').disabled, true); await a.confirm(); await a.click('Confirm RSVP');
    const request = a.requests.find(request => request.options.method === 'POST'); const sent = JSON.parse(request.options.body); assert.equal(sent.date, dates[0]); assert.equal(sent.status, 'going'); assert.equal(sent.expectedRevision, 3);
    assert.equal(a.button('Going').getAttribute('aria-pressed'), 'true');
  } finally { await a.cleanup(); }
});

test('wrong request receipt and stale conflict never claim a saved participation change', async () => {
  for (const status of [200, 409]) {
    const a = await mount({ respond: (_url, options) => options.method === 'POST' ? Response.json(status === 200 ? receipt({ requestId: otherId }, 'join', detail({ member: true, revision: 4 })) : { error: 'PRIVATE_SERVER_DETAIL' }, { status }) : Response.json(detail()) });
    try { await a.click('Load current Circle access'); await a.click('Join this Circle'); await a.confirm(); await a.click('Confirm join'); assert.doesNotMatch(a.text(), /Request confirmed|PRIVATE_SERVER_DETAIL|You are currently a member/); assert.match(a.text(), status === 409 ? /could not be verified/ : /could not be confirmed/); }
    finally { await a.cleanup(); }
  }
});

test('auth, hidden, blur and storage clear private details and pending retry; focus never repeats a write', async () => {
  for (const retire of [a => a.auth('SIGNED_OUT'), a => a.event('blur'), a => a.event('storage'), async a => { Object.defineProperty(a.dom.window.document, 'visibilityState', { configurable: true, value: 'hidden' }); await a.event('visibilitychange', a.dom.window.document); }]) {
    const pending = deferred();
    const a = await mount({ respond: (_url, options) => options.method === 'POST' ? pending.promise : Response.json(detail({ member: true })) });
    try {
      await a.click('Load current Circle access'); await a.click('Leave this Circle'); await a.confirm(); await a.click('Confirm leave'); const sent = JSON.parse(a.requests.at(-1).options.body); await retire(a);
      assert.equal(a.requests.at(-1).options.signal.aborted, true); await a.act(async () => pending.resolve(Response.json(receipt(sent, 'leave', detail({ revision: 4 })))));
      assert.doesNotMatch(a.text(), /PRIVATE_MEETING|Tuesday reading Circle|Request confirmed/); assert.equal(a.button('Retry exact participation request'), undefined); const count = a.requests.length; await a.event('focus'); assert.equal(a.requests.length, count);
    } finally { pending.resolve(Response.json({})); await a.cleanup(); }
  }
});

test('credentials and keyed Circle lifetime fence prevent stale requests and replies', async () => {
  const credentials = deferred(); const a = await mount({ credentials: () => credentials.promise });
  try { await a.click('Load current Circle access'); await a.event('pagehide'); await a.act(async () => credentials.resolve({})); assert.equal(a.requests.length + a.memberRequests.length, 0); }
  finally { credentials.resolve({}); await a.cleanup(); }
  const delayed = deferred(); const b = await mount({ respond: () => delayed.promise });
  try { await b.click('Load current Circle access'); const signal = b.requests[0].options.signal; await b.render({ circleId: otherId }); assert.equal(signal.aborted, true); await b.act(async () => delayed.resolve(Response.json(detail()))); assert.doesNotMatch(b.text(), /Tuesday reading Circle/); }
  finally { delayed.resolve(Response.json({})); await b.cleanup(); }
});

test('creation requires current eligibility, validated draft, a fresh preview and explicit confirmation', async () => {
  const a = await mount({ view: 'start', respond: (url, options) => {
    if (url === '/api/circles/start') return hosting();
    if (options.method === 'POST') { const sent = JSON.parse(options.body); return Response.json(receipt(sent, 'create', detail({ member: true, host: true, revision: 1 })), { status: 201 }); }
    return Response.json(detail({ member: true, host: true, revision: 1 }));
  } });
  try {
    assert.equal(a.requests.length, 0); assert.equal(document.querySelector('input'), null); await a.click('Check hosting access'); await fillCreation(a); await a.click('Review my Circle listing');
    assert.equal(a.requests.filter(request => request.url === '/api/circles/start').length, 2); assert.equal(a.requests.every(request => request.options.method === 'GET'), true); assert.equal(a.button('Confirm and list my Circle').disabled, true);
    assert.equal(document.activeElement.textContent, 'Review your Circle listing'); await a.confirm(); await a.click('Confirm and list my Circle');
    const sent = JSON.parse(a.requests.find(request => request.options.method === 'POST').options.body); assert.equal(sent.title, 'A welcoming reading Circle'); assert.match(sent.requestId, /^[0-9a-f-]{36}$/); assert.equal('formatChoice' in sent, false);
    assert.equal(a.requests.at(-1).options.method, 'GET'); assert.ok(document.querySelector(`a[href="/circles/${circleId}"]`)); assert.match(a.text(), /creation confirmed/);
  } finally { await a.cleanup(); }
});

test('lost creation reply only offers an exact manual retry, and retirement clears its private payload', async () => {
  let posts = 0;
  const a = await mount({ view: 'start', respond: (url, options) => {
    if (url === '/api/circles/start') return hosting();
    if (options.method === 'POST') { posts++; const sent = JSON.parse(options.body); return posts === 1 ? Promise.reject(new Error('Lost saved reply')) : Response.json(receipt(sent, 'create', detail({ member: true, host: true, revision: 1 }), true)); }
    return Response.json(detail({ member: true, host: true, revision: 1 }));
  } });
  try {
    await a.click('Check hosting access'); await fillCreation(a); await a.click('Review my Circle listing'); await a.confirm(); await a.click('Confirm and list my Circle');
    assert.equal(posts, 1); assert.equal(a.button('Review exact Circle creation retry'), undefined);
    await a.event('focus'); await a.click('Check hosting access'); assert.equal(posts, 1);
    await a.click('Review exact Circle creation retry'); assert.equal(a.button('Confirm exact Circle creation retry').disabled, true);
    await a.confirm(); await a.click('Confirm exact Circle creation retry');
    const sent = a.requests.filter(request => request.options.method === 'POST'); assert.equal(sent[0].options.body, sent[1].options.body); assert.match(a.text(), /creation confirmed/);
    await a.auth('SIGNED_OUT'); assert.equal(document.querySelector(`a[href="/circles/${circleId}"]`), null); assert.doesNotMatch(a.text(), /A welcoming reading Circle/); assert.equal(a.button('Review exact Circle creation retry'), undefined);
  } finally { await a.cleanup(); }
});

test('creation draft/private video data and confirmation clear on account switch; later focus is read-only', async () => {
  const a = await mount({ view: 'start', respond: () => hosting() });
  try {
    await a.click('Check hosting access'); await a.edit('Circle name', 'PRIVATE_DRAFT'); await a.act(async () => document.querySelector('input[value="online"]').click()); await a.edit('Private video link (https)', 'https://meet.example.invalid/PRIVATE_LINK'); await a.auth('TOKEN_REFRESHED');
    assert.equal(document.querySelector('input'), null); assert.doesNotMatch(a.text(), /PRIVATE_DRAFT|PRIVATE_LINK/); const count = a.requests.length; await a.event('focus'); assert.equal(a.requests.length, count); await a.click('Check hosting access'); assert.equal(document.getElementById('circle-title').value, '');
  } finally { await a.cleanup(); }
});

test('My Circles returns hidden/completed memberships and hosted-left Circles without private URLs or inferred roster', async () => {
  const hidden = summary(detail({ member: true, hidden: true, ended: true })), hosted = summary(detail({ host: true, id: otherId }));
  const a = await mount({ view: 'mine', respond: () => Response.json({ items: [hidden, hosted], nextCursor: null, private_url: 'PRIVATE_SERVER_URL', roster: ['PRIVATE_ROSTER'] }) });
  try {
    assert.equal(a.requests.length, 0); await a.click('Load My Circles'); assert.match(a.text(), /Hidden from public listings|Closed to new members/); assert.match(a.text(), /Not currently a member · Host/); assert.ok(document.querySelector(`a[href="/circles/${circleId}"]`)); assert.doesNotMatch(a.text(), /PRIVATE_SERVER_URL|PRIVATE_ROSTER|PRIVATE_MEETING/); await a.event('blur'); assert.doesNotMatch(a.text(), /Tuesday reading Circle/);
  } finally { await a.cleanup(); }
});

test('My Circles pagination replaces the page and rejects a cursor that repeats or goes backwards', async () => {
  const items = Array.from({ length: 25 }, (_, index) => summary(detail({ member: true, id: `33333333-3333-4333-8333-${String(index + 1).padStart(12, '0')}`, title: `First page Circle ${index + 1}` })));
  const cursor = items.at(-1).circle.id;
  const a = await mount({ view: 'mine', respond: url => Response.json(url.includes('?after=') ? { items: [summary(detail({ host: true, id: '44444444-4444-4444-8444-444444444444', title: 'Second page Circle' }))], nextCursor: null } : { items, nextCursor: cursor }) });
  try { await a.click('Load My Circles'); await a.click('Next page of My Circles'); assert.match(a.text(), /Second page Circle/); assert.doesNotMatch(a.text(), /First page Circle/); assert.equal(a.requests.at(-1).url, `/api/circles/mine?after=${cursor}`); }
  finally { await a.cleanup(); }
  const b = await mount({ view: 'mine', respond: () => Response.json({ items, nextCursor: cursor }) });
  try { await b.click('Load My Circles'); await b.click('Next page of My Circles'); assert.match(b.text(), /could not be loaded/); assert.doesNotMatch(b.text(), /First page Circle/); }
  finally { await b.cleanup(); }
});

test('hosting eligibility denial cannot become a new draft, and a fresh 401 clears an existing private draft', async () => {
  let forbidden = false;
  const a = await mount({ view: 'start', respond: () => forbidden ? Response.json({ error: 'PRIVATE_AUTH_DETAIL' }, { status: 401 }) : hosting() });
  try {
    await a.click('Check hosting access'); await a.edit('Circle name', 'PRIVATE_OLD_ACCOUNT_DRAFT'); forbidden = true; await a.click('Check hosting access');
    assert.equal(document.querySelector('input'), null); assert.doesNotMatch(a.text(), /PRIVATE_OLD_ACCOUNT_DRAFT|PRIVATE_AUTH_DETAIL/); assert.match(a.text(), /Check your sign-in and hosting access/);
    forbidden = false; await a.click('Check hosting access'); assert.equal(document.getElementById('circle-title').value, '');
  } finally { await a.cleanup(); }
  const b = await mount({ view: 'start', respond: () => hosting(false) });
  try { await b.click('Check hosting access'); assert.equal(document.querySelector('input'), null); assert.match(b.text(), /Hosting is currently unavailable/); assert.equal(b.requests.every(request => request.options.method === 'GET'), true); }
  finally { await b.cleanup(); }
});

test('fifteen-second deadline covers reply body; a late join receipt cannot claim success or auto-retry', async () => {
  const pending = deferred(); let sent;
  const a = await mount({ respond: (_url, options) => {
    if (options.method !== 'POST') return Response.json(detail());
    sent = JSON.parse(options.body); return { status: 200, json: () => pending.promise };
  } });
  try {
    await a.click('Load current Circle access'); await a.click('Join this Circle'); await a.confirm(); await a.click('Confirm join');
    const deadline = a.deadlines.findLast(item => !item.cleared); assert.ok(deadline); await a.act(async () => deadline.fn());
    assert.match(a.text(), /reply could not be confirmed/); assert.equal(a.button('Retry exact participation request'), undefined);
    assert.equal(a.requests.at(-1).options.signal.aborted, true);
    await a.click('Load current Circle access'); assert.ok(a.button('Retry exact participation request'));
    const count = a.requests.length; await a.act(async () => pending.resolve(receipt(sent, 'join', detail({ member: true, revision: 4 }))));
    assert.equal(a.requests.length, count); assert.doesNotMatch(a.text(), /Request confirmed|You are currently a member/);
  } finally { pending.resolve({}); await a.cleanup(); }
});

test('My Circles denies unavailable data without claiming an empty history; new pages have no private SSR or provisioning', async () => {
  for (const status of [401, 403, 503]) {
    const a = await mount({ view: 'mine', respond: () => Response.json({ items: [], nextCursor: null, error: 'PRIVATE_SERVER_DETAIL' }, { status }) });
    try { await a.click('Load My Circles'); assert.doesNotMatch(a.text(), /No current memberships|PRIVATE_SERVER_DETAIL/); }
    finally { await a.cleanup(); }
  }
  for (const filename of ['app/circles/start/page.tsx', 'app/circles/[circleId]/page.tsx', 'app/circles/mine/page.tsx', 'app/circles/start/StartCircleForm.tsx', 'app/circles/[circleId]/CircleDetail.tsx', 'app/circles/mine/MyCircles.tsx']) {
    const source = fs.readFileSync(path.join('../..', filename), 'utf8'); assert.doesNotMatch(source, /PublicNav|getMemberSession|ensure-member|localStorage|sessionStorage|dangerouslySetInnerHTML/);
  }
});

test('actual React and routes recover leaving a legacy Circle with no calendar', async () => {
  const { participationApp, IDS } = await import('./support/participation-app.mjs');
  const server = await participationApp();
  let a;
  try {
    server.setActor(IDS.reader); await server.db.query('UPDATE book_cohorts SET start_date=NULL WHERE id=$1', [IDS.circle]);
    const transport = throughRoutes(server);
    a = await mount({ props: { circleId: IDS.circle }, memberId: server.memberId, respond: transport, listing: transport });
    await a.click('Load current Circle access'); assert.match(a.text(), /could not be verified/); assert.ok(a.button('Check membership controls'));
    await a.click('Check membership controls'); assert.match(a.text(), /currently a member/); assert.equal(a.button('Join this Circle'), undefined); assert.equal(a.button('Going'), undefined); assert.equal(a.button('Read circle conversation'), undefined);
    await a.click('Leave this Circle'); assert.equal(a.button('Confirm leave').disabled, true); await a.confirm(); await a.click('Confirm leave');
    assert.match(a.text(), /Leave request confirmed/);
    assert.doesNotMatch(a.text(), /You are currently a member|PRIVATE_MEETING/);
    assert.equal(a.button('Retry exact participation request'), undefined);
    assert.equal(a.requests.filter(request => request.url.endsWith('/membership')).length, 3);
    const persisted = await server.db.query('SELECT count(*)::int n FROM book_cohort_members WHERE cohort_id=$1 AND member_id=$2', [IDS.circle, IDS.reader]); assert.equal(persisted.rows[0].n, 0);
    assert.equal(a.requests.filter(request => request.options.method === 'POST').length, 1);
  } finally { if (a) await a.cleanup(); await server.close(); }
});

test('actual React and routes let a host leave then complete an online Circle with missing video configuration', async () => {
  const { participationApp, IDS } = await import('./support/participation-app.mjs');
  const server = await participationApp();
  let a;
  try {
    server.setActor(IDS.host);
    await server.db.query('INSERT INTO book_cohort_members(cohort_id,member_id) VALUES($1,$2)', [IDS.circle, IDS.host]);
    await server.db.query("UPDATE book_cohorts SET circle_format='online',circle_venue_type='online' WHERE id=$1", [IDS.circle]);
    const transport = throughRoutes(server);
    a = await mount({ props: { circleId: IDS.circle }, memberId: server.memberId, respond: transport, listing: transport });
    await a.click('Load current Circle access'); assert.match(a.text(), /could not be verified/); await a.click('Check membership controls');
    assert.ok(a.button('Complete this Circle')); await a.click('Leave this Circle'); await a.confirm(); await a.click('Confirm leave');
    assert.match(a.text(), /not currently a member/); assert.ok(a.button('Complete this Circle')); assert.equal(a.button('Join this Circle'), undefined);
    await a.click('Complete this Circle'); await a.confirm(); await a.click('Confirm Circle completion'); assert.match(a.text(), /Request confirmed/); assert.equal(a.button('Complete this Circle'), undefined);
    const persisted = await server.db.query('SELECT status FROM book_cohorts WHERE id=$1', [IDS.circle]); assert.equal(persisted.rows[0].status, 'completed');
    assert.equal(a.requests.filter(request => request.options.method === 'POST').length, 2); assert.equal(document.querySelector('a[href*=PRIVATE_MEETING]'), null);
  } finally { if (a) await a.cleanup(); await server.close(); }
});

test('recovery controls use a fresh canonical snapshot and do not infer a lost membership or enable joining', async () => {
  let reads = 0;
  const a = await mount({ respond: () => Response.json(management({ member: ++reads === 1, host: true, revision: reads + 2 })) });
  try {
    await a.click('Check membership controls'); assert.ok(a.button('Leave this Circle')); await a.click('Leave this Circle');
    assert.match(a.text(), /no longer available/); assert.equal(a.button('Confirm leave'), undefined); assert.equal(a.button('Join this Circle'), undefined); assert.equal(a.requests.every(request => request.options.method === 'GET'), true);
  } finally { await a.cleanup(); }
});

test('uncertain recovery requests retain an exact manual retry and refresh the minimal current state', async () => {
  let posts = 0;
  const a = await mount({ respond: (_url, options) => {
    if (options.method !== 'POST') return Response.json(management({ host: true, member: posts < 2, revision: posts < 2 ? 3 : 4 }));
    posts++; if (posts === 1) throw new Error('Saved recovery reply lost');
    const sent = JSON.parse(options.body); return Response.json(receipt(sent, 'leave', detail({ host: true, revision: 4 }), true));
  } });
  try {
    await a.click('Check membership controls'); await a.click('Leave this Circle'); await a.confirm(); await a.click('Confirm leave'); assert.match(a.text(), /reply could not be confirmed/); assert.equal(posts, 1);
    await a.event('focus'); await a.click('Check membership controls'); assert.equal(posts, 1);
    await a.click('Retry exact participation request'); assert.equal(a.button('Confirm exact participation retry').disabled, true);
    await a.confirm(); await a.click('Confirm exact participation retry');
    const requests = a.requests.filter(request => request.options.method === 'POST'); assert.equal(requests[0].options.body, requests[1].options.body);
    assert.ok(a.requests.at(-1).url.endsWith('/membership')); assert.match(a.text(), /not currently a member/); assert.equal(a.button('Join this Circle'), undefined);
    await a.event('storage'); assert.doesNotMatch(a.text(), /Legacy Circle|You are the host/); assert.equal(a.button('Retry exact participation request'), undefined);
  } finally { await a.cleanup(); }
});

test('My Circles keeps management-only records beside good records without inventing calendar or private links', async () => {
  const a = await mount({ view: 'mine', respond: () => Response.json({ items: [management({ title: null, hidden: true }), summary(detail({ member: true, id: otherId, title: 'Healthy Circle' }))], nextCursor: null }) });
  try {
    await a.click('Load My Circles'); assert.match(a.text(), /Full Circle information is unavailable/); assert.match(a.text(), /Healthy Circle/);
    assert.ok(document.querySelector(`a[href="/circles/${circleId}#membership-controls"]`)); assert.ok(document.querySelector(`a[href="/circles/${otherId}"]`));
    assert.match(a.text(), /Circle membership/); assert.doesNotMatch(a.text(), /PRIVATE_MEETING|scheduled twelve-week path has ended/);
  } finally { await a.cleanup(); }
});

test('recovery auth denial and a foreign snapshot erase controls without exposing server details', async () => {
  for (const denied of [() => Response.json({ error: 'PRIVATE_SERVER_DETAIL' }, { status: 401 }), () => Response.json({ ...management({ host: true }), circle: { id: otherId, title: 'PRIVATE_FOREIGN_CIRCLE', hidden: false } })]) {
    let calls = 0;
    const a = await mount({ respond: () => ++calls === 1 ? Response.json(management({ host: true })) : denied() });
    try {
      await a.click('Check membership controls'); await a.click('Leave this Circle'); assert.doesNotMatch(a.text(), /PRIVATE_SERVER_DETAIL|PRIVATE_FOREIGN_CIRCLE|Legacy Circle|You are the host/); assert.equal(a.button('Confirm leave'), undefined); assert.equal(a.button('Complete this Circle'), undefined);
    } finally { await a.cleanup(); }
  }
});
