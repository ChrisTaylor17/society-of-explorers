import { createClient } from '@/lib/supabase/client'
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
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

export async function getSupabaseAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  const supabase = createClient()

  try {
    const { data, error } = await withAuthLookupTimeout(
      withStaleAuthConsoleSuppressed(() => supabase.auth.getSession()),
      'Supabase session lookup',
    )
    if (!error) return data.session?.access_token || null
    if (isStaleSupabaseAuthError(error)) clearSupabaseAuthStorage()
    else console.warn('[auth] Supabase session lookup failed', authErrorMessage(error))
  } catch (error) {
    if (isStaleSupabaseAuthError(error)) clearSupabaseAuthStorage()
    else console.warn('[auth] Supabase session lookup threw', authErrorMessage(error))
  }

  return null
}

export async function getMemberSession() {
  if (typeof window === 'undefined') return null
  const supabase = createClient()

  // Try Supabase email/OAuth session
  const user = await getSupabaseUser(supabase)
  if (user) {
    const { data: member } = await supabase
      .from('members').select('*').eq('supabase_auth_id', user.id).single()
    if (member) return { member, supabase }

    // Auto-create member for OAuth users (Google, etc.)
    try {
      const res = await fetch('/api/auth/ensure-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supabaseAuthId: user.id,
          displayName: user.user_metadata?.full_name || user.user_metadata?.name,
          email: user.email,
        }),
      })
      const data = await res.json()
      if (data.member) return { member: data.member, supabase }
    } catch {}
  }

  // Try cookie first, then localStorage (MetaMask browser blocks cookies)
  const walletId = getCookie(WALLET_STORAGE_KEY) || getWalletStorageHint()
  if (walletId) {
    if (!isMemberId(walletId)) {
      deleteCookie(WALLET_STORAGE_KEY)
      clearWalletStorageHint()
      return null
    }

    const { data: member } = await supabase
      .from('members').select('*').eq('id', walletId).single()
    if (member) return { member, supabase }
    deleteCookie(WALLET_STORAGE_KEY)
    clearWalletStorageHint()
  }

  return null
}

export function setWalletCookie(memberId: string) {
  // The signed wallet session cookie is issued server-side. Keep a localStorage hint
  // for client-only UI checks in browser contexts with inconsistent cookie visibility.
  if (!isMemberId(memberId)) return
  setWalletStorageHint(memberId)
}
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

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? match[2] : null
}

function deleteCookie(name: string) {
  document.cookie = `${name}=;path=/;max-age=0`
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
