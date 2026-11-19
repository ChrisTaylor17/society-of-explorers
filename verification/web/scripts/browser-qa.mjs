import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import net from 'node:net';
import assert from 'node:assert/strict';
import { supporterApp, IDS } from '../tests/support/supporter-app.mjs';

// The browser sees built Next pages. Actual candidate HTTP handlers execute
// against the disposable SQL fixture; Stripe operations are synthetic only.
const require = createRequire(import.meta.url), { chromium } = require(process.env.SOE_PLAYWRIGHT_PACKAGE);
const root = path.resolve('.'), port = 3195, origin = `http://127.0.0.1:${port}`;
const evidence = { status: 'RUNNING', story: 'Free community → optional support → explicit review → exact lost-reply retry → manual synthetic checkout → verified own return → existing subscription management', provider: 'All Stripe API operations and hosted-page responses are synthetic local fixtures. No actual provider request, purchase, tax change or subscription change is performed.', checks: [], requests: [], writes: [], manualProviderNavigations: [], externalRequestsBlocked: [], pageErrors: [], consoleErrors: [] };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = message => evidence.checks.push(message);
let server, browser, system, failed;
async function portOpen() {
  return new Promise(resolve => { const socket = net.createConnection({ host: '127.0.0.1', port }); socket.once('connect', () => { socket.destroy(); resolve(true); }); socket.once('error', () => resolve(false)); });
}
async function layout(page, name) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '320px horizontal overflow');
  assert.equal(await page.locator('main#main').count(), 1); assert.equal(await page.locator('main h1').count(), 1);
  const bad = await page.locator('main button, main a, main summary, header nav a').evaluateAll(elements => elements.filter(element => { const rect = element.getBoundingClientRect(); return rect.width && rect.height; }).map(element => ({ height: element.getBoundingClientRect().height, text: element.textContent, color: getComputedStyle(element).color })).filter(element => element.height < 43.9 || ['rgb(85, 26, 139)', 'rgb(0, 0, 238)'].includes(element.color)));
  assert.deepEqual(bad, [], 'visible buttons/links need 44px targets and intentional contrast');
  await page.screenshot({ path: `evidence/${name}`, fullPage: true });
}
try {
  assert.equal(await portOpen(), false, 'QA port is already owned');
  fs.mkdirSync('evidence', { recursive: true });
  const env = Object.fromEntries(['PATH', 'HOME', 'USER', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  Object.assign(env, { NEXT_TELEMETRY_DISABLED: '1', NODE_OPTIONS: '--require ' + path.join(root, 'scripts/deny-build-network.cjs'), NEXT_PUBLIC_SUPABASE_URL: 'https://offline.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'OFFLINE_PUBLIC_BUILD_PLACEHOLDER_NOT_A_CREDENTIAL' });
  const log = fs.openSync('evidence/browser-server.log', 'w');
  server = spawn('node', ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: path.resolve(root, '../..'), env, stdio: ['ignore', log, log], detached: true }); evidence.serverPid = server.pid;
  for (let index = 0; index < 100; index++) { if (await portOpen()) break; if (index === 99) throw Error('Owned built server did not start'); await pause(100); }
  system = await supporterApp({ origin, salesEnabled: false }); system.setActor(IDS.actor); system.setSalesEnabled(false);
  browser = await chromium.launch({ headless: true, executablePath: process.env.SOE_BROWSER_EXECUTABLE });
  const browserContext = await browser.newContext({ viewport: { width: 320, height: 900 } }), page = await browserContext.newPage();
  page.on('pageerror', error => evidence.pageErrors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') evidence.consoleErrors.push(message.text()); });
  let loseCheckout = true, manualDestination = null, providerReturn = '/billing';
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== origin) {
      if (manualDestination === req.url() && req.isNavigationRequest()) {
        manualDestination = null; evidence.manualProviderNavigations.push({ host: url.hostname, synthetic: true });
        return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html><head><title>Synthetic billing fixture</title></head><body><main><h1>Synthetic Stripe session</h1><p>This is a local QA response. No payment provider has been contacted.</p><a href="${origin}${providerReturn}">Return to Society of Explorers</a></main></body></html>` });
      }
      evidence.externalRequestsBlocked.push(url.origin); return route.abort();
    }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    assert.ok(url.pathname.startsWith('/api/supporter/'), 'unexpected application API request: ' + url.pathname);
    const body = req.postData() ? req.postDataJSON() : undefined;
    evidence.requests.push({ path: url.pathname, query: url.search, method: req.method() });
    if (req.method() !== 'GET') evidence.writes.push({ path: url.pathname, body });
    const response = await system.dispatch(url.pathname + url.search, req.method(), body, { ...req.headers(), origin });
    if (url.pathname === '/api/supporter/checkout' && req.method() === 'POST' && loseCheckout) { loseCheckout = false; await response.text(); return route.abort('failed'); }
    return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });

  await page.goto(origin + '/join?intent=supporter');
  await page.getByText('New supporter purchases are currently closed.', { exact: false }).waitFor();
  assert.equal(evidence.requests.every(request => request.path === '/api/supporter/offer'), true); assert.equal(evidence.writes.length, 0);
  assert.equal(new URL(await page.getByRole('link', { name: 'Create a free account', exact: true }).getAttribute('href'), origin).searchParams.get('next'), '/join?intent=supporter');
  await page.getByRole('button', { name: 'Check supporter options', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Review supporter subscription', exact: true }).isDisabled(), true);
  assert.ok(await page.getByRole('link', { name: 'Manage an existing subscription', exact: true }).count());
  await layout(page, 'supporter-closed-320.png');
  check('Default-closed join preserves the free library/Circle paths and existing-management links; initial page load reads public offer only and sends no writes');

  system.setSalesEnabled(true); await page.reload();
  await page.getByText('This server currently permits new supporter requests.', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Check supporter options', exact: true }).click();
  await page.getByRole('button', { name: 'Review supporter subscription', exact: true }).click();
  await page.getByRole('heading', { name: 'Review optional monthly support', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Confirm and prepare checkout', exact: true }).isDisabled(), true);
  assert.equal(evidence.writes.length, 0); await layout(page, 'supporter-review-320.png');
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Confirm and prepare checkout', exact: true }).click();
  await page.getByRole('button', { name: 'Retry exact billing request', exact: true }).waitFor();
  assert.equal(evidence.writes.length, 1); await page.getByRole('button', { name: 'Retry exact billing request', exact: true }).click();
  await page.getByRole('link', { name: 'Continue to Stripe checkout', exact: true }).waitFor();
  assert.equal(evidence.writes.length, 2); assert.deepEqual(evidence.writes[0].body, evidence.writes[1].body);
  assert.equal((await system.db.query('SELECT count(*)::int n FROM supporter_checkout_attempts')).rows[0].n, 1);
  assert.equal(system.provider.sessions.size, 1);
  assert.equal(page.url().startsWith(origin), true); assert.equal(evidence.manualProviderNavigations.length, 0);
  assert.equal((await page.textContent('main')).includes('Your payment went through'), false);
  await layout(page, 'supporter-ready-320.png');
  check('Fresh owned account review and checkbox precede checkout; committed lost reply is recovered by one exact retry with one durable attempt and one synthetic provider session');

  const attempt = evidence.writes[0].body.requestId;
  providerReturn = '/billing/return?attempt=' + encodeURIComponent(attempt);
  manualDestination = await page.getByRole('link', { name: 'Continue to Stripe checkout', exact: true }).getAttribute('href');
  assert.equal(new URL(manualDestination).hostname, 'checkout.stripe.com');
  await page.getByRole('link', { name: 'Continue to Stripe checkout', exact: true }).click();
  await page.getByRole('heading', { name: 'Synthetic Stripe session', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Return to Society of Explorers', exact: true }).click();
  await page.getByRole('button', { name: 'Check this return attempt', exact: true }).waitFor();
  assert.equal(evidence.requests.filter(request => request.path === '/api/supporter/return').length, 0);
  await page.getByRole('button', { name: 'Check this return attempt', exact: true }).click();
  await page.getByText('This attempt is still pending.', { exact: false }).waitFor();
  await system.provider.markPaid(attempt);
  await page.getByRole('button', { name: 'Check this return attempt', exact: true }).click();
  await page.getByText('This return attempt was verified against your own current billing state.', { exact: false }).waitFor();
  await page.getByText('Your supporter subscription is currently active.', { exact: true }).waitFor();
  assert.equal((await system.db.query('SELECT tier FROM members WHERE id=$1', [IDS.actor])).rows[0].tier, 'free');
  await layout(page, 'supporter-verified-return-320.png');
  check('Only a manual navigation opens the locally intercepted synthetic Stripe page; returning causes no private read or success claim until an explicit owned attempt check verifies synthetic payment and current status; free membership tier stays unchanged');

  const readsBeforeBilling = evidence.requests.length;
  system.setSalesEnabled(false); await page.goto(origin + '/billing');
  await page.getByRole('button', { name: 'Load current billing status', exact: true }).waitFor();
  assert.equal(evidence.requests.length, readsBeforeBilling);
  await page.getByRole('button', { name: 'Load current billing status', exact: true }).click();
  await page.getByRole('button', { name: 'Review billing management', exact: true }).click();
  await page.getByRole('heading', { name: 'Review billing management', exact: true }).waitFor();
  const beforePortal = evidence.writes.length; assert.equal(beforePortal, 2);
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Confirm and prepare billing portal', exact: true }).click();
  await page.getByRole('link', { name: 'Open my Stripe billing portal', exact: true }).waitFor();
  assert.equal(evidence.writes.length, beforePortal + 1);
  await layout(page, 'supporter-portal-320.png');
  providerReturn = '/billing'; manualDestination = await page.getByRole('link', { name: 'Open my Stripe billing portal', exact: true }).getAttribute('href');
  assert.equal(new URL(manualDestination).hostname, 'billing.stripe.com');
  await page.getByRole('link', { name: 'Open my Stripe billing portal', exact: true }).click();
  await page.getByRole('heading', { name: 'Synthetic Stripe session', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Return to Society of Explorers', exact: true }).click();
  assert.equal(await page.getByRole('link', { name: 'Open my Stripe billing portal', exact: true }).count(), 0);
  check('New sales can close while existing subscription management still requires fresh owned state, explicit portal review/confirmation and a separate manual navigation; returning restores no private session URL');

  system.setActor(IDS.other); await page.goto(origin + '/billing/return?attempt=' + attempt);
  await page.getByRole('button', { name: 'Check this return attempt', exact: true }).click();
  await page.getByText(/Billing could not be confirmed|Billing options are not available/).waitFor();
  assert.equal(await page.locator('section[aria-label="Your current billing status"]').count(), 0);
  assert.equal((await page.textContent('main')).includes('currently active'), false);
  check('A different canonical account cannot inspect the first account’s return attempt or subscription details');

  // Fixture setup is explicit and separate from new supporter purchases.
  await system.seedLegacy(IDS.other); await page.goto(origin + '/billing');
  await page.getByRole('button', { name: 'Load current billing status', exact: true }).click();
  await page.getByText('An older membership is linked to this account.', { exact: false }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Review supporter subscription', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Review billing management', exact: true }).click();
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Confirm and prepare billing portal', exact: true }).click();
  await page.getByRole('link', { name: 'Open my Stripe billing portal', exact: true }).waitFor();
  assert.equal((await system.db.query('SELECT tier FROM members WHERE id=$1', [IDS.other])).rows[0].tier, 'oracle');
  await layout(page, 'legacy-management-320.png');
  check('An existing legacy subscriber can prepare owned billing management while new sales are closed; the old tier remains Oracle and is not renamed or migrated');

  await system.db.query('INSERT INTO members(id,tier) VALUES($1,$2)', [IDS.absent, 'free']);
  system.setActor(IDS.absent); system.setSalesEnabled(true); await page.goto(origin + '/join');
  await page.getByText('This server currently permits new supporter requests.', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Check supporter options', exact: true }).click();
  await page.getByRole('button', { name: 'Review supporter subscription', exact: true }).click();
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Confirm and prepare checkout', exact: true }).click();
  await page.getByRole('link', { name: 'Continue to Stripe checkout', exact: true }).waitFor();
  const abandoned = evidence.writes.at(-1).body.requestId, original = system.provider.sessions.get(abandoned);
  original.status = 'expired'; original.url = null; system.setSalesEnabled(false);
  await page.goto(origin + '/billing'); await page.getByRole('button', { name: 'Load current billing status', exact: true }).click();
  await page.getByRole('button', { name: 'Review pending checkout recovery', exact: true }).click();
  await page.getByRole('heading', { name: 'Review the pending checkout attempt', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Confirm pending checkout recovery', exact: true }).isDisabled(), true);
  const beforeRecovery = evidence.writes.length, providerCount = system.provider.sessions.size;
  await layout(page, 'expired-checkout-recovery-320.png');
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Confirm pending checkout recovery', exact: true }).click();
  await page.getByRole('button', { name: 'Retry exact billing request', exact: true }).waitFor();
  assert.equal(evidence.writes.length, beforeRecovery + 1); assert.equal(evidence.writes.at(-1).body.requestId, abandoned); assert.equal(system.provider.sessions.size, providerCount);
  await page.getByRole('button', { name: 'Load current billing status', exact: true }).click();
  await page.getByText('No current subscription was found in this billing check.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Retry exact billing request', exact: true }).count(), 0);
  assert.equal((await system.db.query('SELECT status FROM supporter_checkout_attempts WHERE request_id=$1', [abandoned])).rows[0].status, 'expired');
  system.setSalesEnabled(true); await page.goto(origin + '/join');
  await page.getByRole('button', { name: 'Check supporter options', exact: true }).click();
  await page.getByRole('button', { name: 'Review supporter subscription', exact: true }).click();
  await page.getByRole('heading', { name: 'Review optional monthly support', exact: true }).waitFor();
  assert.equal(evidence.writes.length, beforeRecovery + 1);
  check('Reloaded/cancelled expired checkout recovers only its original durable key after fresh review and checkbox, even with sales closed; verified expiration clears the local retry and permits a separately reviewed future request without automatically sending one');

  await page.getByRole('button', { name: 'Cancel this review', exact: true }).click();
  system.setActor(IDS.other); await page.goto(origin + '/billing');
  await page.getByRole('button', { name: 'Load current billing status', exact: true }).click();
  await page.getByRole('button', { name: 'Review billing management', exact: true }).click();
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Confirm and prepare billing portal', exact: true }).click();
  await page.getByRole('link', { name: 'Open my Stripe billing portal', exact: true }).waitFor();

  // A real browser event adapter signal, with no native-window acceptance claim.
  await page.evaluate(() => dispatchEvent(new Event('blur')));
  await page.getByText('Private billing details, confirmation and local retry request cleared.', { exact: false }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Open my Stripe billing portal', exact: true }).count(), 0);
  const count = evidence.requests.length; await page.evaluate(() => dispatchEvent(new Event('focus'))); assert.equal(evidence.requests.length, count);
  check('Browser lifetime retirement signal clears the prepared private portal URL; focus does not re-read or repeat any request (native OS focus departure is not assessed)');

  assert.deepEqual(evidence.externalRequestsBlocked, []); assert.deepEqual(evidence.pageErrors, []);
  assert.deepEqual(evidence.consoleErrors.filter(message => !message.includes('net::ERR_FAILED') && !message.includes('404 (Not Found)') && !message.includes('403 (Forbidden)')), []);
  evidence.status = 'PASS';
} catch (error) { failed = error; evidence.status = 'FAIL'; evidence.error = String(error.stack || error); }
finally {
  if (browser) await browser.close(); if (system) await system.close();
  if (server?.pid) { try { process.kill(-server.pid, 'SIGTERM'); } catch {} for (let index = 0; index < 50 && await portOpen(); index++) await pause(100); evidence.ownedServerStopped = !(await portOpen()); }
  fs.mkdirSync('evidence', { recursive: true }); fs.writeFileSync('evidence/browser-qa.json', JSON.stringify(evidence, null, 2) + '\n');
  if (failed) { process.stderr.write(String(failed.stack || failed) + '\n'); process.exitCode = 1; } else process.stdout.write(JSON.stringify({ status: evidence.status, checks: evidence.checks.length, ownedServerStopped: evidence.ownedServerStopped }) + '\n');
}
