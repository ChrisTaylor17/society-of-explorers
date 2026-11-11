import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { offlineApp } from './support/offline-app.mjs';
const require = createRequire(path.resolve('../../package.json')), tooling = createRequire(path.resolve('tooling/package.json'));
const { JSDOM } = tooling('jsdom');
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
const MEMBER = '11111111-1111-4111-8111-111111111111';
const editionId = `pg-1497-${'a'.repeat(64)}`;
function metadata(bookId = 'republic') {
  const books = { republic: ['The Republic', 'Plato', '1497'], hamlet: ['Hamlet', 'William Shakespeare', '1524'] };
  const [title, author, pg] = books[bookId];
  const version = bookId === 'republic' ? editionId : `pg-${pg}-${'b'.repeat(64)}`;
  return { bookId, title, author, edition: { editionId: version,
    documentUrl: `/api/great-books/edition/${bookId}?edition=${version}`, downloadUrl: `/api/great-books/edition/${bookId}/download?edition=${version}`, sourceCatalogUrl: `https://www.gutenberg.org/ebooks/${pg}`,
    sourceArchiveUrl: `https://www.gutenberg.org/cache/epub/${pg}/pg${pg}-h.zip`, sourceTitle: title, sourceAuthor: author,
    attribution: 'Credited Project Gutenberg source edition.', translators: [{ name: 'Benjamin Jowett', appliesTo: 'English translation' }], editors: [], illustrators: [],
    licenseUrl: 'https://www.gutenberg.org/policy/license.html', licenseNotice: 'This eBook is for the use of anyone anywhere in the United States. Check your local law outside the United States.', editionNotes: ['Complete source edition.'],
    rights: { jurisdiction: 'US', status: 'public-domain', authority: 'Project Gutenberg', outsideUS: 'not-assessed', reviewedAt: '2026-11-03' },
    blockCount: 3, contents: [{ id: 'book-i', label: 'Book I', level: 2, readingIndex: 0 }, { id: 'book-ii', label: 'Book II', level: 2, readingIndex: 1 }] } };
}
const sse = text => new Response(`data: ${JSON.stringify({ delta: text })}\n\ndata: ${JSON.stringify({ done: true, response: text, saved: false })}\n\n`, { headers: { 'content-type': 'text/event-stream' } });
async function mount({ view = 'reader', respond, credentials = async () => ({ Authorization: 'Bearer OFFLINE_TEST', 'Content-Type': 'application/json' }), strict = false, ownedFrame = false } = {}) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://offline.invalid/great-books/republic', pretendToBeVisual: true });
  const previous = {};
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous[key] = Object.getOwnPropertyDescriptor(globalThis, key); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  const React = require('react'), { createRoot } = require('react-dom/client'), { act } = React;
  if (ownedFrame) { const frame = document.createElement('iframe'); frame.setAttribute('data-reading-frame', 'true'); document.body.append(frame); }
  const app = offlineApp(), requests = [], auth = new Set(), deadlines = [], jumped = [];
  app.context.window = dom.window; app.context.document = dom.window.document; app.context.navigator = dom.window.navigator;
  app.context.URL.createObjectURL = () => 'blob:offline-audio'; app.context.URL.revokeObjectURL = () => {};
  app.context.setTimeout = (fn, ms) => { if ([15_000, 30_000].includes(ms)) { const item = { fn, ms, cleared: false }; deadlines.push(item); return item; } return setTimeout(fn, ms); };
  app.context.clearTimeout = item => item && typeof item === 'object' && 'cleared' in item ? item.cleared = true : clearTimeout(item);
  app.context.fetch = (url, options) => { requests.push({ url, options }); return Promise.resolve(url === '/api/auth/member' ? Response.json({member:{id:MEMBER},auth:{provider:'supabase',subject:MEMBER}}) : respond ? respond(url, options) : Response.json(metadata(url.includes('hamlet') ? 'hamlet' : 'republic'))); };
  app.setMock('@/lib/circles/client', () => ({ circleHeaders: credentials }));
  app.setMock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { onAuthStateChange(listener) { auth.add(listener); return { data: { subscription: { unsubscribe() { auth.delete(listener); } } } }; } } }) }));
  app.setMock('./reading.module.css', () => ({ __esModule: true, default: new Proxy({}, { get: (_target, name) => name }) }));
  app.setMock('../circles/passages/passage.module.css', () => ({ __esModule: true, default: new Proxy({}, { get: (_target, name) => name }) }));
  app.setMock('next/link', () => ({ __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) }));
  const View = app.load(view === 'tools' ? 'app/great-books/ReaderTools.tsx' : view === 'library' ? 'app/great-books/LibraryBrowser.tsx' : 'app/great-books/BookReader.tsx').default;
  const root = createRoot(document.getElementById('root'));
  const props = bookId => view === 'tools' ? { edition: metadata(bookId), currentIndex: 1, frameReady: true, jump: index => jumped.push(index), select: () => 'A selected passage about justice.' }
    : view === 'library' ? { editions: [metadata()].map(({ bookId, edition }) => ({ bookId, ...edition })) } : { bookId };
  const render = async bookId => { await act(async () => root.render(strict ? React.createElement(React.StrictMode, null, React.createElement(View, props(bookId))) : React.createElement(View, props(bookId)))); };
  await render('republic');
  const button = label => [...document.querySelectorAll('button')].find(element => element.textContent === label);
  const click = async label => { assert.ok(button(label), label); await act(async () => button(label).click()); };
  const type = async (id, value) => { await act(async () => { const input = document.getElementById(id); const prototype = input.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); }); };
  const check = async index => { await act(async () => document.querySelectorAll('input[type="checkbox"]')[index].click()); };
  const event = async name => { await act(async () => dom.window.dispatchEvent(new dom.window.Event(name))); };
  const fireAuth = async name => { await act(async () => { for (const listener of [...auth]) listener(name); }); };
  const frame = async () => {
    const iframe = document.querySelector('iframe'); assert.ok(iframe);
    const doc = iframe.contentDocument;
    doc.open(); doc.write('<html><body><h2 id="book-i" data-reading-index="0">Book I</h2><p id="book-ii" data-reading-index="1">A selected passage about justice.</p><p data-reading-index="2">The end.</p><footer id="pg-footer">Full source license</footer></body></html>'); doc.close();
    for (const [index, element] of [...doc.querySelectorAll('[data-reading-index]')].entries()) {
      element.getBoundingClientRect = () => ({ top: index * 1000 }); element.scrollIntoView = () => jumped.push(index);
    }
    iframe.contentWindow.requestAnimationFrame = callback => { callback(); return 1; };
    await act(async () => iframe.dispatchEvent(new dom.window.Event('load'))); return { iframe, doc };
  };
  const cleanup = async () => { await act(async () => root.unmount()); dom.window.close(); for (const [key, value] of Object.entries(previous)) { if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key]; } };
  return { app, dom, requests, deadlines, auth, render, button, click, type, check, event, fireAuth, frame, jumped, act, cleanup, text: () => document.body.textContent };
}

