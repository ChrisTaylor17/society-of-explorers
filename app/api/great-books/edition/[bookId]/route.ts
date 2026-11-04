import { EditionMismatch, editionHeaders, readEditionDocument } from '@/lib/books/editions';
import { isEditionId } from '@/lib/books/bookmarks';
export const runtime = 'nodejs';
export async function GET(req: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  try {
    const expected = new URL(req.url).searchParams.getAll('edition');
    if (expected.length > 1 || (expected.length === 1 && !isEditionId(expected[0]))) return new Response('Invalid edition', { status: 400, headers: editionHeaders('text/plain; charset=utf-8') });
    const document = await readEditionDocument(bookId, expected[0]);
    if (!document) return new Response('Book not found', { status: 404, headers: editionHeaders('text/plain; charset=utf-8') });
    const headers = editionHeaders('text/html; charset=utf-8', document.sha256);
    headers.set('X-SoE-Edition', document.editionId);
    return new Response(new Uint8Array(document.bytes), { headers });
  } catch (error) { return new Response(error instanceof EditionMismatch ? 'The requested reading edition changed. Reload the book.' : 'The verified reading edition is unavailable',
    { status: error instanceof EditionMismatch ? 409 : 503, headers: editionHeaders('text/plain; charset=utf-8') }); }
}
