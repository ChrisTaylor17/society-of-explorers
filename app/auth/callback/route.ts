import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const next = getSafeRedirectPath(searchParams.get('next'))

  if (code) {
    const response = NextResponse.redirect(new URL(next, origin))

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

    return response
  }

  return NextResponse.redirect(new URL(next, origin))
}

function getSafeRedirectPath(candidate: string | null): string {
  if (!candidate) return '/dashboard'
  if (!candidate.startsWith('/')) return '/dashboard'
  if (candidate.startsWith('//')) return '/dashboard'
  if (candidate.includes('\\')) return '/dashboard'

  try {
    const parsed = new URL(candidate, 'http://localhost')
    if (parsed.origin !== 'http://localhost') return '/dashboard'
    return parsed.pathname + parsed.search + parsed.hash
  } catch {
    return '/dashboard'
  }
}
