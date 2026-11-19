import { PHILEMON_EDITION_METADATA, PHILEMON_READING, PHILEMON_STUDY_HREF, PHILEMON_WORK, philemonEdition, philemonReadingText } from './philemon-edition';
import { PHILEMON_AGENDA, PHILEMON_COMPARISON, PHILEMON_FURTHER_READING, PHILEMON_GREETING,
  PHILEMON_PERSPECTIVES, PHILEMON_SALON_QUESTIONS, PHILEMON_VIDEO_ROOM } from './philemon-study';
import { lukeGoodSamaritan } from './luke-good-samaritan';

const philemon = {
  id: PHILEMON_READING.bookId, work: PHILEMON_WORK, selection: PHILEMON_READING, href: PHILEMON_STUDY_HREF,
  shortTitle: 'Philemon', readAction: 'Read Philemon',
  source: philemonEdition, range: 'Philemon 1', readerTab: 'Read the letter', extent: 'Complete letter',
  notesTitle: 'Two readings of the greeting', notesReference: 'Philemon 1:3', intro: PHILEMON_GREETING,
  perspectives: PHILEMON_PERSPECTIVES, comparison: PHILEMON_COMPARISON, furtherReading: PHILEMON_FURTHER_READING,
  questions: PHILEMON_SALON_QUESTIONS, agenda: PHILEMON_AGENDA, meetingNote: PHILEMON_VIDEO_ROOM, metadata: PHILEMON_EDITION_METADATA,
};

export const SCRIPTURE_STUDIES = [philemon, lukeGoodSamaritan] as const;
export type ScriptureStudy = (typeof SCRIPTURE_STUDIES)[number];
export type ScriptureStudyId = ScriptureStudy['id'];

export function getScriptureStudy(id: unknown): ScriptureStudy | undefined {
  return SCRIPTURE_STUDIES.find(study => study.id === id);
}

export function getScriptureReading(context?: { bookId: string; editionId: string; from: number; to: number } | null) {
  if (!context) return undefined;
  const study = getScriptureStudy(context.bookId);
  return study && context.editionId === study.selection.editionId && context.from === study.selection.from
    && context.to === study.selection.to ? study : undefined;
}

export function scriptureReadingText(study: ScriptureStudy): string {
  if (study.id === PHILEMON_READING.bookId) return philemonReadingText();
  const { paragraphs, footnotes } = study.source;
  const notes = new Set(footnotes.map(note => note.verse));
  return [...paragraphs.map(paragraph => paragraph.map(({ verse, text }) => `${verse}${notes.has(verse) ? '*' : ''} ${text}`).join(' ')),
    'Publisher cross-references', ...footnotes.map(({ verse, text }) => `Verse ${verse} · ${text}`)].join('\n\n');
}
