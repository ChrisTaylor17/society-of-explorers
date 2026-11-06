import Link from 'next/link';
import { getReadingWork, getReadingEdition, readingEditionLabel, readingReaderHref, readingSessionLabel, type ReadingProgram } from '@/lib/circles/reading-program';
import { getScriptureStudy } from '@/lib/root-kernel/scripture-studies';
import { body, h2, small } from '@/lib/circles/ui';
import styles from './reading-program.module.css';

export default function ReadingProgramSummary({ program, circleId, compact = false, proposal = false }: { program: ReadingProgram; circleId?: string; compact?: boolean; proposal?: boolean }) {
  const book = getReadingWork(program.bookId), edition = getReadingEdition(program.bookId, program.editionId);
  if (!book || !edition) return <p style={small}>The agreed reading edition could not be verified.</p>;
  const scripture = getScriptureStudy(program.bookId);
  const Heading = compact ? 'h4' : 'h2';
  const readings = <ol className={styles.list}>{program.sessions.map((session, index) => <li key={`${index}:${session.from}:${session.to}`}>
    <Link href={readingReaderHref(program, session, circleId)}>Week {index + 1}: {readingSessionLabel(program, session)}</Link>
  </li>)}</ol>;
  return <section className={styles.scope} aria-label={proposal ? 'Proposed reading program' : 'Agreed reading program'}>
    <Heading style={{ ...h2, marginTop: compact ? '.75rem' : '2rem' }}>{book.title} · {book.author}</Heading>
    <p style={small}>Pinned source edition: {readingEditionLabel(program)}</p>
    {edition.editors.length > 0 && <p style={small}>Edited by {edition.editors.join(', ')}.</p>}
    {edition.illustrators.length > 0 && <p style={small}>Illustrated by {edition.illustrators.join(', ')}.</p>}
    <p style={small}>{scripture ? scripture.metadata.edition.licenseNotice
      : 'US public-domain assessment: Project Gutenberg. Rights outside the US have not been assessed; check local law.'}</p>
    {compact ? <details><summary>Agreed weekly readings ({program.sessions.length})</summary>{readings}</details> : <>
      <p style={{ ...body, marginTop: '.75rem' }}>{proposal ? `You are proposing these ${program.sessions.length} weekly selections. Confirming will fix this plan when the Circle is created.` : `The host agreed these ${program.sessions.length} weekly selections when creating this Circle.`} They may revisit or omit parts of the edition. The reading plan cannot be changed after creation.</p>{readings}
      <p style={small}>{scripture ? `Open the ${scripture.extent.toLowerCase()} and questions for your salon.`
        : 'Reading positions identify stable places in this exact edition. Links open the complete free source with the agreed selection indicated.'}</p>
    </>}
  </section>;
}
