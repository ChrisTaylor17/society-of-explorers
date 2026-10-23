import { mergeProjectPledgeTotals } from '@/lib/capital/projectFunding';
import { privateJson } from '@/lib/http/routeError';
import { PROJECT_LIST_SELECT, sanitizeProjectListRow } from '@/lib/projects/publicProject';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data: projects, error } = await supabase
    .from('projects')
    .select(PROJECT_LIST_SELECT)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) return privateJson({ projects: [], error: 'Failed to load projects' }, { status: 500 });

  const sanitized = (projects || []).map(sanitizeProjectListRow).filter((project) => project !== null);
  const merged = await mergeProjectPledgeTotals(supabase, sanitized);
  return privateJson({ projects: merged });
}
