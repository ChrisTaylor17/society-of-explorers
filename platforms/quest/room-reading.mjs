import { createCircleReading, isPhilemonReading, parseCircleDetail, philemonReadingText,
  PHILEMON_EDITION_METADATA, starterReadingContext } from './circle-host.mjs';
import { ROOM_TEXT_COLUMNS } from './room-composer.mjs';

const DEADLINE_MS = 9000;
const LINES_PER_PAGE = 9;
const label = 'CIRCLE READING';
const unavailable = 'The current Circle access and source could not be verified. Use the regular Circle view to check again.';
const control = (id, text) => ({ id, label: text });

/** Wrap without dropping characters or source line breaks. */
export function roomReadingPages(text) {
  const pages = [];
  let page = [];
  const append = line => {
    page.push(line);
    if (page.length === LINES_PER_PAGE) { pages.push(page); page = []; }
  };
  for (const line of text.split(/\r\n|\n|\r/u)) {
    const chars = Array.from(line);
    if (!chars.length) append('');
    for (let start = 0; start < chars.length;) {
      let end = Math.min(start + ROOM_TEXT_COLUMNS, chars.length);
      if (end < chars.length) {
        for (let wrap = end; wrap > end - 12; wrap--) {
          if (/\s/u.test(chars[wrap - 1])) { end = wrap; break; }
        }
      }
      append(chars.slice(start, end).join(''));
      start = end;
    }
  }
  if (page.length) pages.push(page);
  return pages;
}

function selectedContext(detail) {
  const { week, reading_program: program } = detail.circle;
  if (!program) return starterReadingContext(week);
  const session = program.sessions[week - 1];
  return session ? { bookId: program.bookId, editionId: program.editionId, ...session } : null;
}

export function createRoomReading({ origin, circleId, owner, transport, isActive, onPanel, backLabel }) {
  const endpoint = origin + '/api/circles/' + circleId;
  const scope = owner.scope(), lifetime = new AbortController();
  const back = control('reading-back', backLabel);
  const active = () => !lifetime.signal.aborted && isActive() && scope !== null && owner.scope() === scope;
  let reader = null, pages = [], credits = [], page = 0, creditPage = null;
  const footer = 'Squeeze to exit the headset room.';
  const notice = (heading, text, rows = []) => onPanel({ label, heading, text, rows, footer });
  const backRow = [[null, null, null, back]];

  function clear() {
    reader?.close();
    reader = null;
    pages = credits = [];
    page = 0;
    creditPage = null;
  }

  async function checkSelection() {
    const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(DEADLINE_MS)]);
    const bearer = await owner.bearer(scope);
    if (!active() || !bearer) throw Error('Circle access ended');
    signal.throwIfAborted();
    const response = await transport(endpoint, { method: 'GET', headers: { Authorization: 'Bearer ' + bearer },
      cache: 'no-store', credentials: 'omit', redirect: 'error', signal });
    signal.throwIfAborted();
    if (!active()) throw Error('Circle access ended');
    if (response.status !== 200 || response.redirected || response.url !== endpoint) throw Error('Circle detail unavailable');
    const detail = parseCircleDetail(await response.json(), circleId);
    signal.throwIfAborted();
    if (!active() || !detail?.viewer.signed_in || !detail.viewer.is_member || detail.circle.hidden
      || !detail.capabilities.canReadConversation) throw Error('Circle access ended');
    return detail.ended ? null : selectedContext(detail);
  }

  function show() {
    const model = reader?.model();
    const edition = model?.passage.metadata.edition ?? PHILEMON_EDITION_METADATA.edition;
    const reading = creditPage === null;
    const position = reading ? page : creditPage;
    const currentPages = reading ? pages : credits;
    const previous = position > 0 ? 'Previous page' : reading && model?.canPrevious ? 'Previous block' : null;
    const next = position + 1 < currentPages.length ? 'Next page' : reading && model?.canNext ? 'Next block' : null;
    const blockLabel = model ? `Block ${model.blockIndex - model.context.from + 1} of ${model.context.to - model.context.from + 1}` : 'Philemon 1';
    onPanel({ label, heading: reading ? edition.sourceTitle : 'Source edition and rights',
      readingLines: currentPages[position],
      rows: [[previous && control('reading-previous', previous), control('reading-credits', reading ? 'Source info' : 'Back to text'),
        next && control('reading-next', next), back]],
      footer: `${reading ? blockLabel : 'Source info'} · Page ${position + 1} of ${currentPages.length} · ${footer}` });
  }

  async function load(move = 'load') {
    if (!active()) return;
    notice('Checking the Circle reading', 'Checking current membership and the exact source selection…');
    try {
      const selection = await checkSelection();
      if (!active()) return;
      if (!selection) {
        clear();
        notice('Circle reading unavailable', 'There is no current selection from a supported edition. See the regular Circle for its reading plan.', backRow);
        return;
      }
      if (isPhilemonReading(selection)) {
        clear();
        const edition = PHILEMON_EDITION_METADATA.edition;
        pages = roomReadingPages(philemonReadingText());
        credits = roomReadingPages([edition.attribution, edition.licenseNotice, edition.sourceCatalogUrl, edition.licenseUrl].join('\n\n'));
        show();
        return;
      }
      if (reader) {
        const { context } = reader.model();
        if (Object.keys(context).some(key => context[key] !== selection[key])) {
          clear();
          notice('The selection changed', 'Return to the salon or discussion and open the new selection.', backRow);
          return;
        }
      } else {
        reader = createCircleReading({ origin, owner, context: selection, passageTransport: transport,
          initialOnline: true, timeoutMs: DEADLINE_MS });
        reader.connect();
      }
      await reader[move]();
      if (!active()) return;
      const { passage, message, canRetry } = reader.model();
      if (!passage) {
        pages = credits = [];
        notice('Source block unavailable', message, [[null, null, canRetry ? control('reading-retry', 'Retry block') : null, back]]);
        return;
      }
      const edition = passage.metadata.edition;
      pages = roomReadingPages(passage.blockText ?? message);
      credits = roomReadingPages([edition.attribution, 'Public domain in the United States. Rights elsewhere are unassessed.',
        edition.licenseNotice, edition.licenseUrl, ...edition.editionNotes].join('\n\n'));
      page = move === 'previous' ? pages.length - 1 : 0;
      creditPage = null;
      show();
    } catch {
      if (!active()) return;
      clear();
      notice('Circle reading unavailable', unavailable, backRow);
    }
  }

  return {
    open: () => load(),
    async select(target) {
      if (!active()) return;
      if (target === 'reading-retry' && reader?.model().canRetry) { await load('retry'); return; }
      if (!pages.length) return;
      if (target === 'reading-credits') creditPage = creditPage === null ? 0 : null;
      else {
        const step = target === 'reading-next' ? 1 : target === 'reading-previous' ? -1 : 0;
        if (!step) return;
        if (creditPage !== null) creditPage = Math.max(0, Math.min(credits.length - 1, creditPage + step));
        else if (page + step >= 0 && page + step < pages.length) page += step;
        else if (reader && (step === 1 ? reader.model().canNext : reader.model().canPrevious)) {
          await load(step === 1 ? 'next' : 'previous');
          return;
        }
      }
      show();
    },
    close() { lifetime.abort(); clear(); },
  };
}
