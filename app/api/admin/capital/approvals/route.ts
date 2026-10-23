import { NextRequest } from 'next/server';
import { requireCapitalAdmin } from '@/lib/capital/adminAuth';
import { buildCapitalApprovalChecklist } from '@/lib/capital/approvalChecklist';
import { buildCapitalReadiness } from '@/lib/capital/launchReadiness';
import { fetchCapitalPipeline } from '@/lib/capital/pipelineStore';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42P01';
}

function reportCapitalApprovalsFailure(scope: string) {
  console.warn(`[capital/approvals] ${scope} failed`);
}

async function pledgeLedgerAvailable(): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('pledge_events')
    .select('id', { count: 'exact', head: true });

  if (!error) return true;
  if (isMissingTable(error)) return false;
  reportCapitalApprovalsFailure('pledge ledger check');
  return false;
}

export async function GET(req: NextRequest) {
  const admin = await requireCapitalAdmin(req);
  if (!admin) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const [ledgerAvailable, pipeline] = await Promise.all([
    pledgeLedgerAvailable(),
    fetchCapitalPipeline(supabase).catch(() => {
      reportCapitalApprovalsFailure('pipeline check');
      return { available: false };
    }),
  ]);

  const readiness = buildCapitalReadiness({ pledgeLedgerAvailable: ledgerAvailable });

  return privateJson({
    checklist: buildCapitalApprovalChecklist({
      pledgeLedgerAvailable: ledgerAvailable,
      pipelineAvailable: pipeline.available,
      readiness,
    }),
  });
}
