import { SiweMessage } from 'siwe'
import { createServiceClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'
import { createWalletSessionValue, readWalletSession, signWithWalletSessionSecret } from '@/lib/auth/walletSession'
import { walletSessionAccess } from '@/lib/auth/walletSessionStore'
import { privateJson } from '@/lib/http/routeError'
import { SIWE_NONCE_COOKIE, verifyNonceCookie } from '@/lib/auth/siweNonce'
import { selectAuthProvider } from '@/lib/auth/provider'
import { canonicalizeSignature, shortAddress } from '@/lib/auth/siweSignature'
import { findOrCreateWalletMember, isDbUnreachable } from '@/lib/auth/walletMember'
import { AUTH_INTENT_COOKIE, parseBrowserIntent } from '@/lib/auth/browserIntent'
import { authWriteOriginAllowed, readAuthJson, requestOrigin } from '@/lib/auth/request'

// siwe rejects with a SiweResponse ({ success, error: SiweError { type } }), not an Error.
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  const type = (error as { error?: { type?: unknown } } | null)?.error?.type
  return typeof type === 'string' ? type : 'Unknown SIWE error'
}

// Server-side reason only; the client gets a generic message. No signatures, secrets or full addresses.
function logFailure(reason: string, address: string | null, extra: Record<string, unknown> = {}) {
  console.error('[siwe] sign-in failed', JSON.stringify({ reason, wallet: shortAddress(address), ...extra }))
}

export async function POST(req: NextRequest) {
  if (!authWriteOriginAllowed(req)) return privateJson({ error: 'Request refused.' }, { status: 403 })
  const body = await readAuthJson(req)
  if (!body || Object.keys(body).sort().join(',') !== 'address,intent,message,signature') return privateJson({ error: 'Invalid sign-in request.' }, { status: 400 })
  const intent = parseBrowserIntent(body.intent)
  if (!intent || req.cookies.get(AUTH_INTENT_COOKIE)?.value !== intent) return privateJson({ error: 'Start wallet sign-in again.' }, { status: 409 })

  const message = typeof body.message === 'string' ? body.message : null
  const signature = typeof body.signature === 'string' ? body.signature : null
  const address = typeof body.address === 'string' ? body.address : null

  if (!message || message.length > 2048 || !signature || signature.length > 512 || !address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return privateJson({ error: 'message, signature, and address are required' }, { status: 400 })
  }

  const challenge = await verifyNonceCookie(req.cookies.get(SIWE_NONCE_COOKIE)?.value, intent)

  try {
    if (!challenge) {
      return privateJson({ error: 'Sign-in nonce missing or expired.' }, { status: 400 })
    }

    const siweMessage = new SiweMessage(message)
    const origin = requestOrigin(new URL(req.url), req.headers)
    if (siweMessage.uri !== origin || siweMessage.address.toLowerCase() !== address.toLowerCase()) {
      return privateJson({ error: 'Invalid wallet sign-in request.' }, { status: 400 })
    }
    const domain = new URL(origin).host
    const canonical = canonicalizeSignature(signature)
    let verified: Awaited<ReturnType<typeof siweMessage.verify>>
    try {
      verified = await siweMessage.verify({ signature: canonical.signature, nonce: challenge.nonce, domain })
    } catch (verifyError: unknown) {
      logFailure(`verify_rejected:${errorMessage(verifyError)}`, address, { signatureShape: canonical.shape, signatureLength: signature.length })
      const rejected = privateJson({ error: 'Invalid signature. Please try again.' }, { status: 401 })
      rejected.cookies.set(SIWE_NONCE_COOKIE, '', {
        httpOnly: true,
        maxAge: 0,
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      })
      return rejected
    }
    const { success, data } = verified
    if (!success) {
      logFailure('verify_unsuccessful', address, { signatureShape: canonical.shape })
      return privateJson({ error: 'Invalid signature' }, { status: 401 })
    }

    const normalizedAddress = (data.address || address).toLowerCase()
    let supabase: ReturnType<typeof createServiceClient>
    try {
      const digest = await signWithWalletSessionSecret(`siwe-consume|${challenge.nonce}`)
      if (!digest) throw new Error('Wallet challenge digest unavailable')
      supabase = createServiceClient()
      const { data: consumed, error } = await supabase
        .rpc('soe_wallet_challenge_consume', { p_digest: digest, p_expires_at: challenge.expiresAt })
        .abortSignal(AbortSignal.timeout(5000))
      if (error || typeof consumed !== 'boolean') throw new Error('Wallet challenge store unavailable')
      if (!consumed) return privateJson({ error: 'Start wallet sign-in again.' }, { status: 409 })
    } catch {
      logFailure('challenge_store_unavailable', normalizedAddress)
      return privateJson({ error: 'Sign-in is temporarily unavailable. Please try again later.' }, { status: 503 })
    }

    const found = await findOrCreateWalletMember(supabase, normalizedAddress)
    if (!found.member) {
      logFailure(found.reason, normalizedAddress)
      if (isDbUnreachable(found.reason)) {
        // The signature was fine; the member database could not be reached. Say so generically (no internals).
        return privateJson({ error: 'Sign-in is temporarily unavailable. Please try again later.' }, { status: 503 })
      }
      return privateJson({ error: 'Unable to create wallet session.' }, { status: 500 })
    }
    const member = found.member
    if (found.duplicates > 1) {
      console.warn('[siwe] duplicate member rows for wallet; using the oldest', JSON.stringify({ wallet: shortAddress(normalizedAddress), rows: found.duplicates }))
    }
    const walletSession = await createWalletSessionValue(member.id)
    if (!walletSession) {
      logFailure('session_value_null', normalizedAddress)
      return privateJson({ error: 'Unable to create wallet session.' }, { status: 500 })
    }
    const next = await readWalletSession(walletSession)
    const previous = await readWalletSession(req.cookies.get('soe_wallet_id')?.value)
    if (!next || !await walletSessionAccess(next, 'check') ||
        (previous && !await walletSessionAccess(previous, 'revoke'))) {
      logFailure('wallet_session_store_unavailable', normalizedAddress)
      return privateJson({ error: 'Sign-in is temporarily unavailable. Please try again later.' }, { status: 503 })
    }

    // Set cookie server-side — server Set-Cookie headers are honored by MetaMask's
    // WKWebView on iOS where document.cookie writes can be silently blocked
    const res = privateJson({ verified: true, member: { id: member.id }, intent })
    selectAuthProvider(res, 'wallet', intent, member.id)
    res.cookies.set('soe_wallet_id', walletSession, {
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
      httpOnly: true,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
    res.cookies.set(SIWE_NONCE_COOKIE, '', {
      httpOnly: true,
      maxAge: 0,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
    return res
  } catch (error: unknown) {
    logFailure(`unexpected:${errorMessage(error)}`, address)
    // Don't echo library/database error text to the client.
    const response = privateJson({ error: 'Sign-in failed. Please request a new nonce and try again.' }, { status: 400 })
    response.cookies.set(SIWE_NONCE_COOKIE, '', {
      httpOnly: true,
      maxAge: 0,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
    return response
  }
}
