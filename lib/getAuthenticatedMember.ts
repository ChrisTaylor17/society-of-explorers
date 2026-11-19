import 'server-only';

import { erasureAllowsAccount } from '@/lib/account/erasure-access';
import { createClient } from '@/lib/supabase/server';
import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { AUTH_PROVIDER_COOKIE } from '@/lib/auth/provider';
import { AUTH_INTENT_COOKIE, AUTH_INTENT_HEADER, AUTH_SELECTION_COOKIE, EXPECTED_MEMBER_HEADER, browserSelectionMatches, parseBrowserIntent, parseBrowserSelection } from '@/lib/auth/browserIntent';
import { isWellFormedUuid, readWalletSession } from '@/lib/auth/walletSession';
import { walletSessionAccess } from '@/lib/auth/walletSessionStore';

const MEMBER_SELECT = 'id, display_name, email, bio, discipline, skills, project_description, seeking, philosophy, exp_tokens, tier, coherence_data, total_responses, supabase_auth_id, wallet_address';
const EDGE_MEMBER_SELECT = 'id,tier,supabase_auth_id,wallet_address';

export interface AuthenticatedMember {
  id: string;
  display_name: string;
  email: string | null;
  bio: string | null;
  discipline: string | null;
  skills: string[] | null;
  project_description: string | null;
  seeking: string | null;
  philosophy: string | null;
  exp_tokens: number;
  tier: string;
  coherence_data: unknown;
  supabase_auth_id: string | null;
  wallet_address: string | null;
}

type MemberIdentity = Pick<AuthenticatedMember, 'id' | 'supabase_auth_id'>;
type EdgeMember = MemberIdentity & { tier: string | null; wallet_address: string | null };
type MemberSession<Member> = {
  memberId: string;
  member: Member;
  auth: { provider: 'supabase' | 'wallet'; subject: string };
};

async function getMemberByColumn<Member extends MemberIdentity>(
  column: 'supabase_auth_id' | 'id',
  value: string,
  projection: string,
): Promise<Member | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('members')
    .select(projection)
    .eq(column, value)
    .single();

  const member = data as MemberIdentity | null;
  if (error || !member || typeof member.id !== 'string' || !isWellFormedUuid(member.id)) return null;
  const owner = member[column];
  if (typeof owner !== 'string' || owner.toLowerCase() !== value.toLowerCase()) return null;
  return member as Member;
}

/**
 * Unified auth helper that works for all three auth methods:
 *   1. Google OAuth / email-password (Supabase session cookie)
 *   2. MetaMask/SIWE (soe_wallet_id cookie)
 *   3. Bearer token in Authorization header
 *
 * Returns the member row or null if unauthenticated.
 */
export function getAuthenticatedMember(req: NextRequest): Promise<MemberSession<AuthenticatedMember> | null> {
  return resolveMember<AuthenticatedMember>(req, MEMBER_SELECT, true);
}

/** These writers accept wallet sessions and exact bearers, with a narrow member projection. */
export async function getAuthenticatedEdgeMember(req: NextRequest): Promise<EdgeMember | null> {
  return (await resolveMember<EdgeMember>(req, EDGE_MEMBER_SELECT, false))?.member ?? null;
}

async function resolveMember<Member extends MemberIdentity>(
  req: NextRequest, projection: string, allowSupabaseCookie: boolean,
): Promise<MemberSession<Member> | null> {
  // A browser logout marker also refuses retained SDK bearer tokens.
  const selected = req.cookies.get(AUTH_PROVIDER_COOKIE)?.value;
  if (selected === 'signed_out') return null;
  const intentValue = req.cookies.get(AUTH_INTENT_COOKIE)?.value;
  const receiptValue = req.cookies.get(AUTH_SELECTION_COOKIE)?.value;
  const matches = (provider: 'supabase' | 'wallet', subject: string) => browserSelectionMatches(intentValue, receiptValue, provider, subject);
  const expectedIntent = req.headers.get(AUTH_INTENT_HEADER);
  if (expectedIntent !== null && (!parseBrowserIntent(expectedIntent) || expectedIntent !== intentValue)) return null;
  const expectedMember = expectedIntent === null ? null : req.headers.get(EXPECTED_MEMBER_HEADER);
  if (expectedMember !== null && !isWellFormedUuid(expectedMember)) return null;
  const matchesMember = (id: string) => expectedMember === null || id.toLowerCase() === expectedMember.toLowerCase();

  // An explicit bearer is one authority choice. Invalid/unprovisioned bearer
  // credentials must never fall through to somebody else's browser cookies.
  const authHeader = req.headers.get('authorization');
  if (authHeader !== null) {
    if (!/^Bearer [^\s]+$/.test(authHeader) || authHeader.length > 16_384) return null;
    const hasBrowserIntent = intentValue !== undefined;
    if (hasBrowserIntent && selected !== 'supabase') return null;
    try {
      const token = authHeader.slice(7);
      const { createClient: createTokenClient } = await import('@supabase/supabase-js');
      const supabaseAuth = createTokenClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
      );
      const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
      if (error || !user || (hasBrowserIntent && !matches('supabase', user.id)) ||
          !await erasureAllowsAccount('supabase', user.id)) return null;
      const member = await getMemberByColumn<Member>('supabase_auth_id', user.id, projection);
      return member && matchesMember(member.id) ? { memberId: member.id, member, auth: { provider: 'supabase' as const, subject: user.id } } : null;
    } catch { return null; }
  }

  // A browser-bound cookie read may discover the member only at the session endpoint.
  if (expectedIntent !== null && expectedMember === null && new URL(req.url).pathname !== '/api/auth/member') return null;
  const intent = parseBrowserIntent(intentValue), receipt = parseBrowserSelection(receiptValue);
  // Legacy cookie-only sessions require a deliberate new sign-in. There is no
  // ambient wallet/Supabase fallback across a missing or mismatched receipt.
  if (!intent || !receipt || receipt.intent !== intent || receipt.provider !== selected) return null;
  const walletIdentity = async () => {
    const wallet = await readWalletSession(req.cookies.get('soe_wallet_id')?.value);
    if (!wallet || !matchesMember(wallet.memberId) || !matches('wallet', wallet.memberId) || !await walletSessionAccess(wallet, 'check') ||
        !await erasureAllowsAccount('wallet', wallet.memberId)) return null;
    const member = await getMemberByColumn<Member>('id', wallet.memberId, projection);
    return member ? { memberId: member.id, member, auth: { provider: 'wallet' as const, subject: member.id } } : null;
  };
  if (selected === 'wallet') return walletIdentity();
  if (!allowSupabaseCookie) return null;

  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (user) {
      if (error || !matches('supabase', user.id) || !await erasureAllowsAccount('supabase', user.id)) return null;
      const member = await getMemberByColumn<Member>('supabase_auth_id', user.id, projection);
      return member && matchesMember(member.id) ? { memberId: member.id, member, auth: { provider: 'supabase' as const, subject: user.id } } : null;
    }
  } catch { return null; }
  return null;
}