test('complete reader is free, credited, scripted-content-free and never auto-saves or calls a provider', async () => {
  const a = await mount({ strict: true });
  try {
    const { iframe, doc } = await a.frame();
    assert.equal(iframe.getAttribute('sandbox'), 'allow-same-origin'); assert.match(iframe.title, /complete source edition/);
    assert.match(a.text(), /Benjamin Jowett|United States/); assert.ok(document.querySelector('main#main h1'));
    assert.ok(document.querySelector(`a[href="/api/great-books/edition/republic/download?edition=${editionId}"][download]`));
    assert.equal(a.requests.every(request => request.url.startsWith('/api/great-books/text/') && !request.options.method), true);
    await a.act(async () => doc.querySelector('p').click()); assert.equal(a.requests.some(request => request.options.method === 'POST'), false);
    await a.click('Larger text'); assert.equal(doc.documentElement.style.getPropertyValue('--reader-font-size'), '22px');
    await a.act(async () => { const select = document.getElementById('reading-contents'); select.value = 'book-ii'; select.dispatchEvent(new a.dom.window.Event('change', { bubbles: true })); }); assert.deepEqual(a.jumped, [1]);
  } finally { await a.cleanup(); }
});

test('unknown/malformed editions show retry without presenting partial text and a stale book reply cannot replace the route', async () => {
  const old = deferred();
  const a = await mount({ respond: url => url.endsWith('/republic') ? old.promise : Response.json(metadata('hamlet')) });
  try {
    await a.render('hamlet'); await a.frame();
    await a.act(async () => old.resolve(Response.json(metadata()))); assert.equal(document.querySelector('main h1').textContent, 'Hamlet'); assert.doesNotMatch(a.text(), /The Republic/);
  } finally { old.resolve(Response.json(metadata())); await a.cleanup(); }
  const malformed = await mount({ respond: () => Response.json({ text: ['A partial extract'] }) });
  try { assert.ok(malformed.button('Retry complete edition')); assert.equal(document.querySelector('iframe'), null); assert.doesNotMatch(malformed.text(), /A partial extract/); }
  finally { await malformed.cleanup(); }
});

