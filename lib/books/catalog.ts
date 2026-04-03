// lib/books/catalog.ts
// Great Books catalog — metadata for the Society's reading program

export interface Book {
  id: string;
  title: string;
  author: string;
  year: string;
  gutenbergId?: number;
  sections: { id: string; title: string; startLine?: number }[];
  description: string;
  themes: string[];
  thinkerAffinity: string; // which thinker resonates most
}

export const GREAT_BOOKS: Book[] = [
  {
    id: 'republic',
    title: 'The Republic',
    author: 'Plato',
    year: '~380 BC',
    gutenbergId: 1497,
    sections: [
      { id: 'book-1', title: 'Book I — Justice' },
      { id: 'book-2', title: 'Book II — The Ring of Gyges' },
      { id: 'book-3', title: 'Book III — Education' },
      { id: 'book-4', title: 'Book IV — The Soul' },
      { id: 'book-5', title: 'Book V — Philosopher Kings' },
      { id: 'book-6', title: 'Book VI — The Good' },
      { id: 'book-7', title: 'Book VII — The Cave' },
      { id: 'book-8', title: 'Book VIII — Decline of States' },
      { id: 'book-9', title: 'Book IX — Tyranny' },
      { id: 'book-10', title: 'Book X — Poetry & Immortality' },
    ],
    description: 'The foundation of Western political philosophy. Justice, the ideal state, the allegory of the cave, the nature of the good.',
    themes: ['justice', 'ideal forms', 'education', 'the cave', 'philosopher kings'],
    thinkerAffinity: 'plato',
  },
  {
    id: 'meditations',
    title: 'Meditations',
    author: 'Marcus Aurelius',
    year: '~170 AD',
    gutenbergId: 2680,
    sections: [
      { id: 'book-1', title: 'Book I — Debts and Lessons' },
      { id: 'book-2', title: 'Book II — On the River Gran' },
      { id: 'book-3', title: 'Book III — In Carnuntum' },
      { id: 'book-4', title: 'Book IV — Inner Retreat' },
      { id: 'book-5', title: 'Book V — At Dawn' },
      { id: 'book-6', title: 'Book VI — Interconnection' },
      { id: 'book-7', title: 'Book VII — Character' },
      { id: 'book-8', title: 'Book VIII — Nature' },
      { id: 'book-9', title: 'Book IX — Injustice' },
      { id: 'book-10', title: 'Book X — Dissolution' },
      { id: 'book-11', title: 'Book XI — The Rational Soul' },
      { id: 'book-12', title: 'Book XII — Time and Eternity' },
    ],
    description: 'A Roman emperor\'s private journal of Stoic philosophy. The most intimate philosophical text ever written.',
    themes: ['stoicism', 'discipline', 'mortality', 'duty', 'inner peace'],
    thinkerAffinity: 'aurelius',
  },
  {
    id: 'nicomachean-ethics',
    title: 'Nicomachean Ethics',
    author: 'Aristotle',
    year: '~340 BC',
    gutenbergId: 8438,
    sections: [
      { id: 'book-1', title: 'Book I — The Good' },
      { id: 'book-2', title: 'Book II — Moral Virtue' },
      { id: 'book-3', title: 'Book III — Courage & Temperance' },
      { id: 'book-4', title: 'Book IV — Virtues Continued' },
      { id: 'book-5', title: 'Book V — Justice' },
      { id: 'book-6', title: 'Book VI — Intellectual Virtue' },
      { id: 'book-7', title: 'Book VII — Continence' },
      { id: 'book-8', title: 'Book VIII — Friendship' },
      { id: 'book-9', title: 'Book IX — Friendship Continued' },
      { id: 'book-10', title: 'Book X — Pleasure & Happiness' },
    ],
    description: 'Aristotle\'s systematic inquiry into the good life. Virtue, friendship, happiness, the examined life.',
    themes: ['virtue', 'happiness', 'friendship', 'the good life', 'practical wisdom'],
    thinkerAffinity: 'socrates',
  },
  {
    id: 'thus-spoke-zarathustra',
    title: 'Thus Spoke Zarathustra',
    author: 'Friedrich Nietzsche',
    year: '1883',
    gutenbergId: 1998,
    sections: [
      { id: 'prologue', title: 'Zarathustra\'s Prologue' },
      { id: 'part-1', title: 'Part I — The Three Metamorphoses' },
      { id: 'part-2', title: 'Part II — Self-Overcoming' },
      { id: 'part-3', title: 'Part III — The Convalescent' },
      { id: 'part-4', title: 'Part IV — The Higher Man' },
    ],
    description: 'Nietzsche\'s philosophical novel. The Übermensch, eternal return, the death of God, will to power.',
    themes: ['will to power', 'eternal return', 'self-overcoming', 'creation', 'the higher man'],
    thinkerAffinity: 'nietzsche',
  },
  {
    id: 'apology',
    title: 'Apology',
    author: 'Plato',
    year: '~399 BC',
    gutenbergId: 1656,
    sections: [
      { id: 'defense', title: 'Socrates\' Defense' },
      { id: 'cross-examination', title: 'Cross-Examination of Meletus' },
      { id: 'verdict', title: 'After the Verdict' },
      { id: 'sentence', title: 'After the Sentence' },
    ],
    description: 'Socrates\' defense at his trial. The unexamined life, the gadfly of Athens, dying for truth.',
    themes: ['truth', 'courage', 'the examined life', 'death', 'wisdom'],
    thinkerAffinity: 'socrates',
  },
  {
    id: 'being-and-time',
    title: 'The Question Concerning Technology',
    author: 'Martin Heidegger',
    year: '1954',
    sections: [
      { id: 'questioning', title: 'The Questioning' },
      { id: 'enframing', title: 'Enframing (Gestell)' },
      { id: 'danger', title: 'The Danger' },
      { id: 'saving-power', title: 'The Saving Power' },
    ],
    description: 'Heidegger\'s essential essay on technology. Gestell, standing-reserve, poiesis — the philosophical foundation of the Society.',
    themes: ['technology', 'enframing', 'standing-reserve', 'poiesis', 'truth'],
    thinkerAffinity: 'socrates',
  },
];

export function getBook(bookId: string): Book | undefined {
  return GREAT_BOOKS.find(b => b.id === bookId);
}
