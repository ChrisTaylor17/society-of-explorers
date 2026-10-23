import { NextRequest } from 'next/server';
import { internalRouteError, privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createClient as createSupabaseServerClient } from '@/lib/supabase/server';

async function ensureDailySubscription(supabaseAdmin: ReturnType<typeof getSupabaseAdmin>, memberId: string) {
  try {
    const { data: existing } = await supabaseAdmin
      .from('daily_email_subscriptions')
      .select('id, unsubscribed_at')
      .eq('member_id', memberId)
      .maybeSingle();
    if (existing) {
      if (existing.unsubscribed_at) {
        await supabaseAdmin
          .from('daily_email_subscriptions')
          .update({ unsubscribed_at: null, subscribed_at: new Date().toISOString() })
          .eq('id', existing.id);
      }
      return;
    }
    await supabaseAdmin.from('daily_email_subscriptions').insert({ member_id: memberId });
  } catch (e) {
    console.error('[ensure-member] daily subscription failed (non-fatal):', e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return privateJson({ error: 'Unauthorized' }, { status: 401 });
    }

    const requestedSupabaseAuthId =
      typeof body?.supabaseAuthId === 'string' ? body.supabaseAuthId : null;

    if (requestedSupabaseAuthId && requestedSupabaseAuthId !== user.id) {
      return privateJson({ error: 'Auth mismatch' }, { status: 403 });
    }

    const supabaseAuthId = user.id;
    const displayName =
      typeof body?.displayName === 'string' && body.displayName.trim().length > 0
        ? body.displayName.trim()
        : null;
    const email = user.email?.trim().toLowerCase() || null;

    const supabaseAdmin = getSupabaseAdmin();

    // Check if member exists
    const { data: existing } = await supabaseAdmin
      .from('members')
      .select('*')
      .eq('supabase_auth_id', supabaseAuthId)
      .maybeSingle();

    if (existing) {
      await ensureDailySubscription(supabaseAdmin, existing.id);
      return privateJson({ member: existing, created: false });
    }

    // Fallback: look up by email (handles members created before OAuth)
    if (email) {
      // Check auth.users for matching email to find their member record
      const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
      const matchingAuth = authUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase() && u.id !== supabaseAuthId);
      if (matchingAuth) {
        const { data: emailMember } = await supabaseAdmin
          .from('members')
          .select('*')
          .eq('supabase_auth_id', matchingAuth.id)
          .maybeSingle();
        if (emailMember) {
          // Link existing member to new OAuth identity
          await supabaseAdmin.from('members').update({ supabase_auth_id: supabaseAuthId }).eq('id', emailMember.id);
          await ensureDailySubscription(supabaseAdmin, emailMember.id);
          return privateJson({ member: { ...emailMember, supabase_auth_id: supabaseAuthId }, created: false });
        }
      }

      // Also check if a member exists with this email as display_name (wallet users who set email)
      const { data: byEmail } = await supabaseAdmin
        .from('members')
        .select('*')
        .ilike('display_name', email)
        .maybeSingle();
      if (byEmail && !byEmail.supabase_auth_id) {
        await supabaseAdmin.from('members').update({ supabase_auth_id: supabaseAuthId }).eq('id', byEmail.id);
        await ensureDailySubscription(supabaseAdmin, byEmail.id);
        return privateJson({ member: { ...byEmail, supabase_auth_id: supabaseAuthId }, created: false });
      }
    }

    // Create new member from Google/OAuth data
    const { data: member, error } = await supabaseAdmin
      .from('members')
      .insert({
        supabase_auth_id: supabaseAuthId,
        display_name: displayName || email?.split('@')[0] || 'Explorer',
        exp_tokens: 0,
        tier: 'free',
      })
      .select()
      .single();

    if (error) {
      console.error('Member creation failed:', error);
      return internalRouteError('Member creation failed');
    }

    await ensureDailySubscription(supabaseAdmin, member.id);
    return privateJson({ member, created: true });
  } catch (err) {
    console.error('[ensure-member] unexpected failure:', err);
    return internalRouteError('Ensure member failed');
  }
}
