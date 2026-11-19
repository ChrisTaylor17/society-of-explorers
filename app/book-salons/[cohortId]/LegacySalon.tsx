'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { circleHeaders } from '@/lib/circles/client';
import { subscribeAuthProviderChanges } from '@/lib/auth/providerSelection';
import { GREAT_BOOKS } from '@/lib/books/catalog';
import { renderMarkdown } from '@/lib/renderMarkdown';
import { isUuid } from '@/lib/ids/uuid';

const gold = '#C5A55A';
const parchment = '#E8DCC8';
const muted = '#b4aa96';

type Actor = { memberId: string; provider: 'supabase' | 'wallet'; subject: string };
type Message = { id: string; member_name: string | null; content: string; content_available: boolean; created_at: string | null; is_mine: boolean };
type Conversation = {
  cohort: { id: string; book_id: string; title: string | null; description: string | null; status: string | null };
  members: { id: string; members: { display_name: string | null } }[];
  membership_count: number;
  roster: { limit: 50; truncated: boolean };
  messages: Message[];
  history: { limit: 100; truncated: boolean; window: 'latest' };
};
type Phase = 'loading' | 'public' | 'preparing' | 'ready' | 'sending' | 'sent' | 'unknown' | 'refused' | 'retired' | 'error';
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max
  && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,100}$/.test(value);
const nullableText = (value: unknown, max: number): value is string | null => value === null || text(value, max);

function parseMessage(value: unknown): Message | null {
  if (!record(value) || !identifier(value.id) || !nullableText(value.member_name, 200) || !text(value.content, 2000)
    || typeof value.content_available !== 'boolean' || !nullableText(value.created_at, 64)
    || (value.created_at !== null && !Number.isFinite(Date.parse(value.created_at))) || typeof value.is_mine !== 'boolean') return null;
  return { id: value.id, member_name: value.member_name, content: value.content_available ? value.content : '[Message unavailable.]',
    content_available: value.content_available, created_at: value.created_at, is_mine: value.is_mine };
}

function parseConversation(value: unknown, cohortId: string): Conversation | null {
  if (!record(value) || !record(value.cohort) || value.cohort.id !== cohortId || !text(value.cohort.book_id, 200)
    || value.cohort.book_id === 'soe-circles-path' || !nullableText(value.cohort.title, 200)
    || !nullableText(value.cohort.description, 2000) || !nullableText(value.cohort.status, 40)
    || !Array.isArray(value.members) || value.members.length > 50 || !Array.isArray(value.messages) || value.messages.length > 100
    || !Number.isSafeInteger(value.membership_count) || Number(value.membership_count) < value.members.length
    || !record(value.roster) || value.roster.limit !== 50 || typeof value.roster.truncated !== 'boolean'
    || !record(value.history) || value.history.limit !== 100 || typeof value.history.truncated !== 'boolean' || value.history.window !== 'latest') return null;
  const members: Conversation['members'] = [];
  const memberIds = new Set<string>();
  for (const row of value.members) {
    if (!record(row) || !identifier(row.id) || memberIds.has(row.id) || !record(row.members) || !nullableText(row.members.display_name, 200)) return null;
    memberIds.add(row.id); members.push({ id: row.id, members: { display_name: row.members.display_name } });
  }
  const messages: Message[] = [];
  const messageIds = new Set<string>();
  for (const row of value.messages) {
    const message = parseMessage(row);
    if (!message || messageIds.has(message.id)) return null;
    messageIds.add(message.id); messages.push(message);
  }
  return { cohort: { id: cohortId, book_id: value.cohort.book_id, title: value.cohort.title,
    description: value.cohort.description, status: value.cohort.status }, members,
  membership_count: Number(value.membership_count), roster: { limit: 50, truncated: value.roster.truncated },
  messages, history: { limit: 100, truncated: value.history.truncated, window: 'latest' } };
}

function current(signal: AbortSignal) { if (signal.aborted) throw new Error('retired'); }
const sameActor = (a: Actor | null, b: Actor) => a?.memberId === b.memberId && a.provider === b.provider && a.subject === b.subject;
const withoutIdentity = (value: Conversation): Conversation => ({ ...value, messages: value.messages.map(message => ({ ...message, is_mine: false })) });

