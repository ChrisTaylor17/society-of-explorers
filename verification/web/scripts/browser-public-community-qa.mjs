import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../../../', import.meta.url)), evidence = path.join(root, 'verification/web/evidence');
const require = createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json'), { chromium } = require('playwright');
const owner = '11111111-1111-4111-8111-111111111111', id = '22222222-2222-4222-8222-222222222222';
const name = 'PublishedExplorer' + 'x'.repeat(150);
const response = slug => ({ community: { name: slug === 'alpha' ? 'Alpha community' : 'Empty community', description: 'Synthetic public community.', mission: null,
  owner_member_id: owner }, contracts: {}, products: [], viewer: { canManage: true }, members: slug === 'alpha' ? [{ id, display_name: name,
  bio: null, discipline: null, skills: [], project_description: null, seeking: null, philosophy: null, member_id: owner, role: 'owner' }] : [] });
const errors = [], requests = [], stories = [];
let hold = false, held = false, release;
const browser = await chromium.launch({ headless: true, executablePath: '/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' }, args: ['--disable-background-networking', '--no-first-run'] });
try {
  const page = await browser.newPage({ viewport: { width: 320, height: 800 } }); page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()); assert.equal(url.origin, 'https://public-profile.test');
    if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/page.mjs"></script>' });
    if (url.pathname === '/page.mjs') return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(evidence, 'public-community-fixture/page.mjs')) });
    requests.push(url.pathname);
    if (url.pathname === '/api/store/balance') return route.fulfill({ status: 200, json: { balance: 0 } });
    const slug = /^\/api\/communities\/(alpha|empty|unavailable)$/.exec(url.pathname)?.[1]; assert.ok(slug);
    if (slug === 'unavailable') return route.fulfill({ status: 503, json: { error: 'Community unavailable.' } });
    if (slug === 'alpha' && hold) { held = true; await new Promise(resolve => { release = resolve; }); }
    try { await route.fulfill({ status: 200, json: response(slug) }); } catch (error) { if (!request.failure()) throw error; }
  });
  await page.goto('https://public-profile.test/'); await page.getByRole('link', { name, exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /CREATE PRODUCT/ }).count(), 0);
  assert.equal(await page.getByText('OWNER', { exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.getByRole('link', { name, exact: true }).screenshot({ path: path.join(evidence, 'public-community-profile-320.png') });
  stories.push('actual community page renders a long published display name within 320px and ignores injected owner identity, role and capability hints');
  await page.evaluate(() => window.publicProfileQa.mount('empty')); await page.getByText('No published profiles are shown.', { exact: true }).waitFor();
  assert.equal(await page.getByText('FOUNDER', { exact: true }).count(), 0); assert.equal(await page.getByText(/first member/).count(), 0);
  stories.push('empty published roster claims no founder status or complete member count');
  hold = true; await page.evaluate(() => window.publicProfileQa.mount('alpha'));
  for (let count = 0; count < 100 && !held; count++) await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(held, true);
  await page.evaluate(() => window.publicProfileQa.mount('empty')); await page.getByText('No published profiles are shown.', { exact: true }).waitFor();
  release(); await page.waitForTimeout(50); assert.equal(await page.getByRole('link', { name, exact: true }).count(), 0);
  stories.push('slug owner reset and aborted stale response cannot restore the prior roster');
  await page.evaluate(() => window.publicProfileQa.mount('unavailable')); await page.getByRole('heading', { name: 'This community is unavailable.' }).waitFor();
  assert.equal(await page.getByText('No published profiles are shown.', { exact: true }).count(), 0);
  await page.evaluate(() => window.publicProfileQa.unmount()); assert.deepEqual(errors, []);
  stories.push('503 is a generic unavailable state rather than an empty successful roster; unmount has no browser errors');
  const files = ['lib/explorer/publicProfile.ts', 'app/explorer/[id]/page.tsx', 'app/api/explorer/[id]/route.ts', 'app/api/members/discover/route.ts', 'app/api/communities/[slug]/route.ts', 'app/c/[slug]/page.tsx'];
  const report = { status: 'PASS', stories, requests, errors, sourceHashes: Object.fromEntries(files.map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')])),
    scope: 'Actual community React page/cached React19.2.4 in Chromium. Navigation/session-hint helpers and HTTP responses are synthetic adapters; HTTPS virtual-origin requests are fully fulfilled. No real auth, provider, PostgREST server or deployment claim.' };
  fs.writeFileSync(path.join(evidence, 'public-community-browser.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
