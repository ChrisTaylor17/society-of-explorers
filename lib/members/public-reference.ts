// A public profile reference is a navigation hint supplied by a publication-
// filtered server projection. It never grants membership or proves publication.
const lowerUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function parsePublicProfileReference(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  return typeof value === 'string' && lowerUuid.test(value) ? value : undefined;
}
export function hasPublicProfileReference(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.hasOwn(value, 'publicProfileId') && (value as Record<string, unknown>).publicProfileId !== undefined &&
    parsePublicProfileReference((value as Record<string, unknown>).publicProfileId) !== undefined;
}
