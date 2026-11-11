import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { offlineApp } from './support/offline-app.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const catalog = offlineApp({ root }).load('lib/claude/thinkers.ts');
const registeredIds = ['socrates', 'plato', 'nietzsche', 'aurelius', 'einstein', 'jobs'];
const inheritedNames = Object.getOwnPropertyNames(Object.prototype);
const fallbackId = 'a-community-guide-outside-the-built-in-catalog';

test('each registered thinker retains a complete profile and usable full and compact prompts', () => {
  assert.deepEqual(Array.from(catalog.getAllThinkerIds()), registeredIds);
  for (const id of registeredIds) {
    const profile = catalog.getThinkerProfile(id);
    assert.equal(profile.id, id);
    for (const field of ['name', 'symbol', 'voiceId', 'greeting', 'systemPrompt']) {
      assert.equal(typeof profile[field], 'string', `${id}.${field}`);
      assert.ok(profile[field].length > 0, `${id}.${field}`);
    }
    assert.match(profile.color, /^#[0-9A-F]{6}$/i);
    assert.equal(catalog.buildSystemPrompt(id), profile.systemPrompt);
    const compact = catalog.buildSystemPrompt(id, { compact: true });
    assert.equal(typeof compact, 'string');
    assert.notEqual(compact, catalog.buildSystemPrompt(fallbackId, { compact: true }));
  }
});

test('unregistered and custom community IDs retain the generic fallback without inventing a profile', () => {
  for (const id of ['', 'Plato', 'socrates ', 'marcus_aurelius', fallbackId]) {
    assert.equal(catalog.getThinkerProfile(id), null, id);
    for (const compact of [false, true]) {
      assert.equal(catalog.buildSystemPrompt(id, { compact }),
        catalog.buildSystemPrompt(fallbackId, { compact }), id);
    }
  }
});

test('Object prototype names are not registered thinker profiles', () => {
  for (const id of inheritedNames) {
    assert.equal(catalog.getThinkerProfile(id), null, id);
  }
});

test('full prompts for Object prototype names use the same fallback as any other unknown ID', () => {
  for (const id of inheritedNames) {
    assert.equal(catalog.buildSystemPrompt(id), catalog.buildSystemPrompt(fallbackId), id);
  }
});

test('compact prompts for Object prototype names cannot include inherited functions or objects', () => {
  for (const id of inheritedNames) {
    assert.equal(catalog.buildSystemPrompt(id, { compact: true }),
      catalog.buildSystemPrompt(fallbackId, { compact: true }), id);
  }
});
