import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript'), React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const pin = JSON.parse(fs.readFileSync(path.join(root, 'content/great-books/apology/manifest.json'), 'utf8')).editionId;

// Load actual public edition/parser/component modules. There are no account,
// provider or transport doubles: those imports and network calls are forbidden.
function app({ unavailable = false } = {}) {
  const cache = new Map();
  const context = vm.createContext({ console, URL, URLSearchParams, Headers, Buffer,
    process: { cwd: () => root }, fetch: () => { throw Error('No network in the public reader test'); } });
  const styles = { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
  function load(relative) {
    const filename = path.resolve(root, relative);
    assert.ok(filename.startsWith(`${root}${path.sep}`));
    assert.doesNotMatch(relative, /(?:auth|supabase|claude|providers)\//);
    if (cache.has(filename)) return cache.get(filename).exports;
    const loaded = { exports: {} }; cache.set(filename, loaded);
    if (filename.endsWith('.json')) { loaded.exports = JSON.parse(fs.readFileSync(filename, 'utf8')); return loaded.exports; }
    const source = fs.readFileSync(filename, 'utf8');
    const compiled = ts.transpileModule(source, { fileName: filename, compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText;
    function localRequire(specifier) {
      if (specifier === 'server-only') return {};
      if (specifier.endsWith('.css')) return styles;
      if (specifier === '../BookReader') return { __esModule: true,
        default: props => React.createElement('div', { 'data-enhanced-book': props.bookId, 'data-enhanced-search': props.search }) };
      if (unavailable && specifier === '@/lib/books/editions') return { readBookEdition: async () => { throw Error('Synthetic unavailable local edition'); } };
      if (specifier.startsWith('@/') || specifier.startsWith('.')) {
        let target = specifier.startsWith('@/') ? path.join(root, specifier.slice(2)) : path.resolve(path.dirname(filename), specifier);
        if (!fs.existsSync(target)) target = ['.ts', '.tsx', '.js'].map(ext => target + ext).find(fs.existsSync);
        assert.ok(target, specifier); return load(path.relative(root, target));
      }
      assert.ok(['node:crypto', 'node:fs/promises', 'node:path', 'react/jsx-runtime'].includes(specifier), specifier);
      return require(specifier);
    }
    new vm.Script(`(function(require,module,exports){${compiled}\n})`, { filename }).runInContext(context)(localRequire, loaded, loaded.exports);
    return loaded.exports;
  }
  return load;
}
const load = app(), reader = load('app/great-books/NoScriptBookReader.tsx');
const read = (search = '') => reader.readingWithoutScripts('apology', search);
const render = (reading, bookId = 'apology') => renderToStaticMarkup(React.createElement(reader.default, { bookId, reading }));

test('installed edition opens only its verified complete document with credit and library recovery', async () => {
  const reading = await read(); assert.equal(reading.status, 'ready');
  assert.equal(reading.metadata.edition.editionId, pin);
  const html = render(reading);
  assert.match(html, new RegExp(`/api/great-books/edition/apology\\?edition=${pin}`));
  assert.match(html, /Open the complete credited edition/);
  assert.match(html, /Benjamin Jowett/); assert.match(html, /Rights outside the United States have not been assessed/);
  assert.match(html, /href="\/great-books"/); assert.match(html, /Back button/);
  assert.doesNotMatch(html, /<iframe|<button|<form|<script|Loading the complete/);
});

test('unknown and unavailable editions provide recovery without partial text or an edition link', async () => {
  const unknown = await reader.readingWithoutScripts('not-a-local-book', '');
  assert.equal(unknown.status, 'missing');
  const unavailable = await app({ unavailable: true })('app/great-books/NoScriptBookReader.tsx').readingWithoutScripts('apology', '');
  assert.equal(unavailable.status, 'unavailable');
  for (const value of [unknown, unavailable]) {
    const html = render(value); assert.match(html, /role="status"/); assert.match(html, /href="\/great-books"/);
    assert.doesNotMatch(html, /Open the complete credited edition|\/api\/great-books\/edition/);
  }
});

test('requested edition must match exactly; never substitute a different edition', async () => {
  assert.equal((await read(`edition=${pin}`)).status, 'ready');
  const mismatch = await read(`edition=pg-1656-${'0'.repeat(64)}`);
  assert.equal(mismatch.status, 'mismatch');
  assert.match(render(mismatch), /No replacement edition has been opened/);
  assert.doesNotMatch(render(mismatch), /Open the complete credited edition/);
});

test('valid range and passage links preserve their edition and explain full-book positioning', async () => {
  for (const query of [`edition=${pin}&from=44&to=51`, `edition=${pin}&passageBlock=44`, `edition=${pin}&passageBlock=44&passageStart=0&passageEnd=10`]) {
    const reading = await read(query); assert.equal(reading.status, 'ready', query); assert.equal(reading.selection, true);
    const html = render(reading); assert.match(html, /without positioning or highlighting/);
    assert.equal(reading.metadata.edition.documentUrl, `/api/great-books/edition/apology?edition=${pin}`);
    assert.doesNotMatch(reading.metadata.edition.documentUrl, /from=|passageBlock=|#/);
  }
});

test('malformed, duplicate, mixed and out-of-bounds intents never receive an edition link', async () => {
  for (const query of ['edition=', `edition=${pin}&edition=${pin}`, 'edition=https://example.invalid', 'book=republic', 'circle=bad',
    'from=44&to=51', `edition=${pin}&from=44`, `edition=${pin}&from=-1&to=5`, `edition=${pin}&from=44&to=5000`,
    `edition=${pin}&passageBlock=125`, `edition=${pin}&passageBlock=44&passageStart=10`,
    `edition=${pin}&passageBlock=44&from=44&to=51`, `edition=${pin}&passageBlock=1&passageBlock=2`]) {
    const reading = await read(query); assert.equal(reading.status, 'invalid', query);
    assert.doesNotMatch(render(reading), /Open the complete credited edition/, query);
  }
});

test('page keeps enhanced-reader parameters and renders a no-script sibling for native navigation', async () => {
  const page = load('app/great-books/[bookId]/page.tsx').default;
  const html = renderToStaticMarkup(await page({ params: Promise.resolve({ bookId: 'apology' }),
    searchParams: Promise.resolve({ edition: pin, from: '44', to: '51', ignored: 'not-forwarded' }) }));
  assert.match(html, /<noscript>/); assert.match(html, /#scripted-book-reader \{ display: none; \}/);
  assert.match(html, /id="scripted-book-reader"/);
  assert.match(html, /data-enhanced-book="apology"/);
  assert.match(html, new RegExp(`data-enhanced-search="edition=${pin}&amp;from=44&amp;to=51"`));
  assert.doesNotMatch(html, /not-forwarded/);
  const invalid = renderToStaticMarkup(await page({ params: Promise.resolve({ bookId: 'apology' }), searchParams: Promise.resolve({ edition: [pin, pin] }) }));
  assert.match(invalid, /edition=.*&amp;edition=/); assert.doesNotMatch(invalid, /Open the complete credited edition/);
});
