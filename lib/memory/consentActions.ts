export const MEMORY_CONSENT_STATE_COLUMNS_ENV = 'MEMORY_CONSENT_STATE_COLUMNS_ENABLED';

export type MemoryConsentAction = 'forget' | 'correct' | 'retract' | 'do_not_use';
export type MemoryConsentState = 'active' | 'corrected' | 'retracted' | 'do_not_use' | 'expired';
export type MemoryConsentWriteMode = 'legacy_valid_until' | 'explicit_state_columns' | 'legacy_schema_fallback';

export type MemoryWritePayload = Record<string, string | number | null>;

export type MemoryConsentReceipt = {
  action: MemoryConsentAction;
  writeMode: MemoryConsentWriteMode;
  activeRecallRemoved: boolean;
  explicitStateRecorded: boolean;
  retrievalEffect: string;
  memberReviewedAt: string;
  replacementFactId?: string | null;
  noteStored: boolean;
};

export type MemoryConsentReadiness = {
  stateColumnsEnabled: boolean;
  writeMode: MemoryConsentWriteMode;
  featureFlag: string;
  activeReadFilter: string;
  migrationReadFilter: string;
  exportScope: string;
};

const CONSENT_STATE_COLUMN_NAMES = [
  'status',
  'replacement_fact_id',
  'correction_note',
  'suppressed_at',
  'suppressed_reason',
  'last_member_reviewed_at',
];

function stateForAction(action: MemoryConsentAction): MemoryConsentState {
  switch (action) {
    case 'correct':
      return 'corrected';
    case 'retract':
      return 'retracted';
    case 'do_not_use':
      return 'do_not_use';
    default:
      return 'expired';
  }
}

function reasonForAction(action: MemoryConsentAction): string {
  switch (action) {
    case 'correct':
      return 'corrected_by_member';
    case 'retract':
      return 'retracted_by_member';
    case 'do_not_use':
      return 'do_not_use_by_member';
    default:
      return 'forgotten_by_member';
  }
}

export function memoryConsentStateColumnsEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env[MEMORY_CONSENT_STATE_COLUMNS_ENV] === 'true';
}

export function buildMemoryConsentReadiness(
  env: Record<string, string | undefined> = process.env,
): MemoryConsentReadiness {
  const stateColumnsEnabled = memoryConsentStateColumnsEnabled(env);
  return {
    stateColumnsEnabled,
    writeMode: stateColumnsEnabled ? 'explicit_state_columns' : 'legacy_valid_until',
    featureFlag: MEMORY_CONSENT_STATE_COLUMNS_ENV,
    activeReadFilter: 'valid_until is null',
    migrationReadFilter: 'valid_until is null + status is active + suppressed_at is null',
    exportScope: 'active semantic memory counts only',
  };
}

function retrievalEffectForAction(action: MemoryConsentAction): string {
  switch (action) {
    case 'correct':
      return 'Old memory removed from active recall; replacement memory becomes active.';
    case 'retract':
      return 'Memory removed from active recall and excluded from AI context.';
    case 'do_not_use':
      return 'Memory excluded from active AI use.';
    default:
      return 'Memory removed from active recall.';
  }
}

export function buildMemoryConsentReceipt(params: {
  action: MemoryConsentAction;
  now: string;
  includeStateColumns?: boolean;
  usedSchemaFallback?: boolean;
  replacementFactId?: string | null;
  note?: string | null;
}): MemoryConsentReceipt {
  const explicitStateRecorded = Boolean(params.includeStateColumns && !params.usedSchemaFallback);
  const writeMode: MemoryConsentWriteMode = explicitStateRecorded
    ? 'explicit_state_columns'
    : params.usedSchemaFallback
      ? 'legacy_schema_fallback'
      : 'legacy_valid_until';

  return {
    action: params.action,
    writeMode,
    activeRecallRemoved: true,
    explicitStateRecorded,
    retrievalEffect: retrievalEffectForAction(params.action),
    memberReviewedAt: params.now,
    replacementFactId: params.replacementFactId || null,
    noteStored: Boolean(params.note && explicitStateRecorded),
  };
}

export function buildMemoryFactExpirationPayload(params: {
  action: MemoryConsentAction;
  now: string;
  includeStateColumns?: boolean;
  note?: string | null;
  replacementFactId?: string | null;
}): MemoryWritePayload {
  const payload: MemoryWritePayload = {
    valid_until: params.now,
    updated_at: params.now,
  };

  if (!params.includeStateColumns) return payload;

  payload.status = stateForAction(params.action);
  payload.suppressed_at = params.now;
  payload.suppressed_reason = params.note || reasonForAction(params.action);
  payload.correction_note = params.note || null;
  payload.last_member_reviewed_at = params.now;

  if (params.action === 'correct' && params.replacementFactId) {
    payload.replacement_fact_id = params.replacementFactId;
  }

  return payload;
}

export function buildMemoryReplacementInsertPayload(params: {
  memberId: string;
  category: string;
  key: string;
  value: string;
  confidence: number;
  version: number;
  now: string;
  includeStateColumns?: boolean;
}): MemoryWritePayload {
  const payload: MemoryWritePayload = {
    member_id: params.memberId,
    category: params.category,
    key: params.key,
    value: params.value,
    confidence: params.confidence,
    version: params.version,
  };

  if (!params.includeStateColumns) return payload;

  payload.status = 'active';
  payload.suppressed_at = null;
  payload.suppressed_reason = null;
  payload.correction_note = null;
  payload.last_member_reviewed_at = params.now;

  return payload;
}

export function memoryConsentStateSchemaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const parts = ['message', 'details', 'hint', 'code']
    .map((key) => {
      const value = (error as Record<string, unknown>)[key];
      return typeof value === 'string' ? value : '';
    })
    .join(' ')
    .toLowerCase();

  const mentionsConsentColumn = CONSENT_STATE_COLUMN_NAMES.some((column) => parts.includes(column));
  const looksLikeSchemaMiss =
    parts.includes('column') ||
    parts.includes('schema cache') ||
    parts.includes('does not exist') ||
    parts.includes('could not find') ||
    parts.includes('pgrst204');

  return mentionsConsentColumn && looksLikeSchemaMiss;
}
