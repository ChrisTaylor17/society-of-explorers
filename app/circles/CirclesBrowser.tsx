'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { formatDay } from '@/lib/circles/schedule';
import { circleDetailHref, DEFAULT_DISCOVERY_QUERY, discoverySearchParams, parseDiscoveryQuery, type DiscoveryQuery } from '@/lib/circles/discovery';
import { button, card, fieldLabel, gold, input, ivory85, muted, parchment, primary, small } from '@/lib/circles/ui';
import { getBook } from '@/lib/books/catalog';
import { getReadingEdition, READING_EDITIONS, readingEditionLabel, readingSessionLabel, readingStartHref } from '@/lib/circles/reading-program';
import ReadingProgramSummary from './ReadingProgramSummary';
import styles from './reading-program.module.css';
import { defaultDiscoveryPageRequest, discoveryPageSearchParams, isDiscoveryRestart, parseDiscoveryPage, parseDiscoveryPageRequest, type DiscoveryPageReply, type DiscoveryPageRequest, type PublicDiscoveryCircle } from '@/lib/circles/discovery-page';

type State = { status: 'loading' } | { status: 'error' } | { status: 'invalid' } | { status: 'soon' } | { status: 'restart' } | { status: 'ok'; result: DiscoveryPageReply };
const NAVIGATION_EVENT = 'soe-public-discovery-navigation';

function startContext(query: DiscoveryQuery) {
  const edition = !query.invalidContext && query.book ? getReadingEdition(query.book, query.edition) : undefined;
  return { href: edition ? readingStartHref({ bookId: edition.bookId, editionId: edition.editionId, from: query.from ?? 0, to: query.to ?? edition.blockCount - 1 }) : '/circles/start', invalid: Boolean(query.invalidContext) };
}

// This primary action follows the same applied public URL as the search below,
// including native Back/Forward. Draft text and cursor are never carried here.
export function CircleStartLink({ initialHref, initialInvalid }: { initialHref: string; initialInvalid: boolean }) {
  const [context, setContext] = useState({ href: initialHref, invalid: initialInvalid });
  useEffect(() => {
    const restore = () => setContext(startContext(parseDiscoveryQuery(new URLSearchParams(window.location.search))));
    restore(); window.addEventListener('popstate', restore); window.addEventListener(NAVIGATION_EVENT, restore);
    return () => { window.removeEventListener('popstate', restore); window.removeEventListener(NAVIGATION_EVENT, restore); };
  }, []);
  return <Link href={context.href} style={primary} prefetch={false}>{context.invalid ? 'Choose a new reading plan' : 'Start a circle'}</Link>;
}

