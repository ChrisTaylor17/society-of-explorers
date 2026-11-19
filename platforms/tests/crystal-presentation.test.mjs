import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from './load-source.mjs';

const load = sourceLoader();
const { createCrystalPresentation } = load('platforms/shared/crystal-presentation.ts');
const { createVerifiedMemberSession } = load('platforms/native/src/circles/verified-member-session.ts');
const { getThinkerProfile, getAllThinkerIds } = load('lib/claude/thinkers.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const inactive = { sessionActive: false, phase: 'idle', thinkerId: null, speakingColor: null };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function fixture(t) {
  let subject = 'SYNTHETIC_MEMBER_A', verifies = 0, credentialReads = 0, detachCalls = 0;
  const events = new Set();
  const binding = createVerifiedMemberSession({
    async verify() { verifies++; return subject ? { subject, credentials: { private: 'SYNTHETIC_SECRET' } } : null; },
    onAuthStateChange(listener) {
      events.add(listener);
      return { data: { subscription: { unsubscribe: () => events.delete(listener) } } };
    },
  });
  const owner = {
    scope: binding.owner.scope,
    subscribe(listener) {
      const off = binding.owner.subscribe(listener);
      return () => { detachCalls++; off(); };
    },
    get credentials() { credentialReads++; throw Error('Presentation must never read credentials'); },
  };
  const view = createCrystalPresentation(owner);
  let session = null;
  const activate = () => (session = view.activate());
  t.after(() => { view.close(); binding.stop(); });
  return { view, binding, events, activate, get session() { return session; },
    async ready() { await binding.start(); assert(activate()); },
    async switchAccount(next) {
      subject = next;
      for (const listener of events) listener('USER_UPDATED');
      await tick();
    },
    counts: () => ({ verifies, credentialReads, detachCalls }),
  };
}
function begin(view, session, id = 'plato') {
  assert.equal(view.selectThinker(session, id), true);
  assert.equal(view.consentToVoice(session, true), true);
  const turn = view.beginListening(session);
  assert(turn);
  return turn;
}

test('no unverified scope or key-shaped value can activate a presentation', t => {
  const f = fixture(t);
  assert.equal(f.view.activate('NFC_TAG_NOT_IDENTITY'), null);
  assert.equal(f.view.selectThinker(f.session, 'plato'), false);
  assert.equal(f.view.consentToVoice(f.session, true), false);
  assert.equal(f.view.beginListening(f.session), null);
  assert.deepEqual(plain(f.view.model()), inactive);
  assert.throws(() => createCrystalPresentation({ keyId: 'tag' }), /verified session signals/i);
});

test('actual verified-session helper supplies the lifetime without granting membership or reading credentials', async t => {
  const f = fixture(t);
  await f.ready();
  const turn = begin(f.view, f.session);
  assert.equal(f.view.beginThinking(turn), true);
  assert.equal(f.view.beginSpeaking(turn), true);
  assert.equal(f.view.finishSpeaking(turn), true);
  assert.deepEqual(f.counts(), { verifies: 1, credentialReads: 0, detachCalls: 0 });
});

test('six canonical thinkers expose their signature color only during speaking presentation', async t => {
  const f = fixture(t); await f.ready();
  for (const id of getAllThinkerIds()) {
    const turn = begin(f.view, f.session, id);
    assert.deepEqual(plain(f.view.model()), { sessionActive: true, phase: 'listening', thinkerId: id, speakingColor: null });
    assert.equal(f.view.beginThinking(turn), true);
    assert.equal(f.view.model().speakingColor, null);
    assert.equal(f.view.beginSpeaking(turn), true);
    assert.deepEqual(plain(f.view.model()), { sessionActive: true, phase: 'speaking', thinkerId: id, speakingColor: getThinkerProfile(id).color });
    assert.equal(f.view.finishSpeaking(turn), true);
    assert.equal(f.view.model().phase, 'idle');
    assert.equal(f.view.model().speakingColor, null);
  }
});

