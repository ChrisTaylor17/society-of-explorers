import { CAPITAL_CAMPAIGN_GOAL_DOLLARS, CAPITAL_USE_OF_FUNDS } from '@/lib/capital/campaign';
import { buildCapitalReadiness, type CapitalReadiness, type ReadinessStatus } from '@/lib/capital/launchReadiness';
import {
  buildCapitalPrepReadiness,
  buildCapitalPrepReceipt,
  type CapitalPrepReadiness,
  type CapitalPrepReceipt,
} from '@/lib/capital/prepReceipts';
import { buildWindowKit } from '@/lib/capital/windowKit';

export type LaunchRoomStatus = 'ready_for_dry_run' | 'needs_setup' | 'needs_approval' | 'blocked';

export type LaunchRoomGate = {
  id: string;
  label: string;
  status: ReadinessStatus;
  detail: string;
  nextAction: string;
};

export type LaunchRoomCommand = {
  label: string;
  command: string;
  purpose: string;
};

export type LaunchRoomApproval = {
  label: string;
  status: 'not_requested' | 'needed' | 'ready_to_review';
  detail: string;
  reference?: string;
  command?: string;
};

export type LaunchRoomDay = {
  day: string;
  focus: string;
  actions: string[];
};

export type CapitalLaunchRoom = {
  generatedAt: string;
  status: LaunchRoomStatus;
  statusLabel: string;
  summary: string;
  campaign: {
    name: string;
    goal: number;
    firstUseOfFunds: string;
    externalActionBoundary: string;
  };
  prepReadiness: CapitalPrepReadiness;
  prepReceipt: CapitalPrepReceipt;
  readiness: CapitalReadiness;
  gates: LaunchRoomGate[];
  dryRunCommands: LaunchRoomCommand[];
  approvals: LaunchRoomApproval[];
  sevenDayLoop: LaunchRoomDay[];
  windowKit: ReturnType<typeof buildWindowKit>;
  safeNextMoves: string[];
  avoidForNow: string[];
};

export function buildCapitalLaunchRoom(input: {
  pledgeLedgerAvailable?: boolean;
  pipelineAvailable?: boolean;
} = {}): CapitalLaunchRoom {
  const generatedAt = new Date().toISOString();
  const readiness = buildCapitalReadiness({
    pledgeLedgerAvailable: Boolean(input.pledgeLedgerAvailable),
  });
  const prepReadiness = buildCapitalPrepReadiness();
  const windowKit = buildWindowKit();
  const gates = buildGates(readiness, Boolean(input.pipelineAvailable));
  const status = resolveLaunchRoomStatus(readiness, gates);

  return {
    generatedAt,
    status,
    statusLabel: status.replace(/_/g, ' ').toUpperCase(),
    summary: summaryForStatus(status),
    campaign: {
      name: '92B Founding Node',
      goal: CAPITAL_CAMPAIGN_GOAL_DOLLARS,
      firstUseOfFunds:
        'Securing, restoring, and building out the Boston physical node only if lease status, repairs, access, and landlord alignment make that responsible.',
      externalActionBoundary:
        'No deployment, public launch, landlord contact, outreach, payment collection, printing, or physical placement without explicit approval.',
    },
    prepReadiness,
    prepReceipt: buildCapitalPrepReceipt({
      action: 'launch_room_prepared',
      generatedAt,
      allowedUse:
        'Review local gates, dry-run commands, approval packets, and seven-day launch sequencing before exact external approvals.',
      detail:
        'Prepared the private Launch Room locally. No deploy, public launch, payment collection, checkout session, webhook replay, migration, outreach, landlord contact, printing, physical placement, connected-tool mutation, or public claim occurred.',
    }),
    readiness,
    gates,
    dryRunCommands: buildDryRunCommands(),
    approvals: buildApprovals(readiness),
    sevenDayLoop: buildSevenDayLoop(),
    windowKit,
    safeNextMoves: [
      'Review the Launch Room and Window Kit copy in the local app.',
      'Run the dry-run command list locally after any capital-system edit.',
      'Resolve required environment gaps before Stripe checkout tests.',
      'Approve exact migration, deployment, window, and outreach actions separately.',
      'Keep every public sentence conditional until the lease/buildout path is verified.',
    ],
    avoidForNow: [
      'Do not contact the landlord yet.',
      'Do not place or print the window sign yet.',
      'Do not send warm outreach yet.',
      'Do not represent the location as secured, repaired, permitted, open, or guaranteed.',
      'Do not use equity, debt, investor, securities, dividends, or financial-return framing.',
    ],
  };
}

