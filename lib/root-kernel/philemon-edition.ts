import philemonEdition from '../../content/root-kernel/philemon.web-classic.json';

export { philemonEdition };

export const PHILEMON_STUDY_HREF = '/great-books/scripture/philemon';
export const PHILEMON_SOURCE_SHA256 = 'b2bc6316f4217a8c97637d44786a4cd6b9b9a83b88cd4880b5aacdf67cae4e19';
export const PHILEMON_READING = { bookId: 'philemon', editionId: `web-classic-${PHILEMON_SOURCE_SHA256}`, from: 0, to: 0 } as const;
export const PHILEMON_WORK = { id: PHILEMON_READING.bookId, title: philemonEdition.title, author: 'Paul' };
export const PHILEMON_RIGHTS = 'The World English Bible publisher dedicates this translation to the public domain.';
export const PHILEMON_EDITION_METADATA = {
  bookId: PHILEMON_WORK.id,
  title: PHILEMON_WORK.title,
  author: PHILEMON_WORK.author,
  sourceSha256: PHILEMON_SOURCE_SHA256,
  edition: {
    editionId: PHILEMON_READING.editionId,
    sourceTitle: philemonEdition.title,
    sourceCatalogUrl: philemonEdition.publisherUrl,
    licenseUrl: philemonEdition.rightsUrl,
    attribution: `${philemonEdition.title} · ${philemonEdition.edition}`,
    licenseNotice: PHILEMON_RIGHTS,
    translators: [],
    editors: [],
    illustrators: [],
    editionNotes: ['Complete letter with both publisher footnotes.'],
    blockCount: 1,
    contents: [{ id: 'scripture', label: 'Philemon 1', level: 2, readingIndex: 0 }],
  },
};

export function isPhilemonReading(selection?: { bookId: string; editionId: string; from: number; to: number } | null): boolean {
  return selection?.bookId === PHILEMON_READING.bookId && selection.editionId === PHILEMON_READING.editionId
    && selection.from === PHILEMON_READING.from && selection.to === PHILEMON_READING.to;
}

export function philemonReadingText(): string {
  const notes = new Map(philemonEdition.footnotes.map(note => [note.verse, note.text]));
  const paragraphs = philemonEdition.paragraphs.map(paragraph => paragraph.map(({ verse, text }) =>
    `${verse}${notes.has(verse) ? '*' : ''} ${text}`).join(' '));
  const footnotes = philemonEdition.footnotes.map(({ verse, text }) => `Verse ${verse} · ${text}`);
  return [...paragraphs, 'Publisher footnotes', ...footnotes].join('\n\n');
}
