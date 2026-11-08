import type { Metadata } from 'next';
import Link from 'next/link';
import StudyExplorer from '@/components/fellowship/StudyExplorer';
import { ANALYSIS_STATUS, SCRIPTURE_EDITION, SCRIPTURE_PASSAGES, STUDY_CONTEXTS, STUDY_REVISION, STUDY_SOURCES } from '@/lib/fellowship/study';
import styles from '../fellowship.module.css';

export const metadata: Metadata = { title: 'Psalm 22, Isaiah 53 and the crucifixion accounts', description: 'Read Scripture in context, compare Christian and Jewish interpretations, and inspect quotation, allusion and disputed claims of prophecy.' };

export default function ScriptureStudyPage() {
  return <>
    <header className={styles.intro}>
      <p className={styles.eyebrow}>Root Kernel · Scripture in conversation</p>
      <h1>The cross, the psalm and the servant.</h1>
      <p className={styles.lead}>Psalm 22 and Isaiah 52:13–53:12 alongside the crucifixion accounts. Begin with the text; then compare what readers make of it.</p>
      <p className={styles.muted}>{ANALYSIS_STATUS} · revision {STUDY_REVISION}. Christian belief, textual criticism and historical inference are labeled separately. You can inspect sources and prepare a local correction.</p>
      <nav className={styles.nav} aria-label="In this Scripture study"><a href="#reading-context">Start in context</a><a href="#compare-claims">Compare connections</a><a href="#scripture-readings">Read the passages</a><a href="#study-sources">Sources and rights</a></nav>
    </header>
    <section id="reading-context" className={styles.section} aria-labelledby="context-title">
      <h2 id="context-title">Two texts with their own voices.</h2>
      <div className={styles.twoColumns}>{Object.entries(STUDY_CONTEXTS).map(([id, context]) => <article className={styles.card} key={id}>
        <h3>{context.title}</h3><p>{context.context}</p>
        <details><summary>Compare named perspectives</summary>
          <h4>Nicene Christian reading</h4><p>{context.nicene}</p>
          <h4>Root Kernel’s Biblical Unitarian reading</h4><p>{context.rootKernel}</p>
          <h4>Jewish and historical readings</h4><p>{context.jewish}</p>
          <ul className={styles.notes}>{context.sources.map(source => <li key={source}><a href={STUDY_SOURCES[source].href} rel="noreferrer">{STUDY_SOURCES[source].title}</a></li>)}</ul>
        </details>
      </article>)}</div>
      <p>“Prophecy fulfilled in Christ” names a Christian theological interpretation. A literary quotation is directly observable; whether it demonstrates divine foreknowledge is a further claim. Parallels do not by themselves establish independent historical corroboration.</p>
    </section>
    <StudyExplorer />
    <noscript><p>All connections and Scripture remain readable. Filtering and local correction tools require JavaScript.</p></noscript>
    <section className={styles.section} id="scripture-readings" aria-labelledby="readings-title">
      <h2 id="readings-title">Read the passages in context</h2>
      <p>{SCRIPTURE_EDITION.name}. Full chapters are distinguished from selected context. Publisher footnotes retain the edition’s own textual choices; they are not SoE’s verdict.</p>
      {SCRIPTURE_PASSAGES.map(passage => <details key={passage.id} id={'reading-' + passage.id}>
        <summary>{passage.title} · {passage.extent}</summary>
        <article aria-label={'Scripture · ' + passage.title} className={styles.verses}>
          {passage.superscription && <p data-scripture-superscription={passage.id}><em>{passage.superscription}</em></p>}
          {passage.verses.map(verse => <p key={verse.verse} className={styles.verse} id={'text-' + passage.id + '-v' + verse.verse} tabIndex={-1}>
            <sup>{verse.verse}</sup><span data-scripture-verse={passage.id + ':' + verse.verse}>{verse.text}</span>
            {!verse.text && <em>No main-text reading at this verse number in this edition; see the publisher note.</em>}
          </p>)}
          {passage.footnotes.length > 0 && <section aria-label={'Publisher notes · ' + passage.title}>
            <h3>Publisher notes and cross-references</h3>
            <ul className={styles.notes}>{passage.footnotes.map(note => <li key={note.id} data-publisher-note={passage.id + ':' + note.verse}><a href={passage.publisherUrl + '#' + note.id} rel="noreferrer">Verse {note.verse} · {note.kind}</a>{' · '}{note.text}</li>)}</ul>
          </section>}
          <a href={passage.publisherUrl} rel="noreferrer">Read the complete chapter at the publisher</a>
        </article>
      </details>)}
    </section>
    <section className={styles.panel} id="study-sources" aria-labelledby="sources-title">
      <h2 id="sources-title">Sources, rights and correction</h2>
      <p>{SCRIPTURE_EDITION.notice} <a href={SCRIPTURE_EDITION.rightsUrl} rel="noreferrer">Read the publisher’s terms.</a></p>
      <p>The commentary is an original AI-assisted draft. Modern scholarship and Jewish commentary are linked and briefly paraphrased; their full translations or articles are not reproduced. No manuscript photograph is included.</p>
      <p>Correction controls prepare a local reading copy and a downloadable proposal with its claim ID, original revision, sources and reason. They do not submit to a shared review queue or change the Scripture. A shared editorial review process remains future work.</p>
      <ul className={styles.notes}>{Object.entries(STUDY_SOURCES).map(([id, source]) => <li key={id}><a href={source.href} rel="noreferrer">{source.title}</a><br />{source.role}</li>)}</ul>
      <div className={styles.actions}><Link href="/great-books/scripture/philemon">Continue with Philemon</Link><Link href="/great-books/scripture/luke-good-samaritan">Read the Good Samaritan</Link><Link href="/salons/pilot">Bring a question to a salon</Link></div>
    </section>
  </>;
}
