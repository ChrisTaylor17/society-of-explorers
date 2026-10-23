import { NextRequest } from 'next/server';
import { mergeProjectPledgeTotals } from '@/lib/capital/projectFunding';
import { privateJson } from '@/lib/http/routeError';
import {
  PROJECT_DETAIL_SELECT,
  PROJECT_ID_PATTERN,
  sanitizeProjectDetailRow,
} from '@/lib/projects/publicProject';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!PROJECT_ID_PATTERN.test(id)) {
    return privateJson({ error: 'Project not found' }, { status: 404 });
  }

  const supabase = getSupabaseAdmin();
  const { data: project, error } = await supabase
    .from('projects')
    .select(PROJECT_DETAIL_SELECT)
    .eq('id', id)
    .single();

  if (error || !project) {
    return privateJson({ error: 'Project not found' }, { status: 404 });
  }

  const sanitized = sanitizeProjectDetailRow(project);
  if (!sanitized) return privateJson({ error: 'Project not found' }, { status: 404 });

  const [merged] = await mergeProjectPledgeTotals(supabase, [sanitized]);
  return privateJson({ project: merged });
}
