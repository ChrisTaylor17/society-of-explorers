import { isUuid } from '../ids/uuid';
import { GREAT_BOOKS } from '../books/catalog';
import { AUTH_INTENT_HEADER, EXPECTED_MEMBER_HEADER, currentBrowserAuthIntent, parseBrowserIntent } from '../auth/browserIntent';

type Actor = { memberId: string; provider: 'wallet' | 'supabase'; subject: string; intent: string; label: string };
export type SalonDraft = { bookId: string; title: string; maxMembers: number; startDate: string };
export type SalonAccountView = {
  phase: 'loading' | 'ready' | 'signed-out' | 'unavailable' | 'retired' | 'creating' | 'joining' | 'checking';
  active: boolean; canAct: boolean; label: string; draft: SalonDraft | null; error: string; notice: string;
  joining: string | null; pendingCreation: boolean; pendingJoin: string | null;
  result: { kind: 'created' | 'member'; cohortId: string } | null; successRevision: number;
};
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const ownerKey = (a: Actor) => `${a.provider}:${a.subject}:${a.memberId}`;
const sameActor = (a: Actor, b: Actor | null) => !!b && ownerKey(a) === ownerKey(b) && a.intent === b.intent;
const blankDraft = (): SalonDraft => ({ bookId: '', title: '', maxMembers: 8, startDate: '' });
const validDate = (v: string) => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v);
export const initialSalonAccountView = (): SalonAccountView => ({ phase: 'loading', active: true, canAct: false, label: '', draft: null,
  error: '', notice: 'Checking your account for salon actions…', joining: null, pendingCreation: false, pendingJoin: null, result: null, successRevision: 0 });
