import { generateNonce } from 'siwe'
import { privateJson } from '@/lib/http/routeError'
import { SIWE_NONCE_COOKIE, SIWE_NONCE_MAX_AGE_S, signNonce } from '@/lib/auth/siweNonce'

export async function GET() {
  const nonce = generateNonce()
  const signedNonce = await signNonce(nonce)
  if (!signedNonce) {
    return privateJson({ error: 'Wallet sign-in is not configured.' }, { status: 503 })
  }
  const response = privateJson({ nonce })

  response.cookies.set(SIWE_NONCE_COOKIE, signedNonce, {
    httpOnly: true,
    maxAge: SIWE_NONCE_MAX_AGE_S,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })

  return response
}
