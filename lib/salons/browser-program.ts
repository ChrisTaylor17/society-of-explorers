import { isUuid } from '../ids/uuid';
import { AUTH_INTENT_HEADER, EXPECTED_MEMBER_HEADER, currentBrowserAuthIntent, parseBrowserIntent } from '../auth/browserIntent';

type Actor = { memberId: string; provider: 'supabase' | 'wallet'; subject: string; intent: string };
type Membership = { sessions_attended: number; sessions_led: number; is_guide_candidate: boolean };
export type GuideProgram = {
  salon: { id: string; title: string; status: string };
  members: (Membership & { id: string; role: string; members: { display_name: string } })[];
  sessions: { id: string; session_date: string; session_number: number; status: string; track: string | null; topic: string | null }[];
  stats: { current_week: number };
  guide: { display_name: string; guide_level: number } | null;
  myMembership: Membership;
};
export type ProgramAccountView = {
  phase: 'loading' | 'ready' | 'signed-out' | 'unavailable' | 'retired' | 'joining' | 'unknown';
  active: boolean; program: GuideProgram | null; joining: string | null; canJoin: boolean; notice: string;
};
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, n: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= n;
const nullableText = (v: unknown, n: number): v is string | null => v === null || text(v, n);
const integer = (v: unknown, max = Number.MAX_SAFE_INTEGER): v is number => Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= max;
const membership = (v: unknown): v is Membership & Record<string, unknown> => record(v) && integer(v.sessions_attended) && integer(v.sessions_led) && typeof v.is_guide_candidate === 'boolean';
const sameActor = (a: Actor, b: Actor | null) => b?.memberId === a.memberId && b.provider === a.provider && b.subject === a.subject && b.intent === a.intent;

// Only presentation fields enter React state. Identity remains in the short-lived
// controller and is proved by the server, never by a cookie or localStorage hint.
export function parseGuideProgram(value: unknown): { program: GuideProgram | null } | null {
  if (!record(value) || !Array.isArray(value.members) || !Array.isArray(value.sessions)) return null;
  if (value.salon === null) return !value.members.length && !value.sessions.length && value.stats === null && value.guide === null && value.myMembership === null ? { program: null } : null;
  const s = value.salon;
  if (!record(s) || !isUuid(s.id) || !text(s.title, 120) || !['recruiting', 'active', 'graduating'].includes(String(s.status))
    || value.members.length > 20 || value.sessions.length > 100 || !record(value.stats) || !integer(value.stats.current_week, 7) || value.stats.current_week < 1
    || !membership(value.myMembership)) return null;
  const members: GuideProgram['members'] = [], sessions: GuideProgram['sessions'] = [];
  const ids = new Set<string>();
  for (const row of value.members) {
    if (!record(row) || !membership(row) || !text(row.id, 80) || ids.has(row.id) || !text(row.role, 32) || !record(row.members) || !text(row.members.display_name, 120)) return null;
    ids.add(row.id); members.push({ id: row.id, role: row.role, sessions_attended: row.sessions_attended, sessions_led: row.sessions_led,
      is_guide_candidate: row.is_guide_candidate, members: { display_name: row.members.display_name } });
  }
  ids.clear();
  for (const row of value.sessions) {
    if (!record(row) || !text(row.id, 80) || ids.has(row.id) || !text(row.session_date, 10) || !/^\d{4}-\d{2}-\d{2}$/.test(row.session_date)
      || !Number.isFinite(Date.parse(row.session_date)) || !integer(row.session_number, 100) || !text(row.status, 32)
      || !nullableText(row.track, 40) || !nullableText(row.topic, 120)) return null;
    ids.add(row.id); sessions.push({ id: row.id, session_date: row.session_date, session_number: row.session_number,
      status: row.status, track: row.track, topic: row.topic });
  }
  const g = value.guide;
  if (g !== null && (!record(g) || !text(g.display_name, 120) || !integer(g.guide_level, 3))) return null;
  const m = value.myMembership;
  return { program: { salon: { id: s.id, title: s.title, status: String(s.status) }, members, sessions,
    stats: { current_week: value.stats.current_week }, guide: g === null ? null : { display_name: g.display_name as string, guide_level: g.guide_level as number },
    myMembership: { sessions_attended: m.sessions_attended, sessions_led: m.sessions_led, is_guide_candidate: m.is_guide_candidate } } };
}

const initial = (): ProgramAccountView => ({ phase: 'loading', active: true, program: null, joining: null, canJoin: false, notice: 'Checking your current program access…' });
export const initialProgramAccountView = initial;

/** Read-only identity checks, followed by an explicitly requested join. Retiring
 * an operation aborts transport and rejects late completions even if abort is
 * ignored. It cannot undo a write already accepted by the server. */
