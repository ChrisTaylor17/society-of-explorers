import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') || '/salon'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error('OAuth code exchange failed:', error)
      return NextResponse.redirect(new URL('/?auth_error=true', origin))
    }
    return NextResponse.redirect(new URL(next, origin))
  }

  // No code — redirect home
  return NextResponse.redirect(new URL('/', origin))
}
