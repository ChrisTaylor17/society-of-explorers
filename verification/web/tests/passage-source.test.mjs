import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { offlineApp } from './support/offline-app.mjs';

const { JSDOM } = createRequire(path.resolve('tooling/package.json'))('jsdom');
const app = offlineApp();
const p = app.load('lib/books/passages.ts'), text = app.load('lib/books/passage-text.ts');
const source = app.load('lib/books/passage-source.ts'), route = app.load('app/api/great-books/passage/route.ts');
const pins = p.passageCatalog();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const ref = (pin = pins[0], extra = {}) => ({ version: 1, bookId: pin.bookId, editionId: pin.editionId, blockIndex: 0, start: null, end: null, ...extra });
const indexFor = pin => JSON.parse(fs.readFileSync(`../../content/great-books/${pin.bookId}/passages.json`, 'utf8'));
const errorStatus = status => error => error.status === status;

for (const pin of pins) {
  test(`${pin.bookId}: public source resolves exact edition, hash, attribution and UTF16 substring`, async () => {
    const folder = `../../content/great-books/${pin.bookId}`;
    const bytes = fs.readFileSync(`${folder}/passages.json`), index = JSON.parse(bytes);
    assert.equal(bytes.length, pin.indexBytes); assert.equal(sha(bytes), pin.indexSha256);
    assert.equal(sha(fs.readFileSync(`${folder}/reader.html`)), pin.documentSha256);
    assert.equal(index.metadataSha256, pin.metadataSha256); assert.equal(index.blocks.length, pin.blockCount);
    const blockIndex = index.blocks.findIndex(block => !block.reason && block.text.length >= 12);
    const end = index.blocks[blockIndex].text.slice(0, 12).trimEnd().length;
    const quoteReference = ref(pin, { blockIndex, start: 0, end });
    const resolved = await source.resolvePassage(quoteReference);
    assert.equal(resolved.quote, index.blocks[blockIndex].text.slice(0, end));
    assert.equal(resolved.sourceHash, pin.documentSha256); assert.equal(resolved.metadata.edition.editionId, pin.editionId);
    assert.equal(resolved.contentSuffix.includes(resolved.metadata.edition.attribution.replace(/\s+/gu, ' ').trim()), true);
    assert.equal(p.parseBookPassage(JSON.parse(JSON.stringify(resolved))).quote, resolved.quote);
    const content = p.formatPassageMessage('My own question.', resolved);
    assert.equal(content, `My own question.\n\n${resolved.contentSuffix}`);
    assert.equal(p.formatPassageMessage('x'.repeat(resolved.commentLimit + 1), resolved), null);
    assert.equal(p.formatPassageMessage('', resolved), null);
    assert.equal(p.passageReferenceFromMessage(content).blockIndex, blockIndex);
    const query = new URLSearchParams({ book: pin.bookId, edition: pin.editionId, block: String(blockIndex), start: '0', end: String(end) });
    const response = await route.GET(new Request(`https://offline.invalid/api/great-books/passage?${query}`));
    assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal((await response.json()).quote, resolved.quote);
  });
}

test('all 10,198 derivative blocks preserve text order, explicit breaks, and nontext/table fallback', () => {
  let total = 0, nonText = 0;
  for (const pin of pins) {
    const dom = new JSDOM(fs.readFileSync(`../../content/great-books/${pin.bookId}/reader.html`, 'utf8'));
    try {
      const elements = [...dom.window.document.querySelectorAll('[data-reading-index]')], index = indexFor(pin);
      assert.equal(elements.length, pin.blockCount);
      elements.forEach((element, i) => {
        assert.equal(element.dataset.readingIndex, String(i));
        const reason = text.passageBlockReason(element), canonical = text.canonicalPassageText(element);
        assert.equal(index.blocks[i].reason, reason || (canonical ? null : 'empty'));
        assert.equal(index.blocks[i].text, reason || !canonical ? null : canonical);
        if (reason) nonText++;
      }); total += elements.length;
    } finally { dom.window.close(); }
  }
  assert.equal(total, 10198); assert.ok(nonText > 20, 'Equations and source images must not become partial quotations');
});

