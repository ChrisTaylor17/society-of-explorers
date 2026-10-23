// Canonical RFC 9562 UUID shape (versions 1-8, variant 10xx), lower or upper case.
// Postgres gen_random_uuid() produces v4 ids, which this accepts.
//
// History: several routes carried a copy of this pattern that was missing the
// fourth "-xxxx" group, so it could never match a real UUID and silently rejected
// every real id. Fixed 2026-10-24 for projects/pledges, book salons and salons.
// Rooms, live sessions, twiddle, merch and project invites still carry the old
// copy on purpose until their external-provider effects are reviewed
// (tests/growth/g7-uuid.test.ts lists them). Import from here instead of copying.
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}
