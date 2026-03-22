import { SiweMessage } from 'siwe'
import { createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { message, signature, address } = await req.json()
  try {
    const siweMessage = new SiweMessage(message)
    const { success, data } = await siweMessage.verify({ signature })
    if (!success) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })

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

    // Set cookie server-side — server Set-Cookie headers are honored by MetaMask's
    // WKWebView on iOS where document.cookie writes can be silently blocked
    const res = NextResponse.json({ verified: true, member })
    res.cookies.set('soe_wallet_id', member.id, {
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
      sameSite: 'none',
      secure: true,
    })
    return res
  } catch(e:any) {
    console.error('SIWE error:', e.message)
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