async function readActor(signal: AbortSignal): Promise<Actor | null> {
  current(signal);
  // Cookie-only authority. Browser display hints and SDK tokens cannot select the draft's author.
  const response = await fetch('/api/auth/member', {
    credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal,
  });
  current(signal);
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('unavailable');
  const value: unknown = await response.json();
  current(signal);
  if (!record(value) || !record(value.member) || typeof value.member.id !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.member.id)
    || !record(value.auth) || !['supabase', 'wallet'].includes(String(value.auth.provider))
    || !text(value.auth.subject, 200) || !value.auth.subject) throw new Error('unavailable');
  return { memberId: value.member.id, provider: value.auth.provider as Actor['provider'], subject: value.auth.subject };
}

async function readConversation(cohortId: string, signal: AbortSignal) {
  current(signal);
  const response = await fetch(`/api/book-salons/${cohortId}`, {
    credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal,
  });
  current(signal);
  if (!response.ok) throw new Error('unavailable');
  const value = parseConversation(await response.json(), cohortId);
  current(signal);
  if (!value) throw new Error('unavailable');
  return value;
}

async function bounded<T>(controller: AbortController, work: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('deadline')); }, 15_000);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

export default function LegacySalon() {
  const params = useParams<{ cohortId: string }>();
  const cohortId = typeof params.cohortId === 'string' ? params.cohortId.toLowerCase() : '';
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [actor, setActor] = useState<Actor | null>(null);
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<Phase>('loading');
  const [notice, setNotice] = useState('Loading the public discussion…');
  const epoch = useRef(0);
  const active = useRef<AbortController | null>(null);
  const working = useRef(false);

  const retire = useCallback((message = 'Sign-in changed. Reload the discussion before preparing a new message.') => {
    epoch.current++; active.current?.abort(); working.current = false;
    setActor(null); setInput(''); setConversation(value => value ? withoutIdentity(value) : null);
    setPhase('retired'); setNotice(message);
  }, []);

  const load = useCallback(async () => {
    if (working.current) return;
    const generation = ++epoch.current;
    active.current?.abort();
    const controller = new AbortController(); active.current = controller; working.current = true;
    setActor(null); setInput(''); setConversation(null); setPhase('loading'); setNotice('Loading the public discussion…');
    try {
      if (!isUuid(cohortId)) throw new Error('unavailable');
      const value = await bounded(controller, () => readConversation(cohortId, controller.signal));
      if (generation !== epoch.current || controller.signal.aborted) return;
      setConversation(withoutIdentity(value)); setPhase('public'); setNotice('Public discussion loaded. Prepare to post if you want to contribute.');
    } catch {
      if (generation !== epoch.current) return;
      setPhase('error'); setNotice('Discussion unavailable. You can try reloading.');
    } finally { if (generation === epoch.current) { working.current = false; active.current = null; } }
  }, [cohortId]);

  useEffect(() => {
    let cancelled = false;
    const invalidate = () => { epoch.current++; active.current?.abort(); working.current = false; };
    const unsubscribe = subscribeAuthProviderChanges(() => retire());
    void Promise.resolve().then(() => { if (!cancelled) void load(); });
    return () => { cancelled = true; invalidate(); unsubscribe(); };
  }, [load, retire]);

  async function prepare() {
    if (working.current || !conversation || phase !== 'public') return;
    const generation = ++epoch.current;
    const controller = new AbortController(); active.current = controller; working.current = true;
    setPhase('preparing'); setNotice('Checking your posting identity…');
    try {
      const selected = await bounded(controller, () => readActor(controller.signal));
      if (generation !== epoch.current || controller.signal.aborted) return;
      setActor(selected); setInput(''); setPhase(selected ? 'ready' : 'public');
      setNotice(selected ? 'Posting identity loaded. Your message and display name will be public.' : 'Sign in, then prepare to post. Anyone can read this discussion.');
    } catch {
      if (generation !== epoch.current) return;
      setActor(null); setPhase('public'); setNotice('Posting identity unavailable. You can try preparing again.');
    } finally { if (generation === epoch.current) { working.current = false; active.current = null; } }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (working.current || !actor || !['ready', 'sent'].includes(phase)) return;
    const content = input.trim();
    if (!content || !text(content, 2000)) { setNotice('Use plain text up to 2,000 characters.'); return; }
    // Capture the author that was loaded BEFORE editing or any SDK/token lookup.
    const expectedActor = actor;
    const generation = ++epoch.current;
    const controller = new AbortController(); active.current = controller; working.current = true;
    let attempted = false;
    const fence = () => { current(controller.signal); if (generation !== epoch.current) throw new Error('retired'); };
    const verifyActor = async () => { fence(); const selected = await readActor(controller.signal); fence(); if (!sameActor(selected, expectedActor)) throw new Error('changed'); };
    setPhase('sending'); setNotice('Sending your public message…');
    try {
      await bounded(controller, async () => {
        await verifyActor();
        const headers = await circleHeaders(true);
        fence();
        await verifyActor();
        attempted = true;
        const response = await fetch(`/api/book-salons/${cohortId}`, {
          method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
          headers, signal: controller.signal, body: JSON.stringify({ content, expectedMemberId: expectedActor.memberId }),
        });
        fence();
        const value: unknown = await response.json();
        fence();
        if (!response.ok) {
          if (record(value) && value.outcome === 'not_attempted') {
            if (response.status === 401 || response.status === 409) {
              retire('Message was not sent. Your sign-in changed. Reload the discussion before preparing again.');
            } else {
              setPhase('refused'); setNotice('Message was not sent. Reload the discussion and check your membership before preparing again.');
            }
            return;
          }
          throw new Error('unknown');
        }
        const receipt = record(value) ? parseMessage(value.message) : null;
        if (!record(value) || value.outcome !== 'confirmed' || value.cohortId !== cohortId || !receipt
          || !receipt.content_available || !receipt.is_mine || receipt.content !== content) throw new Error('unknown');
        await verifyActor();
        const fresh = await readConversation(cohortId, controller.signal);
        fence();
        await verifyActor();
        const observed = fresh.messages.find(message => message.id === receipt.id);
        if (!observed || !observed.content_available || !observed.is_mine || observed.content !== receipt.content || observed.member_name !== receipt.member_name
          || observed.created_at !== receipt.created_at) throw new Error('unknown');
        setConversation(fresh); setInput(''); setPhase('sent');
        setNotice('Posted and confirmed in public history. Your message and display name are public.');
      });
    } catch (error) {
      if (generation !== epoch.current) return;
      if (error instanceof Error && error.message === 'changed') {
        retire(attempted ? 'Sign-in changed. Send outcome unknown. Reload the discussion before preparing again.'
          : 'Message was not sent. Sign-in changed. Reload the discussion before preparing again.');
      } else {
        setPhase(attempted ? 'unknown' : 'refused');
        setNotice(attempted ? 'Send outcome unknown. Reload the discussion to check before preparing another message.'
          : 'Message was not sent. Posting identity unavailable. Reload the discussion before preparing again.');
      }
    } finally { if (generation === epoch.current) { working.current = false; active.current = null; } }
  }

  const busy = ['loading', 'preparing', 'sending'].includes(phase);
  const editable = phase === 'ready' || phase === 'sent';
  const book = conversation ? GREAT_BOOKS.find(value => value.id === conversation.cohort.book_id) : null;
  return <main className="legacy-salon">
    <style>{`
      .legacy-salon { min-height:100vh; background:#0a0a0a; color:${parchment}; font-family:'Cormorant Garamond',serif; overflow-wrap:anywhere; }
      .legacy-salon * { box-sizing:border-box; }
      .legacy-salon a,.legacy-salon button { min-height:44px; display:inline-flex; align-items:center; justify-content:center; padding:10px 14px; color:${gold}; font:inherit; border:1px solid ${gold}55; border-radius:4px; background:#111; text-decoration:none; cursor:pointer; }
      .legacy-salon :is(a,button,textarea):focus-visible { outline:3px solid ${gold}; outline-offset:3px; }
      .legacy-salon button:disabled { opacity:.55; cursor:default; }
      .legacy-salon-header { max-width:72rem; margin:auto; padding:1rem; display:flex; flex-wrap:wrap; align-items:center; gap:1rem; }
      .legacy-salon-header h1 { font-family:Cinzel,serif; font-size:1.35rem; margin:.6rem 0; }
      .legacy-salon-body { max-width:72rem; margin:auto; padding:1rem; display:grid; grid-template-columns:minmax(0,1fr) 15rem; gap:1.5rem; }
      .legacy-salon article { border:1px solid ${gold}33; border-radius:4px; padding:1rem; margin:1rem 0; background:#0d0d0d; }
      .legacy-salon article p { margin:.4rem 0; }
      .legacy-salon textarea { width:100%; min-width:0; min-height:100px; padding:12px; color:${parchment}; background:#111; border:1px solid ${gold}88; font:inherit; font-size:16px; resize:vertical; }
      .legacy-salon .actions { display:flex; flex-wrap:wrap; gap:.75rem; margin:.75rem 0; }
      .legacy-salon .muted { color:${muted}; }
      .legacy-salon aside { min-width:0; border-top:1px solid ${gold}44; }
      @media(max-width:640px) { .legacy-salon-body { grid-template-columns:minmax(0,1fr); } }
    `}</style>
    <header className="legacy-salon-header">
      <div style={{ flex: '1 1 16rem', minWidth: 0 }}><Link href="/book-salons">Book salons</Link>
        <h1>{conversation?.cohort.title || 'Book salon'}</h1>
        {conversation && <p className="muted">{book?.author ? `${book.author} · ` : ''}{conversation.membership_count} total members{conversation.cohort.status ? ` · ${conversation.cohort.status}` : ''}</p>}
      </div>
      {book && <Link href={`/great-books/${book.id}`}>Read the text</Link>}
    </header>
    <div className="legacy-salon-body">
      <section aria-label="Public salon discussion" style={{ minWidth: 0 }}>
        <p>This ordinary book salon is public. Anyone can read its messages and posting display names. Circle discussions have separate member access.</p>
        <div className="actions"><button type="button" onClick={load} disabled={busy}>Reload discussion</button>
          <Link href={`/login?next=${encodeURIComponent(`/book-salons/${cohortId}`)}`}>Sign in</Link>
        </div>
        <p role="status" aria-live="polite">{notice}</p>
        {conversation && <>
          <p className="muted">{conversation.history.truncated ? 'Latest 100 messages. Earlier history is not shown.' : `Showing ${conversation.messages.length} messages.`}</p>
          <section aria-label="Public message history">
            {conversation.messages.length === 0 && <p>No messages yet.</p>}
            {conversation.messages.map(message => <article key={message.id}>
              <p><strong>{message.member_name || 'Unattributed message'}</strong>{actor && editable && message.is_mine ? ' (you)' : ''}</p>
              <div style={{ lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }} />
              <p className="muted">{message.created_at ? <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString()}</time> : 'Date unavailable'}</p>
            </article>)}
          </section>
          {!actor && <button type="button" onClick={prepare} disabled={busy || phase !== 'public'}>Prepare to post</button>}
          {actor && <form onSubmit={send}>
            <label htmlFor="salon-public-message">Your public message</label>
            <p id="salon-public-warning">Your message and posting display name will be public. Join this salon before posting. Reloading clears any unsent draft.</p>
            <textarea id="salon-public-message" aria-describedby="salon-public-warning" maxLength={2000} required disabled={!editable}
              value={input} onChange={event => setInput(event.target.value)} />
            <div className="actions"><button type="submit" disabled={!editable || !input.trim()}>Post public message</button></div>
          </form>}
        </>}
      </section>
      {conversation && <aside aria-label="Published member profiles">
        <h2 style={{ fontSize: '1.15rem' }}>Published profiles ({conversation.members.length})</h2>
        <p className="muted">Only members with published profiles appear here. This is not the full membership list.</p>
        {conversation.roster.truncated && <p className="muted">At most 50 published profiles are shown.</p>}
        {conversation.members.map(member => <p key={member.id}>{member.members.display_name || 'Explorer'}</p>)}
        {conversation.cohort.description && <><h2 style={{ fontSize: '1.15rem' }}>About this salon</h2><p>{conversation.cohort.description}</p></>}
      </aside>}
    </div>
  </main>;
}
