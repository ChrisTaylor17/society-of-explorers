import 'server-only';
import { isUuid } from '@/lib/ids/uuid';

/** An explicit bearer is one authority choice; never fall back to cookies. */
export async function verifySupabaseBearerSubject(header: string): Promise<string | null> {
  if (!/^Bearer [^\s]+$/.test(header) || header.length > 16_384) return null;
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: { user }, error } = await client.auth.getUser(header.slice(7));
    return !error && user && isUuid(user.id) ? user.id.toLowerCase() : null;
  } catch { return null; }
}
