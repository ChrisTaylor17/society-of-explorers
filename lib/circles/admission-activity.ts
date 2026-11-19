/** An owned client view controls this boundary synchronously. No session,
 * account, code or private presentation is stored in it. */
export type CircleAdmissionActivity = {
  active(): boolean;
  subscribe(listener: (active: boolean) => void): () => void;
};
export function createCircleAdmissionActivity() {
  let active = false;
  const listeners = new Set<(active: boolean) => void>();
  return {
    active: () => active,
    subscribe(listener: (active: boolean) => void) { listeners.add(listener); listener(active); return () => { listeners.delete(listener); }; },
    setActive(value: boolean) {
      const next = value === true; if (active === next) return; active = next;
      for (const listener of listeners) { try { listener(active); } catch { /* Finish retiring independent observers. */ } }
    },
  };
}
