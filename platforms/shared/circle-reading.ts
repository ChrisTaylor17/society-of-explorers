import { getReadingEdition, matchesReadingEdition, parseReadingProgram, type ReadingContext } from '../../lib/circles/reading-program';
import { parseBookPassage, passageIndexPin, samePassageReference, type BookPassage, type PassageReference } from '../../lib/books/passages';
import metadataSnapshot from './reading-metadata.json';
import { approvedOrigin, type CircleOwner, type CircleTransport } from '../native/src/circles/host';

export type CircleReadingConfig = { origin: string; owner: CircleOwner; passageTransport?: CircleTransport; context: ReadingContext;
  timeoutMs?: number; initialOnline?: boolean };
export type CircleReadingModel = {
  connected: boolean; active: boolean; online: boolean; busy: boolean;
  phase: 'idle' | 'loading' | 'ready' | 'unsupported' | 'unavailable' | 'closed';
  context: ReadingContext; blockIndex: number; passage: BookPassage | null; message: string;
  canLoad: boolean; canNext: boolean; canPrevious: boolean; canRetry: boolean; canNavigate: boolean;
};
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// The offline generator verifies this complete metadata tuple against the
// canonical index SHA. Runtime comparison needs no native crypto dependency.
function metadataMatches(passage: BookPassage): boolean {
  const pin = passageIndexPin(passage.reference.bookId), e = passage.metadata.edition;
  const snapshot = metadataSnapshot.editions.find(item => item.bookId === passage.reference.bookId && item.editionId === passage.reference.editionId);
  const tuple = [e.sourceTitle,e.sourceAuthor,e.translators,e.editors,e.illustrators,e.rights,
    e.licenseUrl,e.licenseNotice,e.editionNotes,e.sourceCatalogUrl,e.sourceArchiveUrl];
  return Boolean(pin && metadataSnapshot.version === 1 && snapshot && snapshot.metadataSha256 === pin.metadataSha256
    && JSON.stringify(tuple) === JSON.stringify(snapshot.tuple) && e.attribution === snapshot.attribution);
}

/** Reading is public, but the chosen Circle context belongs to this view and
 * owner lifetime. No member credential or provider verification is requested. */
