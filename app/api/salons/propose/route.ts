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

  const city = boundedLeadText(body.city, 120);
  const name = boundedLeadText(body.name, 120);
  const email = normalizeLeadEmail(body.email);
  const why = boundedLeadText(body.why, 1000);

  if (!city || !name || !email) {
    return privateJson({ error: 'City, name, and email required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('founding_interest').insert({
    name,
    email,
    why: `[Salon Proposal] ${city}${why ? `: ${why}` : ''}`,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.warn('[salons/propose] founding interest insert failed');
    return privateJson({ error: 'Failed to record salon proposal' }, { status: 500 });
  }

  await sendPublicLeadNotification({
    heading: 'SALON CITY PROPOSAL',
    subject: `Salon Proposal: ${city} - ${name}`,
    fields: [
      { label: 'City', value: city },
      { label: 'Name', value: name },
      { label: 'Email', value: email },
      ...(why ? [{ label: 'Why', value: why }] : []),
    ],
  });

  return privateJson({ success: true });
}
