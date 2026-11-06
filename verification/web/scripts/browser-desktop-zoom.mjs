import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const [prefix, ...extra] = process.argv.slice(2);
assert(!extra.length && /^built-shell-[a-z0-9-]+-$/.test(prefix ?? ''));
assert(process.execArgv.some(arg => arg.endsWith('/deny-build-network.cjs')));
const root = process.cwd(), evidence = resolve('verification/web/evidence');
const ready = JSON.parse(readFileSync(resolve(evidence, prefix + 'server-ready.json')));
const origin = ready.origin;
assert.equal(ready.status, 'READY');
assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
assert.equal(readFileSync('.next/BUILD_ID', 'utf8').trim(), ready.buildId);
for (const source of ['app/globals.css', 'components/PublicNav.tsx', 'app/login/page.tsx', 'app/auth/recovery/Recovery.tsx',
  'app/circles/page.tsx', 'app/circles/[circleId]/page.tsx', 'app/circles/CirclesBrowser.tsx',
  'app/circles/messages/CircleSafetyNav.tsx', 'app/clips/page.tsx']) {
  assert(lstatSync(source).blocks, source);
  assert.equal(createHash('sha256').update(readFileSync(source)).digest('hex'), ready.sourceHashes[source], source);
}
const require = createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
const executablePath = '/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
assert(lstatSync(executablePath).blocks, 'Chromium must be resident');

