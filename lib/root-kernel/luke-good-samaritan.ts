import edition from '../../content/root-kernel/luke-good-samaritan.web-classic.json';
import { PHILEMON_RIGHTS } from './philemon-edition';

export const LUKE_SOURCE_SHA256 = '08e329a5fdbf1c3516a4b59ca8add43b81c05b74e3807bb1c9211c269ba7507f';
export const LUKE_READING = { bookId: 'luke-good-samaritan', editionId: `web-classic-${LUKE_SOURCE_SHA256}`, from: 0, to: 0 } as const;
export const LUKE_STUDY_HREF = '/great-books/scripture/luke-good-samaritan';
const work = { id: LUKE_READING.bookId, title: edition.title, author: 'Gospel of Luke' };
const range = 'Luke 10:25–37';

export const lukeGoodSamaritan = {
  id: LUKE_READING.bookId, work, selection: LUKE_READING, href: LUKE_STUDY_HREF, source: edition, range,
  shortTitle: 'Good Samaritan', readAction: 'Read the Good Samaritan',
  readerTab: 'Read the passage', extent: 'Complete selected passage',
  notesTitle: 'Two ways to read the question', notesReference: range,
  intro: 'A lawyer asks Jesus what he must do to inherit eternal life. Jesus asks how he reads the law, and the conversation turns to what it means to be a neighbor.',
  perspectives: [
    { id: 'love-without-boundaries', title: 'How far does neighbor love reach?',
      detail: 'The lawyer draws on two commands in Scripture. Read the parable as a test of how far that love reaches when the person in need is a stranger.',
      source: { label: 'Read Luke 10:27–29', href: edition.publisherUrl + '#V27' } },
    { id: 'becoming-a-neighbor', title: 'What does it take to act as a neighbor?',
      detail: 'The Samaritan stops, tends to the man and makes arrangements for his care. Jesus asks which person acted as a neighbor. Follow the change from defining a neighbor to showing mercy.',
      source: { label: 'Read Luke 10:33–37', href: edition.publisherUrl + '#V33' } },
  ],
  comparison: 'Read the story both ways. Which details support each reading? What questions does the passage leave open?',
  furtherReading: edition.footnotes.map(note => ({ label: note.text, href: note.href })),
  questions: [
    { before: 'How does Jesus turn the lawyer’s question around in ', verse: 36, after: '?' },
    { before: 'What does the Samaritan commit to in ', verse: 35, after: ', and which part would cost you the most?' },
    { before: 'How would you explain the instruction in ', verse: 37, after: ' to someone who reads the story differently?' },
  ],
  agenda: [
    { minutes: 5, title: 'Welcome and pray', detail: 'Open with a short prayer for wisdom and mercy. Invite each reader to name one question, with room to pass.' },
    { minutes: 8, title: 'Read the passage aloud', detail: 'Read Luke 10:25–37 without interruption. Give everyone a moment to mark a detail they noticed.' },
    { minutes: 10, title: 'Compare the two questions', detail: 'Read verses 29 and 36 again. Ask each reader how they hear the change.' },
    { minutes: 17, title: 'Discuss what mercy costs', detail: 'Trace the Samaritan’s actions in the text. Invite a different reading and give its reader time to explain.' },
    { minutes: 5, title: 'Close with one next step', detail: 'Invite one concrete act of neighbor love for the week. Close in prayer.' },
  ],
  meetingNote: 'Use your Circle’s private meeting link. Ask each person before sharing their comments outside the group.',
  metadata: {
    bookId: work.id, title: work.title, author: work.author, sourceSha256: LUKE_SOURCE_SHA256,
    edition: {
      editionId: LUKE_READING.editionId, sourceTitle: edition.title, sourceCatalogUrl: edition.publisherUrl,
      licenseUrl: edition.rightsUrl, attribution: `${range} · ${edition.edition}`, licenseNotice: PHILEMON_RIGHTS,
      translators: [], editors: [], illustrators: [], editionNotes: ['Selected verses with both publisher cross-references.'],
      blockCount: 1, contents: [{ id: 'scripture', label: range, level: 2, readingIndex: 0 }],
    },
  },
};
