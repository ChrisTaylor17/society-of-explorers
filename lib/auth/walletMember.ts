// Finds or creates the members row for a verified wallet address, deterministically.
//
// Before: `.select('*').eq('wallet_address', lower).single()`. PostgREST's .single() returns no row (with an error)
// when there are 0 OR 2+ matches, and the error was ignored; a checksum/mixed-case stored address was also missed.
// The route then tried to insert, and when the insert failed (unique constraint or other DB error) it had no member
// and answered "Unable to create wallet session." with nothing logged.
//
// Now: exact lowercase match first, then a case-insensitive exact match; with several rows the oldest wins
// (created_at, then id), so the same member is always chosen. Insert errors are logged by code and a concurrent or
// case-variant unique violation re-reads the existing row.
import { isWellFormedUuid } from '@/lib/auth/walletSession';

type Row = { id?: unknown; created_at?: unknown; wallet_address?: unknown; [key: string]: unknown };
type QueryError = { code?: string; message?: string; details?: string };
type QueryResult = { data: unknown; error: QueryError | null; status?: number };

// postgrest-js turns a thrown fetch (DNS failure, refused connection, paused/deleted Supabase project) into
// { error: { code: '', message: 'TypeError: fetch failed', details: '...Caused by: ... (ENOTFOUND)' }, status: 0 }.
// That is an infrastructure outage, not a member/data problem, so it gets its own reason. Only the errno-style
// cause code is kept (never the host, URL or key).
export function classifyDbError(prefix: string, error: QueryError, status?: number): string {
  const code = typeof error.code === 'string' ? error.code : '';
  if (code) return `${prefix}:${code}`;
  const text = `${error.message ?? ''}\n${error.details ?? ''}`;
  const network = status === 0 || /fetch failed|FetchError|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|UND_ERR/i.test(text);
  if (network) {
    const cause = text.match(/\b(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|UND_ERR_[A-Z_]+|ABORT_ERR)\b/);
    return `db_unreachable:${cause ? cause[1] : 'fetch_failed'}`;
  }
  return `${prefix}:unknown`;
}

export function isDbUnreachable(reason: string): boolean {
  return reason.startsWith('db_unreachable');
}

export type WalletMemberResult =
  | { member: Row & { id: string }; created: boolean; duplicates: number }
  | { member: null; reason: string };

// Minimal structural type for the Supabase service client (keeps this testable).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = { from: (table: string) => any };

function pickOldest(rows: Row[]): Row | null {
  if (!rows.length) return null;
  return [...rows].sort((a, b) => {
    const ca = typeof a.created_at === 'string' ? a.created_at : '';
    const cb = typeof b.created_at === 'string' ? b.created_at : '';
    if (ca !== cb) return ca < cb ? -1 : 1;
    return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
  })[0];
}

async function lookup(supabase: SupabaseLike, address: string): Promise<{ rows: Row[]; error?: string }> {
  const exact: QueryResult = await supabase.from('members').select('*').eq('wallet_address', address).limit(25);
  if (exact.error) return { rows: [], error: classifyDbError('lookup_failed', exact.error, exact.status) };
  const exactRows = Array.isArray(exact.data) ? (exact.data as Row[]) : [];
  if (exactRows.length) return { rows: exactRows };
  // Hex address: no LIKE wildcards possible, so ilike is a case-insensitive exact match.
  const ci: QueryResult = await supabase.from('members').select('*').ilike('wallet_address', address).limit(25);
  if (ci.error) return { rows: [], error: classifyDbError('lookup_ci_failed', ci.error, ci.status) };
  return { rows: Array.isArray(ci.data) ? (ci.data as Row[]) : [] };
}

function accept(row: Row | null, created: boolean, duplicates: number): WalletMemberResult {
  if (!row || typeof row.id !== 'string' || !row.id) return { member: null, reason: 'member_without_id' };
  if (!isWellFormedUuid(row.id)) return { member: null, reason: 'member_id_not_uuid' };
  return { member: row as Row & { id: string }, created, duplicates };
}

export async function findOrCreateWalletMember(supabase: SupabaseLike, walletAddress: string): Promise<WalletMemberResult> {
  const address = walletAddress.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) return { member: null, reason: 'invalid_address' };

  const found = await lookup(supabase, address);
  if (found.error) return { member: null, reason: found.error };
  if (found.rows.length) return accept(pickOldest(found.rows), false, found.rows.length);

  const inserted: QueryResult = await supabase.from('members')
    .insert({ wallet_address: address, display_name: `${address.slice(0, 6)}…${address.slice(-4)}`, exp_tokens: 10 })
    .select()
    .maybeSingle();
  if (inserted.error) {
    if (inserted.error.code === '23505') {
      const again = await lookup(supabase, address);
      if (again.rows.length) return accept(pickOldest(again.rows), false, again.rows.length);
    }
    return { member: null, reason: classifyDbError('insert_failed', inserted.error, inserted.status) };
  }
  return accept((inserted.data as Row | null) ?? null, true, 0);
}
