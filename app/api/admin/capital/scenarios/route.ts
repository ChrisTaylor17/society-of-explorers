import { NextRequest } from 'next/server';
import { requireCapitalAdmin } from '@/lib/capital/adminAuth';
import { buildCapitalScenarioPlanner } from '@/lib/capital/scenarioPlanner';
import { privateJson } from '@/lib/http/routeError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const admin = await requireCapitalAdmin(req);
  if (!admin) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  return privateJson({
    planner: buildCapitalScenarioPlanner(),
  });
}