export default function CirclesBrowser() {
  const [draft, setDraft] = useState<DiscoveryQuery>({ ...DEFAULT_DISCOVERY_QUERY });
  const [search, setSearch] = useState<{ request: DiscoveryPageRequest; attempt: number } | null>(null);
  const [state, setState] = useState<State>({ status: 'loading' });
  const generation = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const focusResults = useRef(false);

  useEffect(() => {
    let appliedSearch: string | undefined;
    const restore = (event?: Event) => {
      const currentSearch = window.location.search;
      // A fragment link can fire popstate while the search stays the same.
      if (event?.type === 'popstate' && currentSearch === appliedSearch) return;
      appliedSearch = currentSearch;
      generation.current += 1;
      focusResults.current = Boolean(event);
      pending.current?.abort();
      const params = new URLSearchParams(currentSearch), parsed = parseDiscoveryPageRequest(params);
      setDraft(parseDiscoveryQuery(params));
      if (!parsed.ok) { setState({ status: 'invalid' }); setSearch(null); return; }
      setState({ status: 'loading' });
      setSearch(previous => ({ request: parsed.value, attempt: (previous?.attempt ?? 0) + 1 }));
    };
    restore();
    window.addEventListener('popstate', restore);
    window.addEventListener(NAVIGATION_EVENT, restore);
    return () => { window.removeEventListener('popstate', restore); window.removeEventListener(NAVIGATION_EVENT, restore); generation.current += 1; pending.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!search) return;
    const ownGeneration = ++generation.current;
    const controller = new AbortController();
    pending.current = controller;
    let active = true;
    let timeout: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const request = fetch(`/api/circles?${discoveryPageSearchParams(search.request)}`, { cache: 'no-store', redirect: 'error', credentials: 'omit', signal: controller.signal });
        // Bound the wait even when a transport does not settle after abort.
        const deadline = new Promise<never>((_, reject) => {
          timeout = setTimeout(() => { controller.abort(); reject(new Error('Circle search timed out')); }, 15_000);
        });
        const data = await Promise.race([
          request.then(async res => ({ status: res.status, data: await res.json() })),
          deadline,
        ]);
        if (!active || ownGeneration !== generation.current) return;
        if (data.status === 409 && isDiscoveryRestart(data.data)) { setState({ status: 'restart' }); return; }
        if (data.status !== 200) throw new Error('Circle search unavailable');
        if (data.data?.ready === false) { setState({ status: 'soon' }); return; }
        const result = parseDiscoveryPage(data.data, search.request);
        if (!result) throw new Error('Invalid circle search response');
        setState({ status: 'ok', result });
      } catch {
        if (active && ownGeneration === generation.current) setState({ status: 'error' });
      } finally { clearTimeout(timeout!); }
    };
    void load();
    return () => { active = false; controller.abort(); clearTimeout(timeout!); };
  }, [search]);

  function apply(query: DiscoveryQuery, cursor: string | null = null, updateHistory = true) {
    generation.current += 1;
    focusResults.current = true;
    pending.current?.abort();
    try {
      const request = { query: parseDiscoveryQuery(discoverySearchParams(query)), limit: search?.request.limit ?? 25, cursor };
      const params = discoveryPageSearchParams(request), next = `/circles${params.size ? `?${params}` : ''}`;
      if (updateHistory && next !== `${window.location.pathname}${window.location.search}`) window.history.pushState(null, '', next);
      if (updateHistory) window.dispatchEvent(new Event(NAVIGATION_EVENT));
      else { setDraft(request.query); setState({ status: 'loading' }); setSearch(previous => ({ request, attempt: (previous?.attempt ?? 0) + 1 })); }
    } catch { setState({ status: 'invalid' }); setSearch(null); }
  }

  const request = search?.request ?? defaultDiscoveryPageRequest(), query = request.query;
  const filtered = Boolean(query.q || query.city || query.format || query.open || query.book);
  const queryString = discoveryPageSearchParams(request).toString();
  const searchLink = `/circles${queryString ? `?${queryString}` : ''}`;
  const edition = query.book && query.edition ? getReadingEdition(query.book, query.edition) : undefined;
  const selected = edition ? query.from !== undefined && query.to !== undefined ? { from: query.from, to: query.to } : { from: 0, to: edition.blockCount - 1 } : null;
  const startLink = edition && selected ? readingStartHref({ bookId: edition.bookId, editionId: edition.editionId, ...selected }) : '/circles/start';
  const summary = state.status === 'loading' ? 'Loading circles…'
    : state.status === 'invalid' ? 'This search link or its book, edition or reading selection could not be verified. Clear the search or choose valid filters before searching.'
    : state.status === 'restart' ? 'The search calendar changed. Restart this search from the first page to check current listings; no empty result is being assumed.'
    : state.status === 'error' ? 'Circles could not be loaded. Your search is ready to try again.'
    : state.status === 'soon' ? 'Circle listings are currently unavailable.'
    : `${state.result.circles.length} ${state.result.circles.length === 1 ? 'Circle' : 'Circles'} returned on this page${filtered ? ' for your search' : ''}. ${state.result.page.nextCursor ? 'More results are available.' : 'No further page was returned at this check.'}`;

  return (
    <div className={styles.scope}>
      <form onSubmit={e => { e.preventDefault(); apply(draft); }} role="search" aria-label="Find a circle"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '12px', alignItems: 'end', margin: '0 0 1.25rem' }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="circle-keywords" style={fieldLabel}>Reading, topic or circle name</label>
          <input id="circle-keywords" name="q" value={draft.q} onChange={e => setDraft({ ...draft, q: e.target.value })} placeholder="e.g. Lincoln or friendship" style={input} maxLength={160} aria-describedby="circle-search-hint" />
          <p id="circle-search-hint" style={small}>Search names, descriptions, hosts and the current reading. Everyone is welcome, including first-time readers.</p>
        </div>
        <div>
          <label htmlFor="circle-book" style={fieldLabel}>Book and exact edition</label>
          <select id="circle-book" name="book" style={input} value={draft.book || ''} onChange={event => {
            const pinned = getReadingEdition(event.target.value);
            setDraft({ ...draft, book: pinned?.bookId, edition: pinned?.editionId, from: undefined, to: undefined, invalidContext: false });
          }}><option value="">All reading plans</option>{READING_EDITIONS.map(pinned => <option key={pinned.bookId} value={pinned.bookId}>{getBook(pinned.bookId)?.title} — {getBook(pinned.bookId)?.author}</option>)}</select>
        </div>
        <div>
          <label htmlFor="circle-city" style={fieldLabel}>City or region</label>
          <input id="circle-city" name="city" value={draft.city} onChange={e => setDraft({ ...draft, city: e.target.value })} placeholder="e.g. Boston" style={input} maxLength={80} />
        </div>
        <div>
          <label htmlFor="circle-format" style={fieldLabel}>Format</label>
          <select id="circle-format" name="format" value={draft.format} onChange={e => setDraft({ ...draft, format: e.target.value as DiscoveryQuery['format'] })} style={input}>
            <option value="">In person or online</option><option value="in_person">In person (including hybrid)</option><option value="online">Online (including hybrid)</option>
          </select>
        </div>
        <div>
          <label htmlFor="circle-sort" style={fieldLabel}>Sort by</label>
          <select id="circle-sort" name="sort" value={draft.sort} onChange={e => setDraft({ ...draft, sort: e.target.value as DiscoveryQuery['sort'] })} style={input}>
            <option value="next">Next meeting date</option><option value="title">Circle name</option>
          </select>
        </div>
        <label style={{ ...small, color: ivory85, display: 'flex', alignItems: 'center', gap: '10px', minHeight: '44px', cursor: 'pointer' }}>
          <input name="open" type="checkbox" checked={draft.open} onChange={e => setDraft({ ...draft, open: e.target.checked })} style={{ width: '20px', height: '20px', flexShrink: 0 }} />
          Has open seats
        </label>
        <button type="submit" style={button}>Search</button>
        <button type="button" onClick={() => apply({ ...DEFAULT_DISCOVERY_QUERY })} style={button}>Clear search</button>
      </form>

      <p role="status" aria-live="polite" aria-atomic="true" style={{ ...small, marginBottom: '12px' }}>{summary}</p>
      {edition && <div style={{ ...small, marginBottom: '12px' }}><p>Pinned edition: {readingEditionLabel(edition)}</p>
        {query.from !== undefined && query.to !== undefined && <p>Reader selection: {readingSessionLabel(edition, { from: query.from, to: query.to })}.</p>}
        <p>Results match this book and exact edition. A Circle may agree different reading ranges; compare its planned weekly readings.</p><Link href={startLink}>Start a Circle with this reading context</Link>
      </div>}
      {search && <p style={{ ...small, marginBottom: '12px' }}><a href={searchLink} style={{ color: gold }}>Link to this results page</a> · Copy the link to share these public filters and page.</p>}
      <div aria-busy={state.status === 'loading'} aria-label="Circle search results">
        {state.status === 'error' && <button type="button" style={button} onClick={() => apply(query, request.cursor, false)}>Try again</button>}
        {state.status === 'restart' && <button type="button" style={button} onClick={() => apply(query)}>Restart current search</button>}
        {state.status === 'soon' && <div style={{ ...card, borderStyle: 'dashed' }}><p style={{ ...small, color: ivory85, fontSize: '17px' }}>
          The reading path, guides, host toolkit and norms are ready now. <Link href="/circles/path/1" style={{ color: gold }}>Begin with week 1</Link>.
        </p><button type="button" style={{ ...button, marginTop: '12px' }} onClick={() => apply(query, request.cursor, false)}>Check listings again</button></div>}
        {state.status === 'ok' && <>
          <h3 style={{ ...small, color: parchment }} tabIndex={-1} ref={element => { if (element && focusResults.current) { element.focus(); focusResults.current = false; } }}>Current results page</h3>
          <p style={{ ...small, marginBottom: '12px' }}>Live page checked at <time dateTime={state.result.page.asOf}>{state.result.page.asOf}</time>. Each page checks current listings. Seats and schedules may change; joining checks current access again.</p>
          <nav className={styles.row} aria-label="Search result pages" style={{ marginBottom: '12px' }}>
            <button type="button" style={button} onClick={() => apply(query)}>First page of results</button>
            {state.result.page.nextCursor && <button type="button" style={button} onClick={() => apply(query, state.result.page.nextCursor)}>Next page of results</button>}
          </nav>
          {state.result.circles.length === 0 ? <EmptyState filtered={filtered} continuation={request.cursor !== null} startHref={startLink} /> : <ul aria-label="Circles on this page" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '12px' }}>{state.result.circles.map(c => <CircleCard key={c.id} c={c} fromOnline={query.format === 'online'} />)}</ul>}
        </>}
      </div>
    </div>
  );
}

