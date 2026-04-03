import { NextRequest, NextResponse } from 'next/server';
import { getBook } from '@/lib/books/catalog';

export async function GET(req: NextRequest, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const book = getBook(bookId);
  if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });

  const sectionId = req.nextUrl.searchParams.get('section');

  // For Gutenberg books, fetch from Project Gutenberg
  if (book.gutenbergId) {
    try {
      const url = `https://www.gutenberg.org/cache/epub/${book.gutenbergId}/pg${book.gutenbergId}.txt`;
      const res = await fetch(url, { next: { revalidate: 86400 } }); // cache 24h
      if (!res.ok) throw new Error('Gutenberg fetch failed');
      let text = await res.text();

      // Clean: remove Gutenberg header/footer
      const startMarker = '*** START OF';
      const endMarker = '*** END OF';
      const startIdx = text.indexOf(startMarker);
      const endIdx = text.indexOf(endMarker);
      if (startIdx > -1) text = text.slice(text.indexOf('\n', startIdx) + 1);
      if (endIdx > -1) text = text.slice(0, endIdx);

      // Split into paragraphs
      const paragraphs = text
        .split(/\n\n+/)
        .map(p => p.replace(/\n/g, ' ').trim())
        .filter(p => p.length > 20);

      return NextResponse.json({
        bookId,
        title: book.title,
        author: book.author,
        totalParagraphs: paragraphs.length,
        text: paragraphs,
      });
    } catch (err) {
      return NextResponse.json({ error: 'Failed to fetch text', details: String(err) }, { status: 502 });
    }
  }

  // For non-Gutenberg books, return placeholder
  return NextResponse.json({
    bookId,
    title: book.title,
    author: book.author,
    totalParagraphs: 0,
    text: [`[Full text of "${book.title}" by ${book.author} — add to Supabase storage or provide a source URL]`],
  });
}
