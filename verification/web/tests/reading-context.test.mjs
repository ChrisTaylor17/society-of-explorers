import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { offlineApp } from './support/offline-app.mjs';

const app = offlineApp(), tools = app.load('lib/circles/reading-program.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const { getScriptureStudy } = app.load('lib/root-kernel/scripture-studies.ts');

test('every Gutenberg program pin and heading is backed by the complete, unchanged local edition', async () => {
  const books = tools.READING_EDITIONS.filter(edition => !getScriptureStudy(edition.bookId));
  assert.equal(books.length, 8);
  for (const edition of books) {
    const manifest = JSON.parse(fs.readFileSync(`../../content/great-books/${edition.bookId}/manifest.json`, 'utf8'));
    assert.equal(edition.editionId, manifest.editionId);
    assert.equal(edition.blockCount, manifest.reader.blockCount);
    assert.deepEqual(plain(edition.contents), manifest.reader.contents);
    assert.deepEqual(plain(edition.translators), manifest.metadata.translators);
    assert.deepEqual(plain(edition.editors), manifest.metadata.editors);
    assert.deepEqual(plain(edition.illustrators), manifest.metadata.illustrators);
    const metadata = await app.load('lib/books/editions.ts').readBookEdition(edition.bookId);
    assert.equal(tools.matchesReadingEdition(metadata, edition), true);
    const program = { version: 1, bookId: edition.bookId, editionId: edition.editionId, sessions: [{ from: 0, to: edition.blockCount - 1 }] };
    assert.deepEqual(plain(tools.parseReadingProgram(program)), program);
    const html = fs.readFileSync(`../../content/great-books/${edition.bookId}/reader.html`, 'utf8');
    for (const heading of edition.contents.filter(c => c.readingIndex !== null)) {
      assert.ok(html.includes(`id="${heading.id}"`), heading.id);
      assert.ok(html.includes(`data-reading-index="${heading.readingIndex}"`), String(heading.readingIndex));
    }
  }
});

test('the Philemon plan binds the complete study and exact edition, with no generic book progress or passage routes', async () => {
  const root = app.load('lib/root-kernel/philemon-edition.ts');
  const source = JSON.parse(fs.readFileSync('../../content/root-kernel/philemon.web-classic.json', 'utf8'));
  const sha = createHash('sha256').update(JSON.stringify(source)).digest('hex');
  const metadata = await app.load('lib/circles/reading-edition-server.ts').readCircleReadingEdition('philemon');
  const { from, to, bookId, editionId } = root.PHILEMON_READING;
  assert.equal(editionId, 'web-classic-' + sha);
  assert.equal(metadata.sourceSha256, sha);
  assert.equal(tools.matchesReadingEdition(metadata, { bookId, editionId }), true);
  assert.deepEqual(plain(tools.parseCircleReadingEditionResponse(plain(metadata))), plain(metadata));
  assert.equal(tools.parseCircleReadingEditionResponse({ ...metadata, sourceSha256: '0'.repeat(64) }), null);
  assert.equal(tools.parseCircleReadingEditionResponse({ ...metadata, edition: { ...metadata.edition, blockCount: 2 } }), null);
  assert.deepEqual(plain(tools.parseReadingContext(tools.readingContextParams(root.PHILEMON_READING)).context), plain(root.PHILEMON_READING));
  assert.equal(tools.readingReaderHref({ bookId, editionId }, { from, to }), '/great-books/scripture/philemon#scripture');
  const circle = '11111111-1111-4111-8111-111111111111';
  assert.equal(tools.readingReaderHref({ bookId, editionId }, { from, to }, circle),
    `/great-books/scripture/philemon?circle=${circle}#scripture`);
  assert.equal(tools.parseReadingProgram({ version: 1, bookId, editionId, sessions: [{ from, to: 1 }] }), null);
  assert.equal(app.load('lib/books/catalog.ts').getBook(bookId), undefined);
  assert.equal(app.load('lib/books/passages.ts').passageIndexPin(bookId), null);
});

test('the Good Samaritan study binds Luke 10:25–37 and retains the checked Circle link', async () => {
  const bookId = 'luke-good-samaritan';
  const { source, selection, href } = getScriptureStudy(bookId);
  const sha = createHash('sha256').update(JSON.stringify(source)).digest('hex');
  const metadata = await app.load('lib/circles/reading-edition-server.ts').readCircleReadingEdition(bookId);
  const { from, to, editionId } = selection;
  assert.equal(editionId, 'web-classic-' + sha);
  assert.equal(metadata.sourceSha256, sha);
  assert.equal(tools.matchesReadingEdition(metadata, selection), true);
  assert.equal(tools.parseCircleReadingEditionResponse({ ...metadata, sourceSha256: '0'.repeat(64) }), null);
  const program = { version: 1, bookId, editionId, sessions: [{ from, to }] };
  assert.deepEqual(plain(tools.parseReadingProgram(program)), program);
  assert.equal(tools.parseReadingProgram({ ...program, sessions: [{ from, to: to + 1 }] }), null);
  assert.equal(tools.readingReaderHref(selection, selection), href + '#scripture');
  const circle = '11111111-1111-4111-8111-111111111111';
  assert.equal(tools.readingReaderHref(selection, selection, circle), href + '?circle=' + circle + '#scripture');
  assert.equal(app.load('lib/books/passages.ts').passageIndexPin(bookId), null);
});

test('a forged edition, range, authority field or oversized plan never becomes a reading program', () => {
  const e = tools.getReadingEdition('hamlet');
  const good = { version: 1, bookId: e.bookId, editionId: e.editionId, sessions: [{ from: 35, to: 100 }] };
  for (const bad of [null, [], {}, { ...good, version: '1' }, { ...good, bookId: 'Hamlet' }, { ...good, editionId: tools.getReadingEdition('apology').editionId },
    { ...good, memberId: 'someone-else' }, { ...good, sessions: [] }, { ...good, sessions: Array(13).fill(good.sessions[0]) },
    ...[{ from: -1, to: 10 }, { from: 2.5, to: 10 }, { from: 10, to: 9 }, { from: 0, to: e.blockCount }, { from: '0', to: 10 }, { from: 0, to: Infinity }, { from: 0, to: 10, label: '<script>invented</script>' }].map(s => ({ ...good, sessions: [s] }))]) {
    assert.equal(tools.parseReadingProgram(bad), null, JSON.stringify(bad));
  }
  const explicit = { ...good, sessions: [{ from: 40, to: 70 }, { from: 200, to: 300 }, { from: 40, to: 70 }] };
  assert.deepEqual(plain(tools.parseReadingProgram(explicit)), explicit, 'gaps and revisiting are explicit choices, not an invented full-book claim');
});

test('reader, discovery, start and existing signup destination preserve the exact public selection', () => {
  const e = tools.getReadingEdition('relativity'), context = { bookId: e.bookId, editionId: e.editionId, from: 101, to: 200 };
  const circle = '11111111-1111-4111-8111-111111111111';
  for (const href of [tools.readingDiscoveryHref(context), tools.readingStartHref(context)]) {
    const url = new URL(href, 'https://offline.invalid');
    assert.deepEqual(plain(tools.parseReadingContext(url.searchParams)), { context, invalid: false });
    assert.equal(url.searchParams.has('memberId'), false);
    assert.equal(app.load('lib/auth/loginForm.ts').getSafeNextPath(href), href);
    const login = new URL('/login', url.origin); login.searchParams.set('mode', 'signup'); login.searchParams.set('next', href);
    assert.equal(app.load('lib/auth/loginForm.ts').getSafeNextPath(login.searchParams.get('next')), href);
  }
  const url = new URL(tools.readingReaderHref(context, context, circle), 'https://offline.invalid');
  assert.equal(url.pathname, '/great-books/relativity');
  assert.deepEqual(plain(tools.parseReaderContext('relativity', url.searchParams)), { context, circleId: circle, invalid: false });
  assert.equal(tools.readingReturnHref('relativity', url.search), url.pathname + url.search);
  const signup = new URL('/login', url.origin); signup.searchParams.set('mode', 'signup'); signup.searchParams.set('next', tools.readingReturnHref('relativity', url.search));
  assert.equal(app.load('lib/auth/loginForm.ts').getSafeNextPath(signup.searchParams.get('next')), url.pathname + url.search);
  assert.throws(() => tools.readingReaderHref(context, context, '//evil.invalid'));
});

test('partial, duplicate and stale link context is explicit failure rather than a broader or remapped selection', () => {
  const e = tools.getReadingEdition('apology');
  const valid = tools.readingContextParams({ bookId: e.bookId, editionId: e.editionId, from: 43, to: 124 });
  for (const key of ['book', 'edition', 'from', 'to']) {
    const missing = new URLSearchParams(valid); missing.delete(key);
    assert.equal(tools.parseReadingContext(missing).invalid, true);
    const duplicate = new URLSearchParams(valid); duplicate.append(key, valid.get(key));
    assert.equal(tools.parseReadingContext(duplicate).invalid, true);
  }
  for (const bad of ['01', '1.0', '-0', '1e1', 'Infinity', '999999', 'https://evil.invalid']) {
    const query = new URLSearchParams(valid); query.set('from', bad);
    assert.equal(tools.parseReadingContext(query).invalid, true);
  }
  const reader = new URLSearchParams(valid); reader.delete('book'); reader.set('circle', 'invalid');
  assert.equal(tools.parseReaderContext('apology', reader).invalid, true);
  const wrongBook = new URLSearchParams(valid); wrongBook.delete('book');
  assert.equal(tools.parseReaderContext('hamlet', wrongBook).invalid, true);
});

test('stable source headings select real ranges and only two starter readings claim local bindings', () => {
  const e = tools.getReadingEdition('meditations');
  assert.deepEqual(plain(tools.readingSelectionAt(e, 80)), { from: 78, to: 94 });
  assert.equal(tools.readingSessionLabel(e, { from: 78, to: 94 }), 'THE SECOND BOOK — before THE THIRD BOOK');
  assert.equal(tools.readingSelectionAt(e, -1), null);
  assert.equal(tools.readingSelectionAt(e, e.blockCount), null);
  for (let week = 1; week <= 12; week++) {
    const context = tools.starterReadingContext(week);
    if (![2, 5].includes(week)) assert.equal(context, null);
    else assert.ok(tools.parseReadingProgram({ version: 1, bookId: context.bookId, editionId: context.editionId, sessions: [{ from: context.from, to: context.to }] }));
  }
  assert.equal(tools.starterReadingContext(5).from, 60);
  assert.equal(tools.starterReadingContext(5).to, 94);
  assert.match(tools.readingEditionLabel(e), /Meric Casaubon/);
});

test('a changed heading index cannot inherit a formerly matched edition context', async () => {
  const metadata = await app.load('lib/books/editions.ts').readBookEdition('apology');
  const e = tools.getReadingEdition('apology');
  const changed = plain(metadata); changed.edition.contents[0].readingIndex = 1;
  assert.equal(tools.matchesReadingEdition(changed, e), false);
  changed.edition.contents = plain(e.contents); changed.edition.blockCount--;
  assert.equal(tools.matchesReadingEdition(changed, e), false);
});
