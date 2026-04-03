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

    // Strip Gutenberg header (multiple marker formats)
    const startMatch = rawText.match(/\*\*\* ?START OF (THE |THIS )?PROJECT GUTENBERG/i);
    if (startMatch) {
      const idx = rawText.indexOf(startMatch[0]);
      rawText = rawText.slice(rawText.indexOf('\n', idx) + 1);
    }

    // Strip Gutenberg footer
    const endMatch = rawText.match(/\*\*\* ?END OF (THE |THIS )?PROJECT GUTENBERG/i);
    if (endMatch) {
      rawText = rawText.slice(0, rawText.indexOf(endMatch[0]));
    }

    // Strip leading boilerplate (translator notes, editor credits, etc.)
    const lines = rawText.split('\n');
    let contentStart = 0;
    for (let i = 0; i < Math.min(lines.length, 50); i++) {
      const line = lines[i].trim();
      const upper = line.toUpperCase();
      if (line.length === 0) continue;
      // Known boilerplate keywords
      if (/TRANSLATED BY|EDITOR|PRODUCED BY|TRANSCRIBER|FREDERICK STREET|PUBLISHED BY|HORACE|SAMUEL/i.test(line) && line.length < 150) {
        contentStart = i + 1;
        continue;
      }
      // Skip metadata lines
      if (/^(BY |WITH |INTRODUCTION|PREFACE BY|COPYRIGHT|\d{4}$|FIRST EDITION|SECOND EDITION|CONTENTS$|TABLE OF)/i.test(upper) && line.length < 120) {
        contentStart = i + 1;
        continue;
      }
      // ALL CAPS short lines at start are usually titles/credits — skip
      if (upper === line && line.length < 80 && line.length > 2) {
        contentStart = i + 1;
        continue;
      }
      // If we hit actual content (mixed case, 40+ chars), stop stripping
      if (line.length > 40 && /[a-z]/.test(line)) break;
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

    // Return section-paginated paragraphs
    const totalSects = sections.length;
    const reqSection = sectionNumber || 1;
    const startIdx = (reqSection - 1) * SECTION_SIZE;
    const sectionParagraphs = allParagraphs.slice(startIdx, startIdx + SECTION_SIZE);

    return NextResponse.json({
      bookId, title: book.title, author: book.author,
      totalSections: totalSects,
      currentSection: reqSection,
      totalParagraphs: allParagraphs.length,
      text: sectionParagraphs,
    });
  } catch (err) {
    console.error('Gutenberg fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch text', details: String(err) }, { status: 502 });
  }
}
