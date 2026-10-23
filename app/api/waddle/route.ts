import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const MAX_TRANSCRIPTION_CHARS = 4_000;
const MAX_REACTION_CHARS = 2_000;

function optionalText(value: FormDataEntryValue | null, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

export async function GET() {
  const supabaseAdmin = getSupabaseAdmin();
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
    return privateJson({ waddles: fallback || [] });
  }

  return privateJson({ waddles: data || [] });
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

    const formData = await req.formData();
    const audioPart = formData.get('audio');
    const audio = audioPart instanceof File ? audioPart : null;
    const transcription = optionalText(formData.get('transcription'), MAX_TRANSCRIPTION_CHARS);
    const thinkerId = optionalText(formData.get('thinkerId'), 80);
    const thinkerReaction = optionalText(formData.get('thinkerReaction'), MAX_REACTION_CHARS);

    if (audio && audio.size > MAX_AUDIO_BYTES) {
      return privateJson({ error: 'Audio file too large' }, { status: 413 });
    }

    if (!audio && !transcription) {
      return privateJson({ error: 'Audio or transcription required' }, { status: 400 });
    }

    let audioUrl = '';
    const supabaseAdmin = getSupabaseAdmin();

    // Upload audio to Supabase storage
    if (audio && audio.size > 0) {
      const filename = `${auth.memberId}/${Date.now()}-${randomUUID()}.webm`;
      const arrayBuffer = await audio.arrayBuffer();
      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from('waddles')
        .upload(filename, arrayBuffer, { contentType: audio.type || 'audio/webm' });

      if (uploadError) return privateJson({ error: 'Failed to store Waddle audio' }, { status: 500 });

      if (uploadData) {
        const { data: urlData } = supabaseAdmin.storage.from('waddles').getPublicUrl(filename);
        audioUrl = urlData.publicUrl;
      }
    }

    const { data: waddle, error } = await supabaseAdmin.from('waddles').insert({
      member_id: auth.memberId,
      audio_url: audioUrl,
      transcription: transcription || '',
      thinker_id: thinkerId || null,
      thinker_reaction: thinkerReaction || null,
      is_public: true,
    }).select().single();

    if (error) return privateJson({ error: 'Failed to save Waddle' }, { status: 500 });
    return privateJson({ waddle });
  } catch {
    return privateJson({ error: 'Failed to save Waddle' }, { status: 500 });
  }
}
