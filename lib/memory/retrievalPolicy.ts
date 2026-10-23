export type MemoryRetrievalRow = {
  valid_until?: string | null;
  suppressed_at?: string | null;
  status?: string | null;
  state?: string | null;
  consent_state?: string | null;
};

const EXCLUDED_MEMORY_STATES = new Set([
  'corrected',
  'retracted',
  'do_not_use',
  'suppressed',
  'deleted',
  'forgotten',
  'expired',
]);

export function canUseMemoryInAI(row: MemoryRetrievalRow | null | undefined): boolean {
  if (!row) return false;
  if (hasExpired(row.valid_until)) return false;
  if (row.suppressed_at) return false;

  const state = String(row.status || row.state || row.consent_state || 'active').trim().toLowerCase();
  return !EXCLUDED_MEMORY_STATES.has(state);
}

export function filterUsableMemoryRows<T extends MemoryRetrievalRow>(rows: T[] | null | undefined): T[] {
  return (rows || []).filter(canUseMemoryInAI);
}

function hasExpired(value: string | null | undefined): boolean {
  if (!value) return false;

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return true;
  return timestamp <= Date.now();
}