async function digest(value: string, cryptography: Pick<Crypto, 'subtle' | 'randomUUID'>) {
  const bytes = new TextEncoder().encode(value);
  return [...new Uint8Array(await cryptography.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
}

/** Private form lifetime only. Public discovery uses a separate cookie-free
 * reader. Retirement clears displayed drafts; the retry ledger retains only
 * opaque request IDs, input digests and pending group IDs. Nothing is written
 * to browser storage. Aborting cannot undo a server-accepted write. */
export function createSalonAccount(request: typeof fetch, timeoutMs = 15_000, currentIntent = currentBrowserAuthIntent,
  cryptography: Pick<Crypto, 'subtle' | 'randomUUID'> = globalThis.crypto) {
  let view = initialSalonAccountView(), actor: Actor | null = null, generation = 0, closed = false, busy = false;
  let active: AbortController | null = null, intent: string | null = null;
  const creations = new Map<string, { requestId: string; digest: string }>(), joins = new Map<string, string>();
  const listeners = new Set<(v: SalonAccountView) => void>();
  function emit(patch: Partial<SalonAccountView>) {
    view = { ...view, ...patch };
    view = { ...view, canAct: !closed && !busy && view.active && view.phase === 'ready' && !!actor && currentIntent() === actor.intent,
      pendingCreation: !!actor && creations.has(ownerKey(actor)), pendingJoin: actor ? joins.get(ownerKey(actor)) ?? null : null };
    if (!closed) for (const listener of listeners) listener(view);
  }
  const current = (g: number, signal: AbortSignal) => !closed && view.active && g === generation && !signal.aborted && intent !== null && intent === currentIntent();
  const check = (g: number, signal: AbortSignal) => { if (!current(g, signal)) throw Error('Retired'); };
  async function json(path: string, g: number, signal: AbortSignal, owner?: Actor, body?: unknown) {
    check(g, signal);
    const res = await request(path, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      referrerPolicy: 'no-referrer', signal, headers: { [AUTH_INTENT_HEADER]: intent!, ...(owner ? { [EXPECTED_MEMBER_HEADER]: owner.memberId } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    check(g, signal); const value: unknown = await res.json(); check(g, signal); return { res, value };
  }
  async function readActor(g: number, signal: AbortSignal): Promise<Actor | null> {
    const { res, value } = await json('/api/auth/member', g, signal);
    if (res.status === 401) return null;
    if (!res.ok || !record(value) || !record(value.member) || !isUuid(value.member.id) || !record(value.auth)
      || !['wallet', 'supabase'].includes(String(value.auth.provider)) || !isUuid(value.auth.subject)
      || (value.auth.provider === 'wallet' ? value.member.id.toLowerCase() !== value.auth.subject.toLowerCase()
        : typeof value.member.supabase_auth_id !== 'string' || value.member.supabase_auth_id.toLowerCase() !== value.auth.subject.toLowerCase())) throw Error('Identity unavailable');
    const label = typeof value.member.display_name === 'string' && value.member.display_name.trim() && !value.member.display_name.includes('@')
      ? value.member.display_name.trim().slice(0, 120) : 'Explorer';
    return { memberId: value.member.id.toLowerCase(), provider: value.auth.provider as Actor['provider'], subject: value.auth.subject.toLowerCase(), intent: intent!, label };
  }
  async function verifyOwner(owner: Actor, g: number, signal: AbortSignal) {
    try { if (!sameActor(owner, await readActor(g, signal))) throw Error('Account changed'); check(g, signal); }
    catch (error) { if (!closed && g === generation) retire(); throw error; }
  }
  async function membership(owner: Actor, cohortId: string, g: number, signal: AbortSignal) {
    const { res, value } = await json(`/api/book-salons/join?cohortId=${encodeURIComponent(cohortId)}`, g, signal, owner);
    if (!res.ok || !record(value) || Object.keys(value).length !== 3 || value.cohortId !== cohortId || value.memberId !== owner.memberId
      || typeof value.isMember !== 'boolean') throw Error('Membership unavailable');
    return value.isMember;
  }
  function retire(inactive = false) {
    generation++; active?.abort(); active = null; busy = false; actor = null; intent = null;
    emit({ phase: 'retired', active: inactive ? false : view.active, draft: null, label: '', error: '', result: null, joining: null,
      notice: 'Account details and draft cleared. Check your current account to continue.' });
  }
  function canEdit() {
    if (actor && currentIntent() !== actor.intent) { retire(); return false; }
    return view.canAct;
  }
  async function run(kind: 'load' | 'create' | 'join' | 'check', cohortId?: string) {
    if (closed || busy || !view.active || (kind !== 'load' && (!view.canAct || !actor))) return;
    const prior = actor, draft = view.draft && { ...view.draft };
    if ((kind === 'join' || kind === 'check') && !isUuid(cohortId)) return;
    if (kind === 'create' && (!draft || !GREAT_BOOKS.some(b => b.id === draft.bookId) || !draft.title.trim() || draft.title.trim().length > 160
      || !Number.isSafeInteger(draft.maxMembers) || draft.maxMembers < 2 || draft.maxMembers > 12 || !validDate(draft.startDate))) {
      emit({ error: 'Choose a book, a name, 2–12 members and a valid optional date.' }); return;
    }
    const g = ++generation, controller = new AbortController(); active = controller; busy = true; intent = parseBrowserIntent(currentIntent());
    if (kind === 'load') actor = null;
    emit({ phase: kind === 'load' ? 'loading' : kind === 'create' ? 'creating' : kind === 'join' ? 'joining' : 'checking', error: '', result: null,
      ...(kind === 'load' ? { draft: null, label: '' } : {}), joining: cohortId ?? null, notice: 'Checking your current account…' });
    let sent = false;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const cancelled = new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(Error('Retired')), { once: true }));
    try {
      if (!intent) { actor = null; emit({ phase: 'signed-out', draft: null, label: '', notice: 'Sign in to create or join a book salon.' }); return; }
      await Promise.race([cancelled, (async () => {
        const owner = await readActor(g, controller.signal); check(g, controller.signal);
        if (kind !== 'load' && (!prior || !sameActor(prior, owner))) { retire(); return; }
        if (!owner) { actor = null; emit({ phase: 'signed-out', draft: null, label: '', notice: 'Sign in to create or join a book salon.' }); return; }
        actor = owner; const key = ownerKey(owner);
        if (kind === 'load') { emit({ phase: 'ready', label: owner.label, notice: 'Current account checked. Choose a salon action when ready.' }); return; }
        if (kind === 'create' && draft) {
          const book = GREAT_BOOKS.find(b => b.id === draft.bookId)!;
          const input = { expectedMemberId: owner.memberId, bookId: draft.bookId, title: draft.title.trim(), maxMembers: draft.maxMembers,
            startDate: draft.startDate || null, thinkerId: book.recommended_thinker || 'socrates' };
          const signature = await digest(JSON.stringify(input), cryptography); check(g, controller.signal);
          const pending = creations.get(key);
          if (pending && pending.digest !== signature) {
            emit({ phase: 'ready', error: 'An earlier creation is unconfirmed. Re-enter exactly the same details to check that request.', notice: 'No new creation was sent.' }); return;
          }
          const attempt = pending ?? { requestId: cryptography.randomUUID(), digest: signature };
          if (!isUuid(attempt.requestId)) throw Error('Request unavailable');
          await verifyOwner(owner, g, controller.signal);
          creations.set(key, attempt); sent = true;
          const { res, value } = await json('/api/book-salons', g, controller.signal, owner, { ...input, requestId: attempt.requestId });
          await verifyOwner(owner, g, controller.signal);
          if (!res.ok) {
            if (res.status === 400 || res.status === 403) creations.delete(key);
            emit({ phase: 'ready', error: res.status === 400 || res.status === 403 ? 'Creation was refused. Review the details and account before trying again.'
              : res.status === 409 || res.status === 410 ? 'Your account or original request changed. Check your account and the original salon before continuing.'
                : 'Could not confirm creation. Retry with exactly the same details to check the same request.', notice: 'Creation is not confirmed.' }); return;
          }
          if (!record(value) || value.requestId !== attempt.requestId || value.creatorJoined !== true || typeof value.replayed !== 'boolean'
            || !record(value.cohort) || !isUuid(value.cohort.id) || value.cohort.created_by !== owner.memberId) throw Error('Creation unconfirmed');
          creations.delete(key); emit({ phase: 'ready', draft: null, result: { kind: 'created', cohortId: value.cohort.id },
            notice: 'Salon creation and your membership are confirmed.', successRevision: view.successRevision + 1 }); return;
        }
        if (cohortId) {
          const pending = joins.get(key);
          if (pending && pending !== cohortId) { emit({ phase: 'ready', notice: 'Check the earlier join before sending another.', error: 'An earlier join is still unconfirmed.' }); return; }
          let joined = await membership(owner, cohortId, g, controller.signal);
          await verifyOwner(owner, g, controller.signal);
          if (!joined && kind === 'join' && !pending) {
            joins.set(key, cohortId); sent = true;
            const reply = await json('/api/book-salons/join', g, controller.signal, owner, { cohortId });
            // Membership readback, not a success-shaped POST body or a public
            // count, proves the current account's state after this request.
            joined = await membership(owner, cohortId, g, controller.signal);
            await verifyOwner(owner, g, controller.signal);
            if (!joined && [400, 403, 404].includes(reply.res.status)) joins.delete(key);
          }
          if (joined) { joins.delete(key); emit({ phase: 'ready', result: { kind: 'member', cohortId }, notice: 'Your membership in this salon is confirmed.', successRevision: view.successRevision + 1 }); }
          else emit({ phase: 'ready', notice: joins.has(key) ? 'The join is still unconfirmed and may complete. Check its status; no repeat join will be sent.'
            : 'This account is not a member of that salon.', error: joins.has(key) ? 'Join outcome unconfirmed.' : 'The salon could not be joined. Refresh its availability before trying again.' });
        }
      })()]);
    } catch {
      if (!closed && g === generation) {
        if (intent !== currentIntent()) { retire(); }
        else if (kind === 'load' || (!sent && kind === 'create')) { actor = null; emit({ phase: 'unavailable', draft: null, label: '', notice: 'Account access could not be checked. Try again or sign in.' }); }
        else emit({ phase: 'ready', error: kind === 'create' ? 'Could not confirm creation. Retry with exactly the same details to check the same request.' : 'Membership could not be confirmed. Check its status before taking another action.', notice: 'The request is unconfirmed; public listing counts do not confirm your membership.' });
      }
    } finally { clearTimeout(timer); if (!closed && g === generation) { busy = false; active = null; emit({ joining: null }); } }
  }
  return {
    model: () => view,
    subscribe(listener: (v: SalonAccountView) => void) { listeners.add(listener); listener(view); return () => { listeners.delete(listener); }; },
    load: () => run('load'), create: () => run('create'), join: (id: string) => run('join', id), checkJoin: () => view.pendingJoin ? run('check', view.pendingJoin) : Promise.resolve(),
    openCreate() { if (canEdit()) emit({ draft: blankDraft(), error: '', result: null }); },
    editDraft(patch: Partial<SalonDraft>) { if (canEdit() && view.draft) emit({ draft: { ...view.draft, ...patch }, error: '' }); },
    closeCreate() { if (!busy) emit({ draft: null, error: '' }); },
    retire: (inactive = false) => { if (!closed) retire(inactive); }, activate: () => { if (!closed) emit({ active: true }); },
    dispose() { if (!closed) { closed = true; listeners.clear(); retire(true); creations.clear(); joins.clear(); } },
  };
}
