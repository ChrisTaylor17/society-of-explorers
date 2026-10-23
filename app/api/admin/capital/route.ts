import { NextRequest } from 'next/server';
import { requireCapitalAdmin } from '@/lib/capital/adminAuth';
import { CAPITAL_CAMPAIGN_GOAL_DOLLARS } from '@/lib/capital/campaign';
import { buildCapitalReadiness } from '@/lib/capital/launchReadiness';
import { fetchCapitalPipeline } from '@/lib/capital/pipelineStore';
import { buildCapitalPrepReadiness, buildCapitalPrepReceipt } from '@/lib/capital/prepReceipts';
import { mergeProjectPledgeTotals } from '@/lib/capital/projectFunding';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { privateJson } from '@/lib/http/routeError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type MemberRow = {
  tier?: string | null;
  created_at?: string | null;
};

type FoundingInterestRow = {
  why?: string | null;
  created_at?: string | null;
};

type ProjectRow = {
  id: string;
  title?: string | null;
  status?: string | null;
  funding_goal?: number | string | null;
  amount_raised?: number | string | null;
  backer_count?: number | string | null;
  use_of_funds?: string | null;
  update_log?: unknown;
};

type MovementScriptRow = {
  status?: string | null;
  platform?: string | null;
  created_at?: string | null;
};

type PledgeEventRow = {
  pledge_type?: string | null;
  campaign_slug?: string | null;
  amount_cents?: number | string | null;
  payment_status?: string | null;
  paid_at?: string | null;
};

type LaunchCheckStatus = 'ready' | 'needs_approval' | 'blocked' | 'manual';

type LaunchCheck = {
  id: string;
  label: string;
  status: LaunchCheckStatus;
  detail: string;
  nextAction: string;
};

const CAPITAL_COMMAND_RESPONSE_HEADERS = {
  'cache-control': 'no-store',
} as const;

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42P01';
}

function commandCenterJson(body: unknown, init: { status?: number; headers?: HeadersInit } = {}) {
  return privateJson(body, {
    ...init,
    headers: {
      ...CAPITAL_COMMAND_RESPONSE_HEADERS,
      ...init.headers,
    },
  });
}

function reportCapitalCommandFailure(scope: string) {
  console.warn(`[capital/command] ${scope} failed`);
}

function countBy<T extends string>(values: T[]): Record<T, number> {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {} as Record<T, number>);
}

