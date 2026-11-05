import { isEditionId } from '@/lib/books/bookmarks';
import { EditionMismatch, editionHeaders } from '@/lib/books/editions';
import { readSourceReaderDocument } from '@/lib/books/source-reader-server';
import { SOURCE_READER_VERSION } from '@/lib/books/source-reader';
export const runtime = 'nodejs';

/** Public bytes only: no account lookup, cookies, provider or database client. */
export async function GET(req: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  try {
    const query = new URL(req.url).searchParams;
    const edition = query.get('edition');
    if (query.size !== 1 || query.getAll('edition').length !== 1 || !isEditionId(edition)) {
      return new Response('Use an exact reading edition', { status: 400, headers: editionHeaders('text/plain; charset=utf-8') });
    }
    const document = await readSourceReaderDocument(bookId, edition);
    if (!document) return new Response('Book not found', { status: 404, headers: editionHeaders('text/plain; charset=utf-8') });
    const headers = editionHeaders('text/html; charset=utf-8', document.sha256);
    headers.set('X-SoE-Edition', document.editionId);
    headers.set('X-SoE-Reader', SOURCE_READER_VERSION);
    headers.set('Content-Length', String(document.bytes.length));
    return new Response(new Uint8Array(document.bytes), { headers });
  } catch (error) {
    return new Response(error instanceof EditionMismatch ? 'The requested reading edition changed. Reload the book.' : 'The verified complete reader is unavailable',
      { status: error instanceof EditionMismatch ? 409 : 503, headers: editionHeaders('text/plain; charset=utf-8') });
  }
}
