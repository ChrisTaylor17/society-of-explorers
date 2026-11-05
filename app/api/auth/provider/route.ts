import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { privateJson } from '@/lib/http/routeError';
import { authWriteOriginAllowed, readAuthJson } from '@/lib/auth/request';
import { selectAuthProvider } from '@/lib/auth/provider';
import { AUTH_INTENT_COOKIE, parseBrowserIntent } from '@/lib/auth/browserIntent';

export async function POST(req: NextRequest) {
  if (!authWriteOriginAllowed(req)) return privateJson({ error: 'Request refused.' }, { status: 403 });
  try {
    const body = await readAuthJson(req);
    if (!body || Object.keys(body).sort().join(',') !== 'expectedSubject,intent,provider' ||
        body.provider !== 'supabase' || typeof body.expectedSubject !== 'string' || !parseBrowserIntent(body.expectedSubject) || !parseBrowserIntent(body.intent)) {
      return privateJson({ error: 'Invalid sign-in choice.' }, { status: 400 });
    }
    const intent = parseBrowserIntent(body.intent)!;
    if (req.cookies.get(AUTH_INTENT_COOKIE)?.value !== intent) return privateJson({ error: 'Sign-in changed. Try again.' }, { status: 409 });
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return privateJson({ error: 'Unauthorized' }, { status: 401 });
    if (body.expectedSubject !== user.id) return privateJson({ error: 'Sign-in changed. Try again.' }, { status: 409 });
    const response = privateJson({ selected: 'supabase', subject: user.id, intent });
    selectAuthProvider(response, 'supabase', intent, user.id);
    return response;
  } catch {
    return privateJson({ error: 'Sign-in choice is temporarily unavailable.' }, { status: 503 });
  }
}
