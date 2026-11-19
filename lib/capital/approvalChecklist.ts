import { buildCapitalReadiness, type CapitalReadiness, type ReadinessStatus } from '@/lib/capital/launchReadiness';
import {
  buildCapitalPrepReadiness,
  buildCapitalPrepReceipt,
  type CapitalPrepReadiness,
  type CapitalPrepReceipt,
} from '@/lib/capital/prepReceipts';

export type CapitalApprovalStatus = ReadinessStatus | 'already_available';

export type CapitalApprovalItem = {
  id: string;
  group: 'environment' | 'database' | 'stripe' | 'deploy' | 'physical' | 'outreach' | 'publishing' | 'tools';
  label: string;
  externalAction: string;
  status: CapitalApprovalStatus;
  statusDetail: string;
  exactApprovalText: string;
  prerequisites: string[];
  verification: string[];
  allowedPrep: string[];
  stopRule: string;
  source: string;
};

export type CapitalApprovalChecklist = {
  generatedAt: string;
  storageKey: string;
  boundary: string;
  localStateWarning: string;
  readiness: {
    overallStatus: ReadinessStatus;
    requiredEnvMissing: number;
    paymentWarnings: number;
    copyWarnings: number;
    blockers: string[];
  };
  prepReadiness: CapitalPrepReadiness;
  prepReceipt: CapitalPrepReceipt;
  summary: {
    total: number;
    blocked: number;
    needsApproval: number;
    ready: number;
    alreadyAvailable: number;
  };
  items: CapitalApprovalItem[];
};

function itemStatus(status: CapitalApprovalStatus, detail: string): Pick<CapitalApprovalItem, 'status' | 'statusDetail'> {
  return { status, statusDetail: detail };
}

function summarize(items: CapitalApprovalItem[]): CapitalApprovalChecklist['summary'] {
  return {
    total: items.length,
    blocked: items.filter((item) => item.status === 'blocked').length,
    needsApproval: items.filter((item) => item.status === 'needs_approval' || item.status === 'manual').length,
    ready: items.filter((item) => item.status === 'ready').length,
    alreadyAvailable: items.filter((item) => item.status === 'already_available').length,
  };
}

