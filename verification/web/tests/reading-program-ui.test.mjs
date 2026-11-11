import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { offlineApp } from './support/offline-app.mjs';
const require = createRequire(path.resolve('../../package.json'));
const { JSDOM } = createRequire(path.resolve('tooling/package.json'))('jsdom');
const circleId = '11111111-1111-4111-8111-111111111111', otherId = '22222222-2222-4222-8222-222222222222';
const memberId = '33333333-3333-4333-8333-333333333333';
const actor = { member: { id: memberId, display_name: 'Fixture host' }, auth: { provider: 'supabase', subject: memberId } };
const dates = ['2026-11-10', '2026-11-17', '2026-11-24', '2026-12-01'];
function detail({ member = false, host = false, hidden = false, ended = false, revision = 3, signed = true, full = false, id = circleId, title = 'Tuesday reading Circle' } = {}) {
  return { ready: true, revision, ended, circle: { id, title, description: 'Public text with welcoming conversation.', format: 'online', format_label: 'Online', city: null, region: null, venue_name: null, venue_label: 'Online', meeting_label: 'Tuesdays at 7 PM ET', weekday: 2, time: '19:00', timezone: 'America/New_York', start_date: '2026-11-10', first_meeting: '2026-11-10', next_meeting: ended || hidden ? null : dates[0], week: 1, reading: null, reading_program: null, program_length: 12, member_count: full ? 8 : 4, max_members: 8, spots_left: full || ended ? 0 : 4, status: ended ? 'completed' : 'forming', host_name: 'Volunteer host', going_next: ended || hidden ? null : 1, hidden }, viewer: { signed_in: signed, is_member: member, is_host: host }, capabilities: { canJoin: signed && !member && !hidden && !ended && !full, canLeave: member, canRsvp: member && !hidden && !ended, canComplete: host && !ended, canReadConversation: member && !hidden }, meetings: ended || hidden ? [] : dates.map(date => ({ date, going: 1, my_status: null })), online_url: member && !hidden ? 'https://meet.example.invalid/PRIVATE_MEETING' : null };
}
function receipt(request, action, current, replayed = false) {
  const c = current.circle, v = current.viewer;
  return { memberId, requestId: request.requestId, circleId: c.id, receipt: { action, joined: action !== 'leave', completed: action === 'complete', date: request.date ?? null, status: request.status ?? null }, state: { revision: current.revision, isMember: v.is_member, isHost: v.is_host, hidden: c.hidden, completed: c.status === 'completed', ended: current.ended, ...current.capabilities }, replayed };
}
function summary(current) { return { kind: 'circle', circle: current.circle, revision: current.revision, ended: current.ended, viewer: current.viewer, capabilities: current.capabilities }; }
function management({ member = true, host = false, hidden = false, revision = 3, title = 'Legacy Circle', complete = false } = {}) {
  return { kind: 'management', circle: { id: circleId, title, hidden }, revision, viewer: { signed_in: true, is_member: member, is_host: host }, capabilities: { canLeave: member, canComplete: host && !complete } };
}
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
async function mount({ view = 'start', respond = () => Response.json(detail()), credentials = async () => ({}), props = {}, strict = true, url = 'https://offline.invalid/circles/start' } = {}) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url, pretendToBeVisual: true });
  const previous = {};
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous[key] = Object.getOwnPropertyDescriptor(globalThis, key); Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  }
  const React = require('react'), { createRoot } = require('react-dom/client'), { act } = React;
  const app = offlineApp(), requests = [], listeners = new Set(), deadlines = [];
  app.context.window = dom.window; app.context.document = dom.window.document; app.context.navigator = dom.window.navigator; app.context.Event = dom.window.Event;
  app.context.setTimeout = (fn, ms) => { if (ms === 15000) { const handle = { fn, cleared: false }; deadlines.push(handle); return handle; } return setTimeout(fn, ms); };
  app.context.clearTimeout = handle => handle && 'cleared' in Object(handle) ? handle.cleared = true : clearTimeout(handle);
  app.context.fetch = (url, options) => { requests.push({ url, options }); return Promise.resolve(url === '/api/auth/member' ? Response.json(actor) : respond(url, options)); };
  app.setMock('./client', () => ({ circleHeaders: credentials }));
  app.setMock('@/lib/circles/client', () => ({ circleHeaders: credentials }));
  app.setMock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { onAuthStateChange(listener) { listeners.add(listener); return { data: { subscription: { unsubscribe() { listeners.delete(listener); } } } }; } } }) }));
  app.setMock('next/link', () => ({ __esModule: true, default: ({ children, ...p }) => React.createElement('a', p, children) }));
  for (const specifier of ['./safety.module.css', '../messages/safety.module.css', '@/app/circles/messages/safety.module.css', '../participation.module.css', '../reading-program.module.css', './reading-program.module.css', '../circles/passages/passage.module.css']) app.setMock(specifier, () => ({ __esModule: true, default: new Proxy({}, { get: (_t, key) => String(key) }) }));
  const View = app.load(view === 'detail' ? 'app/circles/[circleId]/CircleDetail.tsx' : view === 'start' ? 'app/circles/start/StartCircleForm.tsx' : view === 'discovery' ? 'app/circles/CirclesBrowser.tsx' : 'app/circles/mine/MyCircles.tsx').default;
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
  return { app, act, dom, requests, listeners, deadlines, render, button, click, edit, confirm, event, auth, cleanup, text: () => document.body.textContent };
}

