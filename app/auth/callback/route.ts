import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') || '/salon'

  console.log('Auth callback:', { hasCode: !!code, next, url: req.url })

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error('OAuth code exchange failed:', error)
      return NextResponse.redirect(new URL('/?auth_error=true', origin))
    }
    console.log('OAuth code exchanged successfully, redirecting to:', next)
    // Always redirect to /salon after successful auth
    return NextResponse.redirect(new URL('/salon', origin))
  }

  // No code — check if this is a hash-based callback (implicit flow)
  // Supabase sometimes uses hash fragments instead of query params
  return NextResponse.redirect(new URL('/salon', origin))
}
