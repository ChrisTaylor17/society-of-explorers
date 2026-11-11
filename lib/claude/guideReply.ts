import { createGuideTextStream } from './guideTextStream';

export type GuideReplyStatus = 'complete' | 'interrupted' | 'unavailable' | 'rate_limited' | 'cancelled';
export type GuideActionResult = { success?: boolean; type?: string; message?: string };
export type GuideReply = { status: GuideReplyStatus; text: string; reward?: unknown; actions: GuideActionResult[] };

export function guideReplyNotice(status: GuideReplyStatus): string {
  if (status === 'complete') return '';
  if (status === 'rate_limited') return 'Too many requests. Please wait before asking again.';
  if (status === 'cancelled') return 'Stopped. Any text shown is incomplete. Asking again starts a new request.';
  if (status === 'unavailable') return 'The guide is unavailable. This page has not resent your request.';
  return 'Reply interrupted. Any text shown is incomplete. Asking again starts a new request.';
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Reads this application's SSE protocol once. EOF is not a completion receipt,
// and neither malformed frames nor transport errors cause a new POST.
export async function readGuideReply(
  response: Response,
  options: { signal?: AbortSignal; onText?(text: string): void } = {},
): Promise<GuideReply> {
  let text = '';
  const result = (status: GuideReplyStatus): GuideReply => ({ status, text, actions: [] });
  if (options.signal?.aborted) { void response.body?.cancel().catch(() => {}); return result('cancelled'); }
  if (!response.ok || !response.body || !/^text\/event-stream(?:;|$)/i.test(response.headers.get('content-type') || '')) {
    void response.body?.cancel().catch(() => {});
    return result(response.status === 429 ? 'rate_limited' : 'unavailable');
  }
  const reader = response.body.getReader();
  const abort = () => { void reader.cancel().catch(() => {}); };
  options.signal?.addEventListener('abort', abort, { once: true });
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const display = createGuideTextStream();
  let buffer = '', data: string[] = [], bytes = 0;
  let actions: GuideActionResult[] = [];
  let terminal: GuideReply | null = null;
  const acceptLine = (line: string) => {
    if (line) {
      if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      return;
    }
    if (!data.length) return;
    const value: unknown = JSON.parse(data.join('\n')); data = [];
    if (!record(value) || 'error' in value) throw new Error('Incomplete guide stream');
    if ('delta' in value) {
      if (typeof value.delta !== 'string') throw new Error('Invalid guide text');
      text += display.push(value.delta);
      options.onText?.(text);
    }
    if (value.type === 'actions' && Array.isArray(value.results)) {
      actions = value.results.filter(record).map(row => ({
        ...(typeof row.success === 'boolean' ? { success: row.success } : {}),
        ...(typeof row.type === 'string' ? { type: row.type } : {}),
        ...(typeof row.message === 'string' ? { message: row.message } : {}),
      }));
    }
    if (value.done === true) {
      if (typeof value.response !== 'string') throw new Error('Missing final guide response');
      const finalDisplay = createGuideTextStream();
      text = value.silent === true ? '' : finalDisplay.push(value.response) + finalDisplay.finish();
      terminal = { status: 'complete', text, reward: value.reward, actions };
      options.onText?.(text);
    }
  };
  try {
    while (!terminal) {
      if (options.signal?.aborted) return result('cancelled');
      const next = await reader.read();
      if (options.signal?.aborted) return result('cancelled');
      bytes += next.value?.byteLength || 0;
      if (bytes > 256_000) throw new Error('Guide response exceeded the local bound');
      buffer += next.done ? decoder.decode() : decoder.decode(next.value, { stream: true });
      // SSE permits LF, CR and CRLF. Preserve a split CRLF until the next chunk.
      while (!terminal) {
        const index = buffer.search(/[\r\n]/);
        if (index < 0 || !next.done && buffer[index] === '\r' && index === buffer.length - 1) break;
        const width = buffer[index] === '\r' && buffer[index + 1] === '\n' ? 2 : 1;
        const line = buffer.slice(0, index); buffer = buffer.slice(index + width);
        acceptLine(line);
      }
      if (next.done && !terminal) return result('interrupted');
    }
    return terminal;
  } catch {
    return result(options.signal?.aborted ? 'cancelled' : 'interrupted');
  } finally {
    options.signal?.removeEventListener('abort', abort);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
