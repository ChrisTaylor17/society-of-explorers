import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { offlineApp } from './support/offline-app.mjs';

const require = createRequire(path.resolve('../../package.json'));
const { JSDOM } = createRequire(path.resolve('tooling/package.json'))('jsdom');
const id = '11111111-1111-4111-8111-111111111111', subject = '22222222-2222-4222-8222-222222222222';
const code = id + '.' + 'a'.repeat(64);
const receipt = { id, requestedAt: '2026-11-11T10:00:00.000Z', reviewBy: '2026-11-15T10:00:00.000Z' };

// Actual form and receipt parser in React DOM; only transport and current
// browser identity are synthetic. No requests leave this local process.
async function mount({ intakeEnabled = false, respond = () => Response.json({ request: receipt }) } = {}) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://offline.invalid/account/delete', pretendToBeVisual: true });
  const previous = {};
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous[name] = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
  }
  const React = require('react'), { act } = React, { createRoot } = require('react-dom/client'), app = offlineApp();
  Object.assign(app.context, { window: dom.window, document: dom.window.document, navigator: dom.window.navigator });
  const requests = [], listeners = new Set();
  app.context.fetch = async (url, options = {}) => { requests.push({ url, options }); return respond({ url, options }); };
  app.setMock('@/lib/auth/browserIntent', () => ({ currentBrowserAuthIntent: () => '99999999-9999-4999-8999-999999999999' }));
  app.setMock('@/lib/auth/providerSelection', () => ({ subscribeAuthProviderChanges(fn) { listeners.add(fn); return () => listeners.delete(fn); } }));
  app.setMock('../profile/profile.module.css', () => ({ __esModule: true, default: {} }));
  const Form = app.load('app/account/delete/AccountDeletionForm.tsx').default;
  const root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(Form, { intakeEnabled }))));
  async function input(selector, value) {
    const element = document.querySelector(selector);
    assert(element, selector);
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(element, value);
      element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
  }
  async function click(label) {
    const button = [...document.querySelectorAll('button')].find(el => el.textContent === label);
    assert(button, label); assert.equal(button.disabled, false, label);
    await act(async () => button.click());
  }
  return { dom, requests, input, click, act,
    text: () => document.body.textContent,
    async check() { await input('#deletion-status-code', code); await click('Check request status'); },
    async retire() { await act(async () => { for (const listener of listeners) listener(); }); },
    async cleanup() {
      await act(async () => root.unmount()); dom.window.close();
      for (const [name, descriptor] of Object.entries(previous)) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
      }
    },
  };
}

test('legacy status is honestly unknown while a signed-out user can check the private code with intake disabled', async () => {
  const f = await mount();
  try {
    assert.equal(f.requests.length, 0); await f.check();
    assert.match(f.text(), /Request received\. Processing status is unavailable\./);
    assert.match(f.text(), /older receipt does not show whether processing has started/);
    assert.match(f.text(), /does not confirm final deletion/);
    assert.doesNotMatch(f.text(), /account stays active|account remains active|deletion is complete|Account deletion is pending/i);
    assert.equal(document.querySelectorAll('time').length, 2);
    assert.equal(document.querySelector('#deletion-status-code').value, '');
    assert.equal(f.requests.length, 1);
    const call = f.requests[0];
    assert.equal(call.url, '/api/account/deletion');
    assert.equal(call.options.method, 'POST'); assert.equal(call.options.cache, 'no-store');
    assert.equal(call.options.redirect, 'error'); assert.equal(call.options.credentials, 'same-origin');
    assert.deepEqual(JSON.parse(call.options.body), { action: 'status', code });
    assert.equal(Object.hasOwn(call.options.headers, 'Authorization'), false);
  } finally { await f.cleanup(); }
});

test('explicit null labels only the current recorded snapshot without claiming that processing cannot begin', async () => {
  const f = await mount({ respond: () => Response.json({ request: { ...receipt, processingStartedAt: null } }) });
  try {
    await f.check(); assert.match(f.text(), /No processing start is recorded/);
    assert.match(f.text(), /processing may begin after this check/);
    assert.match(f.text(), /does not confirm final deletion/);
    assert.equal(document.querySelectorAll('time').length, 2);
    assert.doesNotMatch(f.text(), /processing has started|account stays active|processing is unavailable/i);
  } finally { await f.cleanup(); }
});

test('processing shows its real start time without claiming completion and auth retirement hides the previous receipt', async () => {
  const started = '2026-11-11T11:00:00.000Z';
  const f = await mount({ respond: () => Response.json({ request: { ...receipt, processingStartedAt: started } }) });
  try {
    await f.check(); assert.match(f.text(), /Account deletion processing has started\./);
    assert.match(f.text(), /Account access may be restricted/);
    assert.match(f.text(), /does not confirm final deletion/);
    assert.equal(document.querySelectorAll('time').length, 3);
    assert.equal(document.querySelectorAll('time')[2].dateTime, started);
    assert.doesNotMatch(f.text(), /deletion is complete|account stays active/i);
    await f.retire(); assert.doesNotMatch(f.text(), /processing has started|Request reference/);
  } finally { await f.cleanup(); }
});

test('malformed, mismatched or private-extra receipt responses never render success or erase the input code', async () => {
  for (const bad of [{ ...receipt, processingStartedAt: undefined, completed: true },
    { ...receipt, processingStartedAt: '2026-11-11T09:00:00Z' },
    { ...receipt, processingStartedAt: '2026-11-11T10:00:00' },
    { ...receipt, id: subject }, { ...receipt, processingStartedAt: null, auth_user_id: subject }]) {
    const f = await mount({ respond: () => Response.json({ request: bad }) });
    try {
      await f.check(); assert.match(f.text(), /request status is temporarily unavailable/);
      assert.doesNotMatch(f.text(), /Request received|processing has started|Request reference/);
      assert.equal(document.querySelector('#deletion-status-code').value, code);
      assert.doesNotMatch(f.text(), new RegExp(subject));
    } finally { await f.cleanup(); }
  }
});

test('preparing a reviewed request explains that access may be restricted and makes no unconditional active-account promise', async () => {
  const f = await mount({ intakeEnabled: true, respond: () => Response.json({ owner: { provider: 'supabase', subject },
    label: 'Fictional account', reviewDays: 4, request: null }) });
  try {
    await f.click('Check my account'); await f.click('Prepare deletion request');
    assert.match(f.text(), /Submitting a request does not immediately delete your data/);
    assert.match(f.text(), /Account access may be restricted once processing begins/);
    assert.doesNotMatch(f.text(), /account stays active|account remains active/i);
    assert.equal(f.requests.length, 1, 'preparation does not send a deletion request');
    const submit = [...document.querySelectorAll('button')].find(el => el.textContent === 'Submit deletion request');
    assert.equal(submit.disabled, true);
  } finally { await f.cleanup(); }
});
