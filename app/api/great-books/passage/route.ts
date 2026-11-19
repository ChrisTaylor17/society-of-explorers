import { privateJson } from '@/lib/http/routeError';
import { PassageSourceError, passageReferenceFromQuery, resolvePassage } from '@/lib/books/passage-source';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const reference = passageReferenceFromQuery(new URL(request.url).searchParams);
    if (!reference) return privateJson({ error: 'Use a valid source passage locator.' }, { status: 400 });
    return privateJson(await resolvePassage(reference));
  } catch (error) {
    return privateJson({ error: 'The requested source passage could not be verified.' }, { status: error instanceof PassageSourceError ? error.status : 503 });
  }
}
