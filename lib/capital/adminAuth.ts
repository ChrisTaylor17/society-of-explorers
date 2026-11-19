import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export function allowedCapitalAdminEmails(): Set<string> {
  const raw = process.env.SOE_ADMIN_EMAILS || 'chris@societyofexplorers.com,christaylor17@gmail.com';
  return new Set(raw.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));
}

export function allowedCapitalAdminWallets(): Set<string> {
  const raw = process.env.SOE_ADMIN_WALLETS || process.env.SOE_ADMIN_WALLET_ADDRESSES || '';
  return new Set(raw.split(',').map(normalizeWalletAddress).filter(Boolean) as string[]);
}

export async function requireCapitalAdmin(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return null;

  const walletAddress = normalizeWalletAddress(auth.member.wallet_address);
  if (walletAddress && allowedCapitalAdminWallets().has(walletAddress)) {
    return { ...auth, email: null, walletAddress, adminMethod: 'wallet_allowlist' as const };
  }

  if (walletAddress && isLocalWalletAdminRequest(req)) {
    return { ...auth, email: null, walletAddress, adminMethod: 'local_wallet' as const };
  }

  if (!auth.member.supabase_auth_id) return null;

  const supabase = getSupabaseAdmin();
  const { data } = await supabase.auth.admin.getUserById(auth.member.supabase_auth_id);
  const email = data.user?.email?.toLowerCase();
  if (!email || !allowedCapitalAdminEmails().has(email)) return null;

  return { ...auth, email, walletAddress, adminMethod: 'email_allowlist' as const };
}

function normalizeWalletAddress(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() || '';
  return /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : null;
}

function isLocalWalletAdminRequest(req: NextRequest): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (process.env.SOE_DISABLE_LOCAL_WALLET_ADMIN === 'true') return false;

  const hostname = req.nextUrl.hostname.toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}
