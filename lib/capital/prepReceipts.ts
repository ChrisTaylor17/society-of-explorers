export type CapitalPrepAction =
  | 'command_center_loaded'
  | 'outreach_lab_loaded'
  | 'approval_packet_prepared'
  | 'window_kit_prepared'
  | 'patron_brief_prepared'
  | 'scenario_planner_prepared'
  | 'weekly_review_prepared'
  | 'launch_room_prepared';

export type CapitalPrepReceipt = {
  action: CapitalPrepAction;
  generatedAt: string;
  mode: 'local_draft_only';
  externalActions: 'none';
  approvalRequiredBeforeExternalAction: true;
  allowedUse: string;
  blockedActions: string[];
  detail: string;
};

export type CapitalPrepReadiness = {
  mode: 'draft_for_approval';
  externalActions: 'none';
  approvalRequiredBeforeExternalAction: true;
  receiptRequiredForPrep: true;
  exactApprovalRequiredFor: string[];
  localOnlySurfaces: string[];
  boundary: string;
};

const blockedActions = [
  'send outreach',
  'schedule messages',
  'import contacts',
  'deploy or publish public changes',
  'create checkout sessions or take payments',
  'contact the landlord',
  'place window materials',
  'mutate Gmail, Slack, Drive, Sheets, Vercel, Supabase, Stripe, or other third-party systems',
];

export function buildCapitalPrepReadiness(): CapitalPrepReadiness {
  return {
    mode: 'draft_for_approval',
    externalActions: 'none',
    approvalRequiredBeforeExternalAction: true,
    receiptRequiredForPrep: true,
    exactApprovalRequiredFor: [
      'recipient or audience',
      'channel',
      'final copy',
      'send or publish window',
      'target external system',
    ],
    localOnlySurfaces: [
      '/capital',
      '/capital/launch-room',
      '/capital/outreach-lab',
      '/capital/approvals',
      '/capital/patron-brief',
      '/capital/scenarios',
      '/capital/weekly-review',
      '/capital/window-kit',
    ],
    boundary:
      'Capital prep can draft, label, rehearse, and review locally. It cannot send, import, publish, deploy, charge, contact, or place anything without exact approval.',
  };
}

export function buildCapitalPrepReceipt(params: {
  action: CapitalPrepAction;
  generatedAt: string;
  allowedUse: string;
  detail: string;
}): CapitalPrepReceipt {
  return {
    action: params.action,
    generatedAt: params.generatedAt,
    mode: 'local_draft_only',
    externalActions: 'none',
    approvalRequiredBeforeExternalAction: true,
    allowedUse: params.allowedUse,
    blockedActions,
    detail: params.detail,
  };
}
