// Great Books sessions: one reading, one AI thinker in the margin, one salon guide.
// Block numbers belong to the reviewed local editions in content/great-books/*.
// A replacement edition must be curated again rather than inherit these ranges.
// Every `quote` below must appear word for word inside its part's blocks
// (tests/growth/g21-library-sessions.test.ts checks this).

export type CompanionId = 'socrates' | 'plato' | 'aurelius' | 'nietzsche' | 'einstein';

export const COMPANIONS: Record<CompanionId, { name: string; voice: string }> = {
  socrates: { name: 'Socrates', voice: 'warm, wry and direct; you find the hidden assumption and ask the one question that matters' },
  plato: { name: 'Plato', voice: 'patient and vivid; you show the larger idea beneath the particular scene, often with an image' },
  aurelius: { name: 'Marcus Aurelius', voice: 'plain, steady and practical; you turn the line into something to do tomorrow morning' },
  nietzsche: { name: 'Nietzsche', voice: 'sharp and provocative; you ask who gains from an idea and what it costs the reader' },
  einstein: { name: 'Einstein', voice: 'curious and playful; you turn the passage into a thought experiment' },
};
export const COMPANION_IDS = Object.keys(COMPANIONS) as CompanionId[];

export type ReadingRange = { label: string; from: number; to: number };
export type SalonPart = { title: string; from: number; to: number; quote: string; detail: string; question: string };
export type AgendaItem = { time: string; title: string; detail: string };

export type LibrarySession = {
  slug: string;
  path: string; // e.g. "Term 1 · Session 1"
  title: string;
  work: string;
  author: string;
  translator: string;
  bookId: string;
  editionId: string;
  ranges: ReadingRange[];
  companion: CompanionId;
  question: string;
  summary: string;
  readingTime: string;
  salon?: { label: string; detail: string };
  parts: SalonPart[];
  agenda: AgendaItem[];
};

const DEFAULT_AGENDA: AgendaItem[] = [
  { time: '0–5', title: 'Welcome', detail: 'Names, and one sentence each: what brought you here tonight. Passing is fine.' },
  { time: '5–15', title: 'Read aloud', detail: 'Read the quoted lines on this page aloud. Reading aloud is optional.' },
  { time: '15–30', title: 'The opening question', detail: 'Everyone answers the opening question in a sentence before anyone argues.' },
  { time: '30–45', title: 'The hard part', detail: 'Take the part of the reading the group liked least and give it its strongest form.' },
  { time: '45–55', title: 'Write two sentences', detail: 'Your own answer, and one case that would break it.' },
  { time: '55–60', title: 'One takeaway each', detail: 'One sentence each, or a pass. Name the next reading. Finish on time.' },
];

const REPUBLIC = 'pg-1497-c0bf2b223089459d9868aaeb69f295b307734ec9c232a9dabc8c1f9b496dcfb4';

