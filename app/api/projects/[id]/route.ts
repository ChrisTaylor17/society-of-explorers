import { NextRequest } from 'next/server';
import { mergeProjectPledgeTotals } from '@/lib/capital/projectFunding';
import { privateJson } from '@/lib/http/routeError';
import {
  PROJECT_DETAIL_SELECT,
  PROJECT_ID_PATTERN,
  sanitizeProjectDetailRow,
} from '@/lib/projects/publicProject';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

function isTemporaryReadFailure(error: { code?: string }, status: number) {
  const code = typeof error.code === 'string' ? error.code : '';
  // Keep denials, absence and unfamiliar database/policy errors masked. A 5xx alone is not
  // enough: custom policy errors may deliberately conceal a project's existence.
  if ([401, 403, 404].includes(status)) return false;
  if (code === '') return [0, 429, 502, 503, 504].includes(status);
  return status >= 500 && status < 600 &&
    /^(PGRST00[0-3]|08[A-Z0-9]{3}|53[A-Z0-9]{3}|57014|57P0[123])$/.test(code);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!PROJECT_ID_PATTERN.test(id)) {
    return privateJson({ error: 'Project not found' }, { status: 404 });
  }

  const supabase = getSupabaseAdmin();
  const { data: project, error, status } = await supabase
    .from('projects')
    .select(PROJECT_DETAIL_SELECT)
    .eq('id', id)
    .eq('status', 'active')
    .single();

  if (error && isTemporaryReadFailure(error, status)) {
    return privateJson({ error: 'Project temporarily unavailable' }, { status: 503 });
  }

  if (error || !project) {
    return privateJson({ error: 'Project not found' }, { status: 404 });
  }

  const sanitized = sanitizeProjectDetailRow(project);
  if (!sanitized) return privateJson({ error: 'Project not found' }, { status: 404 });

  const [merged] = await mergeProjectPledgeTotals(supabase, [sanitized]);
  return privateJson({ project: merged });
}
