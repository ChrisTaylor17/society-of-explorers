import type { BookEditionResponse } from '@/lib/books/bookmarks';
import styles from './reading.module.css';

export default function EditionCredits({ metadata }: { metadata: BookEditionResponse }) {
  const { edition } = metadata;
  return <section className={styles.panel} aria-label="Edition credits, rights and license">
    <h2 className={styles.sectionTitle}>Edition and rights</h2>
    <p className={styles.notice}>{edition.licenseNotice}</p>
    <p className={styles.help}>Project Gutenberg identifies this source edition as public domain in the United States. Rights outside the United States have not been assessed here; check your local law before use.</p>
    <dl className={styles.credits}>
      <dt>Source title</dt><dd>{edition.sourceTitle}</dd><dt>Author</dt><dd>{edition.sourceAuthor}</dd>
      {edition.translators.length > 0 && <><dt>Translation</dt><dd>{edition.translators.map((person, index) => <div key={`${person.name}-${index}`}>{person.name}{person.appliesTo ? ` — ${person.appliesTo}` : ''}</div>)}</dd></>}
      {edition.editors.length > 0 && <><dt>Editing</dt><dd>{edition.editors.join('; ')}</dd></>}
      {edition.illustrators.length > 0 && <><dt>Illustrations</dt><dd>{edition.illustrators.join('; ')}</dd></>}
      <dt>Source credits</dt><dd>{edition.attribution}</dd>
    </dl>
    {edition.editionNotes.map((note, index) => <p key={index} className={styles.help}>{note}</p>)}
    <nav aria-label="Edition source and license" className={styles.nav}>
      <a href={edition.sourceCatalogUrl} target="_blank" rel="noopener noreferrer">Project Gutenberg source catalog</a>
      <a href={edition.licenseUrl} target="_blank" rel="noopener noreferrer">Project Gutenberg License</a>
      <a href={`${edition.documentUrl}#pg-footer`} target="_blank" rel="noopener noreferrer">Full license in this edition</a>
      <a href={edition.downloadUrl} download>Download original source archive free</a>
    </nav>
  </section>;
}
