import { isUuid } from '@/lib/ids/uuid';
import type { ExistingVerifiedAuth } from '@/platforms/native/src/circles/verified-member-session';

type MemberReply = { status: number; url: string; redirected: boolean; json(): Promise<unknown> };
type MemberRequest = (url: string, init: RequestInit) => Promise<MemberReply>;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const unavailable = () => Error('Member session could not be confirmed.');
const credential = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 16384 && !/[\s\u0000-\u001f\u007f]/.test(value);

/** The SDK supplies the exact token; the cookie-only endpoint independently
 * confirms the website's selected provider and subject. Neither profile data nor
 * the token is returned to a view, encoded in a URL, logged or persisted here. */
export function createQuestMemberAuth(auth: ExistingVerifiedAuth, options: {
  origin: string; request: MemberRequest; timeoutMs?: number; isCurrent?: () => boolean;
}) {
  const origin = new URL(options.origin);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash
    || typeof options.request !== 'function' || typeof auth?.getSession !== 'function' || typeof auth.getUser !== 'function' || typeof auth.onAuthStateChange !== 'function') throw unavailable();
  const timeout = options.timeoutMs ?? 4000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000) throw unavailable();
  const endpoint = origin.origin + '/api/auth/member';
  let retired = false, generation = 0;
  const pending = new Set<AbortController>();
  const subscriptions = new Set<() => void>();
  const current = (g: number) => !retired && generation === g && (options.isCurrent?.() ?? true);
  async function bounded<T>(work: (signal: AbortSignal, valid: () => boolean) => Promise<T>): Promise<T> {
    const g = generation;
    if (!current(g)) throw unavailable();
    const controller = new AbortController(); pending.add(controller);
    let rejectAbort: (error: Error) => void = () => {};
    const cancelled = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
    const abort = () => rejectAbort(unavailable());
    controller.signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeout);
    const valid = () => !controller.signal.aborted && current(g);
    try {
      const value = await Promise.race([work(controller.signal, valid), cancelled]);
      if (!valid()) throw unavailable();
      return value;
    } finally { clearTimeout(timer); controller.signal.removeEventListener('abort', abort); pending.delete(controller); }
  }
  function invalidate() { generation++; for (const controller of pending) controller.abort(); }
  const wrapped: ExistingVerifiedAuth = {
    async getSession() {
      try {
        return await bounded(async (_signal, valid) => {
          const reply = await auth.getSession();
          if (!valid() || reply.error) throw unavailable();
          const session = reply.data?.session;
          if (session === null) return { data: { session: null } };
          if (!session || !credential(session.access_token) || !isUuid(session.user?.id)) throw unavailable();
          return { data: { session: { access_token: session.access_token, user: { id: session.user.id } } } };
        });
      } catch { return { data: { session: null }, error: unavailable() }; }
    },
    async getUser(jwt) {
      try {
        if (!credential(jwt)) throw unavailable();
        return await bounded(async (signal, valid) => {
          const verified = await auth.getUser(jwt);
          if (!valid() || verified.error || !isUuid(verified.data?.user?.id)) throw unavailable();
          const subject = verified.data.user.id;
          const response = await options.request(endpoint, { method: 'GET', credentials: 'same-origin', cache: 'no-store',
            redirect: 'error', referrerPolicy: 'no-referrer', signal });
          if (!valid() || response.status !== 200 || response.redirected || response.url !== endpoint) throw unavailable();
          const body: unknown = await response.json();
          if (!valid() || !record(body) || !record(body.auth) || !record(body.member)
            || body.auth.provider !== 'supabase' || !isUuid(body.auth.subject) || !isUuid(body.member.id)
            || !isUuid(body.member.supabase_auth_id) || body.auth.subject !== subject || body.member.supabase_auth_id !== subject) throw unavailable();
          // Expose only the identity field consumed by the existing verified owner.
          return { data: { user: { id: subject } } };
        });
      } catch { return { data: { user: null }, error: unavailable() }; }
    },
    onAuthStateChange(listener) {
      if (retired) throw unavailable();
      let closed = false, detach = () => {};
      const close = () => { if (closed) return; closed = true; subscriptions.delete(close); try { detach(); } catch {} };
      try {
        const result = auth.onAuthStateChange((event, session) => { if (!retired && !closed) listener(event, session); });
        if (typeof result?.data?.subscription?.unsubscribe !== 'function') throw unavailable();
        detach = () => result.data.subscription.unsubscribe();
        if (retired) close(); else subscriptions.add(close);
        return { data: { subscription: { unsubscribe: close } } };
      } catch { close(); throw unavailable(); }
    },
  };
  return { auth: wrapped, invalidate, retire() { if (retired) return; retired = true; invalidate(); for (const close of Array.from(subscriptions)) close(); } };
}
