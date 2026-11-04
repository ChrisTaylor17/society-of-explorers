import { payloadHash } from '../hash.ts';
import type { Reply, SessionScope } from './discussion.ts';
export type Membership = {
    planId: string;
    invitationId: string | null;
    status: 'host' | 'none' | 'invited' | 'accepted' | 'withdrawn' | 'declined';
    canLeave: boolean;
    version: number;
};
export interface ParticipationGateway {
    session(): SessionScope | null;
    read(): Promise<Reply>;
    leave(envelope: Record<string, unknown>): Promise<Reply>;
    lookup(envelope: Record<string, unknown>): Promise<Reply>;
}
type Pending = {
    actor: string;
    key: string;
    hash: string;
    body: {
        planId: string;
        invitationId: string;
    };
    absent: boolean;
};
type Confirmation = {
    actor: string;
    scope: string;
    invitationId: string;
    status: 'invited' | 'accepted';
};
export type ParticipationModel = {
    actor: string | null;
    open: boolean;
    active: boolean;
    busy: boolean;
    phase: 'closed' | 'checking' | 'ready' | 'confirming' | 'sending' | 'unknown' | 'unavailable' | 'needs-refresh' | 'ended';
    membership: Membership | null;
    confirmation: Confirmation | null;
    pending: Pending | null;
    canPrepare: boolean;
    canConfirm: boolean;
    canRetry: boolean;
    receipt: {
        outcome: 'left' | 'withdrawn';
        version: number;
        historical: true;
    } | null;
    message: string;
};
const object = (x: unknown): x is Record<string, any> => x !== null && typeof x === 'object' && !Array.isArray(x);
const id = (x: unknown): x is string => typeof x === 'string' && /^[A-Za-z0-9._:-]{1,100}$/.test(x);
const positive = (x: unknown): x is number => Number.isSafeInteger(x) && (x as number) > 0;
const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x));
export function membershipFrom(reply: Reply, planId: string): Membership | null {
    const b = reply.body;
    if (reply.http !== 200 || !object(b) || b.status !== 'ok' || !positive(b.version) || !object(b.data))
        return null;
    const d = b.data;
    if (Object.keys(d).length !== 4 || d.planId !== planId || !(d.invitationId === null || id(d.invitationId)) || !['host', 'none', 'invited', 'accepted', 'withdrawn', 'declined'].includes(d.status) || typeof d.canLeave !== 'boolean' || d.canLeave && (!['invited', 'accepted'].includes(d.status) || !id(d.invitationId)))
        return null;
    if (['host', 'none'].includes(d.status) ? d.invitationId !== null : !id(d.invitationId))
        return null;
    return { planId, invitationId: d.invitationId, status: d.status, canLeave: d.canLeave, version: b.version };
}
function receiptFrom(reply: Reply, p: Pending) {
    const b = reply.body;
    if (reply.http !== 200 || !object(b) || b.status !== 'committed' || !positive(b.version) || !object(b.data))
        return null;
    const d = b.data;
    if (Object.keys(d).length !== 5 || d.operation !== 'leave' || d.planId !== p.body.planId || d.invitationId !== p.body.invitationId || !['left', 'withdrawn'].includes(d.outcome) || typeof d.limit !== 'string' || d.limit.length > 2000)
        return null;
    return { outcome: d.outcome as 'left' | 'withdrawn', version: b.version, historical: true as const };
}
let serial = 0;
export function createParticipation(gateway: ParticipationGateway | undefined, planId: string, { newKey = () => `leave-${Date.now().toString(36)}-${++serial}-${Math.random().toString(36).slice(2)}`, retirePrivate = () => { } }: {
    newKey?: () => string;
    retirePrivate?: () => void;
} = {}) {
    if (!id(planId))
        throw Error('Explicit plan required');
    let generation = 0, ended = false, disposed = false, hostReady = true, knownScope: string | null = null;
    const pending = new Map<string, Pending>(), floors = new Map<string, number>(), listeners = new Set<(m: ParticipationModel) => void>();
    let s: Omit<ParticipationModel, 'actor' | 'pending' | 'canPrepare' | 'canConfirm' | 'canRetry'> = { open: false, active: true, busy: false, phase: 'closed', membership: null, confirmation: null, receipt: null, message: 'Open plan membership to check your current participation.' };
    const session = () => gateway?.session() ?? null;
    const scopeKey = (a: SessionScope | null) => a ? JSON.stringify([a.actor, a.scope]) : null;
    function model(): ParticipationModel { const a = session(), p = a ? pending.get(a.actor) ?? null : null, owned = knownScope === scopeKey(a), ready = Boolean(owned && !ended && !disposed && hostReady && a && s.open && s.active && !s.busy); return copy({ ...s, membership: owned ? s.membership : null, confirmation: owned ? s.confirmation : null, receipt: owned ? s.receipt : null, busy: s.busy || !hostReady, actor: a?.actor ?? null, pending: p, canPrepare: Boolean(ready && !p && s.phase === 'ready' && s.membership?.canLeave), canConfirm: Boolean(ready && !p && s.confirmation && s.confirmation.actor === a?.actor && s.confirmation.scope === a?.scope), canRetry: Boolean(ready && p?.absent && s.membership?.canLeave && s.membership.invitationId === p.body.invitationId) }); }
    const emit = () => { if (!disposed)
        for (const f of listeners)
            f(model()); };
    function clear(message: string, phase: ParticipationModel['phase'] = 'needs-refresh') { generation++; s = { ...s, busy: false, phase, membership: null, confirmation: null, receipt: null, message }; emit(); }
    function current(g: number, a: SessionScope | null) { if (g !== generation || ended || disposed || !s.active || !s.open || !hostReady)
        return false; const now = session(); if (!a || !now || now.actor !== a.actor || now.scope !== a.scope) {
        clear('Session changed. Check membership again.');
        return false;
    } return true; }
    async function read(g: number, a: SessionScope) { const r = await gateway!.read(); if (!current(g, a))
        return null; const m = membershipFrom(r, planId); if (!m || m.version < (floors.get(a.actor) ?? 0)) {
        clear('Membership unavailable or stale. No current participation is confirmed.', 'unavailable');
        return null;
    } floors.set(a.actor, m.version); s.membership = m; return m; }
    async function refresh() { if (!gateway || !s.open || !s.active || !hostReady || s.busy || ended || disposed) {
        if (!gateway && !ended)
            clear('Membership requires the authenticated local adapter.', 'unavailable');
        return;
    } const a = session(); if (!a) {
        clear('Sign in before checking membership.', 'unavailable');
        return;
    } if (knownScope !== scopeKey(a))
        s.receipt = null; knownScope = scopeKey(a); const g = ++generation; s = { ...s, busy: true, phase: 'checking', membership: null, confirmation: null, message: 'Checking your current participation.' }; emit(); try {
        const m = await read(g, a);
        if (!m || !current(g, a))
            return;
        s = { ...s, busy: false, phase: pending.has(a.actor) ? 'unknown' : 'ready', message: pending.has(a.actor) ? 'One withdrawal is unconfirmed. Check its original receipt before another change.' : m.status === 'withdrawn' ? 'Your participation has ended. Stored history remains.' : 'Current membership checked.' };
        emit();
    }
    catch {
        if (current(g, a))
            clear('Membership check unavailable. No request was sent by this check.', 'unavailable');
    } }
    async function prepare() { if (!model().canPrepare || !s.membership?.invitationId)
        return; const a = session()!, selected = s.membership.invitationId, g = ++generation; retirePrivate(); s = { ...s, busy: true, phase: 'checking', confirmation: null, message: 'Checking the exact participation before confirmation.' }; emit(); try {
        const m = await read(g, a);
        if (!m || !current(g, a))
            return;
        if (!m.canLeave || m.invitationId !== selected) {
            s = { ...s, busy: false, phase: 'ready', message: 'Participation changed. Review current membership before choosing again.' };
            emit();
            return;
        }
        s = { ...s, busy: false, phase: 'confirming', confirmation: { actor: a.actor, scope: a.scope, invitationId: selected, status: m.status as 'invited' | 'accepted' }, message: m.status === 'invited' ? 'Withdraw this exact request?' : 'Leave this exact participation?' };
        emit();
    }
    catch {
        if (current(g, a))
            clear('Could not verify participation. No action was sent.', 'unavailable');
    } }
    async function send(p: Pending, g: number, a: SessionScope) { try {
        const r = await gateway!.leave({ personId: a.actor, idempotencyKey: p.key, payloadHash: p.hash, body: copy(p.body) });
        if (!current(g, a))
            return;
        const receipt = receiptFrom(r, p);
        if (receipt) {
            pending.delete(a.actor);
            floors.set(a.actor, Math.max(floors.get(a.actor) ?? 0, receipt.version));
            s = { ...s, busy: false, receipt, phase: 'ready', confirmation: null, message: 'Historical withdrawal receipt stored. Checking current membership.' };
            await refresh();
        }
        else if ([400, 403, 413].includes(r.http) && object(r.body) && r.body.status === 'rejected') {
            pending.delete(a.actor);
            s = { ...s, busy: false, phase: 'unavailable', confirmation: null, membership: null, message: 'Withdrawal denied. Refresh current membership before another intent.' };
            emit();
        }
        else {
            s = { ...s, busy: false, phase: 'unknown', confirmation: null, membership: null, message: 'Withdrawal reply unconfirmed. Check its original receipt; nothing is retried automatically.' };
            emit();
        }
    }
    catch {
        if (current(g, a)) {
            s = { ...s, busy: false, phase: 'unknown', confirmation: null, membership: null, message: 'Reply lost. Check the original withdrawal receipt before another change.' };
            emit();
        }
    } }
    async function confirm() { if (!model().canConfirm || !s.confirmation)
        return; const chosen = copy(s.confirmation), a = session()!, g = ++generation; retirePrivate(); s = { ...s, busy: true, phase: 'checking', confirmation: null, receipt: null, message: 'Rechecking the confirmed participation.' }; emit(); try {
        const m = await read(g, a);
        if (!m || !current(g, a))
            return;
        if (!m.canLeave || m.invitationId !== chosen.invitationId || m.status !== chosen.status) {
            s = { ...s, busy: false, phase: 'ready', message: 'That participation changed. Nothing was sent; a new participation was not targeted.' };
            emit();
            return;
        }
        const body = { planId, invitationId: chosen.invitationId }, key = newKey();
        if (!id(key))
            throw Error('Invalid key');
        const p: Pending = { actor: a.actor, key, hash: payloadHash(body), body, absent: false };
        pending.set(a.actor, p);
        s = { ...s, phase: 'sending', membership: null };
        emit();
        await send(p, g, a);
    }
    catch {
        if (current(g, a))
            clear('The participation check failed. No new withdrawal was confirmed.', 'unavailable');
    } }
    async function check() { const a = session(), p = a ? pending.get(a.actor) : null; if (!gateway || !a || !p || !s.open || !s.active || !hostReady || s.busy || ended)
        return; knownScope = scopeKey(a); const g = ++generation; s = { ...s, busy: true, membership: null, confirmation: null, receipt: null }; emit(); try {
        const r = await gateway.lookup({ personId: a.actor, endpoint: 'leave', key: p.key, payloadHash: p.hash });
        if (!current(g, a))
            return;
        const b = r.body;
        if (r.http === 200 && object(b) && b.status === 'recorded') {
            const receipt = receiptFrom({ http: 200, body: b.result }, p);
            if (!receipt)
                throw Error('Invalid receipt');
            pending.delete(a.actor);
            floors.set(a.actor, Math.max(floors.get(a.actor) ?? 0, receipt.version));
            s = { ...s, busy: false, receipt, phase: 'ready', message: 'Original receipt found. Nothing was sent again.' };
            await refresh();
        }
        else if (r.http === 200 && object(b) && b.status === 'absent') {
            p.absent = true;
            s = { ...s, busy: false, phase: 'unknown', message: 'Original receipt absent. Explicit retry uses only the original participation and key.' };
            await refresh();
        }
        else {
            s = { ...s, busy: false, message: 'Original receipt unavailable. Keep the key; no retry was sent.' };
            emit();
        }
    }
    catch {
        if (current(g, a)) {
            s = { ...s, busy: false, message: 'Receipt check unavailable. Nothing was resent.' };
            emit();
        }
    } }
    async function retry() { if (!model().canRetry)
        return; const a = session()!, p = pending.get(a.actor)!, g = ++generation; retirePrivate(); s = { ...s, busy: true, confirmation: null, phase: 'checking' }; emit(); try {
        const m = await read(g, a);
        if (!m || !current(g, a))
            return;
        if (!m.canLeave || m.invitationId !== p.body.invitationId) {
            s = { ...s, busy: false, phase: 'unknown', message: 'Original participation changed. Retry was not sent or redirected.' };
            emit();
            return;
        }
        p.absent = false;
        s.phase = 'sending';
        emit();
        await send(p, g, a);
    }
    catch {
        if (current(g, a))
            clear('Retry check unavailable. No new participation was targeted.', 'unavailable');
    } }
    return { model, subscribe(f: (m: ParticipationModel) => void) { listeners.add(f); f(model()); return () => { listeners.delete(f); }; }, async open() { if (ended || disposed)
            return; s.open = true; await refresh(); }, refresh, prepare, confirm, check, retry,
        cancel() { if (!model().canConfirm)
            return; s.confirmation = null; s.phase = s.membership ? 'ready' : 'needs-refresh'; s.message = 'Withdrawal cancelled. No request was sent.'; emit(); },
        dismissAbsent() { const a = session(), p = a ? pending.get(a.actor) : null; if (!a || !p?.absent || s.busy || !s.open || !s.active || !hostReady || ended)
            return; pending.delete(a.actor); s.phase = 'needs-refresh'; s.message = 'Absent attempt dismissed. Refresh before a separate new intent.'; emit(); },
        close() { if (ended || disposed)
            return; s.open = false; clear('Membership screen closed. No withdrawal was sent by closing it.', 'closed'); },
        retire() { if (!ended && !disposed)
            clear('Plan or session changed. Check membership again.'); },
        checkingAccess(value: boolean) { if (ended || disposed)
            return; hostReady = !value; clear(value ? 'Plan access check in progress.' : 'Plan access checked; refresh membership.'); },
        activity(value: string) { if (ended || disposed)
            return; if (value !== 'active') {
            s.active = false;
            clear('App or headset inactive. Confirmation cleared; check any original receipt before another change.');
        }
        else {
            s.active = true;
            emit();
        } },
        end() { ended = true; hostReady = true; pending.clear(); s.open = false; clear('Local session ended. Issued server sessions and stored history are not deleted.', 'ended'); },
        dispose() { disposed = true; generation++; pending.clear(); listeners.clear(); s.membership = null; s.confirmation = null; s.receipt = null; },
    };
}
export type Participation = ReturnType<typeof createParticipation>;
export function createParticipationGateway(session: () => SessionScope | null, request: (path: string, body?: Record<string, unknown>) => Promise<Reply>, planId: string): ParticipationGateway { return { session, read: () => request(`/api/membership/${encodeURIComponent(planId)}`), leave: body => request('/api/writes/leave', body), lookup: body => request('/api/lookup', body) }; }