test('a stale edition document disables saving and retry reloads metadata even when block count is unchanged', async () => {
  const updated = metadata(), nextVersion = `pg-1497-${'c'.repeat(64)}`;
  updated.edition.editionId = nextVersion; updated.edition.documentUrl = `/api/great-books/edition/republic?edition=${nextVersion}`;
  updated.edition.downloadUrl = `/api/great-books/edition/republic/download?edition=${nextVersion}`;
  let refreshed = false;
  const a = await mount({ respond: () => Response.json(refreshed ? updated : metadata()) });
  try {
    const iframe = document.querySelector('iframe'); assert.ok(iframe); assert.equal(new URL(iframe.src).searchParams.get('edition'), editionId);
    const doc = iframe.contentDocument; doc.open(); doc.write('<html><body><p>The requested edition has changed. Reload metadata.</p></body></html>'); doc.close();
    await a.act(async () => iframe.dispatchEvent(new a.dom.window.Event('load')));
    assert.ok(a.button('Retry complete edition')); assert.equal(a.button('Save this place').disabled, true); assert.equal(document.querySelector('iframe'), null);
    assert.equal(a.requests.some(request => request.options.method === 'POST'), false);
    refreshed = true; await a.click('Retry complete edition');
    const fresh = await a.frame(); assert.equal(new URL(fresh.iframe.src).searchParams.get('edition'), nextVersion);
    assert.equal(a.button('Save this place').disabled, true); assert.equal(a.button('Load my saved place').disabled, false); assert.equal(a.requests.length, 2);
  } finally { await a.cleanup(); }
  const mismatch = metadata(); mismatch.edition.documentUrl = `/api/great-books/edition/republic?edition=${nextVersion}`;
  const b = await mount({ respond: () => Response.json(mismatch) });
  try { assert.ok(b.button('Retry complete edition')); assert.equal(document.querySelector('iframe'), null); }
  finally { await b.cleanup(); }
});

test('legacy bookmarks are never mapped or auto-posted; reviewed save requires a matching revision receipt and readback', async () => {
  const state = {bookId:'republic',revision:0,status:'saved',sectionId:'3',paragraphIndex:0,completed:false,updatedAt:null,
    edition:{editionId,blockCount:3},bookmark:{status:'legacy'}};
  let match = false;
  const a = await mount({ view: 'tools', respond: (_url, init) => {
    if(init.method === 'POST' && match)Object.assign(state,{revision:1,sectionId:`soe-reading:v1:${editionId}:1`,updatedAt:'2026-11-04T00:00:00.000Z',bookmark:{status:'current',editionId,blockIndex:1}});
    return Response.json({memberId:MEMBER,progress:[init.method==='POST'&&!match?{...state,revision:1,sectionId:'wrong',bookmark:{status:'invalid'}}:state]});
  } });
  try {
    assert.equal(a.requests.length, 0); await a.click('Load my saved place'); assert.match(a.text(), /numeric bookmark cannot be mapped safely/); assert.equal(a.button('Go to saved place'), undefined);
    await a.click('Save this place'); assert.equal(a.requests.filter(r=>r.options.method==='POST').length,0); await a.click('Confirm saving this place');
    assert.match(a.text(), /could not be confirmed/); assert.equal(a.button('Save this place').disabled, true);
    const body = JSON.parse(a.requests.at(-1).options.body); assert.deepEqual(body, {expectedMemberId:MEMBER,expectedRevision:0,bookId:'republic',action:'save',editionId,blockIndex:1,completed:false});
    await a.click('Load my saved place'); assert.match(a.text(), /still uncertain/); match = true;
    await a.click('Review retry of same saved-place change'); await a.click('Confirm saving this place'); assert.match(a.text(), /place was saved/);
    assert.equal(a.requests.at(-1).options.method,'GET'); await a.click('Go to saved place'); assert.deepEqual(a.jumped, [1]);
  } finally { await a.cleanup(); }
});

