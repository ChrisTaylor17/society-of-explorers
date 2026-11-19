// Find the member a Stripe payment belongs to without loading every auth user
// into memory. Order: explicit member id we put on the session -> stored Stripe
// customer id -> Supabase auth email (paged through all users, not just page 1).
import type { SupabaseClient } from '@supabase/supabase-js';
import { isUuid } from '@/lib/ids/uuid';

export const AUTH_USERS_PER_PAGE = 1000;
export const AUTH_USERS_MAX_PAGES = 200; // 200k users; fail loudly rather than loop forever

export interface MemberRow {
  id: string;
  tier: string | null;
}

export interface MemberTarget {
  memberId?: string | null;
  customerId?: string | null;
  email?: string | null;
}

export type MemberMatch = { rows: MemberRow[]; via: 'member_id' | 'customer_id' | 'auth_email' };

export async function findAuthUserIdByEmail(
  supabase: SupabaseClient,
  email: string,
  opts: { perPage?: number; maxPages?: number } = {},
): Promise<string | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;
  const perPage = opts.perPage ?? AUTH_USERS_PER_PAGE;
  const maxPages = opts.maxPages ?? AUTH_USERS_MAX_PAGES;
  for (let page = 1; page <= maxPages; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error('Membership auth lookup failed');
    const users = data?.users ?? [];
    const hit = users.find((u) => u.email?.trim().toLowerCase() === target);
    if (hit) return hit.id;
    const nextPage = (data as { nextPage?: number | null } | null)?.nextPage;
    if (users.length < perPage || nextPage === null) return null;
  }
  throw new Error('Membership auth lookup exceeded page limit');
}

async function selectMembers(supabase: SupabaseClient, column: string, value: string): Promise<MemberRow[]> {
  const { data, error } = await supabase.from('members').select('id, tier').eq(column, value);
  if (error) throw new Error('Membership member lookup failed');
  return (data as MemberRow[] | null) ?? [];
}

export async function findMembersForPayment(supabase: SupabaseClient, target: MemberTarget): Promise<MemberMatch | null> {
  if (target.memberId && isUuid(target.memberId)) {
    const rows = await selectMembers(supabase, 'id', target.memberId);
    if (rows.length) return { rows, via: 'member_id' };
  }
  if (target.customerId) {
    const rows = await selectMembers(supabase, 'stripe_customer_id', target.customerId);
    if (rows.length) return { rows, via: 'customer_id' };
  }
  if (target.email) {
    const authId = await findAuthUserIdByEmail(supabase, target.email);
    if (authId) {
      const rows = await selectMembers(supabase, 'supabase_auth_id', authId);
      if (rows.length) return { rows, via: 'auth_email' };
    }
  }
  return null;
}
