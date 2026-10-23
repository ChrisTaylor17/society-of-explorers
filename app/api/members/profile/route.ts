import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type ProfileUpdateBody = {
  display_name?: string | null;
  bio?: string | null;
  discipline?: string | null;
  skills?: unknown;
  project_description?: string | null;
  seeking?: string | null;
  philosophy?: string | null;
};

type ProfileUpdatePayload = {
  display_name?: string | null;
  bio: string | null;
  discipline: string | null;
  skills: string[] | null;
  project_description: string | null;
  seeking: string | null;
  philosophy: string | null;
};

const MAX_PROFILE_TEXT_LENGTH = 2_000;
const MAX_DISPLAY_NAME_LENGTH = 80;
const MAX_SKILL_LENGTH = 64;
const MAX_SKILLS = 30;

async function safeRequestJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeOptionalText(value: unknown, maxLength = MAX_PROFILE_TEXT_LENGTH) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function normalizeSkills(skills: unknown) {
  if (typeof skills === 'string') {
    return normalizeSkillList(skills.split(','));
  }

  if (Array.isArray(skills)) {
    return normalizeSkillList(skills);
  }

  return null;
}

function normalizeSkillList(skills: unknown[]) {
  return skills
    .filter((skill): skill is string => typeof skill === 'string')
    .map((skill) => skill.trim().slice(0, MAX_SKILL_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_SKILLS);
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

    const body = await safeRequestJson(req);
    if (!isRecord(body)) return privateJson({ error: 'Invalid body' }, { status: 400 });

    const { display_name, bio, discipline, skills, project_description, seeking, philosophy } =
      body as ProfileUpdateBody;

    const skillsArr = normalizeSkills(skills);
    const supabaseAdmin = getSupabaseAdmin();

    const update: ProfileUpdatePayload = {
      bio: normalizeOptionalText(bio),
      discipline: normalizeOptionalText(discipline),
      skills: skillsArr,
      project_description: normalizeOptionalText(project_description),
      seeking: normalizeOptionalText(seeking),
      philosophy: normalizeOptionalText(philosophy),
    };

    if (display_name !== undefined) {
      update.display_name = normalizeOptionalText(display_name, MAX_DISPLAY_NAME_LENGTH);
    }

    const { data: member, error } = await supabaseAdmin
      .from('members')
      .update(update)
      .eq('id', auth.memberId)
      .select('id, display_name, discipline, skills, project_description, seeking, bio, exp_tokens, tier, philosophy')
      .single();

    if (error) return privateJson({ error: 'Failed to update profile' }, { status: 500 });
    return privateJson({ ok: true, member });
  } catch {
    return privateJson({ error: 'Failed to update profile' }, { status: 500 });
  }
}
