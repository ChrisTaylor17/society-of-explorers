export type CreatorOpsAction = 'generate_drafts' | 'status_change' | 'performance_note';

export type CreatorOpsReceipt = {
  action: CreatorOpsAction;
  generatedAt: string;
  writeMode: 'local_metadata_only';
  externalActions: 'none';
  publishTriggered: false;
  approvalRequiredBeforePublishing: true;
  recordScope: string;
  itemCount: number;
  detail: string;
};

export type CreatorOpsReadiness = {
  mode: 'draft_only';
  externalActions: 'none';
  publishBlockedWithoutApproval: true;
  receiptRequiredForLocalMutations: true;
  approvalRequirement: string;
  allowedLocalActions: string[];
};

export function buildCreatorOpsReadiness(): CreatorOpsReadiness {
  return {
    mode: 'draft_only',
    externalActions: 'none',
    publishBlockedWithoutApproval: true,
    receiptRequiredForLocalMutations: true,
    approvalRequirement:
      'Publishing, sending, paid boosting, or third-party scheduling requires explicit approval for channel, final copy, and timing.',
    allowedLocalActions: [
      'Generate local draft scripts',
      'Update local script status metadata',
      'Save local performance notes',
      'Copy draft text for review',
    ],
  };
}

export function buildCreatorOpsReceipt(params: {
  action: CreatorOpsAction;
  generatedAt: string;
  recordScope: string;
  itemCount?: number;
  detail: string;
}): CreatorOpsReceipt {
  return {
    action: params.action,
    generatedAt: params.generatedAt,
    writeMode: 'local_metadata_only',
    externalActions: 'none',
    publishTriggered: false,
    approvalRequiredBeforePublishing: true,
    recordScope: params.recordScope,
    itemCount: params.itemCount ?? 1,
    detail: params.detail,
  };
}