async function fillCreation(a) {
  await a.edit('Circle name', 'A welcoming reading Circle');
  await a.edit('Venue name', 'Main Street Public Library');
  await a.edit('City', 'Boston');
  await a.edit('First week starts', new Date().toISOString().slice(0, 10));
  await a.confirm();
}

const sourceApp = offlineApp();
const { getReadingEdition, readingReaderHref } = sourceApp.load('lib/circles/reading-program.ts');
const edition = getReadingEdition('hamlet');
const metadata = await sourceApp.load('lib/books/editions.ts').readBookEdition('hamlet');
const fullRange = { from: 0, to: edition.blockCount - 1 };
const program = (sessions = [fullRange]) => ({ version: 1, bookId: edition.bookId, editionId: edition.editionId, sessions });
const context = { bookId: edition.bookId, editionId: edition.editionId, from: 12, to: 22 };
const contextParams = new URLSearchParams({ book: context.bookId, edition: context.editionId, from: String(context.from), to: String(context.to) });
const hosting = { memberId, canCreate: true, activeHosted: 0, maxActiveHosted: 3 };
const normalResponse = url => Response.json(url.startsWith('/api/great-books/text/') ? metadata : url === '/api/circles/start' ? hosting : detail());
async function loadBook(a) {
  await a.click('Check hosting access');
  await a.edit('Reading plan', 'book');
  await a.edit('Book and pinned source edition', 'hamlet');
  await a.click('Load and verify selected edition');
}
const discoveryResponse = circles => Response.json({ ready: true,
  circles: circles.map(circle => ({ ...circle, going_next: null, phase: 'upcoming' })),
  page: { limit: 25, nextCursor: null, asOf: '2026-11-09T12:00:00Z' },
});

test('book plans load public verified metadata only on request, default to the full edition, and preview actual credits', async () => {
  const a = await mount({ respond: normalResponse });
  try {
    assert.equal(a.requests.length, 0);
    await loadBook(a);
    const read = a.requests.find(request => request.url.startsWith('/api/great-books/text/'));
    assert.equal(read.options.credentials, 'omit'); assert.equal(read.options.redirect, 'error'); assert.equal(read.options.cache, 'no-store');
    assert.equal(document.getElementById('reading-0-from').value, '1'); assert.equal(document.getElementById('reading-0-to').value, String(edition.blockCount));
    assert.match(a.text(), /William Shakespeare|outside the US|stable places|cannot be changed/);
    await fillCreation(a); await a.click('Review my Circle listing');
    assert.match(a.text(), /Complete source edition|US public-domain assessment/);
    assert.match(a.text(), /You are proposing these 1 weekly selections|Confirming will fix this plan/);
    assert.doesNotMatch(a.text(), /The host agreed|when creating this Circle|Circle creation confirmed/);
    assert.ok(document.querySelector('section[aria-label="Proposed reading program"]'));
    assert.ok(document.querySelector('section[aria-label="Review your Circle listing"]'));
    assert.equal(a.requests.filter(request => request.options.method === 'POST').length, 0);
    assert.equal(a.requests.filter(request => request.url === '/api/circles/start').length, 2);
    assert.equal(a.requests.filter(request => request.url === '/api/auth/member').length, 2);
    assert.ok(a.requests.filter(request => request.url === '/api/circles/start').every(request => request.options.headers.get('X-Soe-Expected-Member') === memberId));
  } finally { await a.cleanup(); }
});

