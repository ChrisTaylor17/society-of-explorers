import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../package.json', import.meta.url));
const React = require('react');
const ts = require('typescript');
const { renderToStaticMarkup } = require('react-dom/server');
const root = new URL('../../../', import.meta.url);
const source = fs.readFileSync(new URL('app/data-layer/page.tsx', root), 'utf8');
const loaded = { exports: {} };
const mocks = {
  'react/jsx-runtime': require('react/jsx-runtime'),
  'next/link': { default: function Link({ children, prefetch, ...props }) { assert.equal(prefetch, false); return React.createElement('a', props, children); } },
  '@/components/PublicNav': { default: () => null },
  '@/components/PublicFooter': { default: () => null },
};
new vm.Script(`(function(require,module,exports){${ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText}\n})`).runInNewContext({})(name => { assert.ok(name in mocks); return mocks[name]; }, loaded, loaded.exports);
const html = renderToStaticMarkup(React.createElement(loaded.exports.default));
const text = html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

test('data architecture is a readable research direction without a live custody, token or venue claim', () => {
  for (const phrase of ['Proposed architecture.', 'does not establish decentralized custody, token rewards or property access', 'does not establish an operating Society venue', 'no earnings, staking, redemption, voting right or investment']) assert.ok(text.includes(phrase), phrase);
  assert.doesNotMatch(text, /Mint your soulbound|No company can delete your account|Earn \$EXP daily|\+50 EXP\/day|first node|COMING SOON|Reserve a founding dinner seat/i);
  assert.match(html, /<main id="main" tabindex="-1"/);
  assert.doesNotMatch(html, /<button\b|<form\b|<iframe\b/);
});

test('physical and decentralized ideas remain named alongside simpler alternatives and review needs', () => {
  for (const phrase of ['TribeKey', 'Crystal Hub', 'ExploreOS', 'Ordinary payment and written agreements', 'A token only if it solves a demonstrated problem', 'qualified review', 'organizational and ownership model remains under review']) assert.ok(text.includes(phrase), phrase);
});

test('all build-with-us actions open existing public reading and planning pages', () => {
  const links = [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(links, ['/try', '/salons/pilot']);
  for (const href of links) assert.ok(fs.existsSync(new URL(`app${href}/page.tsx`, root)), href);
  assert.doesNotMatch(source, /minmax\((?:260|300)px|overflowX: 'hidden'/);
  assert.match(source, /flexWrap: 'wrap'/);
});
