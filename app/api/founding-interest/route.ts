import { NextRequest } from 'next/server';
import {
  boundedLeadText,
  normalizeLeadEmail,
  safePublicLeadRequestJson as safeRequestJson,
  sendPublicLeadNotification,
} from '@/lib/leads/publicLeadCapture';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  const body = await safeRequestJson(req);

  if (!body) {
    return privateJson({ error: 'Invalid body' }, { status: 400 });
  }

  const name = boundedLeadText(body.name, 120);
  const email = normalizeLeadEmail(body.email);
  const why = boundedLeadText(body.why, 1000);

  if (!name || !email) {
    return privateJson({ error: 'Name and email required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('founding_interest').insert({
    name,
    email,
    why: why || null,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.warn('[founding-interest] founding interest insert failed');
    return privateJson({ error: 'Failed to record founding interest' }, { status: 500 });
  }

  await sendPublicLeadNotification({
    heading: 'FOUNDING DINNER INTEREST',
    subject: `New Founding Dinner Interest: ${name}`,
    fields: [
      { label: 'Name', value: name },
      { label: 'Email', value: email },
      ...(why ? [{ label: 'Why', value: why }] : []),
    ],
  });

  return privateJson({ success: true });
}