export function createGuideProgramSession(request: typeof fetch, timeoutMs = 10_000, currentIntent = currentBrowserAuthIntent) {
  let view = initial(), actor: Actor | null = null, generation = 0, closed = false, busy = false;
  let active: AbortController | null = null, uncertain: { actor: Actor; salonId: string } | null = null;
  let activeIntent: string | null = null;
  const listeners = new Set<(value: ProgramAccountView) => void>();
  const emit = (patch: Partial<ProgramAccountView>) => { view = { ...view, ...patch }; if (!closed) for (const f of listeners) f(view); };
  const current = (g: number, signal: AbortSignal) => !closed && view.active && g === generation && !signal.aborted && activeIntent !== null && currentIntent() === activeIntent;
  const requireCurrent = (g: number, signal: AbortSignal) => { if (!current(g, signal)) throw Error('Retired'); };
  async function json(path: string, g: number, signal: AbortSignal, owner?: Actor, method = 'GET') {
    requireCurrent(g, signal);
    const res = await request(path, { method, credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal,
      headers: { [AUTH_INTENT_HEADER]: activeIntent!, ...(owner ? { [EXPECTED_MEMBER_HEADER]: owner.memberId } : {}), ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
      ...(method === 'POST' ? { body: JSON.stringify({ action: 'join' }) } : {}) });
    requireCurrent(g, signal);
    const body: unknown = await res.json(); requireCurrent(g, signal);
    return { res, body };
  }
  async function readActor(g: number, signal: AbortSignal): Promise<Actor | null> {
    const { res, body } = await json('/api/auth/member', g, signal);
    if (res.status === 401) return null;
    if (!res.ok || !record(body) || !record(body.member) || !isUuid(body.member.id) || !record(body.auth)
      || !['supabase', 'wallet'].includes(String(body.auth.provider)) || !isUuid(body.auth.subject)
      || (body.auth.provider === 'wallet' ? body.member.id !== body.auth.subject : body.member.supabase_auth_id !== body.auth.subject)) throw Error('Identity unavailable');
    return { memberId: body.member.id.toLowerCase(), provider: body.auth.provider as Actor['provider'], subject: body.auth.subject.toLowerCase(), intent: activeIntent! };
  }
  async function readProgram(owner: Actor, g: number, signal: AbortSignal) {
    const { res, body } = await json('/api/salons/my-salon', g, signal, owner);
    const result = res.ok ? parseGuideProgram(body) : null;
    if (!result || !sameActor(owner, await readActor(g, signal))) throw Error('Program access changed');
    return result.program;
  }
  async function run(salonId?: string) {
    if (closed || busy || !view.active || (salonId && (!isUuid(salonId) || !view.canJoin || !actor))) return;
    const prior = actor, g = ++generation, controller = new AbortController(); active = controller; busy = true;
    activeIntent = parseBrowserIntent(currentIntent());
    emit({ phase: salonId ? 'joining' : 'loading', program: null, canJoin: false, joining: salonId ?? null,
      notice: salonId ? 'Checking your account before joining…' : 'Checking your current program access…' });
    let sent = false;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const cancelled = new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(Error('Retired')), { once: true }));
    try {
      await Promise.race([cancelled, (async () => {
        const owner = await readActor(g, controller.signal); requireCurrent(g, controller.signal);
        if (!owner) { actor = null; emit({ phase: 'signed-out', notice: 'Sign in to check your program access.' }); return; }
        if (salonId && (!prior || !sameActor(prior, owner))) throw Error('Account changed');
        if (uncertain && !sameActor(uncertain.actor, owner)) uncertain = null;
        if (salonId) {
          // The server checks this member precondition against current cookies.
          // No stale bearer token or account provisioning is used by this page.
          requireCurrent(g, controller.signal); sent = true; uncertain = { actor: owner, salonId };
          const reply = await json(`/api/salons/${salonId}`, g, controller.signal, owner, 'POST');
          if (!reply.res.ok || !record(reply.body) || reply.body.success !== true) throw Error('Join unconfirmed');
        }
        const program = await readProgram(owner, g, controller.signal); requireCurrent(g, controller.signal);
        if (salonId && program?.salon.id !== salonId) throw Error('Join unconfirmed');
        actor = owner;
        if (uncertain && program?.salon.id === uncertain.salonId) uncertain = null;
        emit({ phase: uncertain ? 'unknown' : 'ready', program, canJoin: !program && !uncertain,
          notice: uncertain ? 'The earlier join is still unconfirmed. Check current access before taking another action.'
            : program ? 'Current program access checked.' : 'No active guide program is recorded for this account.' });
      })()]);
    } catch {
      if (!closed && g === generation) {
        actor = null;
        emit({ phase: sent || uncertain ? 'unknown' : 'unavailable', program: null, canJoin: false,
          notice: sent || uncertain ? 'The join could not be confirmed and may still complete. Check current access; this page will not send it again.'
            : 'Your program access could not be checked. Try again or sign in.' });
      }
    } finally {
      clearTimeout(timer);
      if (!closed && g === generation) { busy = false; active = null; emit({ joining: null }); }
    }
  }
  function retire(inactive = false) {
    generation++; active?.abort(); active = null; busy = false; actor = null;
    emit({ phase: 'retired', active: inactive ? false : view.active, program: null, joining: null, canJoin: false,
      notice: 'Private program details cleared. Check current access to continue.' });
  }
  return {
    model: () => view,
    subscribe(f: (value: ProgramAccountView) => void) { listeners.add(f); f(view); return () => { listeners.delete(f); }; },
    load: () => run(), join: (id: string) => run(id),
    retire: (inactive = false) => { if (!closed) retire(inactive); },
    activate: () => { if (!closed) emit({ active: true }); },
    dispose() { if (!closed) { closed = true; listeners.clear(); retire(true); uncertain = null; } },
  };
}
