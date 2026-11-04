import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { privateJson } from '@/lib/http/routeError';
import { authWriteOriginAllowed, readAuthJson } from '@/lib/auth/request';
import { selectAuthProvider } from '@/lib/auth/provider';

export async function POST(req: NextRequest) {
  if (!authWriteOriginAllowed(req)) return privateJson({ error: 'Request refused.' }, { status: 403 });
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return privateJson({ error: 'Unauthorized' }, { status: 401 });
    const body = await readAuthJson(req);
    if (!body || Object.keys(body).sort().join(',') !== 'expectedSubject,provider' ||
        body.provider !== 'supabase' || typeof body.expectedSubject !== 'string') {
      return privateJson({ error: 'Invalid sign-in choice.' }, { status: 400 });
    }
    if (body.expectedSubject !== user.id) return privateJson({ error: 'Sign-in changed. Try again.' }, { status: 409 });
    const response = privateJson({ selected: 'supabase', subject: user.id });
    selectAuthProvider(response, 'supabase');
    return response;
  } catch {
    return privateJson({ error: 'Sign-in choice is temporarily unavailable.' }, { status: 503 });
  }
}
