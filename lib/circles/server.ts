// Server-side helpers for SoE Circles. Circles are book_cohorts rows with
// book_id = CIRCLE_BOOK_ID plus the circle_* columns from
// supabase/migrations/20261027_soe_circles.sql. Until that migration is applied the
// routes report { ready: false } and the UI shows an honest "opening soon" state.
import { createHash } from 'node:crypto';
import { CIRCLE_BOOK_ID } from './path';
import type { CircleRow } from './public-circle';
export { toPublicCircle, type CircleRow, type PublicCircle } from './public-circle';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export const CIRCLE_SELECT =
  'id,title,description,max_members,start_date,status,created_by,created_at,circle_format,circle_city,circle_region,circle_venue_name,circle_venue_type,circle_weekday,circle_time,circle_timezone,circle_hidden,circle_path_id,circle_reading_program';



let schemaCache: { ready: boolean; at: number } | null = null;

export function resetCircleSchemaCache() {
  schemaCache = null;
}

/** True once the circles migration has been applied. Cached per instance. */
export async function circlesSchemaReady(db: Db, now = Date.now()): Promise<boolean> {
  if (schemaCache && now - schemaCache.at < (schemaCache.ready ? 5 * 60_000 : 60_000)) return schemaCache.ready;
  let ready = false;
  try {
    const checks = await Promise.all([
      db.from('book_cohorts').select('id,circle_hidden,circle_weekday,circle_reading_program').limit(1),
      db.from('circle_rsvps').select('id').limit(1),
      db.from('circle_reports').select('id').limit(1),
      db.from('circle_private').select('cohort_id').limit(1),
    ]);
    ready = checks.every((r: { error?: unknown }) => !r?.error);
  } catch {
    ready = false;
  }
  schemaCache = { ready, at: now };
  return ready;
}

export function hashKey(value: string): string {
  return createHash('sha256').update(`soe-circles:${value}`).digest('hex').slice(0, 32);
}



/** Display names for host ids (display_name only; nothing else about members leaves the server). */
export async function hostNames(db: Db, ids: string[], strict = false): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const { data, count, error } = await db.from('members').select('id,display_name', strict ? { count: 'exact' } : undefined).in('id', unique);
  // Discovery searches host names, so a partial read must not be mistaken for
  // proof that no host matches. Missing/deleted host rows still use the normal
  // anonymous label; count describes returned matching rows, not requested ids.
  if (strict && (error || !Array.isArray(data) || typeof count !== 'number' || !Number.isSafeInteger(count)
    || count < 0 || count !== data.length || count > unique.length
    || data.some((member: unknown) => {
      if (!member || typeof member !== 'object') return true;
      const row = member as Record<string, unknown>;
      return typeof row.id !== 'string' || !unique.includes(row.id)
        || (row.display_name !== null && typeof row.display_name !== 'string');
    }) || new Set(data.map((member: { id: string }) => member.id)).size !== data.length)) {
    throw new Error('Failed to load circle hosts');
  }
  const out: Record<string, string> = {};
  for (const m of (data || []) as Array<{ id: string; display_name: string | null }>) {
    const name = (m.display_name || '').trim();
    out[m.id] = name && !name.includes('@') ? name.slice(0, 40) : 'An explorer';
  }
  return out;
}

export async function loadCircle(db: Db, id: string): Promise<CircleRow | null> {
  const { data, error } = await db.from('book_cohorts').select(CIRCLE_SELECT).eq('id', id).eq('book_id', CIRCLE_BOOK_ID).maybeSingle();
  if (error || !data || data.circle_hidden) return null;
  return data as CircleRow;
}
