import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { participationApp, IDS } from './support/participation-app.mjs';
import { creationInput, requestId } from './support/participation-db.mjs';

const require = createRequire(path.resolve('../../package.json'));
const { JSDOM } = createRequire(path.resolve('tooling/package.json'))('jsdom');
const plain = value => JSON.parse(JSON.stringify(value));
async function fixture() {
  const system = await participationApp();
  const metadata = await system.app.load('lib/books/editions.ts').readBookEdition('hamlet');
  const program = { version: 1, bookId: metadata.bookId, editionId: metadata.edition.editionId, sessions: [{ from: 35, to: 150 }, { from: 151, to: 300 }] };
  system.setActor(IDS.newcomer);
  const response = await system.dispatch('/api/circles', 'POST', { ...await creationInput(system.db), expectedMemberId: IDS.newcomer, readingProgram: program, requestId: requestId() });
  assert.equal(response.status, 200, await response.clone().text());
  const created = await response.json();
  return { system, metadata, program, id: created.circleId };
}
async function mount({ system, metadata, search, respond, ready = true } = {}) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: `https://offline.invalid/great-books/${metadata.bookId}?${search}`, pretendToBeVisual: true });
  const previous = {};
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous[key] = Object.getOwnPropertyDescriptor(globalThis, key); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  const React = require('react'), { act } = React, { createRoot } = require('react-dom/client');
  const { app } = system, requests = [], jumped = [], deadlines = [];
  app.context.window = dom.window; app.context.document = dom.window.document;
  app.context.setTimeout = (fn, ms) => { if (ms === 15_000) { const timer = { fn, cleared: false }; deadlines.push(timer); return timer; } return setTimeout(fn, ms); };
  app.context.clearTimeout = timer => timer && typeof timer === 'object' && 'cleared' in timer ? timer.cleared = true : clearTimeout(timer);
  app.context.fetch = async (url, options) => { requests.push({ url, options }); return respond ? respond(url, options) : system.dispatch(url, options.method ?? 'GET'); };
  app.setMock('./reading.module.css', () => ({ __esModule: true, default: new Proxy({}, { get: (_t, key) => key }) }));
  app.setMock('next/link', () => ({ __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) }));
  const View = app.load('app/great-books/ReadingCommunity.tsx').default, root = createRoot(document.getElementById('root'));
  const jump = index => jumped.push(index);
  let props = { metadata, search, frameReady: ready, currentIndex: 100, jump };
  const render = async updates => { props = { ...props, ...updates }; await act(async () => root.render(React.createElement(View, props))); };
  await render({});
  const settle = async () => { for (let i = 0; i < 40 && /Checking the Circle/.test(document.body.textContent); i++) await act(async () => new Promise(resolve => setTimeout(resolve, 5))); };
  await settle();
  return { dom, act, requests, jumped, deadlines, render, settle, text: () => document.body.textContent,
    cleanup: async () => { await act(async () => root.unmount()); dom.window.close(); for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } } };
}

test('actual reader context crosses the canonical Circle HTTP/SQL read before jumping and performs no mutation', async () => {
  const f = await fixture(), tools = f.system.app.load('lib/circles/reading-program.ts');
  const href = tools.readingReaderHref(f.program, f.program.sessions[0], f.id);
  const before = (await f.system.db.query('SELECT count(*)::int n FROM book_cohort_members')).rows[0].n;
  const a = await mount({ ...f, search: new URL(href, 'https://offline.invalid').search });
  try {
    assert.match(a.text(), /Agreed reading for A fictional reading circle/);
    assert.match(a.text(), /Reading positions 36–151/);
    assert.deepEqual(a.jumped, [35]);
    assert.equal(a.requests.length, 1);
    assert.equal(a.requests[0].options.credentials, 'omit');
    assert.equal(a.requests[0].options.redirect, 'error');
    assert.equal(a.requests.some(r => r.options.method && r.options.method !== 'GET'), false);
    assert.equal((await f.system.db.query('SELECT count(*)::int n FROM book_cohort_members')).rows[0].n, before);
    assert.ok(document.querySelector(`a[href="/circles/${f.id}"]`));
    await a.render({ currentIndex: 200 });
    assert.deepEqual(a.jumped, [35], 'scrolling does not repeatedly reset the reader');
    const discovery = [...document.querySelectorAll('a')].find(a => a.textContent === 'Find a Circle from this selection');
    const q = new URL(discovery.href).searchParams;
    assert.equal(q.get('book'), 'hamlet'); assert.equal(q.get('edition'), f.program.editionId);
  } finally { await a.cleanup(); await f.system.close(); }
});

