// Canonical RFC 9562 UUID shape (versions 1-8, variant 10xx), lower or upper case.
// Postgres gen_random_uuid() produces v4 ids, which this accepts.
//
// History: several routes carried a copy of this pattern that was missing the
// fourth "-xxxx" group, so it could never match a real UUID and silently rejected
// every real id. Fixed 2026-10-24 for projects/pledges, book salons and salons.
// Remaining route copies were reviewed and repaired on 2026-11-11. Provider,
// authorization and paused-feature gates remain; legacy generic room mutations
// stay unavailable pending atomic authority checks. Live Council uses its own
// boundary. Import from here instead of copying a route-local pattern.
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}
