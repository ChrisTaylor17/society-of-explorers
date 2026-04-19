import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function ensureDailySubscription(memberId: string) {
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
    const { supabaseAuthId, displayName, email } = await req.json();
    if (!supabaseAuthId) return NextResponse.json({ error: 'Missing auth ID' }, { status: 400 });

    // Check if member exists
    const { data: existing } = await supabaseAdmin
      .from('members')
      .select('*')
      .eq('supabase_auth_id', supabaseAuthId)
      .single();

    if (existing) {
      await ensureDailySubscription(existing.id);
      return NextResponse.json({ member: existing, created: false });
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
          .single();
        if (emailMember) {
          // Link existing member to new OAuth identity
          await supabaseAdmin.from('members').update({ supabase_auth_id: supabaseAuthId }).eq('id', emailMember.id);
          await ensureDailySubscription(emailMember.id);
          return NextResponse.json({ member: { ...emailMember, supabase_auth_id: supabaseAuthId }, created: false });
        }
      }

      // Also check if a member exists with this email as display_name (wallet users who set email)
      const { data: byEmail } = await supabaseAdmin
        .from('members')
        .select('*')
        .ilike('display_name', email)
        .single();
      if (byEmail && !byEmail.supabase_auth_id) {
        await supabaseAdmin.from('members').update({ supabase_auth_id: supabaseAuthId }).eq('id', byEmail.id);
        await ensureDailySubscription(byEmail.id);
        return NextResponse.json({ member: { ...byEmail, supabase_auth_id: supabaseAuthId }, created: false });
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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await ensureDailySubscription(member.id);
    return NextResponse.json({ member, created: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