export function buildCapitalApprovalChecklist(input: {
  pledgeLedgerAvailable?: boolean;
  pipelineAvailable?: boolean;
  readiness?: CapitalReadiness;
} = {}): CapitalApprovalChecklist {
  const pledgeLedgerAvailable = Boolean(input.pledgeLedgerAvailable);
  const pipelineAvailable = Boolean(input.pipelineAvailable);
  const readiness = input.readiness || buildCapitalReadiness({ pledgeLedgerAvailable });
  const generatedAt = new Date().toISOString();
  const canRunStripeTests = readiness.paymentSafety.canRunStripeTests;
  const canDeployReview =
    readiness.summary.requiredEnvMissing === 0 &&
    readiness.summary.filesMissing === 0 &&
    readiness.summary.copyWarnings === 0;

  const items: CapitalApprovalItem[] = [
    {
      id: 'oracle-env',
      group: 'environment',
      label: 'Set Oracle Stripe price env var',
      externalAction: 'Set STRIPE_PRICE_ORACLE in a local, test, or production environment.',
      ...itemStatus(
        readiness.env.find((check) => check.id === 'stripe-price-oracle')?.present ? 'already_available' : 'blocked',
        readiness.env.find((check) => check.id === 'stripe-price-oracle')?.present
          ? 'Oracle price is present in this environment. Confirm it maps to the intended product before tests.'
          : 'Oracle price is missing. Checkout should remain blocked until the price is explicit.',
      ),
      exactApprovalText:
        'Approve setting STRIPE_PRICE_ORACLE to [price_id] in [local/test/production], after confirming this is the intended Oracle membership product.',
      prerequisites: [
        'Confirm the Stripe product name, amount, currency, and mode.',
        'Use test-mode ids for local checkout tests.',
        'Keep production changes read-only until this exact approval is given.',
      ],
      verification: [
        'Run npm run env:readiness:smoke.',
        'Run npm run capital:preflight -- --production-env --supabase-read --stripe-read --soft for production review.',
      ],
      allowedPrep: [
        'Read Stripe catalog data.',
        'Update local docs and approval packets.',
        'Prepare env-var instructions without changing production settings.',
      ],
      stopRule: 'Stop if the selected price is live-mode when only test-mode was approved, or if the product does not match Oracle.',
      source: 'docs/92b-stripe-approval-packet.md',
    },
    {
      id: 'patronage-migration',
      group: 'database',
      label: 'Apply capital patronage migration',
      externalAction: 'Apply supabase/migrations/20260526_capital_patronage.sql to a Supabase environment.',
      ...itemStatus(
        pledgeLedgerAvailable ? 'already_available' : 'needs_approval',
        pledgeLedgerAvailable
          ? 'pledge_events is reachable in this environment.'
          : 'The migration file exists locally, but applying it is still an explicit external data action.',
      ),
      exactApprovalText: 'Approve applying Supabase migration supabase/migrations/20260526_capital_patronage.sql to [project_id/environment].',
      prerequisites: [
        'Review SQL and target project id.',
        'Confirm rollback-only smoke plan.',
        'Confirm no destructive SQL is included.',
      ],
      verification: [
        'Query pledge_events after migration.',
        'Run npm run capital:preflight -- --supabase-read --soft.',
        'Run npm run capital:metadata:smoke.',
      ],
      allowedPrep: [
        'Read schema and migration file.',
        'Prepare verification SQL.',
        'Document approval packet locally.',
      ],
      stopRule: 'Stop if the Supabase project id differs from the approved target or if destructive SQL appears.',
      source: 'supabase/migrations/20260526_capital_patronage.sql',
    },
    {
      id: 'pipeline-migration',
      group: 'database',
      label: 'Apply capital pipeline migration',
      externalAction: 'Apply supabase/migrations/20260526_capital_pipeline.sql to a Supabase environment.',
      ...itemStatus(
        pipelineAvailable ? 'already_available' : 'needs_approval',
        pipelineAvailable
          ? 'Capital pipeline tables are reachable in this environment.'
          : 'The local pipeline model is ready, but production table creation still requires approval.',
      ),
      exactApprovalText: 'Approve applying Supabase migration supabase/migrations/20260526_capital_pipeline.sql to [project_id/environment].',
      prerequisites: [
        'Review pipeline table fields for redacted lead labels only.',
        'Confirm policies remain service-role only.',
        'Confirm this does not import or contact leads.',
      ],
      verification: [
        'Run npm run capital:privacy:smoke.',
        'Confirm unauthenticated pipeline API returns 401.',
        'Verify pipeline summary returns aggregate/redacted fields only.',
      ],
      allowedPrep: [
        'Prepare redacted labels.',
        'Update local approval queue.',
        'Inspect schema read-only.',
      ],
      stopRule: 'Stop if the migration target is wrong or if contact/payment identifiers would be exposed.',
      source: 'supabase/migrations/20260526_capital_pipeline.sql',
    },
    {
      id: 'stripe-test-checkout',
      group: 'stripe',
      label: 'Run Stripe test checkout matrix',
      externalAction: 'Create Stripe checkout sessions for 92B, project pledge, membership, and merch flows.',
      ...itemStatus(
        canRunStripeTests ? 'needs_approval' : 'blocked',
        canRunStripeTests
          ? 'Test-mode Stripe configuration appears ready, but checkout session creation still needs exact approval.'
          : 'Stripe test checkout is blocked until test-mode key, webhook secret, and all tier price ids are configured.',
      ),
      exactApprovalText: 'Approve running Stripe test checkout for [flows] using test-mode credentials only.',
      prerequisites: [
        'Stripe key starts with sk_test_.',
        'Every price id belongs to the same test account.',
        'Local return URLs point to the intended localhost or preview target.',
      ],
      verification: [
        'Confirm metadata type and pledge_type for every flow.',
        'Confirm success/cancel URLs are environment-safe.',
        'Run npm run capital:metadata:smoke.',
      ],
      allowedPrep: [
        'Inspect checkout route code.',
        'Prepare the test matrix.',
        'Run static metadata smoke tests.',
      ],
      stopRule: 'Stop immediately if a live-mode key or live price is detected.',
      source: 'docs/92b-capital-launch-runbook.md',
    },
    {
      id: 'stripe-webhook-replay',
      group: 'stripe',
      label: 'Replay Stripe test webhooks',
      externalAction: 'Replay Stripe test webhook events into the local or test webhook route.',
      ...itemStatus(
        canRunStripeTests ? 'needs_approval' : 'blocked',
        canRunStripeTests
          ? 'The test-mode payment path appears configured, but replay still requires exact event approval.'
          : 'Webhook replay is blocked until Stripe test-mode readiness is clean.',
      ),
      exactApprovalText: 'Approve replaying Stripe test webhook events for [events] using test-mode credentials only.',
      prerequisites: [
        'Use test-mode events only.',
        'Confirm webhook signing secret.',
        'Confirm duplicate replay cases are included.',
      ],
      verification: [
        'Replay duplicate checkout.session.completed events.',
        'Confirm pledge_events does not double-count.',
        'Confirm membership tier updates remain deterministic.',
      ],
      allowedPrep: [
        'Review webhook route.',
        'Prepare event list.',
        'Run static smoke tests.',
      ],
      stopRule: 'Stop on any live-mode event, mismatched account, or duplicate-counting behavior.',
      source: 'app/api/stripe/webhook/route.ts',
    },
    {
      id: 'deploy',
      group: 'deploy',
      label: 'Deploy campaign and private admin surfaces',
      externalAction: 'Deploy a branch or commit to Vercel or another public environment.',
      ...itemStatus(
        canDeployReview ? 'needs_approval' : 'blocked',
        canDeployReview
          ? 'Local readiness has no missing env/files/copy blockers in this environment. Deployment still needs exact approval.'
          : 'Deployment review is blocked by current readiness blockers.',
      ),
      exactApprovalText: 'Approve deploying [branch/commit] to [target environment/domain].',
      prerequisites: [
        'Build passes.',
        'Operator smoke passes.',
        'Public copy audit is clean.',
        'Production env readiness has been reviewed read-only.',
      ],
      verification: [
        'Check /92b/fund, /capital, /capital/launch-room, /capital/approvals, /capital/window-kit.',
        'Confirm unauthenticated admin APIs return 401.',
        'Confirm no public page implies secured lease, finalized buildout, or financial return.',
      ],
      allowedPrep: [
        'Inspect Vercel config read-only.',
        'Run local build and route smoke.',
        'Prepare deployment checklist.',
      ],
      stopRule: 'Roll back if auth, payment metadata, or public copy is wrong.',
      source: 'docs/92b-capital-launch-runbook.md',
    },
    {
      id: 'public-payments',
      group: 'stripe',
      label: 'Accept public pledge traffic',
      externalAction: 'Share public checkout paths or create live checkout sessions for patrons.',
      ...itemStatus('blocked', 'Public payment collection remains blocked until deployment, migration, and Stripe replay verification are complete.'),
      exactApprovalText: 'Approve creating checkout sessions or payments for [flow] using [test/live] mode.',
      prerequisites: [
        'Live/test mode is explicitly named.',
        'Ledger migration is reachable.',
        'Webhook replay and duplicate handling are verified.',
      ],
      verification: [
        'Confirm first successful payment appears once in pledge_events.',
        'Confirm /api/92b/progress matches ledger totals.',
        'Confirm receipt and admin views expose no unnecessary PII.',
      ],
      allowedPrep: [
        'Prepare live-mode go/no-go checklist.',
        'Review public flow copy.',
        'Document stop conditions.',
      ],
      stopRule: 'Stop if live mode was not explicitly approved or if ledger totals drift.',
      source: 'docs/92b-capital-launch-runbook.md',
    },
    {
      id: 'window-sign',
      group: 'physical',
      label: 'Print or place the 92B window sign',
      externalAction: 'Print, place, photograph, or otherwise activate the storefront window package.',
      ...itemStatus('needs_approval', 'The sign and QR are local drafts. Physical placement requires exact copy, location, and QR approval.'),
      exactApprovalText: 'Approve printing or placing the 92B window sign at [location] using [copy/version] and QR destination [url].',
      prerequisites: [
        'Campaign page is deployed and checked on mobile.',
        'QR route is verified.',
        'Landlord/access decision is made.',
      ],
      verification: [
        'Scan QR before placement.',
        'Save final sign copy/version.',
        'Confirm public page still says conditional and if viable.',
      ],
      allowedPrep: [
        'Draft sign copy.',
        'Generate QR asset.',
        'Prepare print-ready local file.',
      ],
      stopRule: 'Remove or replace if copy, QR destination, permission, or location is wrong.',
      source: 'docs/92b-window-activation.md',
    },
    {
      id: 'landlord-contact',
      group: 'physical',
      label: 'Contact the landlord',
      externalAction: 'Email, call, text, meet, or otherwise contact the landlord about 92B.',
      ...itemStatus('blocked', 'Landlord contact remains intentionally blocked until campaign, payment tests, and exact conversation brief are approved.'),
      exactApprovalText: 'Approve contacting the landlord with [draft/version] by [channel] about [specific ask].',
      prerequisites: [
        'Final message or talk track approved.',
        'Lease/buildout uncertainty is stated accurately.',
        'No public claim that the space is secured or open.',
      ],
      verification: [
        'Save sent copy or meeting notes locally.',
        'Record next action and unresolved lease/buildout facts.',
      ],
      allowedPrep: [
        'Draft landlord note.',
        'List open factual questions.',
        'Prepare non-public conversation brief.',
      ],
      stopRule: 'Stop if the ask changes, legal uncertainty appears, or the approved channel/copy differs.',
      source: 'docs/soe-external-action-approval-matrix.md',
    },
    {
      id: 'warm-outreach',
      group: 'outreach',
      label: 'Send warm founder outreach',
      externalAction: 'Send, schedule, DM, email, text, call, post, or automate an outreach batch.',
      ...itemStatus('needs_approval', 'Drafts exist locally. No recipient, channel, or final copy is approved from this checklist alone.'),
      exactApprovalText: 'Approve sending this outreach batch: [recipients], [channels], [final draft/version], [send window].',
      prerequisites: [
        'Recipient list is explicit.',
        'Channel is explicit.',
        'Final copy and UTM links are reviewed.',
      ],
      verification: [
        'Log sent status after approval.',
        'Track replies, objections, calls, and pledge commitments.',
      ],
      allowedPrep: [
        'Draft copy.',
        'Segment leads.',
        'Prepare local approval queue.',
      ],
      stopRule: 'Stop if recipient, channel, timing, or final copy differs from approval.',
      source: 'docs/92b-outreach-approval-queue.md',
    },
    {
      id: 'creator-publishing',
      group: 'publishing',
      label: 'Publish creator content',
      externalAction: 'Publish scripts, posts, clips, captions, paid promotion, or social content.',
      ...itemStatus('needs_approval', 'Movement Studio can prepare scripts and performance notes locally. Publishing remains a separate approval.'),
      exactApprovalText: 'Approve publishing creator content: [asset/version], [channel/account], [caption], [time].',
      prerequisites: [
        'Final asset is approved.',
        'Caption is approved.',
        'No private data or unapproved claims are included.',
      ],
      verification: [
        'Save published URL.',
        'Log metrics in performance notes.',
      ],
      allowedPrep: [
        'Draft scripts.',
        'Prepare captions.',
        'Build a local posting calendar.',
      ],
      stopRule: 'Delete or correct if copy, account, timing, or claim differs from approval.',
      source: 'app/movement/studio/page.tsx',
    },
    {
      id: 'connected-tools',
      group: 'tools',
      label: 'Mutate connected business tools',
      externalAction: 'Create, edit, send, schedule, comment, upload, or share through Gmail, Slack, Drive, Calendar, Canva, Docs, Sheets, or Slides.',
      ...itemStatus('blocked', 'Connected tools may be used read-only for preparation. Mutation requires exact target and content approval.'),
      exactApprovalText: 'Approve connected-tool mutation: [Gmail/Slack/Google Drive/Google Calendar/Canva/Docs/Sheets/Slides/etc.] [specific action] on [target].',
      prerequisites: [
        'Target item is explicit.',
        'Final content is approved.',
        'Permissions and data sensitivity are reviewed.',
      ],
      verification: [
        'Confirm exact mutation result.',
        'Record link or local note if appropriate.',
      ],
      allowedPrep: [
        'Search and summarize read-only context.',
        'Draft replies, docs, sheets, or slides locally.',
      ],
      stopRule: 'Undo if tool, target, permission, or content differs from approval.',
      source: 'docs/soe-external-action-approval-matrix.md',
    },
    {
      id: 'browser-computer',
      group: 'tools',
      label: 'Browser/computer automation with external effect',
      externalAction: 'Click a button, submit a form, send, publish, deploy, pay, delete, invite, or change permissions in any external app/site.',
      ...itemStatus('blocked', 'Browser and computer automation can inspect local/dev surfaces, but external-effect clicks require exact approval.'),
      exactApprovalText: 'Approve browser/computer automation that clicks [button/action] in [app/site] to [external result].',
      prerequisites: [
        'The button/action and app/site are explicit.',
        'The resulting external effect is understood.',
        'A screenshot or target description is available.',
      ],
      verification: [
        'Screenshot before and after.',
        'Log the action and result.',
      ],
      allowedPrep: [
        'Navigate read-only.',
        'Inspect pages.',
        'Screenshot local targets.',
        'Test localhost.',
      ],
      stopRule: 'Stop before any ambiguous button, payment, send, publish, deploy, delete, invite, or permission change.',
      source: 'docs/soe-external-action-approval-matrix.md',
    },
  ];

  return {
    generatedAt,
    storageKey: 'soe.capital.approvals.v1',
    boundary:
      'This checklist is local review state only. It does not deploy, send, pay, contact, publish, migrate, mutate connected tools, or authorize physical placement.',
    localStateWarning:
      'Checking an item here does not authorize external action. Exact approval must still be given in the active thread using the approval text shown.',
    readiness: {
      overallStatus: readiness.overallStatus,
      requiredEnvMissing: readiness.summary.requiredEnvMissing,
      paymentWarnings: readiness.summary.paymentWarnings,
      copyWarnings: readiness.summary.copyWarnings,
      blockers: readiness.blockers,
    },
    prepReadiness: buildCapitalPrepReadiness(),
    prepReceipt: buildCapitalPrepReceipt({
      action: 'approval_packet_prepared',
      generatedAt,
      allowedUse: 'Review external-action prerequisites and prepare exact approval text for Chris to approve separately in the active thread.',
      detail: 'Prepared the private approval checklist locally. No approvals were granted, and no deploys, sends, payments, migrations, landlord contact, connected-tool mutations, browser-effect clicks, or window actions occurred.',
    }),
    summary: summarize(items),
    items,
  };
}
