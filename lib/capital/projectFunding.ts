import type { SupabaseClient } from '@supabase/supabase-js';
import { PLEDGE_TYPES } from '@/lib/capital/campaign';

type ProjectWithFunding = {
  id: string;
  amount_raised?: number | string | null;
  backer_count?: number | string | null;
  [key: string]: unknown;
};

type PledgeTotalRow = {
  project_id?: string | null;
  amount_cents?: number | string | null;
};

function isMissingLedgerError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42P01' || /pledge_events/i.test(error.message || '');
}

export async function mergeProjectPledgeTotals<T extends ProjectWithFunding>(
  supabase: SupabaseClient,
  projects: T[],
): Promise<T[]> {
  const projectIds = projects.map((project) => project.id).filter(Boolean);
  if (projectIds.length === 0) return projects;

  const { data, error } = await supabase
    .from('pledge_events')
    .select('project_id, amount_cents')
    .eq('pledge_type', PLEDGE_TYPES.PROJECT)
    .in('payment_status', ['paid', 'complete'])
    .in('project_id', projectIds);

  if (error) {
    if (isMissingLedgerError(error)) return projects;
    throw error;
  }

  const totals = new Map<string, { cents: number; count: number }>();
  for (const row of (data || []) as PledgeTotalRow[]) {
    const projectId = String(row.project_id || '');
    if (!projectId) continue;
    const current = totals.get(projectId) || { cents: 0, count: 0 };
    current.cents += Number(row.amount_cents || 0);
    current.count += 1;
    totals.set(projectId, current);
  }

  return projects.map((project) => {
    const total = totals.get(project.id);
    if (!total) return project;
    return {
      ...project,
      amount_raised: total.cents / 100,
      backer_count: total.count,
    };
  });
}
