import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getBook } from '@/lib/books/catalog';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const book = getBook(bookId);
  if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });

  const sectionParam = req.nextUrl.searchParams.get('section');
  const sectionNumber = sectionParam ? Number(sectionParam) : null;

  // Try DB first
  if (sectionNumber !== null) {
    const { data: section } = await supabaseAdmin
      .from('great_books_sections')
      .select('*')
      .eq('book_id', bookId)
      .eq('section_number', sectionNumber)
      .single();

    if (section) {
      return NextResponse.json({
        bookId, title: book.title, author: book.author,
        section_number: section.section_number,
        content: section.content,
        word_count: section.word_count,
      });
    }
  } else {
    // Load all sections from DB
    const { data: sections } = await supabaseAdmin
      .from('great_books_sections')
      .select('*')
      .eq('book_id', bookId)
      .order('section_number', { ascending: true });

    if (sections && sections.length > 0) {
      return NextResponse.json({
        bookId, title: book.title, author: book.author,
        totalSections: sections.length,
        text: sections.map(s => s.content),
      });
    }
  }

  // Fallback: fetch from Gutenberg, clean, split, save to DB
  if (!book.gutenberg_id) {
    return NextResponse.json({
      bookId, title: book.title, author: book.author,
      totalParagraphs: 0,
      text: [`[Full text not yet available for "${book.title}"]`],
    });
  }

  try {
    const url = `https://www.gutenberg.org/cache/epub/${book.gutenberg_id}/pg${book.gutenberg_id}.txt`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) throw new Error(`Gutenberg returned ${res.status}`);
    let rawText = await res.text();

    // Strip Gutenberg header/footer
    const startMarker = '*** START OF';
    const endMarker = '*** END OF';
    const startIdx = rawText.indexOf(startMarker);
    const endIdx = rawText.indexOf(endMarker);
    if (startIdx > -1) rawText = rawText.slice(rawText.indexOf('\n', startIdx) + 1);
    if (endIdx > -1) rawText = rawText.slice(0, endIdx);

    // Strip boilerplate lines (translator notes, Gutenberg credits, etc.)
    const boilerplatePatterns = /^.*(GUTENBERG|PROJECT|LICENSE|PRODUCED BY|TRANSCRIBER|EDITOR'S NOTE|TRANSLATED BY|PUBLISHED|FREDERICK STREET|ARRANGEMENT|EBOOK|POSTING DATE|RELEASE DATE|CHARSET|ENCODING).*/gim;
    rawText = rawText.replace(boilerplatePatterns, '');

    // Strip leading translator/editor credits (first lines before actual content)
    const lines = rawText.split('\n');
    let contentStart = 0;
    for (let i = 0; i < Math.min(lines.length, 30); i++) {
      const line = lines[i].trim().toUpperCase();
      if (line.length === 0) continue;
      // Skip lines that look like metadata
      if (/^(BY |TRANSLATED|EDITED|WITH |INTRODUCTION|PREFACE BY|PUBLISHED|COPYRIGHT|\d{4}|FIRST|SECOND|THIRD|CONTENTS|TABLE OF)/.test(line) && line.length < 120) {
        contentStart = i + 1;
        continue;
      }
      // If we hit a line that looks like actual content (lowercase, long), stop stripping
      if (lines[i].trim().length > 40 && /[a-z]/.test(lines[i])) break;
      // ALL CAPS short lines at the start are usually titles/credits
      if (line === line.toUpperCase() && line.length < 80) {
        contentStart = i + 1;
        continue;
      }
    }
    if (contentStart > 0 && contentStart < 30) {
      rawText = lines.slice(contentStart).join('\n');
    }

    // Split into paragraphs
    const allParagraphs = rawText
      .split(/\n\n+/)
      .map(p => p.replace(/\r/g, '').replace(/\n/g, ' ').trim())
      .filter(p => p.length > 20);

    // Group into sections of ~50 paragraphs
    const SECTION_SIZE = 50;
    const sections: { content: string; wordCount: number }[] = [];
    for (let i = 0; i < allParagraphs.length; i += SECTION_SIZE) {
      const chunk = allParagraphs.slice(i, i + SECTION_SIZE).join('\n\n');
      sections.push({
        content: chunk,
        wordCount: chunk.split(/\s+/).length,
      });
    }

    // Save sections to DB (fire-and-forget for speed)
    const inserts = sections.map((s, i) => ({
      book_id: bookId,
      section_number: i + 1,
      title: `Section ${i + 1}`,
      content: s.content,
      word_count: s.wordCount,
    }));

    supabaseAdmin.from('great_books_sections').upsert(inserts, { onConflict: 'book_id,section_number' })
      .then(({ error }) => { if (error) console.error('Section save error:', error); });

    // Update total_sections on the book
    supabaseAdmin.from('great_books').update({ total_sections: sections.length }).eq('id', bookId)
      .then(({ error }) => { if (error) console.error('Book update error:', error); });

    // Return all paragraphs for the reader
    return NextResponse.json({
      bookId, title: book.title, author: book.author,
      totalSections: sections.length,
      totalParagraphs: allParagraphs.length,
      text: allParagraphs,
    });
  } catch (err) {
    console.error('Gutenberg fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch text', details: String(err) }, { status: 502 });
  }
}
