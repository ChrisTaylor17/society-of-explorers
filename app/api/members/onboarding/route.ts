import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const THINKER_IDS = ['socrates', 'plato', 'aurelius', 'nietzsche', 'einstein', 'jobs'];

type OnboardingAnswers = {
  building?: string;
  challenge?: string;
  success?: string;
  background?: string;
};

type OnboardingBody = {
  answers?: OnboardingAnswers;
};

type ThinkerMemoryRow = {
  id: string;
  life_facts: Record<string, string> | null;
};

const MAX_ONBOARDING_ANSWER_LENGTH = 2_000;

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

function asTrimmedText(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, MAX_ONBOARDING_ANSWER_LENGTH) : '';
}

function normalizeAnswers(value: unknown): OnboardingAnswers | null {
  if (!isRecord(value)) return null;

  return {
    building: asTrimmedText(value.building),
    challenge: asTrimmedText(value.challenge),
    success: asTrimmedText(value.success),
    background: asTrimmedText(value.background),
  };
}

function buildLifeFacts(answers: OnboardingAnswers) {
  const lifeFacts: Record<string, string> = {};
  const building = asTrimmedText(answers.building);
  const challenge = asTrimmedText(answers.challenge);
  const success = asTrimmedText(answers.success);
  const background = asTrimmedText(answers.background);

  if (building) lifeFacts.current_project = building;
  if (challenge) lifeFacts.biggest_challenge = challenge;
  if (success) lifeFacts.ninety_day_goal = success;
  if (background) lifeFacts.background = background;
  return lifeFacts;
}

export async function POST(req: NextRequest) {
  try {
    const body = await safeRequestJson(req);
    if (!isRecord(body)) return privateJson({ error: 'Missing fields' }, { status: 400 });

    const { answers } = body as OnboardingBody;
    const normalizedAnswers = normalizeAnswers(answers);

    if (!normalizedAnswers) {
      return privateJson({ error: 'Missing fields' }, { status: 400 });
    }

    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

    const supabaseAdmin = getSupabaseAdmin();

    // Store onboarding answers on member profile.
    const { error: memberUpdateError } = await supabaseAdmin.from('members')
      .update({ onboarding_answers: normalizedAnswers })
      .eq('id', auth.memberId);

    if (memberUpdateError) {
      return privateJson({ error: 'Failed to save onboarding answers' }, { status: 500 });
    }

    // Seed thinker_memory life_facts for all 6 thinkers.
    const lifeFacts = buildLifeFacts(normalizedAnswers);

    for (const thinkerId of THINKER_IDS) {
      const { data: existing, error: existingError } = await supabaseAdmin
        .from('thinker_memory')
        .select('id, life_facts')
        .eq('member_id', auth.memberId)
        .eq('thinker_id', thinkerId)
        .maybeSingle();

      if (existingError) {
        return privateJson({ error: 'Failed to save onboarding memory' }, { status: 500 });
      }

      const existingRow = existing as ThinkerMemoryRow | null;
      if (existingRow) {
        const { error } = await supabaseAdmin.from('thinker_memory')
          .update({
            life_facts: { ...(existingRow.life_facts || {}), ...lifeFacts },
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingRow.id);

        if (error) return privateJson({ error: 'Failed to save onboarding memory' }, { status: 500 });
      } else {
        const { error } = await supabaseAdmin.from('thinker_memory')
          .insert({
            member_id: auth.memberId,
            thinker_id: thinkerId,
            summary: '',
            message_count: 0,
            life_facts: lifeFacts,
          });

        if (error) return privateJson({ error: 'Failed to save onboarding memory' }, { status: 500 });
      }
    }

    return privateJson({ success: true });
  } catch {
    return privateJson({ error: 'Failed to save onboarding' }, { status: 500 });
  }
}
