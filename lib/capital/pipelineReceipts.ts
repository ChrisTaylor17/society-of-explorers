export type CapitalPipelineReceiptAction = 'pipeline_loaded' | 'lead_created' | 'lead_updated';

export type CapitalPipelineReceipt = {
  action: CapitalPipelineReceiptAction;
  generatedAt: string;
  writeMode: 'private_redacted_pipeline_metadata';
  databaseWrite: boolean;
  redactionApplied: true;
  externalOutreachTriggered: false;
  paymentTriggered: false;
  contactImportTriggered: false;
  publicActionTriggered: false;
  approvalRequiredBeforeOutreach: true;
  recordScope: string;
  detail: string;
};

export function buildCapitalPipelineReceipt(params: {
  action: CapitalPipelineReceiptAction;
  databaseWrite: boolean;
  recordScope: string;
  detail: string;
  generatedAt?: string;
}): CapitalPipelineReceipt {
  return {
    action: params.action,
    generatedAt: params.generatedAt || new Date().toISOString(),
    writeMode: 'private_redacted_pipeline_metadata',
    databaseWrite: params.databaseWrite,
    redactionApplied: true,
    externalOutreachTriggered: false,
    paymentTriggered: false,
    contactImportTriggered: false,
    publicActionTriggered: false,
    approvalRequiredBeforeOutreach: true,
    recordScope: params.recordScope,
    detail: params.detail,
  };
}
