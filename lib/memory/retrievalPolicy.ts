export type MemoryRetrievalRow = {
  valid_until?: string | null;
  suppressed_at?: string | null;
  status?: string | null;
  state?: string | null;
  consent_state?: string | null;
};

export function canUseMemoryInAI(row: MemoryRetrievalRow | null | undefined): boolean {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
  if (hasExpired(row.valid_until)) return false;
  if (row.suppressed_at) return false;

  // Keep legacy rows without state columns compatible. Any explicit state must
  // permit recall; one active field cannot override another field's exclusion.
  return [row.status, row.state, row.consent_state].every(state =>
    state == null || (typeof state === 'string' && state.trim().toLowerCase() === 'active')
  );
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