function buildGates(readiness: CapitalReadiness, pipelineAvailable: boolean): LaunchRoomGate[] {
  const requiredEnvMissing = readiness.summary.requiredEnvMissing;
  const missingFiles = readiness.summary.filesMissing;
  const copyWarnings = readiness.summary.copyWarnings;
  const paymentWarnings = readiness.summary.paymentWarnings;

  return [
    {
      id: 'local-assets',
      label: 'Local launch assets',
      status: missingFiles === 0 ? 'ready' : 'blocked',
      detail:
        missingFiles === 0
          ? 'Runbook, window kit, QR asset, capital pages, and migrations are present locally.'
          : `${missingFiles} required local asset${missingFiles === 1 ? '' : 's'} missing.`,
      nextAction: missingFiles === 0 ? 'Keep assets draft-only until approval.' : 'Restore missing local launch assets before review.',
    },
    {
      id: 'environment',
      label: 'Environment readiness',
      status: requiredEnvMissing === 0 ? 'ready' : 'blocked',
      detail:
        requiredEnvMissing === 0
          ? 'Required environment variables are present in this environment.'
          : `${requiredEnvMissing} required environment variable${requiredEnvMissing === 1 ? '' : 's'} missing.`,
      nextAction: requiredEnvMissing === 0 ? 'Proceed to local dry run.' : 'Set missing required env vars before payment tests.',
    },
    {
      id: 'payment-safety',
      label: 'Stripe and pledge safety',
      status: readiness.paymentSafety.canRunStripeTests ? 'ready' : 'manual',
      detail:
        paymentWarnings === 0
          ? 'Stripe test mode, webhook secret, and tier price ids are configured.'
          : `${paymentWarnings} payment warning${paymentWarnings === 1 ? '' : 's'} need review.`,
      nextAction: readiness.paymentSafety.canRunStripeTests
        ? 'Run Stripe checkout and webhook replay tests.'
        : 'Resolve warnings before accepting public pledge traffic.',
    },
    {
      id: 'copy-risk',
      label: 'Public copy risk',
      status: copyWarnings === 0 ? 'ready' : 'needs_approval',
      detail:
        copyWarnings === 0
          ? 'Copy scan found no unreviewed risky launch terms.'
          : `${copyWarnings} copy finding${copyWarnings === 1 ? '' : 's'} should be reviewed before public launch.`,
      nextAction: copyWarnings === 0 ? 'Preserve conditional language.' : 'Rewrite or approve each finding explicitly.',
    },
    {
      id: 'pledge-ledger',
      label: 'Durable pledge ledger',
      status: inputAwareStatus(Boolean(readiness.files.find((file) => file.id === 'migration')?.present)),
      detail: 'The migration file exists locally; production application still needs explicit approval.',
      nextAction: 'Apply migration only after approval, then verify pledge_events is reachable.',
    },
    {
      id: 'pipeline',
      label: 'Capital pipeline',
      status: pipelineAvailable ? 'ready' : 'blocked',
      detail: pipelineAvailable
        ? 'Private capital pipeline is reachable.'
        : 'Capital pipeline table is not reachable in this environment.',
      nextAction: pipelineAvailable
        ? 'Use redacted labels only until an outreach batch is approved.'
        : 'Apply pipeline migration only after approval.',
    },
    {
      id: 'window-approval',
      label: 'Window activation approval',
      status: 'needs_approval',
      detail: 'The QR asset and window copy are ready for review but not approved for physical use.',
      nextAction: 'Approve exact sign copy and placement before printing or putting anything in the storefront.',
    },
    {
      id: 'external-boundary',
      label: 'External action boundary',
      status: 'blocked',
      detail: 'Landlord contact, public claims, publishing, sending, printing, and payment collection remain explicit approval events.',
      nextAction: 'Use the Launch Room to prepare, not execute, external actions.',
    },
  ];
}

function inputAwareStatus(condition: boolean): ReadinessStatus {
  return condition ? 'manual' : 'blocked';
}

function resolveLaunchRoomStatus(readiness: CapitalReadiness, gates: LaunchRoomGate[]): LaunchRoomStatus {
  if (readiness.summary.filesMissing > 0 || readiness.summary.requiredEnvMissing > 0) return 'needs_setup';
  if (gates.some((gate) => gate.status === 'blocked' && gate.id !== 'external-boundary')) return 'blocked';
  if (readiness.summary.paymentWarnings > 0 || readiness.summary.copyWarnings > 0) return 'needs_setup';
  return 'ready_for_dry_run';
}

function summaryForStatus(status: LaunchRoomStatus): string {
  switch (status) {
    case 'ready_for_dry_run':
      return 'Local assets and core configuration are ready for dry-run verification. External actions still require explicit approval.';
    case 'needs_setup':
      return 'The launch package is assembled, but setup gaps must be resolved before payment tests or public traffic.';
    case 'blocked':
      return 'One or more operating systems are not reachable yet. Keep this in preparation mode.';
    default:
      return 'Approvals are the next constraint. The campaign should not move outside the local workspace yet.';
  }
}

