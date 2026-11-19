import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { passagePostApp, IDS } from './passage-post-app.mjs';
export { IDS };
const require = createRequire(path.resolve('../../package.json'));
const { JSDOM } = createRequire(path.resolve('tooling/package.json'))('jsdom');
export function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
export async function passageFixture() {
  const system = await passagePostApp();
  const books = system.app.load('lib/books/passages.ts');
  const pin = books.passageIndexPin('apology');
  const reference = { version: 1, bookId: 'apology', editionId: pin.editionId, blockIndex: 30, start: 0, end: 80 };
  const source = await system.app.load('lib/books/passage-source.ts').resolvePassage(reference);
  const publicRoute = system.app.load('app/api/great-books/passage/route.ts');
  const dispatch = (url, options = {}) => url.startsWith('/api/great-books/passage?')
    ? publicRoute.GET(new Request('https://offline.invalid' + url))
    : system.dispatch(url, options.method || 'GET', options.body ? JSON.parse(options.body) : undefined);
  return { system, books, reference, source, dispatch, search: new URL(books.passageComposeHref(reference, IDS.circle), 'https://offline.invalid').search };
}
export async function mountPassage(f, { view = 'composer', respond, props = {}, strict = true, credentials = async () => ({}), authThrows = false } = {}) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://offline.invalid/circles/passages' + f.search, pretendToBeVisual: true });
  const previous = {};
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous[key] = Object.getOwnPropertyDescriptor(globalThis, key); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  const React = require('react'), { act } = React, { createRoot } = require('react-dom/client');
  const { app } = f.system, requests = [], listeners = new Set(), deadlines = [], jumped = [];
  app.context.window = dom.window; app.context.document = dom.window.document; app.context.navigator = dom.window.navigator;
  app.context.setTimeout = (fn, ms) => { if (ms === 15_000) { const timer = { fn, cleared: false }; deadlines.push(timer); return timer; } return setTimeout(fn, ms); };
  app.context.clearTimeout = timer => timer && typeof timer === 'object' && 'cleared' in timer ? timer.cleared = true : clearTimeout(timer);
  app.context.fetch = (url, options) => { requests.push({ url, options }); return Promise.resolve(respond ? respond(url, options, f.dispatch) : f.dispatch(url, options)); };
  app.setMock('./client', () => ({ circleHeaders: credentials }));
  app.setMock('@/lib/circles/client', () => ({ circleHeaders: credentials }));
  app.setMock('@/lib/supabase/client', () => ({ createClient: () => { if (authThrows) throw Error('Synthetic auth unavailable'); return { auth: { onAuthStateChange(listener) { listeners.add(listener); return { data: { subscription: { unsubscribe() { listeners.delete(listener); } } } }; } } }; } }));
  app.setMock('next/link', () => ({ __esModule: true, default: ({ children, ...p }) => React.createElement('a', p, children) }));
  for (const specifier of ['./passage.module.css', '../circles/passages/passage.module.css', './safety.module.css']) app.setMock(specifier, () => ({ __esModule: true, default: new Proxy({}, { get: (_t, key) => String(key) }) }));
  const filepath = view === 'composer' ? 'app/circles/passages/PassageComposer.tsx' : view === 'message' ? 'app/circles/messages/MessageActions.tsx' : view === 'tools' ? 'app/great-books/PassageTools.tsx' : 'app/great-books/PassageContext.tsx';
  const View = app.load(filepath).default, root = createRoot(document.getElementById('root'));
  let current = view === 'composer' ? { search: f.search, ...props } : view === 'message' ? { circleId: IDS.circle, message: { id: '55555555-5555-4555-8555-555555555555', member_name: 'Explorer', content: f.books.formatPassageMessage('A human observation.', f.source), created_at: '2026-11-03T12:00:00Z', is_mine: true }, ...props } : { metadata: f.source.metadata, currentIndex: 30, frameReady: true, jump: index => jumped.push(index), search: new URL(f.source.readerHref, 'https://offline.invalid').search, capture: () => ({ ok: true, reference: f.reference, selectedText: f.source.quote }), ...props };
  const render = async updates => { current = { ...current, ...updates }; await act(async () => root.render(React.createElement(strict ? React.StrictMode : React.Fragment, null, React.createElement(View, current)))); };
  await render({});
  const button = name => [...document.querySelectorAll('button')].find(el => el.textContent === name);
  const settle = async () => { for (let i = 0; i < 160 && document.querySelector('[aria-busy="true"]'); i++) await act(async () => new Promise(resolve => setTimeout(resolve, 5))); await act(async () => new Promise(resolve => setTimeout(resolve, 0))); };
  const click = async (name, wait = true) => { assert.ok(button(name), name); await act(async () => button(name).click()); if (wait) await settle(); };
  const edit = async (id, value) => { const control = document.getElementById(id); assert.ok(control, id); await act(async () => { Object.getOwnPropertyDescriptor(control.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : control.tagName === 'INPUT' ? dom.window.HTMLInputElement.prototype : dom.window.HTMLTextAreaElement.prototype, 'value').set.call(control, value); control.dispatchEvent(new dom.window.Event(control.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }); };
  const confirm = async () => act(async () => document.querySelector('input[type="checkbox"]').click());
  const event = async (name, target = dom.window) => act(async () => target.dispatchEvent(new dom.window.Event(name)));
  const auth = async name => act(async () => { for (const listener of [...listeners]) listener(name); });
  const cleanup = async () => { await act(async () => root.unmount()); dom.window.close(); for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } };
  return { app, act, dom, requests, jumped, deadlines, render, button, settle, click, edit, confirm, event, auth, cleanup, text: () => document.body.textContent };
}
export async function reviewPassage(a, comment = 'What does this argument mean for our everyday choices?') {
  await a.click('Verify source'); await a.click('Check current Circle access'); await a.edit('passage-comment', comment); await a.click('Prepare server preview');
}
