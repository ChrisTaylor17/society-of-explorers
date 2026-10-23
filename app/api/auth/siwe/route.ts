import { SiweMessage } from 'siwe'
import { createServiceClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'
import { createWalletSessionValue } from '@/lib/auth/walletSession'
import { privateJson } from '@/lib/http/routeError'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown SIWE error'
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

  const nonce = req.cookies.get('soe_siwe_nonce')?.value

  try {
    if (!nonce) {
      return privateJson({ error: 'Sign-in nonce missing or expired.' }, { status: 400 })
    }

    const siweMessage = new SiweMessage(message)
    const domain =
      req.headers.get('x-forwarded-host') ||
      req.headers.get('host') ||
      undefined
    const { success, data } = await siweMessage.verify({ signature, nonce, domain })
    if (!success) return privateJson({ error: 'Invalid signature' }, { status: 401 })

    const normalizedAddress = (data.address || address).toLowerCase()
    const supabase = createServiceClient()

    const { data: existing } = await supabase.from('members')
      .select('*').eq('wallet_address', normalizedAddress).single()

    let member = existing
    if (!member) {
      const { data: newMember } = await supabase.from('members')
        .insert({ wallet_address: normalizedAddress, display_name: `${normalizedAddress.slice(0,6)}…${normalizedAddress.slice(-4)}`, exp_tokens: 10 })
        .select().single()
      member = newMember
    }

    const walletSession = await createWalletSessionValue(member.id)
    if (!walletSession) {
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
    res.cookies.set('soe_siwe_nonce', '', {
      httpOnly: true,
      maxAge: 0,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
    return res
  } catch (error: unknown) {
    const message = errorMessage(error)
    console.error('SIWE error:', message)
    const response = privateJson({ error: message }, { status: 400 })
    response.cookies.set('soe_siwe_nonce', '', {
      httpOnly: true,
      maxAge: 0,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
    return response
  }
}