test('invalid, inherited and custom names cannot masquerade as canonical hardware presentation profiles', async t => {
  const f = fixture(t); await f.ready();
  for (const id of [...Object.getOwnPropertyNames(Object.prototype), '', 'Plato', 'marcus_aurelius', 'custom-guide', null, {}]) {
    assert.equal(f.view.selectThinker(f.session, id), false);
    assert.equal(f.view.model().thinkerId, null);
  }
  const turn = begin(f.view, f.session);
  assert.equal(f.view.selectThinker(f.session, 'constructor'), false);
  assert.equal(f.view.beginThinking(turn), true);
});

test('voice intent requires explicit true and refusal retires the pending turn', async t => {
  const f = fixture(t); await f.ready(); f.view.selectThinker(f.session, 'plato');
  for (const refused of [false, undefined, null, 'true', 1, {}]) {
    assert.equal(f.view.consentToVoice(f.session, refused), false);
    assert.equal(f.view.beginListening(f.session), null);
  }
  const old = begin(f.view, f.session); f.view.beginThinking(old);
  assert.equal(f.view.consentToVoice(f.session, false), false);
  assert.equal(f.view.model().phase, 'idle');
  assert.equal(f.view.beginSpeaking(old), false);
  f.view.consentToVoice(f.session, true);
  assert.equal(f.view.beginSpeaking(old), false);
  assert(f.view.beginListening(f.session));
});

test('out-of-order, fabricated and repeated transitions never skip the current turn', async t => {
  const f = fixture(t); await f.ready();
  const turn = begin(f.view, f.session);
  assert.equal(f.view.beginListening(f.session), null);
  assert.equal(f.view.beginSpeaking(turn), false);
  assert.equal(f.view.finishSpeaking(turn), false);
  assert.equal(f.view.beginThinking({ ...turn }), false);
  assert.equal(f.view.beginThinking(turn), true);
  assert.equal(f.view.beginThinking(turn), false);
  assert.equal(f.view.beginSpeaking(turn), true);
  assert.equal(f.view.beginSpeaking(turn), false);
  assert.equal(f.view.finishSpeaking(turn), true);
  assert.equal(f.view.finishSpeaking(turn), false);
  assert.equal(f.view.beginSpeaking(turn), false);
});

test('late completion or cancellation from an older turn cannot disturb a newer one', async t => {
  const f = fixture(t); await f.ready();
  const old = begin(f.view, f.session); f.view.beginThinking(old);
  let deliver;
  const delayed = new Promise(resolve => { deliver = resolve; }).then(() => f.view.beginSpeaking(old));
  assert.equal(f.view.cancelTurn(old), true);
  const current = f.view.beginListening(f.session); assert(current);
  f.view.beginThinking(current);
  deliver(); assert.equal(await delayed, false);
  assert.equal(f.view.cancelTurn(old), false);
  assert.equal(f.view.beginSpeaking(current), true);
});

test('changing the selected thinker retires the old completion', async t => {
  const f = fixture(t); await f.ready();
  const old = begin(f.view, f.session); f.view.beginThinking(old);
  assert.equal(f.view.selectThinker(f.session, 'socrates'), true);
  assert.equal(f.view.beginSpeaking(old), false);
  assert.deepEqual(plain(f.view.model()), { sessionActive: true, phase: 'idle', thinkerId: 'socrates', speakingColor: null });
});

for (const removedAt of ['listening', 'thinking', 'speaking']) {
  test(`simulated key removal during ${removedAt} wipes local presentation and requires explicit reactivation`, async t => {
    const f = fixture(t); await f.ready(); const turn = begin(f.view, f.session);
    if (removedAt !== 'listening') f.view.beginThinking(turn);
    if (removedAt === 'speaking') f.view.beginSpeaking(turn);
    f.view.retire(f.session); f.view.retire(f.session);
    assert.deepEqual(plain(f.view.model()), inactive);
    assert.equal(f.view.beginThinking(turn), false);
    assert.equal(f.view.beginSpeaking(turn), false);
    assert.equal(f.view.finishSpeaking(turn), false);
    assert.equal(f.view.beginListening(f.session), null);
    // The host, not this display module, owns provider/archive cleanup.
    assert(f.binding.owner.scope());
    assert(f.activate());
    assert.equal(f.view.model().thinkerId, null);
    f.view.selectThinker(f.session, 'plato');
    assert.equal(f.view.beginListening(f.session), null); // Consent did not survive removal.
    f.view.consentToVoice(f.session, true);
    assert.equal(f.view.beginSpeaking(turn), false);
  });
}

