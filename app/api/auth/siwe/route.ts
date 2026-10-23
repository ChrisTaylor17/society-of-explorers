import { SiweMessage } from 'siwe'
import { createServiceClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'
import { createWalletSessionValue } from '@/lib/auth/walletSession'
import { privateJson } from '@/lib/http/routeError'
import { SIWE_NONCE_COOKIE, verifyNonceCookie } from '@/lib/auth/siweNonce'
import { canonicalizeSignature, shortAddress } from '@/lib/auth/siweSignature'
import { findOrCreateWalletMember, isDbUnreachable } from '@/lib/auth/walletMember'

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
  let body: { message?: unknown; signature?: unknown; address?: unknown }

  try {
    body = (await req.json()) as { message?: unknown; signature?: unknown; address?: unknown }
  } catch {
    return privateJson({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const message = typeof body.message === 'string' ? body.message : null
  const signature = typeof body.signature === 'string' ? body.signature : null
  const address = typeof body.address === 'string' ? body.address : null

  if (!message || !signature || !address) {
    return privateJson({ error: 'message, signature, and address are required' }, { status: 400 })
  }

  // S3: only a nonce this server signed (and that has not expired) is accepted.
  const nonce = await verifyNonceCookie(req.cookies.get(SIWE_NONCE_COOKIE)?.value)

  try {
    if (!nonce) {
      return privateJson({ error: 'Sign-in nonce missing or expired.' }, { status: 400 })
    }

    const siweMessage = new SiweMessage(message)
    const domain =
      req.headers.get('x-forwarded-host') ||
      req.headers.get('host') ||
      undefined
    const canonical = canonicalizeSignature(signature)
    let verified: Awaited<ReturnType<typeof siweMessage.verify>>
    try {
      verified = await siweMessage.verify({ signature: canonical.signature, nonce, domain })
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
    const supabase = createServiceClient()

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

    // Set cookie server-side — server Set-Cookie headers are honored by MetaMask's
    // WKWebView on iOS where document.cookie writes can be silently blocked
    const res = privateJson({ verified: true, member })
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