export function createCircleReading(config: CircleReadingConfig) {
  const origin = approvedOrigin(config.origin), timeout = config.timeoutMs ?? 15000, raw = config.context;
  const program = raw && parseReadingProgram({ version: 1, bookId: raw.bookId, editionId: raw.editionId, sessions: [{ from: raw.from, to: raw.to }] });
  const edition = program && getReadingEdition(program.bookId, program.editionId), pin = program && passageIndexPin(program.bookId);
  if (!program || !edition || !pin || pin.editionId !== program.editionId || pin.blockCount !== edition.blockCount
    || !raw || Object.keys(raw).sort().join(',') !== 'bookId,editionId,from,to'
    || !config.owner || typeof config.owner.scope !== 'function' || typeof config.owner.subscribe !== 'function'
    || config.passageTransport !== undefined && typeof config.passageTransport !== 'function'
    || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000
    || config.initialOnline !== undefined && typeof config.initialOnline !== 'boolean') throw Error('An exact supported reading selection is required');
  const context: ReadingContext = { bookId: program.bookId, editionId: program.editionId, ...program.sessions[0] };
  let attached = false, closed = false, active = true, online = config.initialOnline ?? false, scope: string | null = null;
  let generation = 0, attachment = 0, blockIndex = context.from, busy = false;
  let phase: CircleReadingModel['phase'] = 'closed', passage: BookPassage | null = null, offOwner = () => {};
  let message = config.passageTransport ? 'Load this exact reading selection when ready.' : 'Text reading is unavailable in this connection.';
  const listeners = new Set<(model: CircleReadingModel) => void>(), requests = new Set<AbortController>();
  const enabled = () => !closed && attached && active && online && scope !== null && scope === config.owner.scope() && Boolean(config.passageTransport);
  const model = (): CircleReadingModel => {
    const usable = enabled() && !busy, validated = phase === 'ready' || phase === 'unsupported';
    return { connected: attached && scope !== null, active, online, busy, phase, context: { ...context }, blockIndex,
      passage: copy(passage), message, canLoad: usable, canNext: usable && validated && blockIndex < context.to,
      canPrevious: usable && validated && blockIndex > context.from, canRetry: usable && phase === 'unavailable', canNavigate: !busy };
  };
  const emit = () => { for (const listener of listeners) { try { listener(model()); } catch { /* Notify independent observers. */ } } };
  function retire(notice: string) {
    generation++; for (const controller of requests) controller.abort(); passage = null; blockIndex = context.from;
    busy = false; phase = attached ? 'idle' : 'closed'; message = notice; emit();
  }
  function closeView(notice: string) {
    if (closed) return; closed = true; attachment++; attached = false; scope = null;
    offOwner(); offOwner = () => {}; retire(notice);
  }
  async function load(index = blockIndex) {
    if (!model().canLoad || !Number.isSafeInteger(index) || index < context.from || index > context.to) return;
    const g = ++generation, expected = scope, abort = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    const current = () => enabled() && generation === g && scope === expected && !abort.signal.aborted;
    const reference: PassageReference = { version: 1, bookId: context.bookId, editionId: context.editionId, blockIndex: index, start: null, end: null };
    const params = new URLSearchParams({ book: reference.bookId, edition: reference.editionId, block: String(index) });
    const url = origin + '/api/great-books/passage?' + params;
    blockIndex = index; passage = null; busy = true; phase = 'loading'; message = 'Checking this source block and its exact edition…'; requests.add(abort); emit();
    try {
      const result = await Promise.race([(async () => {
        if (!current()) throw Error('Reading lifetime ended');
        const response = await config.passageTransport!(url, { method: 'GET', headers: {}, cache: 'no-store', redirect: 'error', credentials: 'omit', signal: abort.signal });
        if (!current() || response.status !== 200 || response.redirected || response.url !== url) throw Error('Reading response unavailable');
        const parsed = parseBookPassage(await response.json());
        if (!current() || !parsed || !samePassageReference(parsed.reference, reference)
          || !matchesReadingEdition(parsed.metadata, context) || !metadataMatches(parsed)) throw Error('Reading source not verified');
        return parsed;
      })(), new Promise<never>((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(Error('Reading deadline exceeded')); }, timeout); })]);
      if (!current()) return;
      passage = result; busy = false; phase = result.reason === null ? 'ready' : 'unsupported';
      message = result.reason === null ? 'Verified text from the selected source edition. Line breaks are preserved.'
        : result.reason === 'table' ? 'This source block contains a table. Its text is not available in this reader; nothing has been skipped.'
        : result.reason === 'non_text' ? 'This source block contains an image, equation or other nontext content. It is not available in this reader; nothing has been skipped.'
        : 'This source block has no text to display. Nothing has been skipped.';
      emit();
    } catch {
      // A deadline aborts this request, but still settles its visible failure.
      if (!closed && attached && active && online && generation === g && scope === expected && config.owner.scope() === expected) {
        passage = null; busy = false; phase = 'unavailable'; message = 'This exact source block could not be verified. Retry it manually; no text or reading progress is being assumed.'; emit();
      }
    } finally { clearTimeout(timer); requests.delete(abort); }
  }
  return {
    model,
    subscribe(listener: (value: CircleReadingModel) => void) { listeners.add(listener); listener(model()); return () => { listeners.delete(listener); }; },
    connect() {
      if (attached || closed) return; attached = true; const connectedAt = ++attachment;
      const stop = config.owner.subscribe(() => { if (!attached || closed || connectedAt !== attachment) return; closeView('Account changed. The reading view was closed. Check the Circle and choose its reading again.'); });
      if (!attached || closed || connectedAt !== attachment) { stop(); return; }
      offOwner = stop; scope = config.owner.scope();
      retire(!active ? 'The reading view is inactive.' : !online ? 'Network access is unavailable. Reconnect, then load the reading manually.'
        : config.passageTransport ? 'Load this exact reading selection when ready.' : 'Text reading is unavailable in this connection.');
    },
    disconnect() { attachment++; attached = false; scope = null; offOwner(); offOwner = () => {}; retire('Reading view closed.'); },
    activity(value: boolean) { active = value; if (!value) retire('Reading view cleared while inactive. Load again when ready.'); else emit(); },
    connectivity(value: boolean) { online = value; if (!value) retire('Reading view cleared while offline. Reconnect, then load it manually.'); else emit(); },
    load: () => load(), next: () => model().canNext ? load(blockIndex + 1) : Promise.resolve(),
    previous: () => model().canPrevious ? load(blockIndex - 1) : Promise.resolve(), retry: () => model().canRetry ? load() : Promise.resolve(),
    close() { closeView('Reading view closed. Nothing loads automatically.'); },
  };
}
export type CircleReading = ReturnType<typeof createCircleReading>;