test('selected passage remains local until consent and explicit AI submit; SSE text is escaped and HTTP failures stay honest', async () => {
  let status = 200;
  const a = await mount({ view: 'tools', respond: () => status === 200 ? sse('<script>unsafe()</script> **An interpretation**') : Response.json({ error: 'PRIVATE_INTERNAL_MESSAGE' }, { status }) });
  try {
    await a.click('Use selected passage'); assert.equal(document.getElementById('reading-passage').value, 'A selected passage about justice.'); assert.equal(a.requests.length, 0);
    await a.type('reading-question', 'What does justice mean here?'); await a.check(1); await a.click('Request AI interpretation');
    assert.equal(a.requests.length, 1); assert.equal(a.requests[0].options.headers.get('Authorization'), 'Bearer OFFLINE_TEST');
    const body = JSON.parse(a.requests[0].options.body); assert.equal(body.question, 'What does justice mean here?'); assert.equal('memberId' in body, false);
    assert.match(a.text(), /AI interpretation complete/); assert.match(a.text(), /<script>unsafe\(\)<\/script>/); assert.equal(document.querySelector('script'), null);
    status = 401; await a.click('Request AI interpretation'); assert.match(a.text(), /Sign in to request/); assert.doesNotMatch(a.text(), /unsafe\(\)|PRIVATE_INTERNAL_MESSAGE/);
  } finally { await a.cleanup(); }
});

test('SSE parser accepts CRLF boundaries split across chunks and rejects errors or an unfinished response', async () => {
  const a = offlineApp(), { readAnnotation } = a.load('app/great-books/annotation.ts');
  const encoder = new TextEncoder();
  const pieces = ['data: {"delta":"Hel', 'lo"}\r', '\n\r', '\ndata: {"done":true,"response":"Hello"}\r', '\n\r', '\n'];
  const stream = new ReadableStream({ start(controller) { for (const piece of pieces) controller.enqueue(encoder.encode(piece)); controller.close(); } });
  assert.equal(await readAnnotation(new Response(stream, { headers: { 'content-type': 'text/event-stream' } }), new AbortController().signal, () => true, () => {}), 'Hello');
  for (const text of ['data: {"delta":"unfinished"}\n\n', 'data: {"error":"unavailable","done":true}\n\n']) await assert.rejects(readAnnotation(new Response(text, { headers: { 'content-type': 'text/event-stream' } }), new AbortController().signal, () => true, () => {}));
});

test('blur and identity retirement clear drafts and delayed replies; credentials resolving later cannot send a provider request', async () => {
  const credential = deferred();
  const a = await mount({ view: 'tools', credentials: () => credential.promise, respond: () => sse('SHOULD_NOT_APPEAR') });
  try {
    await a.type('reading-passage', 'PRIVATE_DRAFT_PASSAGE'); await a.check(1); await a.click('Request AI interpretation');
    await a.event('blur'); assert.equal(document.getElementById('reading-passage').value, ''); await a.event('focus');
    await a.act(async () => credential.resolve({ Authorization: 'Bearer OLD' })); assert.equal(a.requests.length, 0); assert.doesNotMatch(a.text(), /PRIVATE_DRAFT_PASSAGE|SHOULD_NOT_APPEAR/);
    await a.type('reading-question', 'PRIVATE_QUESTION'); await a.fireAuth('SIGNED_OUT'); assert.equal(document.getElementById('reading-question').value, '');
  } finally { credential.resolve({}); await a.cleanup(); }
  const pending = deferred();
  const b = await mount({ view: 'tools', respond: () => pending.promise });
  try {
    await b.type('reading-passage', 'Question about a passage'); await b.check(1); await b.click('Request AI interpretation'); await b.fireAuth('TOKEN_REFRESHED');
    await b.act(async () => pending.resolve(sse('PRIVATE_LATE_REPLY'))); assert.doesNotMatch(b.text(), /PRIVATE_LATE_REPLY/); assert.equal(b.requests[0].options.signal.aborted, true);
  } finally { pending.resolve(sse('')); await b.cleanup(); }
});

