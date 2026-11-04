// Client helper for /api/feed/pulse. The feed page used to wait forever on
// "LOADING..." if the first request stalled, and treated error bodies as data.
// This helper always settles: it times out, checks res.ok and the shape.

export const PULSE_TIMEOUT_MS = 10_000;

export type PulseResult<T> = { ok: true; data: T } | { ok: false; reason: 'http' | 'shape' | 'network' | 'timeout' };

export function isPulsePayload(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if ('error' in d) return false;
  return Array.isArray(d.recentResponses) && typeof d.stats === 'object' && d.stats !== null;
}

type FetchLike = (input: string, init?: { signal?: AbortSignal; cache?: RequestCache }) => Promise<{
  ok: boolean;
  json: () => Promise<unknown>;
}>;

export async function fetchPulse<T>(
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
  timeoutMs: number = PULSE_TIMEOUT_MS,
): Promise<PulseResult<T>> {
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
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, reason: timedOut ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}
