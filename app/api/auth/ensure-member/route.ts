import { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { MEMBER_SESSION_SELECT, memberSessionDto } from '@/lib/auth/memberDto';
import { authWriteOriginAllowed, readAuthJson } from '@/lib/auth/request';
import { AUTH_PROVIDER_COOKIE } from '@/lib/auth/provider';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const failure = () => privateJson({ error: 'Member setup is temporarily unavailable.' }, { status: 503 });

export async function POST(req: NextRequest) {
  if (!authWriteOriginAllowed(req)) return privateJson({ error: 'Request refused.' }, { status: 403 });
  try {
    const selected = req.cookies?.get(AUTH_PROVIDER_COOKIE)?.value;
    if (selected !== undefined && selected !== 'supabase') {
      return privateJson({ error: 'Choose email or Google sign-in before member setup.' }, { status: 409 });
    }
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user || !UUID.test(user.id)) return privateJson({ error: 'Unauthorized' }, { status: 401 });
    const body = await readAuthJson(req);
    if (!body || Object.keys(body).some(key => !['supabaseAuthId', 'displayName', 'email'].includes(key)) ||
        (body.displayName !== undefined && (typeof body.displayName !== 'string' || body.displayName.length > 200)) ||
        (body.supabaseAuthId !== undefined && typeof body.supabaseAuthId !== 'string')) {
      return privateJson({ error: 'Invalid member setup request.' }, { status: 400 });
    }
    if (body.supabaseAuthId !== undefined && body.supabaseAuthId !== user.id) {
      return privateJson({ error: 'Auth mismatch' }, { status: 403 });
    }
    // Email/display text is not proof of account ownership. Never reassign
    // members, enumerate accounts, subscribe or reactivate email preferences.
    const admin = getSupabaseAdmin();
    const existing = await admin.from('members').select(MEMBER_SESSION_SELECT)
      .eq('supabase_auth_id', user.id).maybeSingle();
    if (existing.error) return failure();
    if (existing.data) {
      const member = memberSessionDto(existing.data);
      return member ? privateJson({ member, created: false }) : failure();
    }
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    const inserted = await admin.from('members').insert({
      supabase_auth_id: user.id, display_name: displayName || 'Explorer', exp_tokens: 0, tier: 'free',
    }).select(MEMBER_SESSION_SELECT).single();
    if (inserted.error) {
      // Recover simultaneous creation only through the same verified subject.
      if (inserted.error.code !== '23505') return failure();
      const raced = await admin.from('members').select(MEMBER_SESSION_SELECT)
        .eq('supabase_auth_id', user.id).single();
      const member = !raced.error ? memberSessionDto(raced.data) : null;
      return member ? privateJson({ member, created: false }) : failure();
    }
    const member = memberSessionDto(inserted.data);
    return member ? privateJson({ member, created: true }) : failure();
  } catch { return failure(); }
}
