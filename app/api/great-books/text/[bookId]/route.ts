import { readCircleReadingEdition } from '@/lib/circles/reading-edition-server';
import { privateJson } from '@/lib/http/routeError';
export const runtime = 'nodejs';
export async function GET(_req: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  try {
    const edition = await readCircleReadingEdition(bookId);
    if (!edition) return privateJson({ error: 'Book not found' }, { status: 404 });
    return privateJson(edition);
  } catch { return privateJson({ error: 'The verified reading edition is unavailable' }, { status: 503 }); }
}
