import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const [prefix, name, ...extra] = process.argv.slice(2);
assert(!extra.length && /^built-shell-[a-z0-9-]+-$/.test(prefix ?? ''));
assert(/^reel-(?:paranal|elt|lava|isopod)-built-[0-9]+$/.test(name ?? ''));
assert(process.execArgv.some(arg => arg.endsWith('/deny-build-network.cjs')));
const evidence = resolve('verification/web/evidence'), folder = resolve(evidence, name);
const resident = path => {
  const info = lstatSync(path);
  assert(info.isFile() && info.blocks && info.size, path);
  return path;
};
const hash = data => createHash('sha256').update(data).digest('hex');
const readyPath = resident(resolve(evidence, prefix + 'server-ready.json'));
const readyBytes = readFileSync(readyPath), ready = JSON.parse(readyBytes);
assert.equal(ready.status, 'READY');
assert.match(ready.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
const origin = ready.origin;
const require = createRequire(resident('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json'));
const executablePath = resident('/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const elt = name.startsWith('reel-elt-');
const lava = name.startsWith('reel-lava-');
const isopod = name.startsWith('reel-isopod-');
const title = isopod ? 'Is it a new species?' : lava ? 'Which height are we measuring?' : elt ? 'What did the tilt prove?' : 'Who gets the night sky?';
const id = isopod ? 'new-species' : lava ? 'which-height' : elt ? 'telescope-first-tilt' : 'night-sky-traffic';
const credit = isopod ? 'NOAA Ocean Exploration, 2026 American Samoa ROV + Mapping Exploration' : lava ? 'James Lee via Pexels' : elt ? 'ESO/Cimolai/Apical/G. Vecchia' : 'B. Häußler/ESO';
const source = isopod ? 'https://oceanexplorer.noaa.gov/dive-11-ex2606/' : lava ? 'https://www.pexels.com/video/kilauea-volcano-eruption-in-hawaii-33378632/'
  : elt ? 'https://www.eso.org/public/videos/potw2643a/' : 'https://www.eso.org/public/videos/eso2607d/';
const duration = elt || lava || isopod ? 20 : 24;
const sampleTimes = duration === 20 ? [0, 4.8, 10, 15.2, 19.8] : [0, 4.8, 10, 16, 23.8];
const calls = [], external = [], errors = [], stories = [], snapshots = [];
let browser, closed = false, playback = null, failure = null;
function save(name, bytes) {
  const path = resolve(folder, name);
  writeFileSync(path, bytes, { flag: 'wx' });
  snapshots.push({ path, sha256: hash(bytes) });
}
try {
  browser = await require('playwright').chromium.launch({ headless: true, executablePath, timeout: 12000,
    env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' },
    args: ['--disable-background-networking', '--disable-component-update', '--no-first-run',
      '--disable-accelerated-video-decode', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
  const context = await browser.newContext({ viewport: { width: 320, height: 850 }, serviceWorkers: 'block', acceptDownloads: false });
  await context.addCookies([{ name: 'soe_test_account_cookie', value: 'SYNTHETIC_REEL_VERIFICATION', url: origin }]);
  await context.addInitScript(() => {
    const shares = [], copies = [];
    let native = false;
    Object.defineProperty(navigator, 'share', { get: () => native ? async payload => { shares.push(payload); } : undefined });
    Object.defineProperty(navigator, 'clipboard', { value: { async writeText(url) { copies.push(url); } } });
    window.reelShareQa = { shares, copies, useShare() { native = true; } };
  });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { external.push(url.origin + url.pathname); await route.abort(); return; }
    if (/^\/clips\/(?:media|captions)\//.test(url.pathname)) {
      const headers = await request.allHeaders();
      calls.push({ path: url.pathname, method: request.method(), query: [...url.searchParams.keys()],
        cookie: Boolean(headers.cookie), referer: Boolean(headers.referer) });
    }
    await route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  page.setDefaultTimeout(8000);
  assert.equal((await page.goto(origin + '/clips')).status(), 200);
  const reel = page.getByRole('article', { name: title, exact: true });
  await page.getByRole('link', { name: 'Watch the Reel · ' + title }).press('Enter');
  await page.waitForURL(origin + '/clips#' + id);
  assert.equal(await page.evaluate(() => document.activeElement.id), id);
  assert.equal(await reel.getByRole('link', { name: credit, exact: true }).getAttribute('href'), source);
  assert.equal(await reel.getByRole('link', { name: isopod ? 'NOAA reuse terms' : lava ? 'Pexels License' : 'CC BY 4.0', exact: true }).getAttribute('href'),
    isopod ? 'https://oceanexplorer.noaa.gov/faqs/' : lava ? 'https://www.pexels.com/terms-of-service/' : 'https://creativecommons.org/licenses/by/4.0/');
  if (lava) {
    const report = reel.getByRole('link', { name: 'Read the USGS eruption report', exact: true });
    assert.equal(await report.getAttribute('href'),
      'https://www.usgs.gov/media/videos/october-17-2026-video-kilauea-summit-lava-fountaining-episode-55');
  }
  if (isopod) {
    const report = reel.getByRole('link', { name: 'Read the NOAA November trial plan', exact: true });
    assert.equal(await report.getAttribute('href'), 'https://oceanexplorer.noaa.gov/expedition/ex2701/');
  }
  const permalink = '/clips/watch/' + id;
  const direct = reel.getByRole('link', { name: 'Link to this Reel' });
  assert.equal(await direct.getAttribute('href'), permalink);
  assert.equal(await reel.getByRole('link', { name: 'Discuss in an online Circle' }).getAttribute('href'), '/circles?format=online&reel=' + id);
  assert.equal(await page.getByRole('heading', { name: 'How a Circle works', exact: true }).count(), 1);
  assert.equal(await reel.locator('video').count(), 0);
  assert.deepEqual(calls, []);
  stories.push('The built Clips page keeps both formats and opens a keyboard-accessible Reel anchor with source, license and Circle links.');

  await reel.getByRole('button', { name: 'Share Reel' }).click();
  await reel.getByText('Reel link copied.', { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.reelShareQa.copies), [origin + permalink]);
  await direct.press('Enter');
  await page.waitForURL(origin + permalink);
  await page.getByRole('heading', { level: 1, name: title, exact: true }).waitFor();
  await page.waitForFunction(value => document.querySelector('meta[property="og:title"]')?.content === value, title);
  assert.equal(await reel.getByRole('link', { name: credit, exact: true }).getAttribute('href'), source);
  assert.equal(await reel.locator('video').count(), 0);
  assert.deepEqual(calls, []);
  await page.evaluate(() => window.reelShareQa.useShare());
  await reel.getByRole('button', { name: 'Share Reel' }).click();
  await page.waitForFunction(() => window.reelShareQa.shares.length === 1);
  assert.deepEqual(await page.evaluate(() => window.reelShareQa.shares), [{ title, url: origin + permalink }]);
  assert.deepEqual(calls, []);
  stories.push('A Reel link opens its own credited page and preview title. Clipboard and share-sheet fixtures receive only that public URL and title before any media loads.');

  const loadClip = reel.getByRole('button', { name: 'Load video and captions' });
  const unloadClip = reel.getByRole('button', { name: 'Unload clip' });
  await loadClip.press('Enter');
  const video = reel.locator('video');
  await video.waitFor();
  assert.equal(await unloadClip.evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Tab');
  assert.equal(await video.evaluate(el => el === document.activeElement), true);
  await video.scrollIntoViewIfNeeded();
  assert.equal(await video.evaluate(element => element.paused && !element.autoplay && !element.querySelector('track').default), true);
  assert.deepEqual(calls.sort((a, b) => a.path.localeCompare(b.path)), [
    { path: '/clips/captions/' + id, method: 'GET', query: ['sha'], cookie: false, referer: false },
    { path: '/clips/media/' + id, method: 'GET', query: ['sha'], cookie: false, referer: false },
  ]);
  stories.push('Keyboard Load keeps focus on the control, then Tab reaches the paused player. The exact media and timed text load without account cookies or referrer.');

  playback = await video.evaluate(async (element, { duration, sampleTimes }) => {
    const cueTrack = element.querySelector('track'), text = element.textTracks[0];
    const cues = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Caption track did not load')), 6000);
      cueTrack.addEventListener('load', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
    text.mode = 'hidden';
    await cues;
    if (text.cues.length !== 4 || text.cues[3].endTime !== duration) throw Error('Unexpected timed text');
    const canvas = document.createElement('canvas');
    canvas.width = 720; canvas.height = 1280;
    const ctx = canvas.getContext('2d');
    const times = [...sampleTimes], frames = [];
    let count = 0, frameId;
    const start = performance.now();
    const finished = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Playback did not finish')), 32000);
      element.addEventListener('ended', () => { clearTimeout(timer); resolve(); }, { once: true });
      const inspect = (_now, frame) => {
        count++;
        if (times.length && frame.mediaTime >= times[0]) {
          times.shift(); ctx.drawImage(element, 0, 0);
          frames.push({ at: frame.mediaTime, png: canvas.toDataURL('image/png') });
        }
        frameId = element.requestVideoFrameCallback(inspect);
      };
      frameId = element.requestVideoFrameCallback(inspect);
    });
    await element.play();
    const stream = element.captureStream(), audioTracks = stream.getAudioTracks().length, videoTracks = stream.getVideoTracks().length;
    await finished;
    element.cancelVideoFrameCallback(frameId);
    stream.getTracks().forEach(track => track.stop());
    const quality = element.getVideoPlaybackQuality();
    return { duration: element.duration, end: element.currentTime, width: element.videoWidth, height: element.videoHeight,
      rate: element.playbackRate, ended: element.ended, elapsed: performance.now() - start,
      audioTracks, videoTracks, presentedFrames: count, droppedFrames: quality.droppedVideoFrames,
      totalFrames: quality.totalVideoFrames, frames, captions: text.cues.length };
  }, { duration, sampleTimes });
  assert.equal(playback.duration, duration);
  assert.equal(playback.end, duration);
  assert.equal(playback.rate, 1);
  assert(playback.ended && playback.elapsed >= (duration - .5) * 1000 && playback.presentedFrames >= duration * 18.75);
  assert.deepEqual([playback.width, playback.height, playback.audioTracks, playback.videoTracks, playback.captions], [720, 1280, 0, 1, 4]);
  assert.equal(playback.frames.length, 5);
  playback.frames = playback.frames.map(({ at, png }, index) => {
    const file = `decoded-final-${index + 1}.png`;
    save(file, Buffer.from(png.split(',')[1], 'base64'));
    return { at, file };
  });
  save('reel-320.png', await page.screenshot());
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  stories.push('The actual derivative plays through at normal speed with silent portrait video and four captions, including all four editorial beats.');
  await unloadClip.press('Enter');
  assert.equal(await loadClip.evaluate(el => el === document.activeElement), true);
  assert.equal(await video.count(), 0);
  await reel.getByText('Read the transcript', { exact: true }).click();
  await reel.getByText(isopod ? /Bring the question to a\s+Circle/ : lava ? /Bring a question to a\s+Circle/ : /Bring your reason to a\s+Circle/).waitFor();
  assert.equal(calls.length, 2);
  stories.push('Keyboard Unload retires the video, keeps focus on Load and leaves the transcript and source links usable.');
  await reel.getByRole('link', { name: 'Discuss in an online Circle' }).click();
  await page.waitForURL(origin + '/circles?format=online&reel=' + id);
  await page.getByRole('heading', { name: 'Find a circle', exact: true }).waitFor();
  await page.waitForFunction(() => document.getElementById('circle-format')?.value === 'online');
  assert.equal(calls.length, 2);
  await page.getByRole('region', { name: 'Question from the Reel' }).waitFor();
  stories.push('The Reel brings its question to the public directory with the online and hybrid filter selected.');
  if (!elt && !lava) {
    for (const id of ['not-an-approved-reel', 'how-a-circle-works']) {
      assert.equal((await page.goto(origin + '/clips/watch/' + id)).status(), 404);
    }
    assert.equal(calls.length, 2);
    stories.push('Unknown and non-Reel catalog IDs return 404 on the public Reel route.');
  }
  await page.goto(origin + permalink);
  const mediaRequest = url => url.origin === origin && url.pathname === '/clips/media/' + id;
  let releaseMedia;
  const holdMedia = new Promise(resolve => { releaseMedia = resolve; });
  await context.route(mediaRequest, async route => {
    await holdMedia;
    await route.continue().catch(() => {});
  });
  try {
    const requested = page.waitForRequest(request => mediaRequest(new URL(request.url())));
    await loadClip.press('Enter');
    await requested;
    const cancelClip = reel.getByRole('button', { name: 'Cancel loading', exact: true });
    assert.equal(await cancelClip.evaluate(el => el === document.activeElement), true);
    await cancelClip.press('Enter');
    assert.equal(await loadClip.evaluate(el => el === document.activeElement), true);
  } finally {
    releaseMedia();
    await context.unroute(mediaRequest);
  }
  assert.equal(await video.count(), 0);
  await loadClip.press('Enter');
  await video.waitFor();
  assert.equal(await unloadClip.evaluate(el => el === document.activeElement), true);
  stories.push('Keyboard Cancel keeps focus on Load, retires a held media request and permits a fresh load.');
  await context.close();
  assert.deepEqual(external, []); assert.deepEqual(errors, []);
} catch (error) { failure = error.stack || String(error); }
finally {
  if (browser) {
    try { await browser.close(); closed = true; }
    catch (error) { failure ??= String(error); }
  }
  assert.equal(hash(readFileSync(readyPath)), hash(readyBytes));
  writeFileSync(resolve(folder, 'browser.json'), JSON.stringify({ status: failure ? 'FAIL' : 'PASS', clipId: id, stories,
    buildId: ready.buildId, calls, external, errors, snapshots, playback, closed, failure }, null, 2) + '\n', { flag: 'wx' });
}
if (failure) throw Error(failure);
console.log(JSON.stringify({ status: 'PASS', stories: stories.length, closed, duration: playback.duration }));
