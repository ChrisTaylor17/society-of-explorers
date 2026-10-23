import { NextRequest } from 'next/server';
import {
  boundedLeadText,
  normalizeLeadEmail,
  safePublicLeadRequestJson as safeRequestJson,
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

  if (!city || !name || !email) {
    return privateJson({ error: 'City, name, and email required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('founding_interest').insert({
    name,
    email,
    why: `[Salon Support] ${city}`,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.warn('[salons/support] founding interest insert failed');
    return privateJson({ error: 'Failed to record salon support' }, { status: 500 });
  }

  return privateJson({ success: true });
}
