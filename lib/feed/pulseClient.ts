// Client helper for /api/feed/pulse. The feed page used to wait forever on
// "LOADING..." if the first request stalled, and treated error bodies as data.
// This helper always settles: it times out, checks res.ok and the shape.

export const PULSE_TIMEOUT_MS = 10_000;

export type PulseResult<T> = { ok: true; data: T } | { ok: false; reason: 'http' | 'shape' | 'network' | 'timeout' };

export type PulseQuestion = { question_text: string; thinker_id: string; date: string };
export type PulsePayload = { todayQuestion: PulseQuestion | null };

export function parsePulseQuestion(value: unknown): PulseQuestion | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { question_text, thinker_id, date } = value as Record<string, unknown>;
  if (typeof question_text !== 'string' || !question_text.trim() || question_text.length > 1_000
    || typeof thinker_id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(thinker_id)
    || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return { question_text, thinker_id, date };
}

export function isPulsePayload(data: unknown): data is PulsePayload {
  if (!data || typeof data !== 'object' || Array.isArray(data) || 'error' in data || !('todayQuestion' in data)) return false;
  return data.todayQuestion === null || parsePulseQuestion(data.todayQuestion) !== null;
}

type FetchLike = (input: string, init?: { signal?: AbortSignal; cache?: RequestCache }) => Promise<{
  ok: boolean;
  json: () => Promise<unknown>;
}>;

export async function fetchPulse(
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
  timeoutMs: number = PULSE_TIMEOUT_MS,
): Promise<PulseResult<PulsePayload>> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const res = await fetchImpl('/api/feed/pulse', { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return { ok: false, reason: 'http' };
    const data = await res.json().catch(() => null);
    if (!isPulsePayload(data)) return { ok: false, reason: 'shape' };
    return { ok: true, data: { todayQuestion: parsePulseQuestion(data.todayQuestion) } };
  } catch {
    return { ok: false, reason: timedOut ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}
