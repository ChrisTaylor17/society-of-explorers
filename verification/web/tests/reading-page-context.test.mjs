import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { offlineApp } from './support/offline-app.mjs';
const require = createRequire(path.resolve('../../package.json')), React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { JSDOM } = createRequire(path.resolve('tooling/package.json'))('jsdom');
function setup() {
  const app = offlineApp();
  app.setMock('next/link', () => ({ __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) }));
  const css = () => ({ __esModule: true, default: new Proxy({}, { get: (_t, key) => key }) });
  for (const name of ['./safety.module.css', './participation.module.css', '../participation.module.css', '../../participation.module.css', './reading-program.module.css', './reading.module.css', '../circles/passages/passage.module.css']) app.setMock(name, css);
  return app;
}
test('directory primary Start action carries exact valid public context and invalid links require an explicit new plan', async () => {
  const app = setup(), tools = app.load('lib/circles/reading-program.ts'), e = tools.getReadingEdition('hamlet');
  const Page = app.load('app/circles/page.tsx').default;
  for (const [search, valid] of [[{ book: 'hamlet', edition: e.editionId, from: '40', to: '150' }, true], [{ book: 'hamlet', edition: e.editionId }, true], [{ book: 'hamlet', edition: 'forged', from: '40', to: '150' }, false]]) {
    const markup = renderToStaticMarkup(await Page({ searchParams: Promise.resolve(search) }));
    const dom = new JSDOM(markup, { url: 'https://offline.invalid/circles' });
    try {
      const first = dom.window.document.querySelector('main a[href^="/circles/start"]'); assert.ok(first);
      const parsed = tools.parseReadingContext(new URL(first.href).searchParams);
      if (valid) { assert.equal(parsed.invalid, false); assert.equal(parsed.context.editionId, e.editionId); assert.equal(parsed.context.from, search.from ? 40 : 0); assert.equal(parsed.context.to, search.to ? 150 : e.blockCount - 1); }
      else { assert.equal(new URL(first.href).search, ''); assert.equal(first.textContent, 'Choose a new reading plan'); }
      assert.ok(dom.window.document.querySelector('main').className.includes('scope'));
    } finally { dom.window.close(); }
  }
});
test('reader page preserves duplicate context fields until strict validation, without echoing unrelated query data', async () => {
  const app = setup(), e = app.load('lib/circles/reading-program.ts').getReadingEdition('hamlet');
  const Page = app.load('app/great-books/[bookId]/page.tsx').default;
  const result = await Page({ params: Promise.resolve({ bookId: 'hamlet' }), searchParams: Promise.resolve({ edition: e.editionId, from: ['40', '40'], to: '150', memberId: 'forged-actor', onlineUrl: 'PRIVATE_UNTRUSTED_HINT' }) });
  const parsed = app.load('lib/circles/reading-program.ts').parseReaderContext('hamlet', new URLSearchParams(result.props.search));
  assert.equal(parsed.invalid, true);
  assert.doesNotMatch(result.props.search, /memberId|onlineUrl|PRIVATE_UNTRUSTED_HINT/);
});
test('all starter guides retain a validated Circle return; only the two verified editions offer local reading', async () => {
  const app = setup(), Page = app.load('app/circles/path/[week]/page.tsx').default;
  const id = '11111111-1111-4111-8111-111111111111';
  for (let week = 1; week <= 12; week++) {
    const markup = renderToStaticMarkup(await Page({ params: Promise.resolve({ week: String(week) }), searchParams: Promise.resolve({ circle: id }) }));
    const dom = new JSDOM(markup, { url: 'https://offline.invalid' });
    try {
      assert.ok(dom.window.document.querySelector(`a[href="/circles/${id}"]`));
      const reader = dom.window.document.querySelector('a[href^="/great-books/"]');
      assert.equal(Boolean(reader), [2, 5].includes(week));
      if (reader) assert.equal(new URL(reader.href).searchParams.get('circle'), id);
      for (const link of dom.window.document.querySelectorAll('nav[aria-label="Other weeks"] a[href^="/circles/path/"]')) assert.equal(new URL(link.href).searchParams.get('circle'), id);
      assert.doesNotMatch(dom.window.document.querySelector('main').textContent, /free, public domain|linked public-domain editions/);
    } finally { dom.window.close(); }
  }
});
