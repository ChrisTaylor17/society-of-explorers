import { getThinkerProfile } from '../../lib/claude/thinkers';
import type { VerifiedAccountOwner } from '../native/src/circles/verified-member-session';

type VerifiedSessionSignals = Pick<VerifiedAccountOwner, 'scope' | 'subscribe'>;
export type CrystalPhase = 'idle' | 'listening' | 'thinking' | 'speaking';
export type CrystalPresentation = Readonly<{
  sessionActive: boolean;
  phase: CrystalPhase;
  thinkerId: string | null;
  speakingColor: string | null;
}>;
declare const sessionIdentity: unique symbol;
declare const turnIdentity: unique symbol;
/** In-process identity only; not serializable, a credential, or a device message. */
export type CrystalSession = Readonly<{ [sessionIdentity]: true }>;
export type CrystalTurn = Readonly<{ [turnIdentity]: true }>;

/** Proposed software-only boundary for design-package §§6 and 12.
 * The host supplies an already-verified session; this module authenticates nobody.
 * One active presentation and one turn are supported. No transport, audio, light,
 * transcript, reward or persistence effect is performed here.
 */
export function createCrystalPresentation(owner: VerifiedSessionSignals) {
  if (typeof owner?.scope !== 'function' || typeof owner.subscribe !== 'function') {
    throw Error('Existing verified session signals required');
  }
  let scope: string | null = null, closed = false, voiceConsent = false;
  let session: CrystalSession | null = null;
  let phase: CrystalPhase = 'idle';
  let selected: { id: string; color: string } | null = null;
  let pendingTurn: CrystalTurn | null = null;
  let emitting = false, emitAgain = false;
  const listeners = new Set<(value: CrystalPresentation) => void>();

  function observedScope() {
    try {
      const value = owner.scope();
      return typeof value === 'string' && value.length > 0 ? value : null;
    } catch { return null; }
  }
  function clearTurn() { pendingTurn = null; phase = 'idle'; }
  function clearSession() {
    const changed = scope !== null || selected !== null || voiceConsent || pendingTurn !== null || phase !== 'idle';
    scope = null; session = null; selected = null; voiceConsent = false; clearTurn();
    return changed;
  }
  function retireCurrent() { if (clearSession()) emit(); }
  function active() {
    if (scope !== null && observedScope() !== scope) retireCurrent();
    return !closed && scope !== null;
  }
  function ownsSession(expected: CrystalSession) {
    return active() && session !== null && expected === session;
  }
  function model(): CrystalPresentation {
    const sessionActive = active();
    return Object.freeze({ sessionActive, phase, thinkerId: selected?.id ?? null,
      speakingColor: phase === 'speaking' ? selected?.color ?? null : null });
  }
  function emit() {
    if (emitting) { emitAgain = true; return; }
    emitting = true;
    try {
      do {
        emitAgain = false;
        for (const listener of [...listeners]) {
          if (!listeners.has(listener)) continue;
          try { listener(model()); } catch { /* One observer cannot block retirement. */ }
        }
      } while (emitAgain);
    } finally { emitting = false; }
  }
  function ownsTurn(turn: CrystalTurn) {
    return active() && pendingTurn !== null && turn === pendingTurn;
  }
  function advance(turn: CrystalTurn, from: CrystalPhase, to: CrystalPhase) {
    if (!ownsTurn(turn) || !voiceConsent || phase !== from) return false;
    phase = to; emit();
    return ownsTurn(turn) && phase === to && voiceConsent;
  }

  let unsubscribeOwner: () => void;
  try {
    unsubscribeOwner = owner.subscribe(retireCurrent);
    if (typeof unsubscribeOwner !== 'function') throw Error('Missing detach');
  } catch {
    closed = true; clearSession();
    throw Error('Verified session observer unavailable');
  }

  return {
    model,
    subscribe(listener: (value: CrystalPresentation) => void) {
      if (!closed) listeners.add(listener);
      try { listener(model()); } catch { /* Other observers remain usable. */ }
      return () => { listeners.delete(listener); };
    },
    /** Explicit host action after its existing identity verification; never a key ID. */
    activate(): CrystalSession | null {
      if (closed) return null;
      const next = observedScope();
      if (next === null) { retireCurrent(); return null; }
      if (scope === next) return session;
      clearSession(); scope = next;
      const nextSession = Object.freeze({}) as CrystalSession;
      session = nextSession; emit();
      return ownsSession(nextSession) ? nextSession : null;
    },
    selectThinker(expected: CrystalSession, id: string) {
      if (!ownsSession(expected) || typeof id !== 'string') return false;
      const profile = getThinkerProfile(id);
      if (!profile) return false;
      if (selected?.id === profile.id) return true;
      clearTurn(); selected = { id: profile.id, color: profile.color }; emit();
      return ownsSession(expected) && selected?.id === profile.id;
    },
    /** Local intent only, reset for every session. This is not provider consent. */
    consentToVoice(expected: CrystalSession, value: boolean) {
      if (!ownsSession(expected)) return false;
      voiceConsent = value === true;
      if (!voiceConsent && pendingTurn !== null) { clearTurn(); emit(); }
      return ownsSession(expected) && voiceConsent;
    },
    beginListening(expected: CrystalSession): CrystalTurn | null {
      if (!ownsSession(expected) || !selected || !voiceConsent || phase !== 'idle') return null;
      const turn = Object.freeze({}) as CrystalTurn;
      pendingTurn = turn; phase = 'listening'; emit();
      return ownsTurn(turn) && phase === 'listening' && voiceConsent ? turn : null;
    },
    beginThinking: (turn: CrystalTurn) => advance(turn, 'listening', 'thinking'),
    beginSpeaking: (turn: CrystalTurn) => advance(turn, 'thinking', 'speaking'),
    finishSpeaking(turn: CrystalTurn) {
      if (!ownsTurn(turn) || phase !== 'speaking') return false;
      clearTurn(); emit(); return true;
    },
    cancelTurn(turn: CrystalTurn) {
      if (!ownsTurn(turn)) return false;
      clearTurn(); emit(); return true;
    },
    /** Simulated key removal retires presentation only; host owns SDK/archive cleanup. */
    retire(expected: CrystalSession) {
      if (!ownsSession(expected)) return false;
      retireCurrent(); return true;
    },
    close() {
      if (closed) return;
      closed = true; clearSession();
      try { unsubscribeOwner(); } catch { /* Local state is already retired. */ }
      emit(); listeners.clear();
    },
  };
}