test('descendant iframe focus preserves reading tools while real blur, pagehide and hidden visibility retire them', async () => {
  const a = await mount({ view: 'tools' });
  try {
    Object.defineProperty(a.dom.window.document, 'hasFocus', { value: () => true, configurable: true });
    await a.type('reading-passage', 'A local selection from the book.'); await a.event('blur');
    assert.equal(document.getElementById('reading-passage').value, 'A local selection from the book.');
    assert.equal(a.button('Use selected passage').disabled, false); assert.equal(a.button('Load my saved place').disabled, false); assert.equal(a.button('Save this place').disabled, true);
    await a.event('pagehide'); assert.equal(document.getElementById('reading-passage').value, ''); assert.equal(a.button('Save this place').disabled, true);
    await a.event('focus'); await a.type('reading-question', 'Private question before hiding');
    Object.defineProperty(a.dom.window.document, 'visibilityState', { value: 'hidden', configurable: true });
    await a.act(async () => a.dom.window.document.dispatchEvent(new a.dom.window.Event('visibilitychange')));
    assert.equal(document.getElementById('reading-question').value, ''); assert.equal(a.button('Use selected passage').disabled, true);
    Object.defineProperty(a.dom.window.document, 'visibilityState', { value: 'visible', configurable: true });
    await a.event('focus'); await a.type('reading-passage', 'Private draft before actual window blur');
    Object.defineProperty(a.dom.window.document, 'hasFocus', { value: () => false, configurable: true });
    await a.event('blur'); assert.equal(document.getElementById('reading-passage').value, ''); assert.equal(a.button('Use selected passage').disabled, true);
    assert.equal(a.requests.length, 0);
  } finally { await a.cleanup(); }
});

test('child-only reader blur retires a pending private request on actual focus loss and preserves internal focus moves', async () => {
  const pending = deferred();
  const a = await mount({ view: 'tools', ownedFrame: true, strict: true, respond: () => pending.promise });
  try {
    const frame = document.querySelector('iframe');
    Object.defineProperty(a.dom.window.document, 'hasFocus', { value: () => true, configurable: true });
    await a.type('reading-passage', 'PRIVATE FRAME DRAFT');
    await a.act(async () => frame.contentWindow.dispatchEvent(new frame.contentWindow.Event('blur')));
    assert.equal(document.getElementById('reading-passage').value, 'PRIVATE FRAME DRAFT'); assert.equal(a.button('Use selected passage').disabled, false);
    // A load must renew observation when the child document is replaced.
    await a.act(async () => frame.dispatchEvent(new a.dom.window.Event('load')));
    await a.check(1); await a.click('Request AI interpretation'); assert.equal(a.requests.length, 1);
    Object.defineProperty(a.dom.window.document, 'hasFocus', { value: () => false, configurable: true });
    await a.act(async () => frame.contentWindow.dispatchEvent(new frame.contentWindow.Event('blur')));
    assert.equal(document.getElementById('reading-passage').value, ''); assert.equal(a.button('Use selected passage').disabled, true); assert.equal(a.requests[0].options.signal.aborted, true);
    await a.act(async () => pending.resolve(sse('PRIVATE_CHILD_LATE_REPLY'))); assert.doesNotMatch(a.text(), /PRIVATE_CHILD_LATE_REPLY/);
  } finally { pending.resolve(sse('')); await a.cleanup(); }
});

test('audio requires its own consent and explicit generation and never autoplays', async () => {
  const a = await mount({ view: 'tools', respond: () => new Response('OFFLINE_AUDIO_FIXTURE', { headers: { 'content-type': 'audio/mpeg' } }) });
  try {
    await a.type('reading-passage', 'This is a passage to read.'); assert.equal(a.requests.length, 0); assert.equal(a.button('Generate audio for this passage').disabled, true);
    await a.check(2); await a.click('Generate audio for this passage');
    assert.equal(a.requests[0].url, '/api/tts'); assert.equal(JSON.parse(a.requests[0].options.body).consentToVoiceGeneration, true);
    const audio = document.querySelector('audio'); assert.ok(audio.controls); assert.equal(audio.autoplay, false); assert.equal(audio.getAttribute('preload'), 'none');
    audio.pause = () => {}; await a.fireAuth('SIGNED_OUT'); assert.equal(document.querySelector('audio'), null);
  } finally { await a.cleanup(); }
});