function buildDryRunCommands(): LaunchRoomCommand[] {
  return [
    {
      label: 'Local capital preflight audit',
      command: 'npm run capital:preflight -- --routes --supabase-read --stripe-read',
      purpose: 'Run the launch gate audit against the local/dev environment plus read-only Supabase and Stripe checks.',
    },
    {
      label: 'Production env readiness audit',
      command: 'npm run capital:preflight -- --production-env --supabase-read --stripe-read --soft',
      purpose: 'Inspect production env configuration read-only without creating checkout sessions, replaying webhooks, deploying, or sending traffic.',
    },
    {
      label: 'Preflight contract smoke guard',
      command: 'npm run capital:preflight:smoke',
      purpose: 'Verify the local/prod env split, network timeouts, and Launch Room/runbook command alignment have not drifted.',
    },
    {
      label: 'Operator smoke suite',
      command: 'npm run operator:smoke',
      purpose: 'Run the non-network privacy, AI, memory, voice, creator, metadata, and capital contract guards in one pass.',
    },
    {
      label: 'Capital admin response-shape guard',
      command: 'npm run capital:admin-shape:smoke',
      purpose: 'Verify private capital admin responses stay aggregate/redacted and do not expose contact, wallet, Stripe, or raw-note fields.',
    },
    {
      label: 'Capital redaction guard',
      command: 'npm run capital:redaction:smoke',
      purpose: 'Verify capital pipeline free-text fields mask emails, phones, wallets, and Stripe ids before storage.',
    },
    {
      label: 'Approval checklist smoke guard',
      command: 'npm run capital:approvals:smoke',
      purpose: 'Verify the private approvals page stays admin-gated, local-state-only, and unable to execute external actions.',
    },
    {
      label: 'Patron brief smoke guard',
      command: 'npm run capital:patron-brief:smoke',
      purpose: 'Verify the private patron call guide stays admin-gated, draft-only, and free of investment-return claims.',
    },
    {
      label: 'Scenario planner smoke guard',
      command: 'npm run capital:scenarios:smoke',
      purpose: 'Verify the private capital scenario planner stays admin-gated, planning-only, and tied to real 92B tier math.',
    },
    {
      label: 'Outreach Lab smoke guard',
      command: 'npm run capital:outreach-lab:smoke',
      purpose: 'Verify the private outreach prep surface stays admin-gated, local-only, and unable to send or import contacts.',
    },
    {
      label: 'Weekly review smoke guard',
      command: 'npm run capital:weekly-review:smoke',
      purpose: 'Verify the private weekly review stays admin-gated, browser-local, and unable to execute external actions.',
    },
    {
      label: 'Capital route smoke guard',
      command: 'npm run capital:routes:smoke',
      purpose: 'Verify local capital pages return 200 and unauthenticated admin APIs return 401.',
    },
    {
      label: 'Capital privacy smoke guard',
      command: 'npm run capital:privacy:smoke',
      purpose: 'Verify capital admin and pipeline code avoid contact/payment identifiers and remain draft-only.',
    },
    {
      label: 'Capital private page reliability guard',
      command: 'npm run capital:private-pages:smoke',
      purpose: 'Verify private capital pages use admin routes, signed-in tokens, no-store fetches, fail-closed loading, and no-store API responses.',
    },
    {
      label: 'Capital metadata smoke guard',
      command: 'npm run capital:metadata:smoke',
      purpose: 'Verify Stripe checkout metadata stays classification-only and excludes contact, wallet, notes, and payment identifiers.',
    },
    {
      label: 'AI provider status smoke guard',
      command: 'npm run ai:status:smoke',
      purpose: 'Verify private AI status surfaces stay admin-gated, read-only, and do not expose secret values.',
    },
    {
      label: 'Capital lint pass',
      command:
        'npx eslint app/92b/fund/page.tsx app/capital/page.tsx app/capital/window-kit/page.tsx app/api/admin/capital/route.ts app/api/admin/capital/window-kit/route.ts lib/capital/*.ts',
      purpose: 'Catch route, typing, and lint regressions in the capital system.',
    },
    {
      label: 'Full production build',
      command: 'npm run build',
      purpose: 'Verify the Next.js app compiles and route generation is healthy.',
    },
    {
      label: 'Copy risk scan',
      command:
        'rg "profit|dividend|equity|security|securities|secured lease|guaranteed|investment return|investor" app/92b app/projects docs/92b-*.md',
      purpose: 'Find risky campaign language that must remain disclaimer-only.',
    },
    {
      label: 'Unauthenticated admin boundary',
      command: 'curl -sS http://localhost:3000/api/admin/capital/window-kit',
      purpose: 'Confirm shell requests without browser session cookies return Unauthorized.',
    },
    {
      label: 'QR asset check',
      command: 'test -s public/images/92b-window-qr.svg && echo qr-ok',
      purpose: 'Confirm the window QR asset exists before any design review.',
    },
  ];
}

