import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')

  console.log('=== AUTH CALLBACK HIT ===', {
    fullUrl: req.url,
    code: code ? code.substring(0, 10) + '...' : 'none',
    incomingCookies: req.cookies.getAll().map(c => c.name),
  })

  if (code) {
    // Create the redirect response FIRST, then set cookies ON it
    const response = NextResponse.redirect(new URL('/salon', origin))

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll()
          },
          setAll(cookiesToSet) {
            // Set cookies on the response object — this is the key fix.
            // Using cookies() from next/headers silently fails in Route Handlers
            // because the response has already started streaming.
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options)
            })
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error('OAuth code exchange failed:', error)
      return NextResponse.redirect(new URL('/?auth_error=true', origin))
    }

    console.log('=== EXCHANGE RESULT ===', {
      error: 'none',
      cookiesSet: response.cookies.getAll().map(c => c.name),
    })
    return response
  }

  // No code — redirect to salon (may be hash-based implicit flow)
  return NextResponse.redirect(new URL('/salon', origin))
}
