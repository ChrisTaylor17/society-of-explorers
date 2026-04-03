import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('waddles')
    .select('*, members!waddles_member_id_fkey(display_name)')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    // Fallback: query without join if foreign key doesn't exist
    const { data: fallback } = await supabaseAdmin
      .from('waddles')
      .select('*')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(20);
    return NextResponse.json({ waddles: fallback || [] });
  }

  return NextResponse.json({ waddles: data || [] });
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audio = formData.get('audio') as File;
    const memberId = formData.get('memberId') as string;
    const transcription = formData.get('transcription') as string;
    const thinkerId = formData.get('thinkerId') as string | null;
    const thinkerReaction = formData.get('thinkerReaction') as string | null;

    let audioUrl = '';

    // Upload audio to Supabase storage
    if (audio && audio.size > 0) {
      const filename = `${memberId || 'anon'}/${Date.now()}.webm`;
      const arrayBuffer = await audio.arrayBuffer();
      const { data: uploadData } = await supabaseAdmin.storage
        .from('waddles')
        .upload(filename, arrayBuffer, { contentType: audio.type || 'audio/webm' });

      if (uploadData) {
        const { data: urlData } = supabaseAdmin.storage.from('waddles').getPublicUrl(filename);
        audioUrl = urlData.publicUrl;
      }
    }

    const { data: waddle, error } = await supabaseAdmin.from('waddles').insert({
      member_id: memberId || null,
      audio_url: audioUrl,
      transcription: transcription || '',
      thinker_id: thinkerId || null,
      thinker_reaction: thinkerReaction || null,
      is_public: true,
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ waddle });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