test('real verified-session account switches, including back to the first member, retire old work', async t => {
  const f = fixture(t); await f.ready();
  const first = begin(f.view, f.session); f.view.beginThinking(first);
  await f.switchAccount('SYNTHETIC_MEMBER_B');
  assert.equal(f.binding.model().phase, 'ready');
  assert.deepEqual(plain(f.view.model()), inactive);
  assert.equal(f.view.beginSpeaking(first), false);
  f.activate();
  const second = begin(f.view, f.session, 'jobs'); f.view.beginThinking(second);
  await f.switchAccount('SYNTHETIC_MEMBER_A');
  f.activate();
  assert.equal(f.view.beginSpeaking(first), false);
  assert.equal(f.view.beginSpeaking(second), false);
  assert.equal(f.view.beginListening(f.session), null);
});

test('provider stop and suspension retire speaking without a key-removal signal', async t => {
  const f = fixture(t); await f.ready();
  const turn = begin(f.view, f.session); f.view.beginThinking(turn); f.view.beginSpeaking(turn);
  f.binding.activity(false);
  assert.deepEqual(plain(f.view.model()), inactive);
  f.binding.stop();
  assert.equal(f.activate(), null);
  assert.equal(f.view.beginSpeaking(turn), false);
});

test('a changed or throwing scope is refused even if an owner notification is missed', () => {
  let scope = 'synthetic-verified-scope-A', throws = false;
  const view = createCrystalPresentation({ scope() { if (throws) throw Error('PRIVATE_DETAIL'); return scope; }, subscribe: () => () => {} });
  const session = view.activate(); const turn = begin(view, session); view.beginThinking(turn);
  scope = 'synthetic-verified-scope-B';
  assert.equal(view.beginSpeaking(turn), false);
  assert.deepEqual(plain(view.model()), inactive);
  const nextSession = view.activate(); begin(view, nextSession); throws = true;
  assert.deepEqual(plain(view.model()), inactive);
  view.close();
});

test('turn handles cannot cross controller instances', async t => {
  const a = fixture(t), b = fixture(t); await a.ready(); await b.ready();
  const aTurn = begin(a.view, a.session), bTurn = begin(b.view, b.session);
  assert.equal(a.view.beginThinking(bTurn), false);
  assert.equal(b.view.beginThinking(aTurn), false);
  assert.equal(a.view.beginThinking(aTurn), true);
});

test('presentation snapshots are immutable and contain only the four intended public fields', async t => {
  const f = fixture(t); await f.ready();
  const turn = begin(f.view, f.session); f.view.beginThinking(turn); f.view.beginSpeaking(turn);
  const snapshot = f.view.model();
  assert.deepEqual(Object.keys(snapshot).sort(), ['phase', 'sessionActive', 'speakingColor', 'thinkerId']);
  assert.doesNotMatch(JSON.stringify(snapshot), /SYNTHETIC_MEMBER|SECRET|verified-owner|voiceId|systemPrompt|email|bearer|transcript/i);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.throws(() => { snapshot.thinkerId = 'jobs'; }, TypeError);
  assert.equal(f.view.model().thinkerId, 'plato');
  assert.equal(JSON.stringify(turn), '{}');
  assert.equal(Object.isFrozen(turn), true);
  assert.equal(f.counts().credentialReads, 0);
});

test('observer refusal or reentrant retirement cannot revive or deliver stale speaking state', async t => {
  const f = fixture(t); await f.ready(); const seen = [];
  f.view.subscribe(() => { throw Error('Synthetic observer failure'); });
  f.view.subscribe(value => { if (value.phase === 'speaking') f.view.retire(f.session); });
  f.view.subscribe(value => { seen.push(plain(value)); });
  const turn = begin(f.view, f.session); f.view.beginThinking(turn);
  assert.equal(f.view.beginSpeaking(turn), false);
  assert.deepEqual(seen.at(-1), inactive);
  assert.equal(seen.some(value => value.phase === 'speaking'), false);
});

