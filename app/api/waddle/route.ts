import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { circleWriteOrigin } from '@/lib/circles/moderation-server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { hasPrivateWaddleBucket, MAX_AUDIO_BYTES, WADDLE_AUDIO_MIME, WADDLE_BUCKET, waddleAudioHref } from '@/lib/waddle/media';

const MAX_TRANSCRIPTION_CHARS = 4_000;
const MAX_REACTION_CHARS = 2_000;
const WADDLE_FEED_FIELDS = 'id,audio_url,transcription,thinker_id,thinker_reaction,created_at,member_id';

type WaddleFeedRow = {
  id: string;
  audio_url: string | null;
  transcription: string | null;
  thinker_id: string | null;
  thinker_reaction: string | null;
  created_at: string | null;
  member_id: string | null;
};

function optionalText(value: FormDataEntryValue | null, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function publicWaddle({ id, audio_url, transcription, thinker_id, thinker_reaction, created_at, member_id }: WaddleFeedRow) {
  return { id, audio_url: waddleAudioHref(id, audio_url, member_id), transcription, thinker_id, thinker_reaction, created_at };
}

export async function GET() {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('waddles')
    .select(WADDLE_FEED_FIELDS)
    .eq('is_public', true)
    .not('public_consent_at', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return privateJson({ error: 'Failed to load Waddles' }, { status: 500 });

  return privateJson({ waddles: (data || []).map(publicWaddle) });
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
    if (audio && (audio.size === 0 || audio.type.split(';', 1)[0] !== WADDLE_AUDIO_MIME)) {
      return privateJson({ error: 'Use a WebM audio recording.' }, { status: 400 });
    }

    if (!audio && !transcription) {
      return privateJson({ error: 'Audio or transcription required' }, { status: 400 });
    }

    let audioObject = '';
    const supabaseAdmin = getSupabaseAdmin();

    if (audio) {
      const arrayBuffer = await audio.arrayBuffer();
      if (arrayBuffer.byteLength < 5 || new DataView(arrayBuffer).getUint32(0) !== 0x1a45dfa3) {
        return privateJson({ error: 'Use a WebM audio recording.' }, { status: 400 });
      }
      if (!await hasPrivateWaddleBucket(supabaseAdmin.storage)) {
        return privateJson({ error: 'Waddle audio storage is unavailable.' }, { status: 503 });
      }
      const filename = `${auth.memberId}/${Date.now()}-${randomUUID()}.webm`;
      const { data: uploaded, error: uploadError } = await supabaseAdmin.storage
        .from(WADDLE_BUCKET)
        .upload(filename, arrayBuffer, { contentType: WADDLE_AUDIO_MIME, cacheControl: '0' });

      if (uploadError || uploaded?.fullPath !== `${WADDLE_BUCKET}/${filename}`) {
        return privateJson({ error: 'Failed to store Waddle audio' }, { status: 500 });
      }
      audioObject = filename;
    }

    const { data: waddle, error } = await supabaseAdmin.from('waddles').insert({
      member_id: auth.memberId,
      audio_url: audioObject,
      transcription: transcription || '',
      thinker_id: thinkerId || null,
      thinker_reaction: thinkerReaction || null,
      is_public: true,
      public_consent_at: new Date().toISOString(),
    }).select(WADDLE_FEED_FIELDS).single();

    if (error || !waddle) return privateJson({ error: 'Failed to save Waddle' }, { status: 500 });
    return privateJson({ waddle: publicWaddle(waddle) });
  } catch {
    return privateJson({ error: 'Failed to save Waddle' }, { status: 500 });
  }
}
