import { createClient } from '@/lib/supabase/client'
import { memberSessionDto } from '@/lib/auth/memberDto'
import {
  isAuthSessionMissingError,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js'
import {
  authErrorMessage,
  clearSupabaseAuthStorage,
  isStaleSupabaseAuthError,
  withStaleAuthConsoleSuppressed,
} from '@/lib/auth/staleSupabaseAuth'

const AUTH_LOOKUP_TIMEOUT_MS = 5_000
const WALLET_STORAGE_KEY = 'soe_wallet_id'
// Any well-formed hex UUID, matching lib/auth/walletSession.ts (member ids are not guaranteed to be v1-5).
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function withAuthLookupTimeout<T>(operation: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), AUTH_LOOKUP_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function getSupabaseUser(supabase: SupabaseClient): Promise<User | null> {
  try {
    const { data, error } = await withAuthLookupTimeout(
      withStaleAuthConsoleSuppressed(() => supabase.auth.getUser()),
      'Supabase user lookup',
    )
    if (!error) return data.user
    if (isAuthSessionMissingError(error)) return null

    if (isStaleSupabaseAuthError(error)) {
      clearSupabaseAuthStorage()
      return null
    }

    console.warn('[auth] Supabase user lookup failed', authErrorMessage(error))
  } catch (error) {
    if (isAuthSessionMissingError(error)) return null
    if (isStaleSupabaseAuthError(error)) clearSupabaseAuthStorage()
    else console.warn('[auth] Supabase user lookup threw', authErrorMessage(error))
  }

  return null
}

async function selectedMemberProof() {
  const response = await withAuthLookupTimeout(fetch('/api/auth/member', {
    credentials: 'same-origin', cache: 'no-store',
  }), 'Member authority check')
  if (response.status === 401) {
    const denied = await response.json()
    if (denied?.session === 'signed_out') return null
    throw new Error('Member authority unavailable')
  }
  if (!response.ok) throw new Error('Member authority unavailable')
  const result = await response.json()
  const member = memberSessionDto(result.member)
  const auth = result.auth
  if (!member || !auth || (auth.provider !== 'supabase' && auth.provider !== 'wallet') ||
      typeof auth.subject !== 'string' || !auth.subject) throw new Error('Member authority unavailable')
  return { memberId: member.id, provider: auth.provider as 'supabase' | 'wallet', subject: auth.subject as string }
}

export async function getSupabaseAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  const selected = await selectedMemberProof()
  if (!selected || selected.provider === 'wallet') return null
  const supabase = createClient()
  const { data, error } = await withAuthLookupTimeout(
    withStaleAuthConsoleSuppressed(() => supabase.auth.getSession()), 'Supabase session lookup',
  )
  const token = !error ? data.session?.access_token : null
  if (!token) throw new Error('Selected sign-in unavailable')
  const verified = await withAuthLookupTimeout(
    withStaleAuthConsoleSuppressed(() => supabase.auth.getUser(token)), 'Selected identity verification',
  )
  if (verified.error || verified.data.user?.id !== selected.subject) throw new Error('Selected sign-in changed')
  const current = await selectedMemberProof()
  if (!current || current.provider !== selected.provider || current.subject !== selected.subject ||
      current.memberId !== selected.memberId) throw new Error('Selected sign-in changed')
  return token
}

export async function getMemberSession(onWalletSignOutPending?: () => void) {
  if (typeof window === 'undefined') return null

  // Display hints and anonymous table reads cannot establish a session. The
  // private endpoint verifies the actual cookie/token and returns a whitelist.
  try {
    const res = await withAuthLookupTimeout(fetch('/api/auth/member', {
      credentials: 'same-origin', cache: 'no-store',
    }), 'Member session lookup')
    if (res.ok) {
      const member = memberSessionDto((await res.json()).member)
      if (member) return { member, supabase: createClient() }
      return null
    }
    if (res.status !== 401) return null
    const denied = await res.json().catch(() => null)
    if (denied?.browserSignedOut === true) {
      if (denied.walletSignOutPending === true) onWalletSignOutPending?.()
      return null
    }
    const supabase = createClient()
    const user = await getSupabaseUser(supabase)
    if (!user) return null
    const ensured = await withAuthLookupTimeout(fetch('/api/auth/ensure-member', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supabaseAuthId: user.id,
        displayName: user.user_metadata?.full_name || user.user_metadata?.name || 'Explorer' }),
    }), 'Member setup')
    if (!ensured.ok) return null
    const member = memberSessionDto((await ensured.json()).member)
    if (member) return { member, supabase }
  } catch {}

  return null
}

export function setWalletCookie(memberId: string) {
  // The signed wallet session cookie is issued server-side. Keep a localStorage hint
  // for client-only UI checks in browser contexts with inconsistent cookie visibility.
  if (!isMemberId(memberId)) return
  setWalletStorageHint(memberId)
}
// Compatibility helpers clear display hints only. Browser sign-out must use
// the verified server logout flow; JavaScript cannot clear an httpOnly session.
export function clearWalletStorage() {
  try { document.cookie = `${WALLET_STORAGE_KEY}=;path=/;max-age=0` } catch {}
  clearWalletStorageHint()
}

export function clearWalletCookie() {
  try { document.cookie = `${WALLET_STORAGE_KEY}=;path=/;max-age=0` } catch {}
  clearWalletStorageHint()
}

export function getWalletStorageHint(): string | null {
  if (typeof window === 'undefined') return null

  try {
    const walletId = window.localStorage.getItem(WALLET_STORAGE_KEY)
    if (!walletId) return null
    if (isMemberId(walletId)) return walletId

    window.localStorage.removeItem(WALLET_STORAGE_KEY)
    return null
  } catch {
    return null
  }
}

function setWalletStorageHint(memberId: string) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(WALLET_STORAGE_KEY, memberId)
  } catch {}
}

function clearWalletStorageHint() {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.removeItem(WALLET_STORAGE_KEY)
  } catch {}
}

function isMemberId(value: string): boolean {
  return UUID_PATTERN.test(value)
}
