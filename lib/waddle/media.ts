import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { isUuid } from '@/lib/ids/uuid';

export const WADDLE_BUCKET = 'waddles';
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const WADDLE_AUDIO_MIME = 'audio/webm';

export async function hasPrivateWaddleBucket(storage: SupabaseClient['storage']) {
  const { data, error } = await storage.getBucket(WADDLE_BUCKET);
  return !error && data?.id === WADDLE_BUCKET && data.public === false;
}

export function waddleAudioObject(value: unknown, memberId: unknown): string | null {
  if (typeof value !== 'string' || !isUuid(memberId)) return null;
  let key = value;
  if (value.startsWith('https://') || value.startsWith('http://')) {
    const project = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!project) return null;
    const prefix = new URL(`/storage/v1/object/public/${WADDLE_BUCKET}/`, project).href;
    if (!value.startsWith(prefix)) return null;
    key = value.slice(prefix.length);
  }

  // The older uploader used a timestamp alone. Current uploads add a random UUID.
  const [owner, file, ...extra] = key.split('/');
  if (owner !== memberId || !file || extra.length) return null;
  const match = /^\d{13}(?:-([a-f0-9-]{36}))?\.webm$/.exec(file);
  return match && (!match[1] || isUuid(match[1])) && match[0] === file ? key : null;
}

export function waddleAudioHref(id: unknown, stored: unknown, memberId: unknown): string | null {
  return isUuid(id) && waddleAudioObject(stored, memberId) ? `/api/waddle/${id}/audio` : null;
}
