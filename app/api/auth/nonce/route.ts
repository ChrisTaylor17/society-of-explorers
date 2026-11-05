import { generateNonce } from 'siwe'
import { privateJson } from '@/lib/http/routeError'
import { SIWE_NONCE_COOKIE, SIWE_NONCE_MAX_AGE_S, signNonce } from '@/lib/auth/siweNonce'
import { NextRequest } from 'next/server'
import { AUTH_INTENT_COOKIE, parseBrowserIntent } from '@/lib/auth/browserIntent'
import { authWriteOriginAllowed } from '@/lib/auth/request'

export async function GET(req: NextRequest) {
  if (!authWriteOriginAllowed(req)) return privateJson({ error: 'Request refused.' }, { status: 403 })
  const intent = parseBrowserIntent(req.headers.get('x-soe-auth-intent'))
  if (!intent || req.cookies.get(AUTH_INTENT_COOKIE)?.value !== intent) return privateJson({ error: 'Start wallet sign-in again.' }, { status: 409 })
  const nonce = generateNonce()
  const signedNonce = await signNonce(nonce, intent)
  if (!signedNonce) {
    return privateJson({ error: 'Wallet sign-in is not configured.' }, { status: 503 })
  }
  const response = privateJson({ nonce, intent })

  response.cookies.set(SIWE_NONCE_COOKIE, signedNonce, {
    httpOnly: true,
    maxAge: SIWE_NONCE_MAX_AGE_S,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })

  return response
}
