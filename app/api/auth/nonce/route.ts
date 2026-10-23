import { generateNonce } from 'siwe'
import { privateJson } from '@/lib/http/routeError'

export async function GET() {
  const nonce = generateNonce()
  const response = privateJson({ nonce })

  response.cookies.set('soe_siwe_nonce', nonce, {
    httpOnly: true,
    maxAge: 60 * 10,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })

  return response
}