test('reader context is an explicit opt-in with a verified edition and an encoded signup return', async () => {
  const a = await mount({ props: { initialContext: context }, respond: normalResponse });
  try {
    const signup = document.querySelector('a[href*="mode=signup"]');
    assert.equal(new URL(signup.href).searchParams.get('next'), `/circles/start?${contextParams}`);
    await a.click('Check hosting access'); assert.equal(document.getElementById('circle-reading-plan').value, 'starter');
    assert.equal(document.getElementById('reading-0-from'), null); assert.equal(a.requests.length, 2);
    await a.click('Use the reader selection as the first reading'); assert.equal(document.getElementById('reading-0-from'), null);
    await a.click('Load and verify selected edition');
    assert.equal(document.getElementById('reading-0-from').value, '13'); assert.equal(document.getElementById('reading-0-to').value, '23');
    await a.event('blur'); await a.event('focus'); await a.click('Check hosting access');
    assert.equal(document.getElementById('circle-reading-plan').value, 'starter'); assert.equal(document.getElementById('reading-0-from'), null);
    assert.equal(a.requests.filter(request => request.url.startsWith('/api/great-books')).length, 1);
  } finally { await a.cleanup(); }
});

test('source heading boundaries map to inclusive blocks, additions deliberately repeat, and twelve is the limit', async () => {
  const a = await mount({ respond: normalResponse });
  try {
    await loadBook(a);
    const headings = edition.contents.filter(item => item.readingIndex > 0);
    const first = headings[0], next = headings.find(item => item.readingIndex > first.readingIndex);
    await a.edit('Begin at a source heading', String(first.readingIndex));
    await a.edit('Read through to a boundary', String(next.readingIndex));
    assert.equal(document.getElementById('reading-0-from').value, String(first.readingIndex + 1));
    assert.equal(document.getElementById('reading-0-to').value, String(next.readingIndex));
    await a.click('Add weekly reading');
    assert.equal(document.getElementById('reading-1-from').value, document.getElementById('reading-0-from').value);
    for (let index = 2; index < 12; index++) await a.click('Add weekly reading');
    assert.equal(document.querySelectorAll('input[id$="-from"]').length, 12); assert.equal(a.button('Add weekly reading').disabled, true);
    await a.act(async () => document.querySelector('[aria-label="Remove week 12 reading"]').click());
    assert.equal(a.button('Add weekly reading').disabled, false);
  } finally { await a.cleanup(); }
});

test('invalid ranges cannot reach confirmation and stale metadata never becomes an accepted program', async () => {
  const a = await mount({ respond: normalResponse });
  try {
    await loadBook(a); await fillCreation(a); await a.edit('Week 1 begins at reading position', String(edition.blockCount + 1));
    await a.click('Review my Circle listing'); assert.match(a.text(), /choose valid weekly reading ranges/);
    assert.equal(document.querySelector('section[aria-label="Review your Circle listing"]'), null);
    assert.equal(a.requests.filter(request => request.url === '/api/circles/start').length, 1);
  } finally { await a.cleanup(); }
  for (const altered of ['version', 'headings']) {
    const changed = structuredClone(metadata);
    if (altered === 'version') { changed.edition.editionId = `pg-1524-${'a'.repeat(64)}`; changed.edition.documentUrl = `/api/great-books/edition/hamlet?edition=${changed.edition.editionId}`; changed.edition.downloadUrl = `/api/great-books/edition/hamlet/download?edition=${changed.edition.editionId}`; }
    else changed.edition.contents[0].label = 'INVENTED_HEADING';
    const b = await mount({ respond: url => url.startsWith('/api/great-books/') ? Response.json(changed) : Response.json(hosting) });
    try { await loadBook(b); assert.match(b.text(), /could not be verified/); assert.equal(document.getElementById('reading-0-from'), null); assert.doesNotMatch(b.text(), /INVENTED_HEADING/); }
    finally { await b.cleanup(); }
  }
});

