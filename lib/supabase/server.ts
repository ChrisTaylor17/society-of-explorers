import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const PLACEHOLDER_SUPABASE_URL = 'https://placeholder.supabase.co'
const PLACEHOLDER_SUPABASE_ANON_KEY = 'placeholder-anon-key'

export async function createClient() {
  const cookieStore = await cookies()
  const { url, anonKey } = getServerSupabasePublicConfig()
  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(c) { try { c.forEach(({name,value,options}) => cookieStore.set(name,value,options)) } catch {} }
      }
    }
  )
}

export function createServiceClient() {
  const { url, serviceRoleKey } = getServiceSupabaseConfig()
  return createServerClient(
    url,
    serviceRoleKey,
    { cookies: { getAll(){return[]}, setAll(){} } }
  )
}

function getServerSupabasePublicConfig() {
  // Fallback placeholders prevent @supabase/ssr from throwing during
  // build-time prerendering, when NEXT_PUBLIC_ vars may not yet be injected
  // into the worker process. The client is still lazy until auth/database
  // methods are invoked during a real request.
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || PLACEHOLDER_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || PLACEHOLDER_SUPABASE_ANON_KEY,
  }
}

function getServiceSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('Supabase service client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  }

  return { url, serviceRoleKey }
}
