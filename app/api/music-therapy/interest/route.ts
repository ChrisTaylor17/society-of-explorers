import { NextRequest } from 'next/server';
import {
  boundedLeadText,
  normalizeLeadEmail,
  safePublicLeadRequestJson as safeRequestJson,
  sendPublicLeadNotification,
} from '@/lib/leads/publicLeadCapture';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const HARDWARE_STATUS = new Set(['learn', 'have_device', 'need_device', 'other']);

function normalizeHardwareStatus(value: unknown) {
  const hardwareStatus = boundedLeadText(value, 60).toLowerCase();
  return HARDWARE_STATUS.has(hardwareStatus) ? hardwareStatus : 'learn';
}

export async function POST(req: NextRequest) {
  const body = await safeRequestJson(req);

  if (!body) {
    return privateJson({ error: 'Invalid body' }, { status: 400 });
  }

  const name = boundedLeadText(body.name, 120);
  const email = normalizeLeadEmail(body.email);
  const hardwareStatus = normalizeHardwareStatus(body.hardware_status);

  if (!name || !email) {
    return privateJson({ error: 'Name and email required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('founding_interest').insert({
    name,
    email,
    why: `[Music Therapy Waitlist] ${hardwareStatus}`,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.warn('[music-therapy/interest] founding interest insert failed');
    return privateJson({ error: 'Failed to record music therapy interest' }, { status: 500 });
  }

  await sendPublicLeadNotification({
    heading: 'MUSIC THERAPY WAITLIST',
    subject: `Music Therapy Interest: ${name}`,
    fields: [
      { label: 'Name', value: name },
      { label: 'Email', value: email },
      { label: 'Hardware', value: hardwareStatus },
    ],
  });

  return privateJson({ success: true });
}