export const LIBRARY_SESSIONS: LibrarySession[] = [
  {
    slug: 'republic-book-1', path: 'December 3 salon', title: 'What is justice?', work: 'Republic, Book I', author: 'Plato', translator: 'Benjamin Jowett',
    bookId: 'republic', editionId: REPUBLIC, ranges: [{ label: 'Book I', from: 423, to: 914 }], companion: 'plato',
    question: 'What is justice, and is the just person actually better off?',
    summary: 'Three people give three answers, and Socrates takes each one apart. Book I ends without an answer, which is why the rest of the Republic exists.',
    readingTime: 'About an hour',
    salon: { label: 'Thursday, December 3 · online', detail: 'Read Book I, or at least the Thrasymachus part, before the salon.' },
    parts: [
      { title: 'Cephalus: justice as honesty and paying what you owe', from: 423, to: 459, quote: 'to speak the truth and to pay your debts',
        detail: 'An old, wealthy man says money matters most because it lets a person die without owing anyone. Socrates asks whether that is all justice is.',
        question: 'Can you think of a time when telling the truth or paying back what you owed would have been the wrong thing to do?' },
      { title: 'Polemarchus: help your friends, harm your enemies', from: 460, to: 600, quote: 'justice is the art which gives good to friends and evil to enemies',
        detail: 'His son defends an inherited saying. Socrates presses on two points: we can be wrong about who our friends are, and harming someone makes them worse.',
        question: 'Is it ever just to harm someone? What would make it so?' },
      { title: 'Thrasymachus: justice serves the powerful', from: 601, to: 914, quote: 'justice is nothing else than the interest of the stronger',
        detail: 'The angriest voice in the room says the rules are written by whoever rules, for their own benefit. Socrates argues back, and admits at the end that he still has not said what justice is.',
        question: 'Where does Thrasymachus have a point about how the world works? Where does his argument fail?' },
    ],
    agenda: [
      { time: '0–5', title: 'Welcome', detail: 'Names, and one sentence each: what brought you here tonight. Passing is fine.' },
      { time: '5–15', title: 'Read aloud', detail: 'Read the three quoted lines, and one paragraph of Thrasymachus. Reading aloud is optional.' },
      { time: '15–30', title: 'The argument', detail: 'Lay out the three answers to “what is justice?” in plain words. Which one does each of us actually live by?' },
      { time: '30–45', title: 'The objection', detail: 'Give Thrasymachus his strongest form. Ask someone who disagrees with him to state his view so well he would agree.' },
      { time: '45–55', title: 'An exercise', detail: 'Each person writes two sentences: their own definition of justice, and one case that would break it.' },
      { time: '55–60', title: 'One takeaway each', detail: 'One sentence each, or a pass. Name the next reading. Finish on time.' },
    ],
  },
  {
    slug: 'apology', path: 'Term 1 · Session 1', title: 'The examined life', work: 'Apology', author: 'Plato', translator: 'Benjamin Jowett',
    bookId: 'apology', editionId: 'pg-1656-c23a532ff45b46926abb91c193151af3f4aa8d27dc3bb76a3bb8971a427642c7', ranges: [{ label: 'Socrates’ defence', from: 44, to: 118 }], companion: 'socrates',
    question: 'Is an unexamined life really not worth living?',
    summary: 'Socrates on trial for his life. He explains why he spent his days questioning people, refuses to stop, and faces the verdict calmly.',
    readingTime: 'About 45 minutes',
    parts: [
      { title: 'The oracle: nobody is wiser', from: 49, to: 53, quote: 'he asked the oracle to tell him whether anyone was wiser than I was',
        detail: 'A friend asks the oracle at Delphi if anyone is wiser than Socrates. Socrates sets out to prove it wrong, and finds that the people who claim to know mostly don’t.',
        question: 'Socrates says his only wisdom is knowing what he doesn’t know. Is that real wisdom, or a clever kind of modesty?' },
      { title: 'The gadfly', from: 99, to: 101, quote: 'am a sort of gadfly, given to the state by God',
        detail: 'He compares himself to a fly that stings a big, lazy horse awake, and tells the jury they will not easily find another.',
        question: 'Who plays the gadfly in your life, and how do you usually treat them?' },
      { title: 'Not worth living', from: 109, to: 116, quote: 'the unexamined life is not worth living',
        detail: 'Asked to propose his own penalty, he will not promise to stop questioning, because that would mean giving up the thing that makes life worth living.',
        question: 'Is that true for everyone, or only for people built like Socrates?' },
    ],
    agenda: DEFAULT_AGENDA,
  },
  {
    slug: 'the-cave', path: 'Term 1 · Session 3', title: 'The cave', work: 'Republic, Book VII', author: 'Plato', translator: 'Benjamin Jowett',
    bookId: 'republic', editionId: REPUBLIC, ranges: [{ label: 'Book VII', from: 3195, to: 3264 }], companion: 'plato',
    question: 'What shadows do you take for real?',
    summary: 'Prisoners chained in a cave take shadows on a wall for the whole of reality. One is freed, climbs into the sun, and comes back down.',
    readingTime: 'About 25 minutes',
    parts: [
      { title: 'The prisoners and the shadows', from: 3195, to: 3208, quote: 'human beings living in a underground den',
        detail: 'Chained since childhood, the prisoners see only shadows of objects carried past a fire, and believe the shadows are the real things.',
        question: 'What is one thing you believed for years only because it was all you had ever seen?' },
      { title: 'Turning toward the light', from: 3209, to: 3226, quote: 'he will suffer sharp pains; the glare will distress him',
        detail: 'Freed, the prisoner is dazzled and wants to turn back. Seeing clearly takes time and hurts at first.',
        question: 'Why does the truth hurt before it helps? Have you seen that happen?' },
      { title: 'Going back down', from: 3227, to: 3264, quote: 'the prison-house is the world of sight',
        detail: 'Back in the cave, the freed man looks ridiculous to the others. Plato says those who have seen the light must still go back and help.',
        question: 'Do people who see more owe something to those who don’t, even when they get laughed at?' },
    ],
    agenda: DEFAULT_AGENDA,
  },
  {
    slug: 'meditations', path: 'Term 1 · Session 6', title: 'Steady around difficult people', work: 'Meditations, end of Book I, Books II and IV', author: 'Marcus Aurelius', translator: 'Meric Casaubon',
    bookId: 'meditations', editionId: 'pg-2680-299ccec053a7da0dc33b3f1e32812fc1f33852ab962390f7680d925f015624d1', ranges: [{ label: 'End of Book I', from: 75, to: 75 }, { label: 'Book II', from: 79, to: 94 }, { label: 'Book IV', from: 114, to: 156 }], companion: 'aurelius',
    question: 'How do you stay steady around difficult people?',
    summary: 'An emperor’s private notebook, written to himself on campaign. Short entries on time, anger, other people and what is actually up to us.',
    readingTime: 'About 40 minutes',
    parts: [
      { title: 'Expect them in the morning', from: 75, to: 75, quote: 'This day I shalt have to do with an idle curious man',
        detail: 'He starts the day by expecting rude, ungrateful people, and reminding himself they are his kin by reason, not his enemies.',
        question: 'Does expecting the worst from people make you kinder to them, or just harder?' },
      { title: 'You have put this off long enough', from: 79, to: 94, quote: 'Remember how long thou hast already put off these things',
        detail: 'Book II opens with a reminder that time is short and the day set for doing better keeps passing.',
        question: 'What have you been putting off that you already know you should do?' },
      { title: 'The retreat inside', from: 114, to: 156, quote: 'Let opinion be taken away, and no man will think himself wronged',
        detail: 'People long for the country or the sea, he writes, but the quietest place is your own mind. Harm comes from the opinion you add.',
        question: 'Is it true that you are only wronged if you think you are? Where does that break down?' },
    ],
    agenda: DEFAULT_AGENDA,
  },
];

export function getLibrarySession(slug: string): LibrarySession | null {
  return LIBRARY_SESSIONS.find(session => session.slug === slug) ?? null;
}

/** The term-one path from the great books plan; only some sessions are built yet. */
export const TERM_ONE: { n: number; reading: string; question: string; slug?: string }[] = [
  { n: 1, reading: 'Plato, Apology', question: 'Is an unexamined life really not worth living?', slug: 'apology' },
  { n: 2, reading: 'Plato, Crito', question: 'When should you obey a rule you think is unjust?' },
  { n: 3, reading: 'Plato, Republic VII: the cave', question: 'What shadows do you take for real?', slug: 'the-cave' },
  { n: 4, reading: 'Plato, Symposium: Diotima’s speech', question: 'What are we actually looking for when we love?' },
  { n: 5, reading: 'Epictetus, Enchiridion', question: 'What is truly up to you today?' },
  { n: 6, reading: 'Marcus Aurelius, Meditations', question: 'How do you stay steady around difficult people?', slug: 'meditations' },
];
