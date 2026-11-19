import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { parseDeletionCode, parseDeletionOwner, parseDeletionReceipt, sameDeletionOwner, type DeletionOwner } from '@/lib/account/deletion-contract';
import { deletionReviewDays } from '@/lib/account/deletion-config';
import { AUTH_INTENT_COOKIE, AUTH_SELECTION_COOKIE, browserSelectionMatches } from '@/lib/auth/browserIntent';
import { AUTH_PROVIDER_COOKIE } from '@/lib/auth/provider';
import { readAuthJson, requestOrigin } from '@/lib/auth/request';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

type WebsiteAccount = { owner: DeletionOwner; label: string };

function accountLabel(value: unknown, fallback: string) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 254) || fallback : fallback;
}

async function websiteAccount(req: NextRequest): Promise<WebsiteAccount | null> {
  if (req.headers.has('authorization')) return null;
  const provider = req.cookies.get(AUTH_PROVIDER_COOKIE)?.value;
  if (provider === 'wallet') {
    const session = await getAuthenticatedMember(req);
    const owner = parseDeletionOwner(session?.auth);
    return session && owner?.provider === 'wallet' ? { owner, label: accountLabel(session.member.wallet_address, 'Your wallet account') } : null;
  }
  if (provider !== 'supabase') return null;
  const intent = req.cookies.get(AUTH_INTENT_COOKIE)?.value;
  const selection = req.cookies.get(AUTH_SELECTION_COOKIE)?.value;
  if (!intent || !selection) return null;
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  const owner = parseDeletionOwner({ provider, subject: user?.id });
  return user && !error && owner && browserSelectionMatches(intent, selection, provider, owner.subject)
    ? { owner, label: accountLabel(user.email, 'Your signed-in account') } : null;
}

function error(status: number, message: string) {
  return privateJson({ error: message }, { status });
}

const unavailable = () => error(503, 'Account deletion requests are temporarily unavailable.');
const signIn = () => error(401, 'Sign in on this website to check your account.');
const receiptMissing = () => error(404, 'No deletion request matched that status code.');

function sameOrigin(req: NextRequest) {
  const fetchSite = req.headers.get('sec-fetch-site');
  return (fetchSite === null || fetchSite === 'same-origin') && req.headers.get('origin') === requestOrigin(new URL(req.url), req.headers);
}

function ownerParams(owner: DeletionOwner) {
  return { p_provider: owner.provider, p_subject: owner.subject };
}

const progressRoutines = {
  soe_account_deletion_owner_state: 'soe_account_deletion_owner_progress',
  soe_account_deletion_request: 'soe_account_deletion_request_progress',
  soe_account_deletion_status: 'soe_account_deletion_status_progress',
} as const;

async function readReceipt(name: keyof typeof progressRoutines, params: Record<string, unknown>) {
  const db = getSupabaseAdmin(), progressName = progressRoutines[name];
  const result = await db.rpc(progressName, params).maybeSingle();
  // An absent optional progress routine can use the old receipt, whose
  // processing state stays unknown. Other failures do not replay a request.
  return result.error?.code === 'PGRST202' && typeof result.error.message === 'string'
    && result.error.message.startsWith(`Could not find the function public.${progressName}(`)
    ? db.rpc(name, params).maybeSingle() : result;
}

export async function GET(req: NextRequest) {
  if (new URL(req.url).search || req.headers.get('sec-fetch-site') === 'cross-site' || req.headers.get('sec-fetch-site') === 'same-site') {
    return error(403, 'Open account deletion directly on this website.');
  }
  try {
    const account = await websiteAccount(req);
    if (!account) return signIn();
    const result = await readReceipt('soe_account_deletion_owner_state', ownerParams(account.owner));
    const request = parseDeletionReceipt(result.data);
    if (result.error || (result.data !== null && !request)) return unavailable();
    return privateJson({ ...account, reviewDays: deletionReviewDays(), request });
  } catch {
    return unavailable();
  }
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req) || new URL(req.url).search || req.headers.has('authorization')) {
    return error(403, 'Open account deletion directly on this website.');
  }
  const body = await readAuthJson(req);
  const code = parseDeletionCode(body?.code);
  if (!body || !code) return error(400, 'Enter the complete status code.');
  const params = { p_request_id: code.id, p_receipt_hash: createHash('sha256').update(code.secret).digest('hex') };
  try {
    if (body.action === 'status' && Object.keys(body).length === 2) {
      const result = await readReceipt('soe_account_deletion_status', params);
      if (result.error) return unavailable();
      if (result.data === null) return receiptMissing();
      const receipt = parseDeletionReceipt(result.data);
      return receipt?.id === code.id ? privateJson({ request: receipt }) : unavailable();
    }
    if (body.action !== 'request' || body.confirmation !== 'DELETE' || Object.keys(body).length !== 4) {
      return error(400, 'Confirm the account deletion request.');
    }
    const expected = parseDeletionOwner(body.owner);
    if (!expected) return error(400, 'Check your account before submitting.');
    const account = await websiteAccount(req);
    if (!account) return signIn();
    if (!sameDeletionOwner(expected, account.owner)) return error(409, 'Your sign-in changed. Check the account again.');
    const days = deletionReviewDays();
    if (days === null) return unavailable();
    const result = await readReceipt('soe_account_deletion_request', {
      ...ownerParams(account.owner), ...params, p_review_days: days,
    });
    if (result.error?.code === 'PT409') return error(409, 'A deletion request is already pending or the code is unavailable. Check your account.');
    const receipt = parseDeletionReceipt(result.data);
    return !result.error && receipt?.id === code.id ? privateJson({ request: receipt }) : unavailable();
  } catch {
    return unavailable();
  }
}