function CircleCard({ c, fromOnline }: { c: PublicDiscoveryCircle; fromOnline: boolean }) {
  const href = circleDetailHref(c.id, fromOnline);
  const where = c.format === 'online' ? 'Online' : [c.venue_name, c.city, c.region].filter(Boolean).join(', ');
  return (
    <li data-circle-id={c.id} style={{ ...card, overflowWrap: 'anywhere' }}>
      <p style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.12em', color: gold, margin: '0 0 6px' }}>{c.format_label.toUpperCase()} · {c.spots_left > 0 ? `${c.spots_left} SPOTS LEFT` : 'FULL'}</p>
      <h3 style={{ fontFamily: 'Cinzel, serif', fontSize: '18px', fontWeight: 400, color: parchment, margin: '0 0 6px' }}><Link href={href} style={{ color: parchment }}>{c.title}</Link></h3>
      {c.description && <p style={{ ...small, color: ivory85, marginBottom: '8px', whiteSpace: 'pre-wrap' }}>{c.description}</p>}
      <p style={{ fontSize: '17px', color: ivory85, margin: '0 0 4px' }}>{where}</p>
      <p style={{ fontSize: '16px', color: muted, margin: '0 0 4px' }}>{c.phase === 'upcoming' ? 'Upcoming Circle · first meeting' : 'Reading together now · next meeting'} <time dateTime={c.next_meeting}>{formatDay(c.next_meeting)}</time></p>
      <p style={{ fontSize: '16px', color: muted, margin: '0 0 4px' }}>{c.meeting_label} · hosted by {c.host_name}</p>
      {c.reading && <p style={{ fontSize: '16px', color: muted, margin: '0 0 8px' }}>{c.phase === 'upcoming' ? 'First reading' : 'Current reading'} · Week {c.reading.week}: <Link href={`/circles/path/${c.reading.week}?circle=${c.id}`} style={{ color: gold }}>{c.reading.title} — discussion guide</Link></p>}
      {c.reading_program && <ReadingProgramSummary program={c.reading_program} circleId={c.id} compact />}
      <Link href={href} style={{ ...button, marginTop: '8px' }} aria-label={`View circle: ${c.title}`}>View circle</Link>
    </li>
  );
}

function EmptyState({ filtered, continuation, startHref }: { filtered: boolean; continuation: boolean; startHref: string }) {
  return <div style={{ display: 'grid', gap: '12px' }}>
    <p style={{ ...small, color: ivory85, fontSize: '17px' }}>{continuation ? 'No Circles were returned on this page. Listings may have changed; check the first page again.' : filtered ? 'No matches were returned by this search at this check. Try a broader search or an online Circle.' : 'No Circles were returned at this check. You can start a Circle or try again later.'}</p>
    <div aria-label="Example listing, not a real circle" style={{ ...card, borderStyle: 'dashed' }}>
      <p style={{ ...small, color: gold }}>EXAMPLE · NOT A REAL CIRCLE</p>
      <p style={{ ...small, color: parchment }}>Your circle&rsquo;s name · Your public library or online · A weekly reading together</p>
    </div>
    <p style={small}>You can also <Link href={startHref} style={{ color: gold }}>start a circle</Link>, use the <Link href="/circles/host" style={{ color: gold }}>host toolkit</Link>, or <Link href="/circles/path" style={{ color: gold }}>read at your own pace</Link>.</p>
  </div>;
}
