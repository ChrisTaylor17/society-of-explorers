import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../package.json', import.meta.url));
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');
const root = new URL('../../../', import.meta.url);
const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX };
const source = fs.readFileSync(new URL('app/travel/page.tsx', root), 'utf8');
const loaded = { exports: {} };
const imports = [];
const mocks = {
  'react/jsx-runtime': require('react/jsx-runtime'),
  'next/link': { default: function Link({ children, prefetch, ...props }) {
    assert.equal(prefetch, false);
    return React.createElement('a', props, children);
  } },
  '../fellowship/fellowship.module.css': { default: new Proxy({}, { get: (_, key) => String(key) }) },
};
new vm.Script(`(function(require,module,exports){${ts.transpileModule(source, { compilerOptions }).outputText}\n})`).runInNewContext({})(name => {
  imports.push(name);
  assert.ok(name in mocks, `Public reading route must not import a remote, member, scan or booking dependency: ${name}`);
  return mocks[name];
}, loaded, loaded.exports);
const html = renderToStaticMarkup(React.createElement(loaded.exports.default));
const text = html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const hrefs = [...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(match => match[1].replace(/&amp;/g, '&'));

test('travel page renders its full reading itinerary with no account, wallet, scan or browser dependency', () => {
  assert.deepEqual([...new Set(imports)].sort(), ['../fellowship/fellowship.module.css', 'next/link', 'react/jsx-runtime']);
  assert.match(html, /<main id="main" tabindex="-1"/);
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.equal((html.match(/<article\b/g) || []).length, 6);
  assert.doesNotMatch(html, /<button\b|<input\b|<form\b|<iframe\b|<script\b|opacity:0/);
  assert.match(html, /<details><summary>Three prompts to bring along<\/summary>/);
});

test('every reading and recovery link resolves to an existing local page and catalog work', () => {
  const catalog = { exports: {} };
  const catalogSource = fs.readFileSync(new URL('lib/books/catalog.ts', root), 'utf8');
  new vm.Script(`(function(module,exports){${ts.transpileModule(catalogSource, { compilerOptions }).outputText}\n})`).runInNewContext({})(catalog, catalog.exports);
  for (const href of hrefs) {
    if (href.startsWith('#')) {
      assert.ok(html.includes(`id="${href.slice(1)}"`), href);
      continue;
    }
    assert.ok(href.startsWith('/'), `Unexpected external service ${href}`);
    const url = new URL(href, 'https://soe.invalid');
    const book = url.pathname.match(/^\/great-books\/([^/]+)$/);
    const page = book ? 'app/great-books/[bookId]/page.tsx' : `app${url.pathname === '/' ? '' : url.pathname}/page.tsx`;
    assert.ok(fs.existsSync(new URL(page, root)), href);
    if (book) assert.ok(catalog.exports.getBook(book[1]), `Unknown reading ${book[1]}`);
  }
  assert.ok(hrefs.includes('/great-books/apology'));
  assert.ok(hrefs.includes('/great-books/scripture/luke-good-samaritan#scripture'));
  assert.ok(hrefs.includes('/salons/pilot'));
});

test('earlier destination ideas remain proposals without invented traveler, biometric or financial evidence', () => {
  for (const place of ['Athens', 'Kyoto', 'Medellín', 'Lisbon', 'Marrakech', 'Reykjavík']) assert.ok(text.includes(place));
  assert.ok(text.includes('thematic reading ideas, not researched travel itineraries or claims about a local culture'));
  assert.ok(text.includes('Shared physical spaces, travel meetups and VR visits remain future directions'));
  assert.ok(text.includes('There are no travel bookings, live traveler profiles, earned rewards or verified passport records here.'));
  assert.ok(text.includes('Its host and dates are unconfirmed; it does not book a meeting.'));
  assert.doesNotMatch(text, /Elena M|James K|Sofia A|0042|1,?240|EEG|HRV|VERIFIED ON BASE|book with crypto|launch preview|10-50|40%|COMING SOON|TODO|placeholder/i);
});

test('the replacement retains original reflection prompts and a consent-aware human conversation path', () => {
  for (const statement of ['Before:', 'During:', 'After:', 'Distinguish what you observe from what you infer.', 'Ask permission before recording', 'A person can listen, disagree or pass.']) assert.ok(text.includes(statement), statement);
  assert.ok(hrefs.includes('/try#feedback'));
  assert.ok(hrefs.includes('/fellowship'));
});
