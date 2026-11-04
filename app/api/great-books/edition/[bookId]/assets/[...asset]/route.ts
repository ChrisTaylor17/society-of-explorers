import { EditionMismatch, editionHeaders, readEditionAsset } from '@/lib/books/editions';
export const runtime = 'nodejs';
export async function GET(req: Request, { params }: { params: Promise<{ bookId: string; asset: string[] }> }) {
  const { bookId, asset } = await params;
  try {
    const expected = new URL(req.url).searchParams.getAll('sha');
    if (expected.length > 1 || (expected.length === 1 && !/^[a-f0-9]{64}$/.test(expected[0]))) return new Response('Invalid image version', { status: 400, headers: editionHeaders('text/plain; charset=utf-8') });
    const image = Array.isArray(asset) ? await readEditionAsset(bookId, asset.join('/'), expected[0]) : null;
    if (!image) return new Response('Image not found', { status: 404, headers: editionHeaders('text/plain; charset=utf-8') });
    return new Response(new Uint8Array(image.bytes), { headers: editionHeaders(image.mime, image.sha256) });
  } catch (error) { return new Response(error instanceof EditionMismatch ? 'The requested image version changed. Reload the book.' : 'The verified image is unavailable',
    { status: error instanceof EditionMismatch ? 409 : 503, headers: editionHeaders('text/plain; charset=utf-8') }); }
}
