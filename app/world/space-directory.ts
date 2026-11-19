export type Space = {
  id: string; name: string; description: string | null; city: string | null;
  country: string | null; space_type: string; total_scans: number; avg_quality: number;
};
export type SpaceDirectory = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; spaces: Space[] };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, limit: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
const optional = (value: unknown, limit: number): value is string | null => value === null || text(value, limit);

export function parseSpaces(value: unknown): Space[] {
  if (!object(value) || 'error' in value || !Array.isArray(value.spaces) || value.spaces.length > 1000) throw Error('Invalid spaces response');
  const ids = new Set<string>();
  return value.spaces.map((row: unknown) => {
    if (!object(row) || !text(row.id, 128) || ids.has(row.id) || !text(row.name, 120)
      || !optional(row.description, 1000) || !optional(row.city, 160) || !optional(row.country, 160)
      || !text(row.space_type, 40) || !Number.isSafeInteger(row.total_scans) || Number(row.total_scans) < 0
      || typeof row.avg_quality !== 'number' || !Number.isFinite(row.avg_quality) || row.avg_quality < 0 || row.avg_quality > 100) throw Error('Invalid space');
    ids.add(row.id);
    return { id: row.id, name: row.name, description: row.description, city: row.city, country: row.country,
      space_type: row.space_type, total_scans: row.total_scans as number, avg_quality: row.avg_quality };
  });
}

type Clock = { set: (callback: () => void, delay: number) => unknown; clear: (timer: unknown) => void };

/** A public read with a deadline covering both response and body; disposal retires late replies. */
export function startSpaceDirectory(emit: (state: SpaceDirectory) => void, fetcher: typeof fetch = fetch, clock: Clock = {
  set: (callback, delay) => setTimeout(callback, delay), clear: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
}) {
  const controller = new AbortController();
  let active = true;
  const timer = clock.set(() => { if (active) { active = false; controller.abort(); emit({ kind: 'error' }); } }, 10_000);
  const finish = (state: SpaceDirectory) => {
    if (!active) return;
    active = false; clock.clear(timer); emit(state);
  };
  void (async () => {
    try {
      const response = await fetcher('/api/world/spaces', { credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal });
      if (!response.ok) throw Error('Unable to load spaces');
      const spaces = parseSpaces(await response.json());
      finish({ kind: 'ready', spaces });
    } catch { finish({ kind: 'error' }); }
  })();
  return () => { active = false; clock.clear(timer); controller.abort(); };
}
