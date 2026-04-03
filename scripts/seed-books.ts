// scripts/seed-books.ts
// Run: npx tsx scripts/seed-books.ts
// Seeds the great_books table from the catalog

import { createClient } from '@supabase/supabase-js';

const GREAT_BOOKS_CATALOG = [
  { id: 'republic', title: 'The Republic', author: 'Plato', year: '~380 BC', gutenberg_id: '1497', recommended_thinker: 'plato', description: 'The blueprint for every utopia and every tyranny. What is justice? Who should rule? Plato answers — and the answers are dangerous.' },
  { id: 'meditations', title: 'Meditations', author: 'Marcus Aurelius', year: '~170 AD', gutenberg_id: '2680', recommended_thinker: 'aurelius', description: 'Private journals of a Roman emperor at war. Not philosophy for the academy — philosophy for survival.' },
  { id: 'genealogy-of-morals', title: 'On the Genealogy of Morals', author: 'Friedrich Nietzsche', year: '1887', gutenberg_id: '52319', recommended_thinker: 'nietzsche', description: 'Where did "good" and "evil" come from? Nietzsche traces the bloodline and finds something disturbing.' },
  { id: 'apology', title: 'The Apology of Socrates', author: 'Plato', year: '~399 BC', gutenberg_id: '1656', recommended_thinker: 'socrates', description: 'Socrates on trial for his life. His defense is not a defense — it is an attack on everyone in the room.' },
  { id: 'odyssey', title: 'The Odyssey', author: 'Homer', year: '~700 BC', gutenberg_id: '1727', recommended_thinker: 'socrates', description: 'The original homecoming story. Every detour is a test. Every monster is a mirror.' },
  { id: 'divine-comedy', title: 'The Divine Comedy', author: 'Dante Alighieri', year: '1320', gutenberg_id: '8800', recommended_thinker: 'plato', description: 'The descent into Hell, the climb through Purgatory, the blinding light of Paradise. The most ambitious poem ever written.' },
  { id: 'hamlet', title: 'Hamlet', author: 'William Shakespeare', year: '1601', gutenberg_id: '1524', recommended_thinker: 'nietzsche', description: 'A man who thinks too much and acts too late. The question is not "to be or not to be" — it is why he cannot decide.' },
  { id: 'relativity', title: 'Relativity: The Special and General Theory', author: 'Albert Einstein', year: '1916', gutenberg_id: '5001', recommended_thinker: 'einstein', description: 'Einstein explains his own revolution — in plain language, for anyone willing to think carefully.' },
];

async function seed() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    console.error('Run: source .env.local && npx tsx scripts/seed-books.ts');
    process.exit(1);
  }

  const supabase = createClient(url, key);

  for (const book of GREAT_BOOKS_CATALOG) {
    const { error } = await supabase.from('great_books').upsert(book, { onConflict: 'id' });
    if (error) {
      console.error(`Failed to seed ${book.id}:`, error.message);
    } else {
      console.log(`✓ ${book.title}`);
    }
  }

  console.log(`\nDone. ${GREAT_BOOKS_CATALOG.length} books seeded.`);
}

seed();
