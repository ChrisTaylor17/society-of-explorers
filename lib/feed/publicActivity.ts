import { isUuid } from '@/lib/ids/uuid';

export const PUBLIC_ACTIVITY_SCHEMA = 'soe-public-activity-v1';
// Read the reviewed copy only. Raw titles, descriptions, identities and metadata
// are not public projections, even when an old default set is_public=true.
export const PUBLIC_ACTIVITY_SELECT = 'id,community_id,is_public,created_at,public_feed:metadata->public_feed';
export type PublicActivity = { id: string; event_type: string; title: string; description: string | null; created_at: string };
export type PublicActivityPublication = { version: 1; reviewed_at: string; event_type: string; title: string; description: string | null };
const record = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max
  && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v);

export function activityTimestamp(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(v)) return false;
  const day = v.slice(0, 10);
  return day.slice(0, 4) !== '0000' && Number.isFinite(Date.parse(v))
    && new Date(day).toISOString().slice(0, 10) === day;
}

export function parsePublicActivityPublication(value: unknown): PublicActivityPublication | null {
  if (!record(value) || Object.keys(value).sort().join(',') !== 'description,event_type,reviewed_at,title,version'
    || value.version !== 1 || !activityTimestamp(value.reviewed_at)
    || typeof value.event_type !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(value.event_type)
    || !text(value.title, 200) || value.description !== null && !text(value.description, 1000)) return null;
  return { version: 1, reviewed_at: value.reviewed_at, event_type: value.event_type,
    title: value.title, description: value.description as string | null };
}

export function projectPublicActivity(value: unknown, communityId?: string): PublicActivity | null {
  if (!record(value) || !isUuid(value.id) || !isUuid(value.community_id) || value.is_public !== true
    || communityId !== undefined && value.community_id !== communityId || !activityTimestamp(value.created_at)) return null;
  const published = parsePublicActivityPublication(value.public_feed);
  if (!published) return null;
  return { id: value.id, event_type: published.event_type, title: published.title,
    description: published.description, created_at: value.created_at };
}

export function parsePublicActivityReply(value: unknown): PublicActivity[] | null {
  if (!record(value) || Object.keys(value).sort().join(',') !== 'events,schema'
    || value.schema !== PUBLIC_ACTIVITY_SCHEMA || !Array.isArray(value.events) || value.events.length > 100) return null;
  const events: PublicActivity[] = [], seen = new Set<string>();
  for (const row of value.events) {
    if (!record(row) || Object.keys(row).sort().join(',') !== 'created_at,description,event_type,id,title'
      || !isUuid(row.id) || seen.has(row.id) || !activityTimestamp(row.created_at)
      || typeof row.event_type !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(row.event_type)
      || !text(row.title, 200) || row.description !== null && !text(row.description, 1000)) return null;
    seen.add(row.id);
    events.push({ id: row.id, event_type: row.event_type, title: row.title,
      description: row.description as string | null, created_at: row.created_at });
  }
  return events;
}

export function parseActivityQuery(params: URLSearchParams): { community: string; limit: number; before: string | null } | null {
  if (Array.from(params.keys()).some(key => !['community', 'limit', 'before'].includes(key) || params.getAll(key).length !== 1)) return null;
  const community = params.get('community') ?? 'society-of-explorers';
  const rawLimit = params.get('limit') ?? '30', before = params.get('before');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(community) || community.length > 80
    || !/^[1-9]\d{0,2}$/.test(rawLimit) || Number(rawLimit) > 100 || before !== null && !activityTimestamp(before)) return null;
  return { community, limit: Number(rawLimit), before };
}
