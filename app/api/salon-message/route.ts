import type { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { memberCanUseSharedSalon } from '@/lib/salons/access';

const GENERAL_SALON_ID = 'general';
const MAX_SALON_ID_LENGTH = 64;
const MAX_SENDER_NAME_LENGTH = 80;
const MAX_CONTENT_LENGTH = 4000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SalonMessageBody = Record<string, unknown>;

function isRecord(value: unknown): value is SalonMessageBody {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function safeRequestJson(req: NextRequest): Promise<SalonMessageBody | null> {
  try {
    const parsed = await req.json();
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function boundedText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function normalizeSalonId(value: unknown): string | null {
  const salonId = boundedText(value, MAX_SALON_ID_LENGTH);
  if (!salonId) return GENERAL_SALON_ID;
  if (salonId === GENERAL_SALON_ID || UUID_RE.test(salonId)) return salonId;
  return null;
}

export async function POST(req: NextRequest) {
  const body = await safeRequestJson(req);
  if (!body) return privateJson({ error: 'Invalid body' }, { status: 400 });

  const salonId = normalizeSalonId(body.salon_id);
  if (!salonId) return privateJson({ error: 'Invalid salon_id' }, { status: 400 });

  const content = boundedText(body.content, MAX_CONTENT_LENGTH);
  if (!content) return privateJson({ error: 'Content required' }, { status: 400 });

  // Security fix S9: the author is the verified session's member. Body sender_name / sender_type /
  // thinker_id / member ids are ignored, and only members of the salon may post.
  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  try {
    const supabase = getSupabaseAdmin();
    if (!(await memberCanUseSharedSalon(supabase, auth.memberId, salonId))) {
      return privateJson({ error: 'Forbidden' }, { status: 403 });
    }

    const senderName = boundedText(auth.member.display_name, MAX_SENDER_NAME_LENGTH) || 'Explorer';
    const { error } = await supabase.from('salon_messages').insert({
      salon_id: salonId,
      sender_type: 'member',
      sender_name: senderName,
      thinker_id: null,
      content,
    });

    if (error) {
      return privateJson({ error: 'Failed to save salon message' }, { status: 500 });
    }

    return privateJson({ ok: true });
  } catch {
    return privateJson({ error: 'Failed to save salon message' }, { status: 500 });
  }
}