test('an unplanned range cannot claim agreement even when the book and edition are correct', async () => {
  const f = await fixture(), tools = f.system.app.load('lib/circles/reading-program.ts');
  const a = await mount({ ...f, search: new URL(tools.readingReaderHref(f.program, { from: 35, to: 151 }, f.id), 'https://offline.invalid').search });
  try {
    assert.match(a.text(), /does not match the Circle’s agreed edition and selection/);
    assert.doesNotMatch(a.text(), /Agreed reading for/); assert.deepEqual(a.jumped, []);
    assert.equal(a.requests.length, 1);
  } finally { await a.cleanup(); await f.system.close(); }
});

test('hidden Circle context is unavailable, does not jump, and leaves no private meeting or discussion state', async () => {
  const f = await fixture(), tools = f.system.app.load('lib/circles/reading-program.ts');
  await f.system.db.query('UPDATE book_cohorts SET circle_hidden=true WHERE id=$1', [f.id]);
  f.system.setActor(null);
  const a = await mount({ ...f, search: new URL(tools.readingReaderHref(f.program, f.program.sessions[0], f.id), 'https://offline.invalid').search });
  try { assert.match(a.text(), /reading could not be verified/); assert.deepEqual(a.jumped, []); assert.equal(document.querySelector('iframe'), null); assert.doesNotMatch(a.text(), /A fictional reading circle/); }
  finally { await a.cleanup(); await f.system.close(); }
});

test('a stale pin or duplicate query does not request a Circle or map to the current edition', async () => {
  const f = await fixture();
  for (const search of [`edition=pg-1524-${'a'.repeat(64)}&from=35&to=150&circle=${f.id}`, `edition=${f.program.editionId}&from=35&from=35&to=150&circle=${f.id}`]) {
    const a = await mount({ ...f, search });
    try { assert.match(a.text(), /invalid or changed edition or selection/); assert.equal(a.requests.length, 0); assert.deepEqual(a.jumped, []); }
    finally { await a.cleanup(); }
  }
  await f.system.close();
});

test('a delayed public reply cannot restore the previous Circle after navigation', async () => {
  const f = await fixture(), tools = f.system.app.load('lib/circles/reading-program.ts');
  let deliver;
  const reply = await f.system.dispatch(`/api/circles/${f.id}`);
  const a = await mount({ ...f, search: new URL(tools.readingReaderHref(f.program, f.program.sessions[0], f.id), 'https://offline.invalid').search,
    respond: () => new Promise(resolve => { deliver = resolve; }) });
  try {
    assert.deepEqual(a.jumped, []);
    await a.render({ search: '' });
    await a.act(async () => { deliver(reply); await Promise.resolve(); });
    assert.doesNotMatch(a.text(), /Agreed reading for/); assert.equal(document.querySelector(`a[href="/circles/${f.id}"]`), null); assert.deepEqual(a.jumped, []);
  } finally { await a.cleanup(); await f.system.close(); }
});

test('a stuck Circle read reaches an honest retry and a late aborted reply remains retired', async () => {
  const f = await fixture(), tools = f.system.app.load('lib/circles/reading-program.ts');
  let deliver; const reply = await f.system.dispatch(`/api/circles/${f.id}`);
  const a = await mount({ ...f, search: new URL(tools.readingReaderHref(f.program, f.program.sessions[0], f.id), 'https://offline.invalid').search,
    respond: () => new Promise(resolve => { deliver = resolve; }) });
  try {
    await a.act(async () => a.deadlines.find(d => !d.cleared).fn());
    assert.match(a.text(), /could not be verified/); assert.deepEqual(a.jumped, []);
    await a.act(async () => { deliver(reply); await Promise.resolve(); });
    assert.doesNotMatch(a.text(), /Agreed reading for/); assert.deepEqual(a.jumped, []);
  } finally { await a.cleanup(); await f.system.close(); }
});

test('the two verified starter bindings keep their exact source and Circle return path', async () => {
  const f = await fixture(), tools = f.system.app.load('lib/circles/reading-program.ts');
  const metadata = await f.system.app.load('lib/books/editions.ts').readBookEdition('apology'), context = tools.starterReadingContext(2);
  f.system.setActor(null);
  const href = tools.readingReaderHref(context, context, IDS.circle);
  const a = await mount({ ...f, metadata, search: new URL(href, 'https://offline.invalid').search });
  try { assert.match(a.text(), /Agreed reading for Fictional public reading circle/); assert.deepEqual(a.jumped, [43]); assert.ok(document.querySelector(`a[href="/circles/${IDS.circle}"]`)); }
  finally { await a.cleanup(); await f.system.close(); }
});
