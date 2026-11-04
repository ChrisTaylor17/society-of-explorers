import test from 'node:test';
import assert from 'node:assert/strict';
import { offlineApp } from './support/offline-app.mjs';

class Target {
  listeners = new Map(); visibilityState = 'visible';
  addEventListener(name, fn) { const listeners = this.listeners.get(name) ?? new Set(); listeners.add(fn); this.listeners.set(name, listeners); }
  removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
  dispatchEvent(event) { for (const fn of this.listeners.get(event.type) ?? []) fn(event); return true; }
  emit(type, extras = {}) { this.dispatchEvent({ type, ...extras }); }
  get count() { return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0); }
}
function fixture({ storageBlocked = false, channelBlocked = false } = {}) {
  const app = offlineApp(), win = new Target(), doc = new Target(), channels = [], stored = [];
  win.localStorage = { setItem(key, value) { if (storageBlocked) throw Error('Fixture storage blocked'); stored.push([key, value]); } };
  class Channel {
    closed = false; onmessage = null;
    constructor(name) { if (channelBlocked) throw Error('Fixture channel blocked'); this.name = name; channels.push(this); }
    postMessage(value) { for (const channel of channels) if (!channel.closed && channel !== this && channel.name === this.name) channel.onmessage?.({ data: value }); }
    close() { this.closed = true; }
  }
  Object.assign(app.context, { window: win, Event, BroadcastChannel: Channel });
  const { bindCircleAccess } = app.load('lib/circles/browser-access.ts');
  const events = app.load('lib/auth/providerSelection.ts');
  let privateValue = 'PRIVATE_FIXTURE_VIEW', draft = 'PRIVATE_FIXTURE_DRAFT', retired = 0, inactive = 0, active = 0, detached = 0;
  const dispose = bindCircleAccess({ window: win, document: doc, subscribeAuth: () => () => detached++,
    onIdentity: () => { privateValue = ''; draft = ''; retired++; }, onInactive: () => inactive++, onActive: () => active++ });
  return { app, win, doc, channels, stored, dispose, events,
    state: () => ({ privateValue, draft, retired, inactive, active, detached }) };
}

test('deliberate provider choice synchronously clears ordinary Circle private data and drafts without activating or requesting again', () => {
  const f = fixture(); f.events.notifyAuthProviderChanged();
  assert.equal(f.state().privateValue, ''); assert.equal(f.state().draft, ''); assert.ok(f.state().retired > 0);
  assert.equal(f.state().active, 0); assert.equal(f.state().inactive, 0);
  assert.equal(f.stored.length, 1); assert.doesNotMatch(JSON.stringify(f.stored), /PRIVATE_FIXTURE|Bearer|subject|memberId/);
  f.dispose(); assert.equal(f.win.count, 0); assert.equal(f.doc.count, 0); assert.equal(f.state().detached, 1);
});

test('same-tab retirement survives denied storage and BroadcastChannel', () => {
  const f = fixture({ storageBlocked: true, channelBlocked: true });
  f.events.notifyAuthProviderChanged(); assert.equal(f.state().privateValue, ''); assert.equal(f.state().draft, '');
  assert.equal(f.state().active, 0); f.dispose();
});

test('cross-tab channel retirement remains available with blocked storage and ignores non-change payloads', () => {
  const f = fixture({ storageBlocked: true }); const channel = f.channels[0];
  channel.onmessage({ data: { subject: 'UNTRUSTED' } }); assert.equal(f.state().retired, 0);
  channel.onmessage({ data: 'changed' }); assert.equal(f.state().privateValue, ''); assert.equal(f.state().active, 0);
  f.dispose(); assert.equal(channel.closed, true); const before = f.state().retired;
  channel.onmessage({ data: 'changed' }); f.win.emit('soe:auth-provider-changed');
  assert.equal(f.state().retired, before);
});

test('cross-tab storage notification clears a view without treating notification data as authority', () => {
  const f = fixture({ channelBlocked: true });
  f.win.emit('storage', { key: 'soe.auth.provider.changed', newValue: 'UNTRUSTED_EPOCH_ONLY' });
  assert.equal(f.state().privateValue, ''); assert.equal(f.state().active, 0); f.dispose();
});
