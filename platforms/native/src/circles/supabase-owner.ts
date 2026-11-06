import type { BearerCircleOwner } from './host';
/** Adapter for an EXISTING authenticated client, never a new sign-in/client/key.
 * The server still verifies the bearer and membership on every operation. */
type ExistingSession = { access_token: string; user: { id: string } };
type ExistingAuth = {
  getSession(): Promise<{ data: { session: ExistingSession | null }; error?: unknown }>;
  onAuthStateChange(listener: (event: string, session: ExistingSession | null) => void): { data: { subscription: { unsubscribe(): void } } };
};
export function createExistingSupabaseCircleOwner(auth: ExistingAuth) {
  let generation = 0, lifetime = 0, started = false, subject: string | null = null, scope: string | null = null, off = () => {};
  const listeners = new Set<() => void>();
  const emit = () => { for (const listener of listeners) listener(); };
  function adopt(session: ExistingSession | null) {
    generation++; subject = session?.user.id || null; scope = subject ? `existing-owner-${generation}` : null; emit();
  }
  const owner: BearerCircleOwner = {
    scope: () => scope,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async bearer(expected) {
      const operation = generation, expectedSubject = subject;
      if (!started || !scope || scope !== expected) return null;
      try {
        const result = await auth.getSession();
        if (result.error || !started || generation !== operation || scope !== expected || result.data.session?.user.id !== expectedSubject) {
          if (generation === operation) adopt(null);
          return null;
        }
        return result.data.session.access_token;
      } catch { if (generation === operation) adopt(null); return null; }
    },
  };
  return { owner,
    async start() {
      if (started) return;
      started = true; const run = ++lifetime;
      const subscription = auth.onAuthStateChange((_event, session) => { if (started && run === lifetime) adopt(session); });
      off = () => subscription.data.subscription.unsubscribe();
      const operation = generation;
      try { const result = await auth.getSession(); if (started && run === lifetime && operation === generation) adopt(result.error ? null : result.data.session); }
      catch { if (started && run === lifetime && operation === generation) adopt(null); }
    },
    stop() { lifetime++; started = false; const detach = off; off = () => {}; adopt(null); try { detach(); } catch { /* Scope is already retired. */ } },
  };
}
