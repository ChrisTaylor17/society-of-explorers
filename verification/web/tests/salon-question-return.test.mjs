import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const root = process.env.SOE_QUESTION_SOURCE || path.resolve(import.meta.dirname, '../../..');
const deps = createRequire(path.join(root, 'package.json'));
const ts = deps('typescript'), React = deps('react');
const { renderToStaticMarkup } = deps('react-dom/server');
const id = 'abcdef01-1111-4111-8111-111111111111';
const idle = { active: true, busy: false, uncertain: false, phase: 'idle', notice: 'Synthetic signed-out review', epoch: 0 };
const context = vm.createContext({ URL, URLSearchParams, console, process: { env: {} } });
const cache = new Map();
const Link = ({ href, children, ...props }) => {
  delete props.prefetch;
  return React.createElement('a', { ...props, href }, children);
};
const empty = () => null;
const doubles = new Map([
  ['next/link', Link], ['next/navigation', { notFound() { throw new Error('FIXTURE_NOT_FOUND'); } }],
  ['@/lib/circles/useCircleParticipation', { useCircleParticipation: () => idle }],
  ['@/lib/circles/useCircleAdmission', { useCircleAdmission: () => idle }],
  ['@/components/PublicFooter', empty], ['@/components/PublishedProfileLink', empty],
  ['../messages/CircleSafetyNav', ({ signInHref }) => React.createElement(Link, { href: signInHref }, 'Safety sign in')],
  ['../ReportButton', empty], ['./CircleConversation', empty], ['./CircleInviteShare', empty],
  ['../ReadingProgramSummary', empty],
]);

function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports;
  const filename = path.join(root, relative), loaded = { exports: {} };
  cache.set(relative, loaded);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const require = spec => {
    if (doubles.has(spec)) return doubles.get(spec);
    if (spec.endsWith('.css')) return {};
    if (spec === 'react' || spec === 'react/jsx-runtime') return deps(spec);
    if (spec.startsWith('.') || spec.startsWith('@/')) {
      const name = spec.startsWith('@/') ? 'src-placeholder/' + spec.slice(2) : path.normalize(path.join(path.dirname(relative), spec));
      const base = name.replace(/^src-placeholder\//, '');
      const target = [base, base + '.ts', base + '.tsx', base + '.json'].find(p => fs.existsSync(path.join(root, p)) && fs.statSync(path.join(root, p)).isFile());
      assert.ok(target, 'Missing local source ' + base);
      if (target.endsWith('.json')) return JSON.parse(fs.readFileSync(path.join(root, target), 'utf8'));
      return load(target);
    }
    throw new Error('Unexpected dependency: ' + spec);
  };
  new vm.Script('(function(require,module,exports){' + code + '\n})', { filename }).runInContext(context)(require, loaded, loaded.exports);
  return loaded.exports;
}

const circlePage = load('app/circles/[circleId]/page.tsx').default;
const admission = load('app/circles/[circleId]/admission/page.tsx');
const component = load('app/circles/[circleId]/CircleAdmission.tsx').default;
const decode = text => text.replaceAll('&amp;', '&').replaceAll('&#x27;', "'").replaceAll('&quot;', '"');
const links = html => [...html.matchAll(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gs)].map(([, href, label]) => ({ href: decode(href), label: label.replace(/<[^>]+>/g, '') }));
const href = (html, label) => { const match = links(html).find(row => row.label === label); assert.ok(match, label); return match.href; };
const renderPage = async (page, query = {}) => renderToStaticMarkup(await page({ params: Promise.resolve({ circleId: id.toUpperCase() }), searchParams: Promise.resolve(query) }));
const queryOf = url => Object.fromEntries(new URL(url, 'https://soe.invalid').searchParams);

test('Fellowship and Reel context survives detail to admission to details and sign-in return', async () => {
  for (const query of [{ fellowship: 'psalm-22' }, { fellowship: 'isaiah-53' }, { fellowship: 'josephus' }, { reel: 'night-sky-traffic' }, { reel: 'telescope-first-tilt' }, { reel: 'which-height' }, { reel: 'new-species' }]) {
    const initial = { from: 'online', ...query };
    const detail = await renderPage(circlePage, initial);
    const next = href(detail, 'Host approvals and private invitation codes');
    assert.deepEqual(queryOf(next), initial);
    assert.equal(new URL(next, 'https://soe.invalid').pathname, `/circles/${id}/admission`);
    const invite = await renderPage(admission.default, queryOf(next));
    assert.deepEqual(queryOf(href(invite, 'Salon details')), initial);
    const returnPath = queryOf(href(invite, 'Sign in')).next;
    assert.equal(new URL(returnPath, 'https://soe.invalid').pathname, `/circles/${id}/admission`);
    assert.deepEqual(queryOf(returnPath), initial);
    const resumed = await renderPage(admission.default, queryOf(returnPath));
    assert.equal(href(resumed, 'Salon details'), href(invite, 'Salon details'));
  }
});

test('admission entry preserves only one recognized public context and exact online flag', async () => {
  for (const query of [
    { fellowship: ['psalm-22', 'isaiah-53'] }, { reel: ['which-height', 'new-species'] },
    { fellowship: 'psalm-22', reel: 'which-height' }, { fellowship: 'unlisted-topic' },
    { reel: 'unlisted-reel' }, { from: ['online', 'online'] }, { from: 'https://other.invalid' },
  ]) {
    const html = await renderPage(admission.default, query);
    assert.equal(href(html, 'Salon details'), `/circles/${id}`);
    assert.equal(queryOf(href(html, 'Sign in')).next, `/circles/${id}/admission`);
  }
  const html = await renderPage(admission.default, { from: 'online', fellowship: 'psalm-22' });
  assert.deepEqual(queryOf(href(html, 'Salon details')), { from: 'online', fellowship: 'psalm-22' });
});

test('raw codes and arbitrary next targets are not copied into navigation', async () => {
  const html = await renderPage(admission.default, {
    from: 'online', fellowship: 'psalm-22', recipientCode: 'SYNTHETIC_PRIVATE_RECIPIENT',
    invitationToken: 'SYNTHETIC_PRIVATE_APPROVAL', next: 'https://foreign.invalid/collect', unexpected: 'SYNTHETIC_EXTRA',
  });
  assert.equal(/SYNTHETIC_PRIVATE|SYNTHETIC_EXTRA|foreign\.invalid/.test(html), false);
  for (const row of links(html)) assert.ok(row.href.startsWith('/') && !row.href.startsWith('//'));
  assert.match(html, /Approval codes stay out of links/);
});

test('embedded and context-free admission keep their existing destinations', async () => {
  for (const embedded of [false, true]) {
    const html = renderToStaticMarkup(React.createElement(component, { circleId: id, embedded }));
    assert.equal(href(html, 'Salon details'), `/circles/${id}`);
    assert.equal(queryOf(href(html, 'Sign in')).next, `/circles/${id}/admission`);
    assert.match(html, embedded ? /<h2[^>]*>Salon invitations/ : /<h1[^>]*>Salon invitations/);
  }
});

test('invalid Circle identifiers still refuse before rendering invitation controls', async () => {
  await assert.rejects(admission.default({ params: Promise.resolve({ circleId: '../other' }), searchParams: Promise.resolve({ fellowship: 'psalm-22' }) }), /FIXTURE_NOT_FOUND/);
});

test('invitation page retains private referrer and indexing metadata', () => {
  assert.equal(admission.metadata.referrer, 'no-referrer');
  assert.equal(admission.metadata.robots.index, false);
  assert.equal(admission.metadata.robots.follow, false);
});
