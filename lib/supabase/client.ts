import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // Fallback placeholders prevent @supabase/ssr from throwing during
  // Next.js build-time prerendering, when NEXT_PUBLIC_ vars may not yet
  // be injected into the worker process.  The real values are always
  // present at runtime (dev server, Vercel, any request-time render).
  // createBrowserClient is lazy — it makes no network calls until you
  // invoke .from() or .auth.*, which only happens inside useEffect (browser only).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'
  return createBrowserClient(url, key)
}
