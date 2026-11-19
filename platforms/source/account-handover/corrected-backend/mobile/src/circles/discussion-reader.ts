import { CIRCLE_BOOK_ID } from './path';
export type DiscussionMessage = {
    id: string;
    member_name: string;
    content: string;
    created_at: string;
    is_mine: boolean;
};
export type CircleConversation = {
    circleId: string;
    title: string;
    messages: DiscussionMessage[];
};
export type ReadReply = {
    http: number;
    body: unknown;
};
export type CircleDiscussionGateway = {
    read(circleId: string): Promise<ReadReply>;
};
export type CircleReadModel = {
    revision: number;
    open: boolean;
    active: boolean;
    busy: boolean;
    phase: 'closed' | 'loading' | 'ready' | 'paused' | 'denied' | 'unavailable';
    conversation: CircleConversation | null;
    message: string;
};
const object = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
const text = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(x);
const id = (x: unknown): x is string => typeof x === 'string' && /^[A-Za-z0-9._:-]{1,100}$/.test(x);
const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x));
export function discussionMessageFrom(value: unknown): DiscussionMessage | null {
    if (!object(value) || !id(value.id) || !text(value.member_name, 200) || !text(value.content, 2000) ||
        !text(value.created_at, 64) || !Number.isFinite(Date.parse(value.created_at)) || typeof value.is_mine !== 'boolean') return null;
    return { id: value.id, member_name: value.member_name, content: value.content, created_at: value.created_at, is_mine: value.is_mine };
}
export function safePrivateMeetingUrl(value: unknown): string | null {
    if (typeof value !== 'string' || value.length > 2048)
        return null;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
    }
    catch {
        return null;
    }
}
export function conversationFrom(value: unknown, circleId: string): CircleConversation | null {
    if (!object(value) || !object(value.cohort) || value.cohort.id !== circleId || value.cohort.book_id !== CIRCLE_BOOK_ID || !text(value.cohort.title, 200) || !Array.isArray(value.messages) || value.messages.length > 100)
        return null;
    const messages: DiscussionMessage[] = [], seen = new Set<string>();
    for (const m of value.messages) {
        const message = discussionMessageFrom(m);
        if (!message || seen.has(message.id))
            return null;
        seen.add(message.id);
        messages.push(message);
    }
    // Whitelist only this read-only view; no profile, membership list, token,
    // private meeting link, report or inferred consent/reviewer authority.
    return { circleId, title: value.cohort.title, messages };
}
/** Portable read-only controller. The caller supplies its existing authenticated
 * transport and retires it on identity/activity changes. It never signs in,
 * stores credentials, posts, grants consent or adopts fixture authority. */
export function createCircleDiscussionReader(gateway: CircleDiscussionGateway, circleId: string) {
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(circleId))
        throw Error('Explicit circle UUID required');
    let generation = 0, disposed = false;
    let s: CircleReadModel = { revision: 0, open: false, active: true, busy: false, phase: 'closed', conversation: null, message: 'Open the existing circle conversation to check access.' };
    const listeners = new Set<(m: CircleReadModel) => void>(), model = () => copy(s), emit = () => { if (!disposed)
        for (const f of listeners)
            f(model()); };
    const current = (g: number) => !disposed && g === generation && s.open && s.active;
    function retire(message = 'Access changed. Check membership again before reading.') { generation++; s = { ...s, busy: false, phase: s.open ? 'paused' : 'closed', conversation: null, message }; emit(); }
    async function refresh() {
        if (disposed || !s.open || !s.active || s.busy)
            return;
        const g = ++generation;
        s = { ...s, busy: true, phase: 'loading', conversation: null, message: 'Checking current circle membership and discussion access.' };
        emit();
        try {
            const r = await gateway.read(circleId);
            if (!current(g))
                return;
            const conversation = r.http === 200 ? conversationFrom(r.body, circleId) : null;
            if (conversation)
                s = { ...s, revision: s.revision + 1, busy: false, phase: 'ready', conversation, message: 'Current circle conversation loaded.' };
            else
                s = { ...s, busy: false, phase: [401, 403, 404].includes(r.http) ? 'denied' : 'unavailable', conversation: null, message: [401, 403, 404].includes(r.http) ? 'Current circle membership could not be confirmed. No discussion is shown.' : 'Discussion unavailable. Nothing was posted or retried.' };
            emit();
        }
        catch {
            if (current(g)) {
                s = { ...s, busy: false, phase: 'unavailable', conversation: null, message: 'Read unavailable. Nothing was posted or retried.' };
                emit();
            }
        }
    }
    return { model, subscribe(f: (m: CircleReadModel) => void) { listeners.add(f); f(model()); return () => { listeners.delete(f); }; }, async open() { if (disposed)
            return; s.open = true; await refresh(); }, refresh, retire,
        activity(state: string) { if (disposed)
            return; if (state !== 'active') {
            s.active = false;
            retire('Private conversation cleared while inactive. Refresh access when you return.');
        }
        else {
            s.active = true;
            emit();
        } },
        close() { if (disposed)
            return; s.open = false; retire('Conversation closed. Stored messages and previously seen copies remain.'); },
        dispose() { disposed = true; generation++; s.conversation = null; listeners.clear(); },
    };
}
export type CircleDiscussionReader = ReturnType<typeof createCircleDiscussionReader>;
/** Credential acquisition stays in the existing session owner. Credentials are
 * used once per request and are not copied into model state or URLs. */
export function createCircleDiscussionGateway(request: (path: string, options: {
    method: 'GET';
    cache: 'no-store';
    redirect: 'error';
}) => Promise<ReadReply>): CircleDiscussionGateway {
    return { read: circleId => request(`/api/book-salons/${encodeURIComponent(circleId)}`, { method: 'GET', cache: 'no-store', redirect: 'error' }) };
}
