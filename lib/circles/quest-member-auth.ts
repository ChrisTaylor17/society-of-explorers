import { isUuid } from '@/lib/ids/uuid';
import { AUTH_INTENT_HEADER, parseBrowserIntent } from '@/lib/auth/browserIntent';
import { createVerifiedMemberSession, type ExistingVerifiedAuth } from '@/platforms/native/src/circles/verified-member-session';
import type { BrowserCircleAuthority } from '@/platforms/native/src/circles/host';

type MemberReply = { status: number; url: string; redirected: boolean; json(): Promise<unknown> };
type MemberRequest = (url: string, init: RequestInit) => Promise<MemberReply>;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const unavailable = () => Error('Member session could not be confirmed.');
const credential = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 16384 && !/[\s\u0000-\u001f\u007f]/.test(value);

/** Verify the current browser choice without transferring wallet credentials.
 * For email and Google the verified SDK bearer must match that choice. */
export function createQuestMemberAuth(auth: ExistingVerifiedAuth, options: {
  origin: string; intent: string; request: MemberRequest; timeoutMs?: number; isCurrent?: () => boolean;
}) {
  const origin = new URL(options.origin);
  const intent = parseBrowserIntent(options.intent);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash
    || !intent || typeof options.request !== 'function' || typeof auth?.getSession !== 'function'
    || typeof auth.getUser !== 'function' || typeof auth.onAuthStateChange !== 'function') throw unavailable();
  const timeout = options.timeoutMs ?? 4000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000) throw unavailable();
  const endpoint = origin.origin + '/api/auth/member';
  let retired = false, generation = 0;
  const pending = new Set<AbortController>();
  const current = (g: number) => !retired && generation === g && (options.isCurrent?.() ?? true);
  async function bounded<T>(ownerCurrent: () => boolean, work: (signal: AbortSignal, valid: () => boolean) => Promise<T>): Promise<T> {
    const g = generation;
    if (!current(g) || !ownerCurrent()) throw unavailable();
    const controller = new AbortController(); pending.add(controller);
    let rejectAbort: (error: Error) => void = () => {};
    const cancelled = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
    const abort = () => rejectAbort(unavailable());
    controller.signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeout);
    const valid = () => !controller.signal.aborted && current(g) && ownerCurrent();
    try {
      const value = await Promise.race([work(controller.signal, valid), cancelled]);
      if (!valid()) throw unavailable();
      return value;
    } finally { clearTimeout(timer); controller.signal.removeEventListener('abort', abort); pending.delete(controller); }
  }
  function invalidate() { generation++; for (const controller of pending) controller.abort(); }
  const session = createVerifiedMemberSession<BrowserCircleAuthority>({
    verify(ownerCurrent, expectedSubject) {
      return bounded(ownerCurrent, async (signal, valid) => {
        const response = await options.request(endpoint, { method: 'GET', credentials: 'same-origin', mode: 'same-origin', cache: 'no-store',
          headers: { [AUTH_INTENT_HEADER]: intent }, redirect: 'error', referrerPolicy: 'no-referrer', signal });
        if (!valid() || response.redirected || response.url !== endpoint) throw unavailable();
        if (response.status === 401) return null;
        if (response.status !== 200) throw unavailable();
        const body: unknown = await response.json();
        if (!valid() || !record(body) || !record(body.auth) || !record(body.member)
            || !isUuid(body.auth.subject) || !isUuid(body.member.id)) throw unavailable();
        const { provider, subject } = body.auth;
        if (provider !== 'wallet' && provider !== 'supabase') throw unavailable();
        const memberId = body.member.id;
        const identity = `${provider}:${subject}:${memberId}`;
        if (expectedSubject && identity !== expectedSubject) throw unavailable();

        if (provider === 'wallet' && subject === memberId) return { subject: identity, credentials: { intent, memberId } };
        if (provider !== 'supabase' || body.member.supabase_auth_id !== subject) throw unavailable();
        const { data, error } = await auth.getSession();
        const selected = data?.session;
        if (!valid() || error || selected?.user?.id !== subject || !credential(selected.access_token)) throw unavailable();
        const bearer = selected.access_token;
        const verified = await auth.getUser(bearer);
        if (!valid() || selected.user.id !== subject || selected.access_token !== bearer
            || verified.error || verified.data?.user?.id !== subject) throw unavailable();
        return { subject: identity, credentials: { intent, memberId, bearer } };
      });
    },
    onAuthStateChange(listener) {
      if (retired) throw unavailable();
      return auth.onAuthStateChange(listener);
    },
  });
  const { scope, subscribe, credentials } = session.owner;
  const binding = { ...session, owner: { scope, subscribe, browserAuthority: credentials } };
  return { binding, invalidate, retire() { if (retired) return; retired = true; invalidate(); binding.stop(); } };
}
