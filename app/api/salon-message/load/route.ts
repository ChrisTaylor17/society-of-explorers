import type { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { memberCanUseSharedSalon } from '@/lib/salons/access';

const GENERAL_SALON_ID = 'general';
const MAX_SALON_ID_LENGTH = 64;
const MAX_SENDER_NAME_LENGTH = 80;
const MAX_THINKER_ID_LENGTH = 80;
const MAX_CONTENT_LENGTH = 4000;
const MAX_MESSAGES = 60;
const SALON_MESSAGE_SELECT = 'id, salon_id, sender_type, sender_name, thinker_id, content, created_at';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SalonMessageRow = {
  id: string | null;
  salon_id: string | null;
  sender_type: string | null;
  sender_name: string | null;
  thinker_id: string | null;
  content: string | null;
  created_at: string | null;
};

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

function publicSalonMessage(row: SalonMessageRow) {
  return {
    id: boundedText(row.id, MAX_SALON_ID_LENGTH),
    salon_id: row.salon_id === null ? null : boundedText(row.salon_id, MAX_SALON_ID_LENGTH),
    sender_type: boundedText(row.sender_type, 20) === 'thinker' ? 'thinker' : 'member',
    sender_name: boundedText(row.sender_name, MAX_SENDER_NAME_LENGTH) || 'Explorer',
    thinker_id: boundedText(row.thinker_id, MAX_THINKER_ID_LENGTH) || null,
    content: boundedText(row.content, MAX_CONTENT_LENGTH),
    created_at: boundedText(row.created_at, 40) || null,
  };
}

export async function GET(req: NextRequest) {
  const salonId = normalizeSalonId(req.nextUrl.searchParams.get('salonId'));
  if (!salonId) return privateJson({ messages: [], error: 'Invalid salonId' }, { status: 400 });

  // Security fix S8: reading requires a verified session and membership of the salon.
  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ messages: [], error: 'Unauthorized' }, { status: 401 });

  try {
    const supabase = getSupabaseAdmin();
    if (!(await memberCanUseSharedSalon(supabase, auth.memberId, salonId))) {
      return privateJson({ messages: [], error: 'Forbidden' }, { status: 403 });
    }
    let query = supabase
      .from('salon_messages')
      .select(SALON_MESSAGE_SELECT)
      .order('created_at', { ascending: true })
      .limit(MAX_MESSAGES);

    if (salonId !== GENERAL_SALON_ID) {
      query = query.eq('salon_id', salonId);
    } else {
      query = query.or('salon_id.eq.general,salon_id.is.null');
    }

    const { data, error } = await query;

    if (error) {
      return privateJson({ messages: [], error: 'Failed to load salon messages' }, { status: 500 });
    }

    const messages = ((data || []) as SalonMessageRow[]).map(publicSalonMessage);
    return privateJson({ messages });
  } catch {
    return privateJson({ messages: [], error: 'Failed to load salon messages' }, { status: 500 });
  }
}