function buildApprovals(readiness: CapitalReadiness): LaunchRoomApproval[] {
  const oraclePriceConfigured = Boolean(readiness.env.find((item) => item.id === 'stripe-price-oracle')?.present);
  const stripeKeyMode = readiness.paymentSafety.stripeSecretMode;

  return [
    {
      label: 'Set Oracle Stripe price',
      status: oraclePriceConfigured ? 'ready_to_review' : 'needed',
      detail: oraclePriceConfigured
        ? 'Oracle price id is configured; confirm it maps to the intended $499 one-time Oracle membership before checkout tests.'
        : 'Oracle checkout is intentionally blocked until STRIPE_PRICE_ORACLE is set explicitly.',
      reference: '/Users/christaylor/society-of-explorers/docs/92b-stripe-approval-packet.md',
      command: 'npm run capital:preflight -- --production-env --supabase-read --stripe-read --soft',
    },
    {
      label: 'Use test-mode Stripe credentials',
      status: stripeKeyMode === 'test' ? 'ready_to_review' : 'needed',
      detail: stripeKeyMode === 'test'
        ? 'Stripe key is test-mode; checkout and webhook replay tests can proceed after Oracle price approval.'
        : `Current Stripe key mode is ${stripeKeyMode}; do not create local checkout sessions or replay webhooks with this key.`,
      reference: '/Users/christaylor/society-of-explorers/docs/92b-stripe-approval-packet.md',
    },
    {
      label: 'Apply Supabase migrations',
      status: readiness.files.find((file) => file.id === 'migration')?.present ? 'ready_to_review' : 'needed',
      detail: 'Capital patronage and pipeline migrations must be separately approved before production use.',
    },
    {
      label: 'Run Stripe checkout and webhook replay',
      status: readiness.paymentSafety.canRunStripeTests ? 'ready_to_review' : 'needed',
      detail: 'Test-mode Stripe flows should be approved before any public pledge traffic.',
    },
    {
      label: 'Deploy campaign changes',
      status: 'needed',
      detail: 'Deployment is an external action and should happen only after build, copy, and payment gates are clean.',
    },
    {
      label: 'Place the 92B window sign',
      status: readiness.files.find((file) => file.id === 'window-qr')?.present ? 'ready_to_review' : 'needed',
      detail: 'Window placement requires exact sign-copy approval and a decision on landlord sequencing.',
    },
    {
      label: 'Contact landlord',
      status: 'not_requested',
      detail: 'No landlord contact until campaign, pledge tracking, and a conversation brief are approved.',
    },
    {
      label: 'Send warm outreach',
      status: 'not_requested',
      detail: 'No outreach until recipient batch, channel, and exact message text are approved.',
    },
  ];
}

function buildSevenDayLoop(): LaunchRoomDay[] {
  return [
    {
      day: 'Day 1',
      focus: 'Final copy and local gates',
      actions: ['Review /92b/fund, /capital, /capital/window-kit, and /capital/launch-room.', 'Resolve copy risk findings.', 'Confirm exact approval boundaries.'],
    },
    {
      day: 'Day 2',
      focus: 'Database and Stripe test readiness',
      actions: ['Approve migrations if ready.', 'Run test checkout matrix.', 'Replay webhooks and verify duplicate handling.'],
    },
    {
      day: 'Day 3',
      focus: 'Deployment smoke test',
      actions: ['Deploy only after approval.', 'Check mobile campaign page.', 'Confirm admin privacy and pledge progress.'],
    },
    {
      day: 'Day 4',
      focus: 'Window package decision',
      actions: ['Review QR destination and print proof.', 'Decide landlord-before-window sequencing.', 'Approve or defer physical placement.'],
    },
    {
      day: 'Day 5',
      focus: 'Warm outreach batch',
      actions: ['Prepare five redacted leads.', 'Approve exact messages.', 'Send only approved outreach manually or through an approved tool.'],
    },
    {
      day: 'Day 6',
      focus: 'Objection and story review',
      actions: ['Track replies, objections, and pledge intent.', 'Identify the strongest human story.', 'Refine public update draft.'],
    },
    {
      day: 'Day 7',
      focus: 'Go wider or tighten',
      actions: ['Review collected and committed funds.', 'Decide next audience segment.', 'Decide whether to widen outreach, place window sign, or revise offer.'],
    },
  ];
}

export function launchRoomUseOfFundsSummary(): string {
  return CAPITAL_USE_OF_FUNDS.map((item) => `${item.label}: $${item.amount.toLocaleString()}`).join('; ');
}