test('metadata deadline and lifecycle retirement suppress delayed replies without automatic reads or writes', async () => {
  for (const mode of ['blur', 'auth', 'timeout']) {
    const late = deferred();
    const a = await mount({ respond: url => url.startsWith('/api/great-books/') ? late.promise : Response.json(hosting) });
    try {
      await a.click('Check hosting access'); await a.edit('Reading plan', 'book'); await a.edit('Book and pinned source edition', 'hamlet'); await a.click('Load and verify selected edition');
      if (mode === 'blur') await a.event('blur'); else if (mode === 'auth') await a.auth('SIGNED_OUT'); else await a.act(async () => a.deadlines.filter(item => !item.cleared).at(-1).fn());
      await a.act(async () => late.resolve(Response.json(metadata)));
      assert.equal(document.getElementById('reading-0-from'), null);
      assert.equal(a.requests.length, 3); await a.event('focus'); assert.equal(a.requests.length, 3);
      assert.equal(a.requests.some(request => request.options.method === 'POST'), false);
      if (mode === 'timeout') assert.match(a.text(), /could not be verified/);
    } finally { late.resolve(Response.json(metadata)); await a.cleanup(); }
  }
});

test('unknown creation preserves the exact verified program and UUID for manual retry only', async () => {
  let posts = 0, current = detail();
  const a = await mount({ respond: (url, options) => {
    if (options.method !== 'POST') return url === `/api/circles/${circleId}` ? Response.json(current) : normalResponse(url);
    posts++; if (posts === 1) throw new Error('Unknown commit');
    current = detail({ member: true, host: true, revision: 4 });
    return Response.json(receipt(JSON.parse(options.body), 'create', current, true));
  } });
  try {
    await loadBook(a); await a.edit('Week 1 begins at reading position', '13'); await a.edit('Week 1 ends at reading position', '23');
    await a.click('Add weekly reading'); await a.edit('Week 2 begins at reading position', '1'); await a.edit('Week 2 ends at reading position', '8');
    await fillCreation(a); await a.click('Review my Circle listing'); await a.confirm(); await a.click('Confirm and list my Circle');
    assert.equal(posts, 1); assert.match(a.text(), /reply could not be confirmed/); await a.event('focus'); assert.equal(posts, 1);
    await a.click('Check hosting access'); await a.click('Review exact Circle creation retry'); assert.equal(posts, 1);
    assert.equal(a.button('Confirm exact Circle creation retry').disabled, true); await a.confirm(); await a.click('Confirm exact Circle creation retry');
    const writes = a.requests.filter(request => request.options.method === 'POST');
    assert.equal(writes[0].options.body, writes[1].options.body);
    const sent = JSON.parse(writes[0].options.body); assert.equal(sent.expectedMemberId, memberId); assert.deepEqual(sent.readingProgram, program([{ from: 12, to: 22 }, { from: 0, to: 7 }]));
    const readback = a.requests.at(-1); assert.equal(readback.url, `/api/circles/${circleId}`);
    assert.equal(new Request(`https://offline.invalid${readback.url}`, readback.options).method, 'GET'); assert.match(a.text(), /Circle creation confirmed/);
  } finally { await a.cleanup(); }
});

test('starter creation omits the readingProgram property rather than sending a null book plan', async () => {
  const a = await mount({ respond: (url, options) => options.method === 'POST' ? Response.json(receipt(JSON.parse(options.body), 'create', detail({ member: true, host: true, revision: 4 }))) : normalResponse(url) });
  try { await a.click('Check hosting access'); await fillCreation(a); await a.click('Review my Circle listing'); await a.confirm(); await a.click('Confirm and list my Circle'); assert.equal(Object.hasOwn(JSON.parse(a.requests.find(request => request.options.method === 'POST').options.body), 'readingProgram'), false); }
  finally { await a.cleanup(); }
});