test('canonical extraction folds only ordinary wrapping and retains explicit verse/PRE/Unicode', () => {
  const dom = new JSDOM('<p>“A  &amp;\n B”<br>Second\n line — 🙂.</p><pre>  One\n    Two\nThree  </pre><pre><span>  X\n   Y  </span></pre>');
  try {
    const d = dom.window.document;
    assert.equal(text.canonicalPassageText(d.querySelector('p')), '“A & B”\nSecond line — 🙂.');
    assert.equal(text.canonicalPassageText(d.querySelector('pre')), 'One\n    Two\nThree');
    assert.equal(text.canonicalPassageText(d.querySelector('span')), 'X\n   Y');
  } finally { dom.window.close(); }
});

function selectionFixture(html) {
  const dom = new JSDOM(html), d = dom.window.document, blocks = [...d.querySelectorAll('[data-reading-index]')];
  const metadata = { bookId: pins[0].bookId, edition: { editionId: pins[0].editionId, blockCount: blocks.length } };
  return { dom, d, blocks, metadata, select(a, start, b = a, end = a.textContent.length) { const range = d.createRange(); range.setStart(a, start); range.setEnd(b, end); const selection = d.getSelection(); selection.removeAllRanges(); selection.addRange(range); return text.capturePassageSelection(d, blocks, metadata); } };
}
test('capture binds the selected occurrence and keeps inline text/BR coordinates exact', () => {
  const f = selectionFixture('<p data-reading-index="0">same <i>same</i><br>Last 🙂 line</p>');
  try {
    const inline = f.d.querySelector('i').firstChild, result = f.select(inline, 0, inline, 4);
    assert.equal(result.ok, true); assert.equal(result.reference.start, 5); assert.equal(result.reference.end, 9); assert.equal(result.selectedText, 'same');
    const last = f.blocks[0].lastChild, verse = f.select(inline, 0, last, last.length);
    assert.equal(verse.ok, true); assert.equal(verse.selectedText, 'same\nLast 🙂 line');
    assert.equal(text.canonicalPassageText(f.blocks[0]).slice(verse.reference.start, verse.reference.end), verse.selectedText);
    const split = f.select(last, 5, last, 6); assert.equal(split.ok, false);
  } finally { f.dom.window.close(); }
});
test('capture refuses cross-block, oversized and image/table partial quotation; link fallback is explicit', () => {
  const f = selectionFixture(`<p data-reading-index="0">${'a'.repeat(601)}</p><p data-reading-index="1">Text <img src="/local.png" alt="formula"> after</p><table><tr><td data-reading-index="2">Table text</td></tr></table>`);
  try {
    assert.equal(f.select(f.blocks[0].firstChild, 0, f.blocks[1].firstChild, 4).ok, false);
    const long = f.select(f.blocks[0].firstChild, 0); assert.equal(long.ok, false); assert.equal(long.reference.start, null);
    for (const i of [1, 2]) { const result = f.select(f.blocks[i].firstChild, 0); assert.equal(result.ok, false); assert.equal(result.reference.blockIndex, i); assert.equal(result.reference.start, null); }
    f.metadata.edition.blockCount++; assert.equal(f.select(f.blocks[0].firstChild, 0, f.blocks[0].firstChild, 3).ok, false);
  } finally { f.dom.window.close(); }
});

