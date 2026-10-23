import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

function publicNoStoreJson(body: unknown, init: { status?: number } = {}) {
  const response = NextResponse.json(body, init);
  response.headers.set('cache-control', 'public, no-store, max-age=0, must-revalidate');
  response.headers.set('x-content-type-options', 'nosniff');
  return response;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = getSupabaseAdmin();
  const { data: session } = await supabase
    .from('council_sessions')
    .select('*')
    .eq('public_url_slug', slug)
    .eq('is_public', true)
    .single();

  if (!session) return publicNoStoreJson({ error: 'Not found' }, { status: 404 });
  return publicNoStoreJson({ session });
}