test('an unresponsive AI stream reaches its deadline and late bytes cannot restore a reply or automatically retry', async () => {
  const pending = deferred(), encoder = new TextEncoder();
  const a = await mount({ view: 'tools', respond: () => ({ status: 200, ok: true, headers: new Headers({ 'content-type': 'text/event-stream' }), body: { getReader: () => ({ read: () => pending.promise, cancel: async () => {} }) } }) });
  try {
    await a.type('reading-passage', 'A passage about the good life.'); await a.check(1);
    await a.act(async () => { a.button('Request AI interpretation').click(); a.button('Request AI interpretation').click(); });
    assert.equal(a.requests.length, 1);
    const deadline = a.deadlines.findLast(item => item.ms === 30_000 && !item.cleared); assert.ok(deadline);
    await a.act(async () => deadline.fn()); assert.match(a.text(), /reply could not be confirmed/); assert.equal(a.requests[0].options.signal.aborted, true);
    await a.act(async () => pending.resolve({ done: false, value: encoder.encode('data: {"done":true,"response":"PRIVATE_LATE_BYTES"}\n\n') }));
    assert.doesNotMatch(a.text(), /PRIVATE_LATE_BYTES/); assert.equal(a.requests.length, 1);
  } finally { pending.resolve({ done: true }); await a.cleanup(); }
});

test('changing books retires a private annotation, even if the previous provider reply arrives later', async () => {
  const pending = deferred();
  const a = await mount({ respond: url => url === '/api/great-books/annotate' ? pending.promise : Response.json(metadata(url.includes('hamlet') ? 'hamlet' : 'republic')) });
  try {
    await a.frame(); await a.type('reading-passage', 'PRIVATE_OLD_BOOK_PASSAGE'); await a.check(1); await a.click('Request AI interpretation');
    const request = a.requests.find(item => item.url === '/api/great-books/annotate'); assert.ok(request);
    await a.render('hamlet'); await a.frame(); assert.equal(request.options.signal.aborted, true);
    await a.act(async () => pending.resolve(sse('PRIVATE_OLD_BOOK_ANSWER')));
    assert.equal(document.querySelector('main h1').textContent, 'Hamlet'); assert.equal(document.getElementById('reading-passage').value, '');
    assert.doesNotMatch(a.text(), /PRIVATE_OLD_BOOK_PASSAGE|PRIVATE_OLD_BOOK_ANSWER/);
  } finally { pending.resolve(sse('')); await a.cleanup(); }
});

test('library uses author/translator discovery, loads progress explicitly and displays no raw bookmark IDs', async () => {
  const books=offlineApp().load('lib/books/catalog.ts').GREAT_BOOKS;
  const progress=books.map(book=>({bookId:book.id,revision:0,status:'absent',sectionId:null,paragraphIndex:null,completed:null,updatedAt:null,edition:{editionId,blockCount:3},bookmark:null}));
  Object.assign(progress.find(row=>row.bookId==='republic'),{status:'saved',sectionId:`soe-reading:v1:${editionId}:1`,paragraphIndex:0,completed:false,bookmark:{status:'current',editionId,blockIndex:1}});
  const a = await mount({ view: 'library', respond: () => Response.json({memberId:MEMBER,progress}) });
  try {
    assert.equal(a.requests.length, 0); assert.doesNotMatch(a.text(), /RECOMMENDS/); assert.match(a.text(), /Benjamin Jowett/);
    const editionLinks = [...document.querySelectorAll('article a')];
    assert.equal(editionLinks.filter(link => link.textContent === 'Read complete edition free').length, 1);
    assert.equal(editionLinks.filter(link => link.textContent === 'Check edition availability').length, books.length - 1);
    await a.type('library-search', 'Jowett'); assert.equal(document.querySelectorAll('article').length, 1);
    await a.click('Load my saved-place summaries'); assert.match(a.text(), /Saved place in this edition/); assert.doesNotMatch(a.text(), /soe-reading:v1|pg-1497-/);
    const requestCount = a.requests.length;
    await a.type('library-search', 'Hamlet');
    await a.act(async () => { const author = document.getElementById('library-author'); author.value = 'Plato'; author.dispatchEvent(new a.dom.window.Event('change', { bubbles: true })); });
    assert.equal(document.querySelectorAll('article').length, 0); assert.match(a.text(), /No books match both filters/);
    await a.click('Clear search and author filters');
    assert.equal(document.getElementById('library-search').value, ''); assert.equal(document.getElementById('library-author').value, 'all');
    assert.equal(document.activeElement.id, 'library-search'); assert.equal(document.querySelectorAll('article').length, books.length);
    assert.equal(a.requests.length, requestCount); assert.match(a.text(), /Saved place in this edition/);
    await a.fireAuth('SIGNED_OUT'); assert.doesNotMatch(a.text(), /Saved place in this edition/);
  } finally { await a.cleanup(); }
});
