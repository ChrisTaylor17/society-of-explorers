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
const trialFile = new URL('app/try/page.tsx', root);
const trialSource = fs.readFileSync(trialFile, 'utf8');
const imports = [];

function renderTrial() {
  const source = ts.transpileModule(trialSource, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const loaded = { exports: {} };
  const mocks = {
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/link': { default: function Link({ children, prefetch, ...props }) {
      assert.equal(prefetch, false, 'Trial links should wait for the visitor to choose a destination');
      return React.createElement('a', props, children);
    } },
    '../fellowship/fellowship.module.css': { default: new Proxy({}, { get: (_, key) => String(key) }) },
  };
  new vm.Script(`(function(require,module,exports){${source}\n})`).runInNewContext({})(name => {
    imports.push(name);
    assert.ok(name in mocks, `Unreviewed dependency on the public trial page: ${name}`);
    return mocks[name];
  }, loaded, loaded.exports);
  return { html: renderToStaticMarkup(React.createElement(loaded.exports.default)), metadata: loaded.exports.metadata };
}

const cleanText = value => value.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const rendered = renderTrial();
const links = [...rendered.html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(match => ({ href: match[1].replace(/&amp;/g, '&'), text: cleanText(match[2]) }));

test('public trial renders usable links without a session, browser storage or network dependency', () => {
  assert.deepEqual([...new Set(imports)].sort(), ['../fellowship/fellowship.module.css', 'next/link', 'react/jsx-runtime']);
  assert.match(rendered.html, /<main id="main" tabindex="-1"/);
  assert.equal((rendered.html.match(/<h1\b/g) || []).length, 1);
  assert.ok(links.some(link => link.href === '#main'));
  assert.doesNotMatch(rendered.html, /<form\b|<input\b|<iframe\b|<script\b/);
  assert.ok(links.filter(link => link.href.startsWith('/')).length > 5);
});

test('each local trial destination exists and each in-page jump has a target', () => {
  for (const link of links) {
    if (link.href.startsWith('#')) {
      assert.ok(rendered.html.includes(`id="${link.href.slice(1)}"`), link.href);
    } else if (link.href.startsWith('/')) {
      const url = new URL(link.href, 'https://soe.invalid');
      const page = url.pathname === '/great-books/apology' ? 'app/great-books/[bookId]/page.tsx' : `app${url.pathname === '/' ? '' : url.pathname}/page.tsx`;
      assert.ok(fs.existsSync(new URL(page, root)), `Missing page ${link.href}`);
      assert.notEqual(url.pathname, '/login', 'Public trial tasks must not send visitors to sign-in');
      assert.ok(!url.pathname.startsWith('/api/'), 'User tasks link to reading pages rather than private actions');
    } else {
      assert.ok(link.href.startsWith('mailto:'), `Unexpected external destination ${link.href}`);
    }
  }
  for (const href of ['/great-books/apology', '/fellowship/scripture', '/salons/pilot']) assert.ok(links.some(link => link.href === href), href);
  assert.equal(rendered.metadata.alternates.canonical, '/try');
});

test('the invitation states what can be tried and does not imply a booked meeting or live customer validation', () => {
  const content = cleanText(rendered.html);
  for (const statement of [
    'No account, payment or wallet is needed.',
    'no confirmed host or dates',
    'does not book a meeting or reserve a place',
    'Prayer is optional',
    'Root Kernel remains a distinct study project',
    'AI-assisted analysis can be questioned',
  ]) assert.ok(content.includes(statement), statement);
  assert.doesNotMatch(content, /join \d+ members|guaranteed|book now|reserve now|free trial expires|TODO|coming soon|placeholder/i);
});

test('feedback stays a user-reviewed email draft with a direct-address fallback', () => {
  const feedback = links.find(link => link.text === 'Write feedback to Chris');
  assert.ok(feedback);
  const url = new URL(feedback.href);
  assert.equal(url.protocol, 'mailto:');
  assert.equal(url.pathname, 'chris@societyofexplorers.com');
  assert.equal(url.searchParams.get('subject'), 'SoE — my first visit');
  assert.match(url.searchParams.get('body'), /Page I tried:\n\n/);
  assert.ok(links.some(link => link.href === 'mailto:chris@societyofexplorers.com'));
  assert.match(cleanText(rendered.html), /draft in your email app for you to review and send/);
  assert.match(cleanText(rendered.html), /leave out passwords, payment information and private conversation text/);
});

test('homepage hero points first to the public trial and keeps Circle discovery available', () => {
  const home = fs.readFileSync(new URL('app/HomePageClient.tsx', root), 'utf8');
  const hero = home.slice(home.indexOf('{/* HERO */}'), home.indexOf('<FellowshipInvitation'));
  const destinations = [...hero.matchAll(/<Link\b[^>]*href=("[^"]+"|\{[^}]+\})/g)].map(match => match[1]);
  assert.deepEqual(destinations, ['"/try"', '{ONLINE_CIRCLES_HREF}']);
  assert.match(hero, /No account or payment is needed to explore them\./);
});

test('leaderboard recovery links lead to an existing community directory in every display state', () => {
  const source = ts.transpileModule(fs.readFileSync(new URL('app/leaderboard/page.tsx', root), 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  for (const state of ['checking', 'unavailable', 'error', 'invalid', 'timeout']) {
    let stateIndex = 0;
    const mocks = {
      react: { ...React, useState: initial => [stateIndex++ === 0 ? state : initial, () => {}], useRef: () => ({ current: null }), useEffect: () => {} },
      'react/jsx-runtime': require('react/jsx-runtime'),
      '@/components/PublicFooter': { default: () => null },
    };
    const loaded = { exports: {} };
    new vm.Script(`(function(require,module,exports){${source}\n})`).runInNewContext({})(name => {
      assert.ok(name in mocks, `Unreviewed dependency ${name}`);
      return mocks[name];
    }, loaded, loaded.exports);
    const html = renderToStaticMarkup(React.createElement(loaded.exports.default));
    assert.doesNotMatch(html, /href="\/community"/);
    assert.equal((html.match(/href="\/explore"/g) || []).length, 2, state);
  }
  assert.ok(fs.existsSync(new URL('app/explore/page.tsx', root)));
});

test('homepage no longer mounts the seeded collaboration prototype or touches its storage and sync hooks', () => {
  const home = fs.readFileSync(new URL('app/HomePageClient.tsx', root), 'utf8');
  const source = ts.transpileModule(home, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const mocks = {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/link': { default: function Link({ children, prefetch, ...props }) {
      assert.equal(prefetch, false);
      return React.createElement('a', props, children);
    } },
    '@/components/PublicNav': { default: () => null },
    '@/components/PublicFooter': { default: () => null },
    '@/components/FellowshipInvitation': { default: () => null },
    '@/lib/analytics/client': { track: () => { throw Error('SSR may not record an action'); } },
    '@/lib/circles/discovery': { ONLINE_CIRCLES_HREF: '/circles?format=online' },
    '@/lib/feed/pulseClient': { fetchPulse: () => { throw Error('SSR may not load live questions'); } },
  };
  const loaded = { exports: {} };
  new vm.Script(`(function(require,module,exports){${source}\n})`).runInNewContext({})(name => {
    assert.ok(name in mocks, `Homepage may not import a prototype dependency: ${name}`);
    return mocks[name];
  }, loaded, loaded.exports);
  const html = renderToStaticMarkup(React.createElement(loaded.exports.default));
  assert.doesNotMatch(html, /network-handshake|Current role|Local pod queue|Local change queue|Project workspace|Profile questions|Systems Architect|multisig|payout/i);
  assert.match(html, /href="\/try"/);
  assert.match(html, /href="\/structure"/);
  assert.match(cleanText(html), /venture-building model is a proposal/);
  assert.doesNotMatch(home, /usePodSync|useProjectEscrow|PhilosophicalSurvey|CollaborationSandbox|CollaborationPrototype|localStorage/);
});

test('the extracted collaboration prototype retains its existing keys and stays off public routes', () => {
  const prototype = fs.readFileSync(new URL('components/workspace/CollaborationPrototype.tsx', root), 'utf8');
  for (const value of ['soe:homepage-pod-key:v1', 'soe:homepage-explorer-graph:v1', 'createHomepageExplorerGraph', 'buildHomepagePodEnvelope', 'CollaborationSandbox', 'PhilosophicalSurvey']) assert.ok(prototype.includes(value), value);
  assert.match(prototype, /autoSync: false/);
  assert.match(prototype, /stream: false/);
  const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(new URL(entry.name + '/', directory)) : entry.name.endsWith('.tsx') || entry.name.endsWith('.ts') ? [new URL(entry.name, directory)] : []);
  for (const file of walk(new URL('app/', root))) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /(?:from\s*|import\s*\()['"][^'"]*CollaborationPrototype/, file.pathname);
  }
});
