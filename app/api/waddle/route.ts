import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { circleWriteOrigin } from '@/lib/circles/moderation-server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const MAX_TRANSCRIPTION_CHARS = 4_000;
const MAX_REACTION_CHARS = 2_000;
const PUBLIC_WADDLE_FIELDS = 'id,audio_url,transcription,thinker_id,thinker_reaction,created_at';

function optionalText(value: FormDataEntryValue | null, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function publishedAudioUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    const bucket = new URL('/storage/v1/object/public/waddles/', process.env.NEXT_PUBLIC_SUPABASE_URL);
    const asset = new URL(value);
    if (asset.origin === bucket.origin && asset.pathname.startsWith(bucket.pathname) &&
        !asset.username && !asset.password && !asset.search && !asset.hash) {
      const parts = asset.pathname.slice(bucket.pathname.length).split('/').map(decodeURIComponent);
      if (parts.every(part => part && part !== '.' && part !== '..' && !/[/\\%\u0000-\u001f\u007f]/.test(part))) {
        return asset.href;
      }
    }
  } catch {
    // Historic rows can contain unrecognized links.
  }
  return null;
}

export async function GET() {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('waddles')
    .select(PUBLIC_WADDLE_FIELDS)
    .eq('is_public', true)
    .not('public_consent_at', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return privateJson({ error: 'Failed to load Waddles' }, { status: 500 });

  return privateJson({ waddles: (data || []).map(({ id, audio_url, transcription, thinker_id, thinker_reaction, created_at }) => ({
    id, audio_url: publishedAudioUrl(audio_url), transcription, thinker_id, thinker_reaction, created_at,
  })) });
}

export async function POST(req: NextRequest) {
  try {
    const originError = circleWriteOrigin(req);
    if (originError) return originError;
    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

    const formData = await req.formData();
    if (formData.get('publishPublicly') !== 'true') {
      return privateJson({ error: 'Choose to publish the Waddle publicly.' }, { status: 403 });
    }
    if (formData.get('expectedMemberId') !== auth.memberId) {
      return privateJson({ error: 'The account changed. Review the Waddle again.' }, { status: 409 });
    }
    const audioPart = formData.get('audio');
    const audio = audioPart instanceof File ? audioPart : null;
    const transcription = optionalText(formData.get('transcription'), MAX_TRANSCRIPTION_CHARS);
    const thinkerId = optionalText(formData.get('thinkerId'), 80);
    const thinkerReaction = optionalText(formData.get('thinkerReaction'), MAX_REACTION_CHARS);

    if (audio && audio.size > MAX_AUDIO_BYTES) {
      return privateJson({ error: 'Audio file too large' }, { status: 413 });
    }
    if (audio && (audio.size === 0 || audio.type.split(';', 1)[0] !== 'audio/webm')) {
      return privateJson({ error: 'Use a WebM audio recording.' }, { status: 400 });
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
        .upload(filename, arrayBuffer, { contentType: 'audio/webm' });

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
      public_consent_at: new Date().toISOString(),
    }).select(PUBLIC_WADDLE_FIELDS).single();

    if (error) return privateJson({ error: 'Failed to save Waddle' }, { status: 500 });
    return privateJson({ waddle });
  } catch {
    return privateJson({ error: 'Failed to save Waddle' }, { status: 500 });
  }
}