test('detail shows all agreed ranges before the unchanged conversation with canonical Circle-bound reader links', async () => {
  const current = detail({ member: true }); current.circle.reading_program = program([{ from: 12, to: 22 }, fullRange]); current.circle.program_length = 2; current.meetings = current.meetings.slice(0, 2);
  const a = await mount({ view: 'detail', respond: () => Response.json(current) });
  try {
    await a.click('Load current Circle access'); const summary = document.querySelector('section[aria-label="Agreed reading program"]'); assert.ok(summary);
    const conversation = a.button('Read circle conversation'); assert.ok(summary.compareDocumentPosition(conversation) & a.dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
    assert.ok(document.querySelector(`a[href="${readingReaderHref(current.circle.reading_program, current.circle.reading_program.sessions[0], circleId)}"]`));
    assert.equal(document.querySelector('a[href^="/circles/path/"]'), null); assert.match(a.text(), /2 weekly selections|may revisit or omit/);
    assert.match(a.text(), /The host agreed these 2 weekly selections when creating this Circle/);
    assert.doesNotMatch(a.text(), /You are proposing|Confirming will fix/);
  } finally { await a.cleanup(); }
});

test('book discovery preserves the selection hint but explicitly compares only the exact book and edition', async () => {
  const current = detail(); current.circle.reading_program = program([{ from: 35, to: 45 }]); current.circle.program_length = 1;
  const a = await mount({ view: 'discovery', url: `https://offline.invalid/circles?${contextParams}`, respond: () => discoveryResponse([current.circle]) });
  try {
    assert.match(a.text(), /Results match this book and exact edition|may agree different reading ranges/);
    assert.match(a.requests[0].url, /from=12&to=22/); assert.equal(a.requests.every(request => request.options.credentials === 'omit'), true);
    const share = document.querySelector('a[href^="/circles?book="]'); assert.ok(share); assert.equal(new URL(share.href).searchParams.get('from'), '12');
    assert.ok(document.querySelector(`a[href="${readingReaderHref(current.circle.reading_program, current.circle.reading_program.sessions[0], circleId)}"]`));
    const start = [...document.querySelectorAll('a')].find(link => link.textContent === 'Start a Circle with this reading context'); assert.equal(new URL(start.href).searchParams.get('to'), '22');
    await a.click('Clear search'); assert.equal(new URL(a.dom.window.location.href).search, ''); assert.equal(document.getElementById('circle-book').value, '');
  } finally { await a.cleanup(); }
});

test('invalid duplicate or stale discovery context never broadens into an unfiltered request, and explicit selection recovers', async () => {
  for (const invalid of [`${contextParams}&book=hamlet`, 'book=hamlet&edition=obsolete']) {
    const a = await mount({ view: 'discovery', url: `https://offline.invalid/circles?${invalid}`, respond: () => discoveryResponse([]) });
    try {
      assert.equal(a.requests.length, 0); assert.match(a.text(), /could not be verified/);
      await a.click('Search'); assert.equal(a.requests.length, 0);
      await a.edit('Book and exact edition', 'hamlet'); await a.click('Search');
      assert.ok(a.requests.length > 0); assert.equal(new URL(`https://offline.invalid${a.requests.at(-1).url}`).searchParams.get('edition'), edition.editionId); assert.match(a.text(), /No matches were returned by this search at this check/);
    } finally { await a.cleanup(); }
  }
});

test('changing discovery history retires late replies and retains the verified edition in share links', async () => {
  const late = deferred(); let reads = 0;
  const a = await mount({ view: 'discovery', strict: false, respond: () => ++reads === 1 ? late.promise : discoveryResponse([]) });
  try {
    a.dom.window.history.pushState(null, '', `/circles?${contextParams}`); await a.event('popstate');
    await a.act(async () => late.resolve(discoveryResponse([{ ...detail().circle, title: 'STALE_PUBLIC_RESULT' }])));
    assert.doesNotMatch(a.text(), /STALE_PUBLIC_RESULT/); assert.match(a.text(), /Pinned edition/);
    assert.equal(a.requests[0].options.signal.aborted, true);
  } finally { late.resolve(discoveryResponse([])); await a.cleanup(); }
});

test('my Circles distinguishes a verified book plan from management-only recovery without guessing a reading', async () => {
  const current = detail({ member: true }); current.circle.reading_program = program(); current.circle.program_length = 1;
  const fallback = management({ title: null }); fallback.circle.id = otherId;
  const a = await mount({ view: 'mine', respond: () => Response.json({ items: [summary(current), fallback], nextCursor: null }) });
  try { await a.click('Load My Circles'); assert.equal(document.querySelectorAll('section[aria-label="Agreed reading program"]').length, 1); assert.match(a.text(), /Membership controls available|Circle membership/); }
  finally { await a.cleanup(); }
});

