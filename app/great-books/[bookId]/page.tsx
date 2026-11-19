import type { Metadata } from 'next';
import { getBook } from '@/lib/books/catalog';
import BookReader from '../BookReader';
import NoScriptBookReader, { readingWithoutScripts } from '../NoScriptBookReader';

type Props = { params: Promise<{ bookId: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { bookId } = await params, book = getBook(bookId);
  return { title: book ? `${book.title} — Free Complete Edition` : 'Book Not Found', description: book ? `Read ${book.title} by ${book.author} in a complete, credited source edition. Free reading, accessible controls and optional reading tools.` : 'Browse the free Great Books library.' };
}
export default async function BookReaderPage({ params, searchParams }: Props) {
  const { bookId } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams ?? {})) {
    if (!['book', 'edition', 'from', 'to', 'circle', 'passageBlock', 'passageStart', 'passageEnd'].includes(key)) continue;
    for (const part of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, part);
  }
  const search = query.toString();
  const reading = await readingWithoutScripts(bookId, search);
  return <>
    <noscript>
      <style>{'#scripted-book-reader { display: none; }'}</style>
      <NoScriptBookReader bookId={bookId} reading={reading} />
    </noscript>
    <div id="scripted-book-reader"><BookReader bookId={bookId} search={search} /></div>
  </>;
}
