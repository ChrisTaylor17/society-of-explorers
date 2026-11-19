import { circleHeaders } from '@/lib/circles/client';
import { memberSessionDto } from '@/lib/auth/memberDto';

/** Resolve the canonical member with the credentials used by this operation.
 * Session display hints and an earlier successful request are never authority. */
export async function readingOwner(signal: AbortSignal, current: () => boolean) {
  const headers = new Headers(await circleHeaders());
  if (!current()) throw new Error('Reading operation retired');
  const response = await fetch('/api/auth/member', {
    headers, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal,
  });
  if (!current() || !response.ok) throw new Error('Member check unavailable');
  const value = await response.json();
  const member = memberSessionDto(value?.member), auth = value?.auth;
  if (!current() || !member || !auth || !['supabase', 'wallet'].includes(auth.provider)
    || typeof auth.subject !== 'string' || !auth.subject || member.id !== member.id.toLowerCase()) {
    throw new Error('Member check unavailable');
  }
  return { memberId: member.id, headers };
}