for (const tail of ['&start=x&end=y', '&start=0', '&start=1&end=0', '&start=0&end=601', '&start=01&end=3', '&block=0', '&comment=private', '&url=https://evil.invalid']) {
  test(`public source refuses malformed or extra query: ${tail}`, async () => {
    const query = new URLSearchParams({ book: pins[0].bookId, edition: pins[0].editionId, block: '0' });
    const response = await route.GET(new Request(`https://offline.invalid/api/great-books/passage?${query}${tail}`));
    assert.equal(response.status, 400); assert.doesNotMatch(await response.text(), /private|evil\.invalid/);
  });
}
test('reader and composer intent reject duplicate/mixed contexts without silently becoming source links', () => {
  const r = ref();
  const valid = new URL(p.passageReaderHref(r), 'https://offline.invalid');
  assert.equal(p.parsePassageReaderIntent(r.bookId, valid.searchParams).invalid, false);
  for (const tail of ['&from=0&to=9', '&circle=11111111-1111-4111-8111-111111111111', '&passageStart=x&passageEnd=y', '&passageStart=0', '&passageBlock=0']) {
    const query = new URLSearchParams(valid.search.slice(1) + tail);
    assert.equal(p.parsePassageReaderIntent(r.bookId, query).invalid, true);
  }
  const circle = '11111111-1111-4111-8111-111111111111';
  assert.equal(p.parsePassageComposeIntent(new URL(p.passageComposeHref(null, circle), 'https://offline.invalid').searchParams).circleId, circle);
  assert.equal(p.parsePassageComposeIntent(new URLSearchParams('book=hamlet')).invalid, true);
  assert.equal(p.parsePassageComposeIntent(new URLSearchParams(`circle=${circle}&comment=secret`)).invalid, true);
  assert.equal(p.passageReferenceFromMessage('hint\nhttps://evil.invalid' + p.passageReaderHref(r)), null);
  assert.equal(p.parsePassageReference({ ...r, quote: 'forged' }), null);
});
test('changed edition, invalid bounds and nontext quotation fail explicitly; block link still resolves', async () => {
  const pin = pins.find(item => item.bookId === 'relativity'), index = indexFor(pin);
  await assert.rejects(source.resolvePassage(ref(pin, { editionId: pin.editionId.replace(/[a-f0-9]$/u, pin.editionId.endsWith('0') ? '1' : '0') })), errorStatus(409));
  await assert.rejects(source.resolvePassage(ref(pin, { blockIndex: pin.blockCount })), errorStatus(400));
  const blockIndex = index.blocks.findIndex(block => block.reason === 'non_text'); assert.ok(blockIndex >= 0);
  await assert.rejects(source.resolvePassage(ref(pin, { blockIndex, start: 0, end: 1 })), errorStatus(400));
  const linked = await source.resolvePassage(ref(pin, { blockIndex })); assert.equal(linked.quote, null); assert.equal(linked.blockText, null); assert.equal(linked.reason, 'non_text');
});

function isolatedSource() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'soe-passage-source-'));
  for (const directory of ['lib', 'tests/security', 'content/root-kernel']) fs.cpSync(path.resolve('../..', directory), path.join(root, directory), { recursive: true });
  fs.copyFileSync('../../package.json', path.join(root, 'package.json'));
  fs.symlinkSync(fs.realpathSync('../../node_modules'), path.join(root, 'node_modules'));
  const book = pins[0].bookId, folder = path.join(root, 'content/great-books', book); fs.mkdirSync(folder, { recursive: true });
  for (const name of ['reader.html', 'manifest.json', 'passages.json']) fs.copyFileSync(`../../content/great-books/${book}/${name}`, path.join(folder, name));
  return { root, folder, close: () => fs.rmSync(root, { recursive: true, force: true }) };
}
for (const kind of ['reader', 'index', 'credit', 'rights']) {
  test(`actual isolated ${kind} bytes changed: resolver refuses without exposing source detail`, async () => {
    const f = isolatedSource();
    try {
      if (kind === 'reader') fs.appendFileSync(path.join(f.folder, 'reader.html'), '\n');
      if (kind === 'index') fs.appendFileSync(path.join(f.folder, 'passages.json'), ' ');
      if (kind === 'credit' || kind === 'rights') {
        const file = path.join(f.folder, 'manifest.json'), manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (kind === 'credit') manifest.metadata.sourceTitle += ' forged credit';
        else manifest.metadata.rights.outsideUS = 'public-domain';
        fs.writeFileSync(file, JSON.stringify(manifest));
      }
      const isolated = offlineApp({ root: f.root }).load('lib/books/passage-source.ts');
      await assert.rejects(isolated.resolvePassage(ref()), error => error.status === 503 && !/forged|reader\.html|manifest\.json/u.test(error.message));
    } finally { f.close(); }
  });
}
