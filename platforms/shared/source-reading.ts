import { getReadingEdition, parseReadingProgram, type ReadingContext } from '../../lib/circles/reading-program';
import { getSourceReaderEdition } from '../../lib/books/source-reader';
import type { CircleOwner } from '../native/src/circles/host';

export type SourceReadingEvent = { requestKey: string; blockIndex: number; phase: 'loading' | 'ready' | 'unavailable' };
export type SourceReadingConfig = { owner: Pick<CircleOwner, 'scope' | 'subscribe'>; context: ReadingContext;
  available: boolean; initialBlockIndex?: number; initialOnline?: boolean; timeoutMs?: number };
export type SourceReadingModel = {
  connected: boolean; active: boolean; online: boolean; busy: boolean;
  phase: 'closed' | 'idle' | 'loading' | 'ready' | 'unavailable'; context: ReadingContext;
  blockIndex: number; requestKey: string | null; message: string;
  canLoad: boolean; canRetry: boolean; canPrevious: boolean; canNext: boolean; canNavigate: boolean;
};
let viewSequence = 0;

/** The native view alone loads the public source. This controller never receives
 * credentials, URLs, HTML, or reading text. Its selected position is explicit;
 * scrolling and source footnotes do not silently move a saved-place target. */
export function createSourceReading(config: SourceReadingConfig) {
  const raw = config.context;
  const program = raw && parseReadingProgram({ version: 1, bookId: raw.bookId, editionId: raw.editionId, sessions: [{ from: raw.from, to: raw.to }] });
  const source = program && getSourceReaderEdition(program.bookId, program.editionId);
  const edition = program && getReadingEdition(program.bookId, program.editionId);
  const timeout = config.timeoutMs ?? 60000;
  if (!program || !source || !edition || edition.blockCount !== source.blockCount
    || Object.keys(raw).sort().join(',') !== 'bookId,editionId,from,to'
    || typeof config.owner?.scope !== 'function' || typeof config.owner.subscribe !== 'function'
    || typeof config.available !== 'boolean' || config.initialOnline !== undefined && typeof config.initialOnline !== 'boolean'
    || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 120000) throw Error('An exact supported source selection is required');
  const context = { bookId: program.bookId, editionId: program.editionId, ...program.sessions[0] };
  const first = config.initialBlockIndex ?? context.from;
  if (!Number.isSafeInteger(first) || first < context.from || first > context.to) throw Error('Initial source position must be within the selection');
  const viewId = ++viewSequence;
  let connected = false, closed = false, active = true, online = config.initialOnline ?? false;
  let scope: string | null = null, attachment = 0, generation = 0, blockIndex = first;
  let phase: SourceReadingModel['phase'] = 'closed', requestKey: string | null = null;
  let message = 'Load the complete source edition when ready.', stopOwner = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<(model: SourceReadingModel) => void>();
  const enabled = () => !closed && connected && active && online && scope !== null && scope === config.owner.scope() && config.available;
  const model = (): SourceReadingModel => {
    const usable = enabled(), ready = usable && phase === 'ready';
    return { connected: connected && scope !== null, active, online, busy: phase === 'loading', phase,
      context: { ...context }, blockIndex, requestKey: usable ? requestKey : null, message,
      canLoad: usable && phase !== 'loading', canRetry: usable && phase === 'unavailable',
      canPrevious: ready && blockIndex > context.from, canNext: ready && blockIndex < context.to, canNavigate: true };
  };
  const emit = () => { for (const listener of listeners) { try { listener(model()); } catch { /* Independent observers. */ } } };
  function retire(notice: string) {
    ++generation; clearTimeout(timer); timer = undefined; requestKey = null; blockIndex = first;
    phase = connected ? 'idle' : 'closed'; message = notice; emit();
  }
  function close(notice = 'Reading view closed. Nothing loads automatically.') {
    if (closed) return;
    closed = true; ++attachment; connected = false; scope = null; stopOwner(); stopOwner = () => {}; retire(notice);
  }
  function fail() {
    clearTimeout(timer); timer = undefined; requestKey = null; phase = 'unavailable';
    message = 'The complete source edition could not be verified. Retry this selected position when ready.'; emit();
  }
  function load(index = blockIndex) {
    if (!model().canLoad || !Number.isSafeInteger(index) || index < context.from || index > context.to) return;
    clearTimeout(timer); const g = ++generation;
    blockIndex = index; requestKey = `source_${viewId}_${g}`; phase = 'loading';
    message = 'Loading the complete source edition and its illustrations…';
    timer = setTimeout(() => { if (enabled() && generation === g && phase === 'loading') fail(); }, timeout);
    emit();
  }
  return {
    model,
    subscribe(listener: (value: SourceReadingModel) => void) { listeners.add(listener); listener(model()); return () => { listeners.delete(listener); }; },
    connect() {
      if (closed || connected) return;
      connected = true; const captured = ++attachment;
      const stop = config.owner.subscribe(() => { if (connected && !closed && attachment === captured) close('Account changed. Choose the reading again from your current account.'); });
      if (!connected || closed || attachment !== captured) { stop(); return; }
      stopOwner = stop; scope = config.owner.scope();
      retire(!config.available ? 'The complete source reader is unavailable in this app version.'
        : !active ? 'Reading view is inactive.' : !online ? 'Reconnect, then load the source edition manually.' : 'Load the complete source edition when ready.');
    },
    disconnect() { ++attachment; connected = false; scope = null; stopOwner(); stopOwner = () => {}; retire('Reading view closed.'); },
    activity(value: boolean) { active = value; if (!value) retire('Reading view cleared while inactive. Load it again when ready.'); else emit(); },
    connectivity(value: boolean) { online = value; if (!value) retire('Reading view cleared while offline. Reconnect, then load it manually.'); else emit(); },
    load: () => load(), retry: () => { if (model().canRetry) load(); },
    next: () => { if (model().canNext) load(blockIndex + 1); },
    previous: () => { if (model().canPrevious) load(blockIndex - 1); },
    receive(event: SourceReadingEvent) {
      if (!enabled() || !requestKey || event?.requestKey !== requestKey || event.blockIndex !== blockIndex
        || !['loading', 'ready', 'unavailable'].includes(event.phase)) return;
      if (event.phase === 'unavailable') { fail(); return; }
      // Ready is monotonic. An old loading callback cannot reopen a settled frame.
      if (phase !== 'loading' || event.phase !== 'ready') return;
      clearTimeout(timer); timer = undefined; phase = 'ready';
      message = 'Complete source edition. Scrolling and footnotes leave your selected save position unchanged.'; emit();
    },
    close,
  };
}
export type SourceReading = ReturnType<typeof createSourceReading>;