test('close detaches and cannot be reopened by delayed owner or completion events', async t => {
  const f = fixture(t); await f.ready();
  const turn = begin(f.view, f.session); f.view.beginThinking(turn);
  f.view.close(); f.view.close();
  assert.equal(f.counts().detachCalls, 1);
  await f.switchAccount('SYNTHETIC_MEMBER_B');
  assert.equal(f.activate(), null);
  assert.equal(f.view.beginSpeaking(turn), false);
  assert.deepEqual(plain(f.view.model()), inactive);
});

test('an unavailable observer or failed detach never leaves an active presentation', () => {
  assert.throws(() => createCrystalPresentation({ scope: () => 'scope', subscribe: () => null }), /observer unavailable/);
  assert.throws(() => createCrystalPresentation({ scope: () => 'scope', subscribe() { throw Error('private'); } }), /observer unavailable/);
  const view = createCrystalPresentation({ scope: () => 'scope', subscribe: () => () => { throw Error('Synthetic detach failure'); } });
  const session = view.activate(); begin(view, session); view.close();
  assert.deepEqual(plain(view.model()), inactive);
});

test('each verified member presentation has a distinct local session handle', async t => {
  const f = fixture(t); await f.ready();
  const priorSession = f.activate();
  await f.switchAccount('SYNTHETIC_MEMBER_B');
  const currentSession = f.activate();
  assert(priorSession && currentSession);
  assert.notEqual(priorSession, currentSession);
});

test('late selection, consent and key-removal events from a previous member cannot affect the current member', async t => {
  const f = fixture(t); await f.ready();
  const priorSession = f.session;
  const priorTurn = begin(f.view, priorSession); f.view.beginThinking(priorTurn);
  await f.switchAccount('SYNTHETIC_MEMBER_B'); f.activate();
  const currentTurn = begin(f.view, f.session, 'einstein'); f.view.beginThinking(currentTurn);
  const currentModel = plain(f.view.model());
  assert.equal(f.view.selectThinker(priorSession, 'jobs'), false);
  assert.equal(f.view.consentToVoice(priorSession, true), false);
  assert.equal(f.view.consentToVoice(priorSession, false), false);
  assert.equal(f.view.beginListening(priorSession), null);
  assert.equal(f.view.retire(priorSession), false);
  assert.equal(f.view.beginSpeaking(priorTurn), false);
  assert.deepEqual(plain(f.view.model()), currentModel);
  assert.equal(f.view.beginSpeaking(currentTurn), true);
});

test('reactivating the same verified owner cannot reuse removed or fabricated session handles', async t => {
  const f = fixture(t); await f.ready();
  const removed = f.session;
  assert.equal(f.view.activate(), removed); // Idempotent only while still active.
  f.view.retire(removed); f.activate();
  assert.notEqual(f.session, removed);
  assert.equal(f.view.selectThinker(removed, 'plato'), false);
  assert.equal(f.view.selectThinker({ ...f.session }, 'plato'), false);
  assert.equal(f.view.consentToVoice(removed, true), false);
  assert.equal(f.view.beginListening(removed), null);
  assert.equal(f.view.retire(removed), false);
  assert.equal(Object.isFrozen(f.session), true);
  assert.equal(JSON.stringify(f.session), '{}');
  assert(begin(f.view, f.session));
});

test('revoking local voice intent clears speaking color and cannot be undone by a repeated completion', async t => {
  const f = fixture(t); await f.ready();
  const turn = begin(f.view, f.session); f.view.beginThinking(turn); f.view.beginSpeaking(turn);
  f.view.consentToVoice(f.session, false);
  assert.equal(f.view.model().speakingColor, null);
  assert.equal(f.view.model().phase, 'idle');
  assert.equal(f.view.beginSpeaking(turn), false);
  assert.equal(f.view.finishSpeaking(turn), false);
  assert.equal(f.view.beginListening(f.session), null);
});
