// lib/books/catalog.ts
// Great Books catalog — metadata for the Society's reading program

export interface Book {
  id: string;
  title: string;
  author: string;
  year: string;
  gutenberg_id: string;
  recommended_thinker: string;
  authorThinkerId?: string;
  description: string;
}

export const GREAT_BOOKS: Book[] = [
  {
    id: 'republic',
    title: 'The Republic',
    author: 'Plato',
    year: '~380 BC',
    gutenberg_id: '1497',
    recommended_thinker: 'plato',
    authorThinkerId: 'plato',
    description: 'The blueprint for every utopia and every tyranny. What is justice? Who should rule? Plato answers — and the answers are dangerous.',
  },
  {
    id: 'meditations',
    title: 'Meditations',
    author: 'Marcus Aurelius',
    year: '~170 AD',
    gutenberg_id: '2680',
    recommended_thinker: 'aurelius',
    authorThinkerId: 'aurelius',
    description: 'Private journals of a Roman emperor at war. Not philosophy for the academy — philosophy for survival.',
  },
  {
    id: 'genealogy-of-morals',
    title: 'On the Genealogy of Morals',
    author: 'Friedrich Nietzsche',
    year: '1887',
    gutenberg_id: '52319',
    recommended_thinker: 'nietzsche',
    authorThinkerId: 'nietzsche',
    description: 'Where did "good" and "evil" come from? Nietzsche traces the bloodline and finds something disturbing.',
  },
  {
    id: 'apology',
    title: 'The Apology of Socrates',
    author: 'Plato',
    year: '~399 BC',
    gutenberg_id: '1656',
    recommended_thinker: 'socrates',
    authorThinkerId: 'plato',
    description: 'Socrates on trial for his life. His defense is not a defense — it is an attack on everyone in the room.',
  },
  {
    id: 'odyssey',
    title: 'The Odyssey',
    author: 'Homer',
    year: '~700 BC',
    gutenberg_id: '1727',
    recommended_thinker: 'socrates',
    description: 'The original homecoming story. Every detour is a test. Every monster is a mirror.',
  },
  {
    id: 'divine-comedy',
    title: 'The Divine Comedy',
    author: 'Dante Alighieri',
    year: '1320',
    gutenberg_id: '8800',
    recommended_thinker: 'plato',
    description: 'The descent into Hell, the climb through Purgatory, the blinding light of Paradise. The most ambitious poem ever written.',
  },
  {
    id: 'hamlet',
    title: 'Hamlet',
    author: 'William Shakespeare',
    year: '1601',
    gutenberg_id: '1524',
    recommended_thinker: 'nietzsche',
    description: 'A man who thinks too much and acts too late. The question is not "to be or not to be" — it is why he cannot decide.',
  },
  {
    id: 'relativity',
    title: 'Relativity: The Special and General Theory',
    author: 'Albert Einstein',
    year: '1916',
    gutenberg_id: '5001',
    recommended_thinker: 'einstein',
    authorThinkerId: 'einstein',
    description: 'Einstein explains his own revolution — in plain language, for anyone willing to think carefully.',
  },
];

export function getBook(bookId: string): Book | undefined {
  return GREAT_BOOKS.find(b => b.id === bookId);
}
