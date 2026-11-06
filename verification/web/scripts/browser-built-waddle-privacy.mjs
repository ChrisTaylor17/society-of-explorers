import assert from 'node:assert/strict';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const [prefix, ...extra] = process.argv.slice(2);
assert(!extra.length && /^built-shell-[a-z0-9-]+-$/.test(prefix ?? ''));
assert(process.execArgv.some(arg => arg.endsWith('/deny-build-network.cjs')));
const evidence = resolve('verification/web/evidence', prefix);
const ready = JSON.parse(readFileSync(evidence + 'server-ready.json', 'utf8'));
assert.equal(ready.status, 'READY');
assert.equal(readFileSync('.next/BUILD_ID', 'utf8').trim(), ready.buildId);
assert.match(ready.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
const { origin } = ready;
const require = createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
const executablePath = '/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
assert(lstatSync(executablePath).blocks, 'Chromium must be resident');
const browser = await require('playwright').chromium.launch({
  executablePath, headless: true, timeout: 15_000,
  env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' },
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
    '--disable-background-networking', '--disable-component-update', '--no-first-run',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'],
});
const memberId = '77000000-0000-4000-8000-000000000001';
const transcript = 'A synthetic voice for the local recording test.';
const report = { status: 'FAIL', buildId: ready.buildId, transcriptionRequests: 0, publicationRequests: 0,
  externalBrowserRequests: [], pageErrors: [], fixtureErrors: [], checks: [], browserClosed: false };
try {
  const context = await browser.newContext({
    serviceWorkers: 'block', acceptDownloads: false, viewport: { width: 390, height: 820 },
  });
  await context.grantPermissions(['microphone'], { origin });
  let published = false;
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    try {
      if (url.origin !== origin) {
        report.externalBrowserRequests.push(url.origin);
        return route.abort();
      }
      if (url.pathname === '/api/auth/member') return route.fulfill({ json: {
        member: { id: memberId, display_name: 'Synthetic member', tier: 'seeker' },
        auth: { provider: 'wallet', subject: memberId },
      } });
      if (url.pathname === '/api/waddle' && request.method() === 'GET') return route.fulfill({ json: {
        waddles: published ? [{ id: memberId, transcription: transcript, created_at: '2026-11-06T12:00:00Z' }] : [],
      } });
      if (url.pathname === '/api/transcribe' || url.pathname === '/api/waddle') {
        assert.equal(request.method(), 'POST');
        const body = request.postDataBuffer();
        assert(body && body.length > 100);
        const parts = body.toString('latin1');
        assert(parts.includes('name="audio"; filename="waddle.webm"'));
        if (url.pathname === '/api/transcribe') {
          assert(parts.includes('name="consentToTranscription"\r\n\r\ntrue'));
          assert(!parts.includes('name="publishPublicly"'));
          report.transcriptionRequests++;
          return report.transcriptionRequests === 1
            ? route.fulfill({ status: 503, json: { error: 'Synthetic provider unavailable' } })
            : route.fulfill({ json: { text: transcript } });
        }
        assert(parts.includes('name="publishPublicly"\r\n\r\ntrue'));
        assert(parts.includes('name="expectedMemberId"\r\n\r\n' + memberId));
        assert(parts.includes('name="transcription"\r\n\r\n' + transcript));
        report.publicationRequests++;
        if (report.publicationRequests === 1) {
          return route.fulfill({ status: 409, json: { error: 'Synthetic account change' } });
        }
        published = true;
        return route.fulfill({ json: { success: true } });
      }
      assert(!url.pathname.startsWith('/api/'), 'Unexpected request ' + url.pathname);
      return route.continue();
    } catch (error) {
      report.fixtureErrors.push(error.message);
      await route.abort();
    }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.on('pageerror', error => report.pageErrors.push(error.message));
  assert.equal((await page.goto(origin + '/waddle')).status(), 200);
  await page.getByRole('heading', { name: 'THE WADDLE FORGE' }).waitFor();
  await page.getByText('Recording requires a membership.').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'HOLD', exact: true }).hover();
  await page.mouse.down();
  await page.getByRole('button', { name: /^1[234]s$/ }).waitFor();
  await page.mouse.up();
  const transcribe = page.getByRole('button', { name: 'Transcribe with OpenAI' });
  await transcribe.waitFor();
  const preview = page.locator('audio[src^="blob:"]');
  assert.equal(await preview.count(), 1);
  const bytes = await preview.evaluate(async audio => (await (await fetch(audio.src)).arrayBuffer()).byteLength);
  assert(bytes > 100);
  assert.equal(report.transcriptionRequests, 0);
  assert.equal(report.publicationRequests, 0);
  report.checks.push('The real recorder produces a local playback preview without contacting a provider.');
  await page.screenshot({ path: evidence + 'recording-preview.png' });

  await transcribe.click();
  await page.getByRole('alert').filter({ hasText: 'Could not transcribe' }).waitFor();
  assert.equal(report.transcriptionRequests, 1);
  assert.equal(await page.getByRole('button', { name: 'Publish recording and transcript' }).count(), 0);
  await transcribe.click();
  const publish = page.getByRole('button', { name: 'Publish recording and transcript' });
  await publish.waitFor();
  assert.equal(report.transcriptionRequests, 2);
  assert.equal(report.publicationRequests, 0);
  await page.getByText('Anyone can listen to the recording and read the transcript after you publish it.').waitFor();
  report.checks.push('Explicit transcription handles provider refusal and displays the successful transcript without publishing.');
  await publish.scrollIntoViewIfNeeded();
  await page.screenshot({ path: evidence + 'publication-review.png' });

  await publish.click();
  await page.getByRole('alert').filter({ hasText: 'Could not confirm publication' }).waitFor();
  assert.equal(report.publicationRequests, 1);
  await publish.click();
  await page.getByRole('button', { name: 'Published', exact: true }).waitFor();
  assert.equal(report.publicationRequests, 2);
  await page.getByText(transcript, { exact: true }).last().waitFor();
  assert.equal(await page.getByText(transcript, { exact: true }).count(), 2);
  report.checks.push('Explicit publication carries the reviewed account and recovers after a refusal before showing success.');
  assert.deepEqual(report.externalBrowserRequests, []);
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.fixtureErrors, []);
  report.status = 'PASS';
} finally {
  await browser.close();
  report.browserClosed = true;
  writeFileSync(evidence + 'browser.json', JSON.stringify(report, null, 2) + '\n');
}