const work = mkdtempSync('/private/tmp/soe-browser-zoom-');
const extension = resolve(work, 'extension');
mkdirSync(extension);
writeFileSync(resolve(extension, 'manifest.json'), JSON.stringify({
  manifest_version: 3, name: 'SoE loopback zoom check', version: '1.0.0',
  host_permissions: ['http://127.0.0.1/*'], background: { service_worker: 'worker.js' },
}));
writeFileSync(resolve(extension, 'worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});\n');
const layouts = [], stories = [], requests = [], errors = [], cleanup = {};
let context, fixture, failure;

try {
  process.chdir(resolve(root, 'verification/web'));
  const { createPublicProfileApp, ORIGIN } = await import('../tests/support/public-profile-app.mjs');
  fixture = await createPublicProfileApp();
  const title = 'Philemon keyboard Circle';
  const expectedMemberId = fixture.actors.author;
  const body = await fixture.createBody({
    expectedMemberId, title, format: 'online', city: null, venueName: null, venueType: 'online',
    onlineUrl: 'https://fixture.invalid/meeting',
  });
  const created = await fixture.dispatch('/api/circles', { method: 'POST', body, headers: {
    authorization: 'Bearer ' + fixture.TOKENS.author, origin: ORIGIN, 'x-soe-expected-member': expectedMemberId,
  } });
  assert.equal(created.status, 200);
  const { circleId } = await created.json();
  const detail = '/circles/' + circleId + '?from=online';

  context = await require('playwright').chromium.launchPersistentContext(resolve(work, 'profile'), {
    channel: 'chromium', executablePath, headless: true, timeout: 15_000, viewport: null, serviceWorkers: 'block',
    args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension, '--window-size=1280,1024',
      '--force-device-scale-factor=1', '--disable-background-networking', '--disable-component-update',
      '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'],
    env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' },
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 5000 });
  assert(worker.url().startsWith('chrome-extension://'));
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    try {
      assert.equal(url.origin, origin, 'Unexpected network destination');
      if (!url.pathname.startsWith('/api/')) return await route.continue();
      const directory = url.pathname === '/api/circles';
      const listing = url.pathname === '/api/circles/' + circleId && url.search === '?view=listing';
      assert(directory || listing, 'Unexpected API path ' + url.pathname);
      const headers = await request.allHeaders();
      assert.equal(request.method(), 'GET');
      assert(!headers.cookie && !headers.authorization && !headers['x-soe-expected-member']);
      const reply = await fixture.dispatch(url.pathname + url.search);
      requests.push({ path: url.pathname, status: reply.status });
      await route.fulfill({ status: reply.status, headers: Object.fromEntries(reply.headers), body: await reply.text() });
    } catch (error) {
      if (request.failure()?.errorText !== 'net::ERR_ABORTED') errors.push(error.message);
      await route.abort().catch(() => {});
    }
  });
  const page = context.pages()[0] ?? await context.newPage();
  page.setDefaultTimeout(10_000);
  page.on('pageerror', error => errors.push(error.message));
  const cdp = await context.newCDPSession(page);
  const button = name => page.getByRole('button', { name, exact: true });
  const link = name => page.getByRole('link', { name, exact: true });
  const heading = name => page.getByRole('heading', { name, exact: true });
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const focus = () => page.evaluate(() => {
    const element = document.activeElement, rect = element.getBoundingClientRect();
    const x = (rect.left + rect.right) / 2, y = (rect.top + rect.bottom) / 2;
    return {
      id: element.id, tag: element.tagName,
      name: element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 64) || element.id,
      visible: x >= 0 && x < innerWidth && y >= 0 && y < innerHeight && element.contains(document.elementFromPoint(x, y)),
      focusVisible: element.matches(':focus-visible'),
    };
  });
  async function goto(path, factor, title) {
    assert.equal((await page.goto(origin + path)).status(), 200, path);
    await page.bringToFront();
    const zoom = await worker.evaluate(async ({ origin, factor }) => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url || new URL(tab.url).origin !== origin) throw Error('Zoom target escaped the test origin');
      await chrome.tabs.setZoom(tab.id, factor);
      return chrome.tabs.getZoom(tab.id);
    }, { origin, factor });
    assert(Math.abs(zoom - factor) < 0.01);
    await heading(title).waitFor();
    if (path.startsWith('/login')) {
      await page.waitForFunction(() => document.getElementById('login-password')?.disabled === false);
    }
    await settle();
    const size = await page.evaluate(() => ({
      width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth,
      cssZoom: getComputedStyle(document.documentElement).zoom, devicePixelRatio,
    }));
    assert.equal(size.devicePixelRatio, factor);
    assert.equal(size.width, 1280 / factor);
    assert.equal(size.cssZoom, '1');
    assert(size.documentWidth <= size.width, JSON.stringify({ path, factor, size }));
    layouts.push({ path, factor, ...size });
  }
  async function tabTo(locator) {
    await locator.waitFor();
    for (let step = 0; step < 60; step++) {
      if (await locator.evaluate(element => element === document.activeElement)) return;
      await page.keyboard.press('Tab');
    }
    throw Error('Keyboard could not reach ' + locator);
  }
  async function accessible(role, name) {
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    assert(nodes.some(node => !node.ignored && node.role?.value === role && node.name?.value === name),
      'Chromium accessibility tree missing ' + role + ' ' + name);
  }
  async function skipTo(id) {
    await page.keyboard.press('Tab');
    const first = await focus();
    assert.equal(first.name, 'Skip to content');
    assert(first.visible && first.focusVisible);
    await page.keyboard.press('Enter');
    await page.waitForFunction(target => document.activeElement.id === target, id);
  }

  const login = '/login?next=%2Fcircles%3Fformat%3Donline';
  const directory = '/circles?format=online';
  const directoryHeading = 'Read together in a weekly salon';
  for (const factor of [1, 2, 4]) {
    await goto(login, factor, 'Welcome back');
    for (const [key, steps] of [['Tab', 23], ['Shift+Tab', 18]]) {
      for (let i = 0; i < steps; i++) {
        await page.keyboard.press(key);
        await settle();
        const current = await focus();
        assert(current.tag === 'BODY' || current.visible, JSON.stringify({ factor, key, current }));
      }
    }
    stories.push('Sign-in keyboard focus stays visible at ' + factor * 100 + '%.');
    await goto('/auth/recovery', factor, 'Recover your password');
    await goto(directory, factor, directoryHeading);
    await link('View circle: ' + title).waitFor();
    await goto('/clips', factor, 'Clips & passages');
  }

  await goto(login, 4, 'Welcome back');
  await skipTo('login-title');
  assert((await focus()).visible);
  await accessible('heading', 'Welcome back');
  await accessible('textbox', 'Password');
  await tabTo(button('Create account'));
  await page.keyboard.press('Enter');
  await heading('Create an account').waitFor();
  await page.waitForFunction(() => document.activeElement.id === 'login-title');
  assert((await focus()).visible);
  assert.equal(new URL(page.url()).searchParams.get('next'), directory);
  await tabTo(button('Sign in instead'));
  await page.keyboard.press('Enter');
  await heading('Welcome back').waitFor();
  await page.waitForFunction(() => document.activeElement.id === 'login-title');
  assert((await focus()).visible);
  await tabTo(link('Forgot your password?'));
  await page.keyboard.press('Enter');
  await page.waitForURL(origin + '/auth/recovery');
  await page.getByLabel('Email', { exact: true }).waitFor();
  await accessible('heading', 'Recover your password');
  await accessible('textbox', 'Email');
  stories.push('The first shortcut, signup, return to sign-in and password recovery work at 400% with the return path intact.');

  await goto(login, 4, 'Welcome back');
  await tabTo(button('Open navigation'));
  await page.keyboard.press('Enter');
  await page.getByRole('dialog', { name: 'Site navigation' }).waitFor();
  assert.equal((await focus()).name, 'Close navigation');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal((await focus()).name, 'Open navigation');
  assert((await focus()).visible);
  stories.push('At 400%, the short-screen menu closes with Escape and returns visible focus to its trigger.');

  await goto(directory, 4, directoryHeading);
  await link('View circle: ' + title).waitFor();
  await accessible('search', 'Find a circle');
  const beforeSkip = requests.length;
  await skipTo('main');
  await settle();
  assert.equal((await focus()).id, 'main');
  assert.equal(requests.length, beforeSkip);
  const searchField = page.getByLabel('Reading, topic or circle name');
  await tabTo(searchField);
  await page.keyboard.type('Philemon');
  await tabTo(button('Search'));
  await page.keyboard.press('Enter');
  await heading('Current results page').waitFor();
  await page.waitForFunction(() => document.activeElement.textContent === 'Current results page');
  assert((await focus()).visible);
  const restored = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.origin === origin && url.pathname === '/api/circles' && !url.searchParams.has('q');
  });
  await page.evaluate(() => history.back());
  assert.equal((await restored).status(), 200);
  assert.equal(await searchField.inputValue(), '');
  await page.waitForFunction(() => document.activeElement.textContent === 'Current results page');
  assert((await focus()).visible);
  await tabTo(link('View circle: ' + title));
  await page.keyboard.press('Enter');
  await page.waitForURL(origin + detail);
  const preview = page.getByRole('region', { name: 'Public Circle preview' });
  await preview.waitFor();
  const signIn = page.locator('main').getByRole('link', { name: 'Sign in', exact: true });
  const signInHref = await signIn.getAttribute('href');
  assert.equal(new URL(signInHref, origin).searchParams.get('next'), detail);
  assert.equal(await link('Open the online meeting').count(), 0);
  await tabTo(signIn);
  await page.keyboard.press('Enter');
  await page.waitForURL(origin + signInHref);
  await heading('Welcome back').waitFor();
  stories.push('At 400%, the shortcut preserves search, a submitted search and Back focus the results, and the preview preserves the sign-in return path.');

  await goto('/clips', 4, 'Clips & passages');
  await accessible('navigation', 'Archivist Reels');
  await skipTo('clips-title');
  const reel = page.getByRole('link', { name: /Watch the Reel.*Who gets the night sky/ });
  await tabTo(reel);
  await page.keyboard.press('Enter');
  const article = page.getByRole('article', { name: 'Who gets the night sky?', exact: true });
  await article.waitFor();
  const transcript = article.getByText('Read the transcript', { exact: true });
  await tabTo(transcript);
  await page.keyboard.press('Enter');
  assert.equal(await article.locator('details[open]').count(), 1);
  assert((await focus()).visible);
  stories.push('At 400%, the Clips shortcut and Reel link lead to a transcript that opens from the keyboard.');
  assert.deepEqual(errors, []);
} catch (error) {
  failure = error.message;
  throw error;
} finally {
  if (context) { await context.close(); cleanup.browser = 'closed'; }
  if (fixture) { await fixture.close(); cleanup.database = 'closed'; }
  rmSync(work, { recursive: true, force: true });
  cleanup.profile = 'removed';
  const receipt = { status: failure ? 'FAIL' : 'PASS', buildId: ready.buildId, layouts, stories, requests, errors, cleanup, failure,
    scope: 'Actual Chromium tab zoom and accessibility tree. The built app uses a disposable database for public Circle routes and a fresh local browser profile.' };
  writeFileSync(resolve(evidence, prefix + 'desktop-zoom.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ status: receipt.status, layouts: layouts.length, stories: stories.length, cleanup }));
}
