import { approvedOrigin, type CircleTransport } from './host';
import { createNativeMemberPorts, type NativeMemberBridge } from './native-ports';
import type { ExistingMemberCircleConfig, ExistingVerifiedAuth } from './verified-member-session';

const unavailable = () => Error('Native member session unavailable');

/** Opt-in composition only. The caller creates and owns its auth client, passing
 * the returned storage into that client's configuration. Neither the bridge's
 * security properties nor the auth client's network policy can be attested by
 * this adapter. No client, sign-in, or native module is created here. */
export async function prepareNativeMemberBinding(options: {
  bridge: NativeMemberBridge | null; origin: string; storageKey: string; timeoutMs?: number;
}) {
  const origin = approvedOrigin(options.origin);
  const ports = await createNativeMemberPorts(options.bridge, options);
  let closed = false, bound = false;
  let offAccountRetirement = () => {};
  const requests = new Set<AbortController>();
  const subscriptions = new Set<{ retire(): void }>();
  const assertOpen = () => { if (closed) throw unavailable(); };
  const transport: CircleTransport = async (url, init) => {
    assertOpen();
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (init.signal.aborted) throw unavailable();
    init.signal.addEventListener('abort', abort, { once: true });
    requests.add(controller);
    try {
      if (closed || init.signal.aborted) throw unavailable();
      const result = await ports.transport(url, { ...init, signal: controller.signal });
      assertOpen();
      return result;
    } catch { throw unavailable(); }
    finally { requests.delete(controller); init.signal.removeEventListener('abort', abort); }
  };
  function bind(auth: ExistingVerifiedAuth, circleId: string, verificationTimeoutMs?: number): ExistingMemberCircleConfig {
    assertOpen();
    if (bound || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(circleId) ||
      !auth || typeof auth.getSession !== 'function' || typeof auth.getUser !== 'function' || typeof auth.onAuthStateChange !== 'function' ||
      (verificationTimeoutMs !== undefined && (!Number.isSafeInteger(verificationTimeoutMs) || verificationTimeoutMs < 1 || verificationTimeoutMs > 60000))) throw unavailable();
    bound = true;
    const guardedAuth: ExistingVerifiedAuth = {
      async getSession() { assertOpen(); try { const result = await auth.getSession(); assertOpen(); return result; } catch { throw unavailable(); } },
      async getUser(jwt) { assertOpen(); try { const result = await auth.getUser(jwt); assertOpen(); return result; } catch { throw unavailable(); } },
      onAuthStateChange(listener) {
        assertOpen();
        let detached = false;
        const entry = { retire() { if (!detached) { try { listener('SOE_BINDING_CLOSED', null); } catch {} detach(); } } };
        let unsubscribe = () => {};
        function detach() { if (detached) return; detached = true; subscriptions.delete(entry); try { unsubscribe(); } catch {} }
        try {
          const sub = auth.onAuthStateChange((event) => { if (!closed && !detached) listener(event, null); });
          if (typeof sub?.data?.subscription?.unsubscribe !== 'function') throw unavailable();
          unsubscribe = () => sub.data.subscription.unsubscribe();
          subscriptions.add(entry);
          if (closed) entry.retire();
          return { data: { subscription: { unsubscribe: detach } } };
        } catch { detach(); throw unavailable(); }
      },
    };
    const createRequestId = ports.newRequestId;
    return { origin, circleId, auth: guardedAuth, transport, aiConsent: ports.aiConsent,
      ...(typeof createRequestId === 'function' ? { newRequestId: async () => { assertOpen(); const id = await createRequestId(); assertOpen(); return id; } } : {}),
      ...(verificationTimeoutMs === undefined ? {} : { verificationTimeoutMs }) };
  }
  function close() {
    if (closed) return;
    closed = true;
    offAccountRetirement();
    for (const controller of requests) controller.abort();
    ports.retireStorage();
    for (const sub of Array.from(subscriptions)) sub.retire();
  }
  offAccountRetirement = ports.onAccountRetired(close);
  return { storage: ports.storage, bind, close, async resetAccountStorage() { await ports.resetAccountStorage(); } };
}