export async function GET(req: NextRequest) {
  try {
    const admin = await requireCapitalAdmin(req);
    if (!admin) return commandCenterJson({ error: 'Unauthorized' }, { status: 401 });

    const generatedAt = new Date().toISOString();
    const supabase = getSupabaseAdmin();

    const [
      membersRes,
      foundingInterestRes,
      projectsRes,
      scriptsRes,
      pledgeEventsRes,
      pipelineResult,
    ] = await Promise.all([
      supabase.from('members').select('tier, created_at'),
      supabase.from('founding_interest').select('why, created_at').order('created_at', { ascending: false }).limit(200),
      supabase.from('projects').select('id, title, status, funding_goal, amount_raised, backer_count, use_of_funds, update_log').order('created_at', { ascending: false }),
      supabase.from('movement_scripts').select('status, platform, created_at'),
      supabase.from('pledge_events').select('pledge_type, campaign_slug, amount_cents, payment_status, paid_at'),
      fetchCapitalPipeline(supabase),
    ]);

    const members = (membersRes.data || []) as MemberRow[];
    const tierCounts = countBy(members.map((member) => String(member.tier || 'free')));
    const paidMembers = members.filter((member) => !['free', 'explorer', ''].includes(String(member.tier || '').toLowerCase())).length;

    const foundingInterest = (foundingInterestRes.data || []) as FoundingInterestRow[];
    const leadBuckets = {
      ninetyTwoB: foundingInterest.filter((row) => String(row.why || '').includes('92B')).length,
      projects: foundingInterest.filter((row) => String(row.why || '').includes('Project')).length,
      salons: foundingInterest.filter((row) => String(row.why || '').includes('Salon')).length,
      general: foundingInterest.filter((row) => {
        const why = String(row.why || '');
        return !why.includes('92B') && !why.includes('Project') && !why.includes('Salon');
      }).length,
    };

    const projects = await mergeProjectPledgeTotals(supabase, (projectsRes.data || []) as ProjectRow[]);
    const activeProjects = projects.filter((project) => project.status === 'active');
    const projectRaised = projects.reduce((sum, project) => sum + Number(project.amount_raised || 0), 0);

    const scripts = (scriptsRes.data || []) as MovementScriptRow[];
    const scriptStatusCounts = countBy(scripts.map((script) => String(script.status || 'draft')));

    let pledgeRows: PledgeEventRow[] = [];
    const pledgeLedgerAvailable = !pledgeEventsRes.error || !isMissingTable(pledgeEventsRes.error);
    if (!pledgeEventsRes.error) pledgeRows = (pledgeEventsRes.data || []) as PledgeEventRow[];

    const paidPledges = pledgeRows.filter((row) => ['paid', 'complete'].includes(String(row.payment_status || '').toLowerCase()));
    const pledgeTotals = paidPledges.reduce(
      (acc, row) => {
        const type = String(row.pledge_type || 'unknown');
        const amount = Number(row.amount_cents || 0) / 100;
        acc.total += amount;
        acc.byType[type] = (acc.byType[type] || 0) + amount;
        return acc;
      },
      { total: 0, byType: {} as Record<string, number> },
    );

    const launchChecks: LaunchCheck[] = [
      {
        id: 'campaign-copy',
        label: 'Conditional campaign copy',
        status: 'ready',
        detail: '92B public copy frames the Boston storefront as intended and conditional, not secured.',
        nextAction: 'Review the page once more before deployment.',
      },
      {
        id: 'pledge-ledger',
        label: 'Durable pledge ledger',
        status: pledgeLedgerAvailable ? 'ready' : 'blocked',
        detail: pledgeLedgerAvailable
          ? 'The pledge_events table is reachable from the admin API.'
          : 'The capital patronage migration has not been applied in this environment.',
        nextAction: pledgeLedgerAvailable
          ? 'Run Stripe test checkouts and webhook replay.'
          : 'Approve and apply supabase/migrations/20260526_capital_patronage.sql before public traffic.',
      },
      {
        id: 'stripe-tests',
        label: 'Stripe checkout and replay',
        status: 'manual',
        detail: 'The app has normalized metadata paths for 92B, project pledges, membership, and webhook dedupe.',
        nextAction: 'Run the test matrix in docs/92b-capital-launch-runbook.md.',
      },
      {
        id: 'admin-privacy',
        label: 'Admin privacy boundary',
        status: 'ready',
        detail: 'Capital API returns aggregate metrics and avoids raw donor emails, lead names, Stripe ids, and wallet data.',
        nextAction: 'Keep relationship context in draft documents or approved tools until outreach is authorized.',
      },
      {
        id: 'window-package',
        label: 'Window activation package',
        status: 'needs_approval',
        detail: 'Window sign, patron note, QR asset, and private Window Kit page are drafted locally.',
        nextAction: 'Review /capital/window-kit and approve exact copy before printing, placing, or discussing the sign.',
      },
      {
        id: 'outreach',
        label: 'Warm outreach drafts',
        status: 'needs_approval',
        detail: 'Founder outreach templates are local drafts only.',
        nextAction: 'Approve a recipient batch and exact message text before anything is sent.',
      },
      {
        id: 'pipeline',
        label: 'Capital pipeline',
        status: pipelineResult.available ? 'ready' : 'blocked',
        detail: pipelineResult.available
          ? 'The private outreach approval table is reachable.'
          : 'The capital pipeline migration has not been applied in this environment.',
        nextAction: pipelineResult.available
          ? 'Add redacted lead labels and move only approved outreach through the pipeline.'
          : 'Approve and apply supabase/migrations/20260526_capital_pipeline.sql before using the pipeline.',
      },
      {
        id: 'landlord-boundary',
        label: 'Landlord boundary',
        status: 'blocked',
        detail: 'No landlord contact should happen until campaign materials, pledge tracking, and a proposed conversation script are approved.',
        nextAction: 'Prepare the landlord conversation brief only after the capital page and test checkouts are ready.',
      },
    ];
    const readiness = buildCapitalReadiness({ pledgeLedgerAvailable });
    const prepReadiness = buildCapitalPrepReadiness();

    return commandCenterJson({
    campaign: {
      name: '92B Founding Node',
      goal: CAPITAL_CAMPAIGN_GOAL_DOLLARS,
      stance: 'Conditional physical anchor',
      externalActionBoundary: 'Draft for approval',
    },
    prepReadiness,
    prepReceipt: buildCapitalPrepReceipt({
      action: 'command_center_loaded',
      generatedAt,
      allowedUse:
        'Review aggregate and redacted campaign metrics, readiness gates, pipeline summaries, and local draft materials before exact external approvals.',
      detail:
        'Loaded the private Capital Command Center locally. No outreach, contact import, checkout session, payment, webhook replay, deploy, migration, landlord contact, window action, connected-tool mutation, CRM write, public post, or public claim occurred.',
    }),
    metrics: {
      membersTotal: members.length,
      paidMembers,
      tierCounts,
      foundingInterestCount: foundingInterest.length,
      leadBuckets,
      projectsTotal: projects.length,
      activeProjects: activeProjects.length,
      projectRaised,
      pledgeLedgerAvailable,
      pledgeLedgerRaised: pledgeTotals.total,
      pledgeLedgerByType: pledgeTotals.byType,
      movementScripts: scriptStatusCounts,
      pipelineTotal: pipelineResult.summary.total,
      pipelinePledgeIntent: pipelineResult.summary.pledgeIntentCents / 100,
    },
    projects: activeProjects.map((project) => ({
      id: project.id,
      title: project.title,
      status: project.status,
      fundingGoal: Number(project.funding_goal || 0),
      amountRaised: Number(project.amount_raised || 0),
      backerCount: Number(project.backer_count || 0),
      hasUseOfFunds: Boolean(project.use_of_funds),
      updateCount: Array.isArray(project.update_log) ? project.update_log.length : 0,
    })),
    operations: {
      launchChecks,
      readiness,
      pipeline: {
        available: pipelineResult.available,
        summary: pipelineResult.summary,
        nextActions: pipelineResult.summary.nextActions,
      },
      nextActions: [
        'Review 92B campaign page and pledge tiers.',
        'Apply the capital patronage migration before accepting production pledge traffic.',
        'Run npm run capital:preflight -- --routes --supabase-read before Stripe checkout tests.',
        'Run the Stripe test matrix and webhook replay after missing env is resolved.',
        'Use /capital/approvals to track local review state for each external action.',
        'Use /capital/patron-brief to rehearse the patron story, objection handling, and ask ladder before approved outreach.',
        'Use /capital/scenarios to choose a patron-mix target before asking for specific tiers.',
        'Use /capital/outreach-lab to prepare redacted outreach slots before requesting approval.',
        'Use /capital/weekly-review to record weekly money collected, committed pledges, strongest story, top objection, and next ask locally.',
        'Prepare redacted leads in the Capital Pipeline after migration approval.',
        'Approve or edit the window sign and patron note drafts.',
        'Approve outreach drafts before any messages are sent.',
      ],
      draftMaterials: [
        '/Users/christaylor/society-of-explorers/docs/92b-capital-launch-runbook.md',
        '/Users/christaylor/society-of-explorers/supabase/migrations/20260526_capital_pipeline.sql',
        '/Users/christaylor/society-of-explorers/docs/92b-window-activation.md',
        '/Users/christaylor/society-of-explorers/docs/92b-stripe-approval-packet.md',
        '/Users/christaylor/society-of-explorers/docs/92b-window-sign.html',
        '/Users/christaylor/society-of-explorers/public/images/92b-window-qr.svg',
        '/Users/christaylor/society-of-explorers/app/capital/window-kit/page.tsx',
        '/Users/christaylor/society-of-explorers/app/capital/launch-room/page.tsx',
        '/Users/christaylor/society-of-explorers/app/capital/approvals/page.tsx',
        '/Users/christaylor/society-of-explorers/app/capital/patron-brief/page.tsx',
        '/Users/christaylor/society-of-explorers/app/capital/scenarios/page.tsx',
        '/Users/christaylor/society-of-explorers/app/capital/outreach-lab/page.tsx',
        '/Users/christaylor/society-of-explorers/app/capital/weekly-review/page.tsx',
        '/Users/christaylor/society-of-explorers/scripts/capital-preflight.mjs',
        '/Users/christaylor/society-of-explorers/docs/92b-patron-note.md',
        '/Users/christaylor/society-of-explorers/docs/92b-founder-outreach-drafts.md',
        '/Users/christaylor/society-of-explorers/docs/92b-outreach-approval-queue.md',
      ],
    },
    });
  } catch {
    reportCapitalCommandFailure('load');
    return commandCenterJson({ error: 'Capital command center unavailable' }, { status: 500 });
  }
}
