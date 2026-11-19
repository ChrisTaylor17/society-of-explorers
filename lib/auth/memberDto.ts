// This profile is a presentation DTO, never a browser authorization grant.
export const MEMBER_SESSION_SELECT = 'id, display_name, email, bio, discipline, skills, project_description, seeking, philosophy, exp_tokens, tier, coherence_data, total_responses, supabase_auth_id';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value: unknown, limit: number): string | null {
  if (typeof value !== 'string') return null;
  return [...value].slice(0, limit).join('');
}

export function memberSessionDto(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || !UUID.test(row.id)) return null;
  let coherence: unknown = null;
  try {
    const encoded = JSON.stringify(row.coherence_data ?? null);
    if (encoded.length <= 32_768) coherence = JSON.parse(encoded);
  } catch {}
  return {
    id: row.id,
    supabase_auth_id: typeof row.supabase_auth_id === 'string' && UUID.test(row.supabase_auth_id) ? row.supabase_auth_id : null,
    display_name: text(row.display_name, 200) || 'Explorer',
    email: text(row.email, 320),
    bio: text(row.bio, 4_000),
    discipline: text(row.discipline, 200),
    skills: Array.isArray(row.skills) ? row.skills.filter((item): item is string => typeof item === 'string').slice(0, 40).map(item => text(item, 100)!) : [],
    project_description: text(row.project_description, 4_000),
    seeking: text(row.seeking, 2_000),
    philosophy: text(row.philosophy, 4_000),
    exp_tokens: typeof row.exp_tokens === 'number' && Number.isFinite(row.exp_tokens) ? row.exp_tokens : 0,
    tier: text(row.tier, 40) || 'free',
    coherence_data: coherence,
    total_responses: typeof row.total_responses === 'number' && Number.isFinite(row.total_responses) ? row.total_responses : 0,
  };
}
