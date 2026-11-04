import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { authWriteOriginAllowed } from '@/lib/auth/request';
import { OWNER_PROFILE_SELECT, ownerProfileFromRow, parseProfileMutation } from '@/lib/members/profile';

const unavailable = () => privateJson({ error: 'Profile is temporarily unavailable. Reload before saving.' }, { status: 503 });
const MAX_BODY_BYTES = 65_536;
async function readProfileJson(req: Request): Promise<unknown> {
  if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return null;
  const length = req.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) return null;
  if (!req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = []; let bytes = 0; let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const expired = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Profile body deadline')), 5000); });
    for (;;) {
      const part = await Promise.race([reader.read(), expired]);
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_BODY_BYTES) return null;
      chunks.push(part.value);
    }
    const combined = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(combined));
  } catch { return null; }
  finally { if (timer) clearTimeout(timer); void reader.cancel().catch(() => {}); }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });
    const { data, error } = await getSupabaseAdmin().from('members').select(OWNER_PROFILE_SELECT).eq('id', auth.memberId).single();
    const profile = !error ? ownerProfileFromRow(data) : null;
    if (!profile || profile.memberId !== auth.memberId.toLowerCase()) return unavailable();
    return privateJson(profile);
  } catch { return unavailable(); }
}

export async function POST(req: NextRequest) {
  if (!authWriteOriginAllowed(req)) return privateJson({ error: 'Request refused.' }, { status: 403 });
  try {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });
    const mutation = parseProfileMutation(await readProfileJson(req));
    if (!mutation) return privateJson({ error: 'Use the current profile form and valid fields.' }, { status: 400 });
    // Bind the draft to its original verified owner before any mutation. An A
    // draft must not become a B edit when both happen to have revision zero.
    if (mutation.expectedMemberId !== auth.memberId.toLowerCase()) {
      return privateJson({ error: 'Account changed. Reload the profile before saving.' }, { status: 409 });
    }
    const { data, error } = await getSupabaseAdmin().rpc('soe_member_profile_update', {
      p_actor: auth.memberId, p_expected_revision: mutation.expectedRevision, p_patch: mutation.patch,
    });
    if (error?.code === 'PT409') return privateJson({ error: 'Profile changed. Reload before saving.' }, { status: 409 });
    const profile = !error ? ownerProfileFromRow(data) : null;
    if (!profile || profile.memberId !== auth.memberId.toLowerCase() || profile.revision < mutation.expectedRevision ||
        profile.revision > mutation.expectedRevision + 1) return unavailable();
    return privateJson(profile);
  } catch { return unavailable(); }
}
