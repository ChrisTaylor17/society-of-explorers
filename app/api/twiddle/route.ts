import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { content, twiddle_type, thread_type, thinker_tags, voice_url, artifact_url, sketch_data, parent_id, memberId } = body;

    if (!content?.trim() && twiddle_type !== 'voice') {
      return NextResponse.json({ error: 'Content required' }, { status: 400 });
    }
    if (!memberId) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    // Resolve root_id from parent
    let root_id = null;
    if (parent_id) {
      const { data: parent } = await supabaseAdmin.from('twiddles').select('root_id').eq('id', parent_id).single();
      root_id = parent?.root_id || parent_id;
    }

    // Look up auth user id from member id
    const { data: member } = await supabaseAdmin.from('members').select('supabase_auth_id').eq('id', memberId).single();
    const author_id = member?.supabase_auth_id || null;

    const { data: twiddle, error } = await supabaseAdmin.from('twiddles').insert({
      author_id,
      content: content?.trim(),
      twiddle_type: twiddle_type || 'text',
      thread_type: thread_type || 'open',
      thinker_tags: thinker_tags || [],
      voice_url: voice_url || null,
      artifact_url: artifact_url || null,
      sketch_data: sketch_data || null,
      parent_id: parent_id || null,
      root_id,
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ twiddle });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const filter = searchParams.get('filter') || 'trending';
    const thinker = searchParams.get('thinker');
    const limit = Math.min(Number(searchParams.get('limit')) || 20, 50);
    const offset = Number(searchParams.get('offset')) || 0;
    const memberId = searchParams.get('memberId');

    let query = supabaseAdmin
      .from('twiddles')
      .select('*, twiddle_reactions(reaction_type)')
      .is('parent_id', null) // Only top-level twiddles
      .range(offset, offset + limit - 1);

    if (thinker) {
      query = query.contains('thinker_tags', [thinker]);
    }

    switch (filter) {
      case 'my':
        if (memberId) {
          const { data: m } = await supabaseAdmin.from('members').select('supabase_auth_id').eq('id', memberId).single();
          if (m?.supabase_auth_id) query = query.eq('author_id', m.supabase_auth_id);
        }
        query = query.order('created_at', { ascending: false });
        break;
      case 'archive':
        query = query.eq('is_woven', true).order('created_at', { ascending: false });
        break;
      case 'thinker_picks':
        query = query.eq('is_thinker_response', false).order('created_at', { ascending: false });
        break;
      case 'trending':
      default:
        query = query.order('created_at', { ascending: false });
        break;
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ twiddles: [], error: error.message });

    // Enrich with reaction counts
    const twiddles = (data || []).map((t: any) => {
      const reactions = t.twiddle_reactions || [];
      const counts: Record<string, number> = {};
      reactions.forEach((r: any) => { counts[r.reaction_type] = (counts[r.reaction_type] || 0) + 1; });
      return { ...t, reaction_counts: counts, twiddle_reactions: undefined };
    });

    return NextResponse.json({ twiddles });
  } catch (err) {
    return NextResponse.json({ twiddles: [], error: String(err) });
  }
}
