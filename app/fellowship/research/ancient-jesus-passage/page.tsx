import type { Metadata } from 'next';
import Link from 'next/link';
import AnalysisReview from '@/components/fellowship/AnalysisReview';
import { ANALYSIS_STATUS } from '@/lib/fellowship/study';
import { ANCIENT_TEXT_PAPER as paper, ANCIENT_TEXT_SOURCES as sources, DOSSIER_ANALYSES, HISTORICAL_POSITIONS, TEXT_WITNESSES, WHISTON_PASSAGE } from '@/lib/fellowship/ancient-text';
import styles from '../../fellowship.module.css';

export const metadata: Metadata = { title: 'An ancient passage about Jesus: the evidence dossier', description: 'A verified 2026 preprint, Josephus’s received passage, manuscript transmission and competing scholarly arguments, with provisional news identification.' };

function SourceLinks({ ids }: { ids: readonly string[] }) {
  return <ul className={styles.notes}>{ids.map(id => {
    const source = sources.find(s => s.id === id);
    return source ? <li key={id}><a href={source.href} rel="noreferrer">{source.title}</a></li> : null;
  })}</ul>;
}

export default function AncientTextPage() {
  return <article>
    <header className={styles.intro}>
      <p className={styles.eyebrow}>Ancient-text dossier · sources checked 8 November 2026</p>
      <h1>An ancient passage. A new argument. An open question.</h1>
      <p className={styles.lead}>The paper and the text below are identified. The connection to a particular recent news headline remains provisional.</p>
      <p className={styles.muted}>{ANALYSIS_STATUS}. This dossier does not announce a newly discovered 2,000-year-old manuscript.</p>
      <nav className={styles.nav} aria-label="In this research dossier"><a href="#paper">Exact paper</a><a href="#received-text">Read the passage</a><a href="#transmission">Dates and witnesses</a><a href="#scholarship">Competing arguments</a><a href="#dossier-sources">Sources and rights</a></nav>
    </header>
    <section className={styles.panel} id="paper" aria-labelledby="paper-title">
      <span className={styles.badge}>Preprint · {paper.date} · {paper.version}</span>
      <h2 id="paper-title">{paper.title}</h2>
      <p>{paper.author} · DOI {paper.doi}</p>
      <p><strong>Exact text under discussion:</strong> {paper.locus}.</p>
      <p>{paper.summary}</p>
      <p><a href={paper.href} rel="noreferrer">Open the original paper record</a>. The record labels it a preprint by an independent researcher; journal peer review is not established here.</p>
      <p>What is new is an argument about existing sources. The paper does not report excavation or discovery of a first-century physical manuscript. No specific viral headline has yet been matched to this dossier.</p>
    </section>
    <section className={styles.section} id="received-text" aria-labelledby="text-title">
      <p className={styles.eyebrow}>Layer 1 · what the received text says</p>
      <h2 id="text-title">Read the passage with its disputed wording visible.</h2>
      <p>Josephus, <em>Jewish Antiquities</em> 18.63–64, received text; translated by William Whiston (1737). The origin of several clauses is disputed.</p>
      <blockquote data-received-text="whiston-1737">{WHISTON_PASSAGE}</blockquote>
      <p>The language about calling Jesus more than a man, his being the Christ and his return alive belongs to the transmitted passage printed here. Quoting it does not certify each clause as Josephus’s original wording. No reconstructed “clean original” is substituted.</p>
      <SourceLinks ids={['whiston', 'whiston-rights']} />
      <details><summary>Keep the James notice separate</summary><p>Josephus’s reference to James at <em>Antiquities</em> 20.200 is a different passage. It should not be substituted for 18.63–64, and a conclusion about one passage does not authenticate every clause of the other.</p></details>
    </section>
    <section className={styles.section} id="transmission" aria-labelledby="transmission-title">
      <p className={styles.eyebrow}>Layer 2 · transmission and historical confidence</p>
      <h2 id="transmission-title">Composition, translation and surviving copy are different dates.</h2>
      <p>Josephus wrote in the late first century. The surviving witnesses listed below are later copies or quotations. Earlier Syriac copies of Christian quotations must not be confused with the medieval Greek copies of <em>Antiquities</em> Book 18.</p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption>Selected witnesses: copy metadata from Schmidt’s index; composition qualified by the scholarly repertory and critical edition linked below. No fresh palaeographic dating is claimed.</caption>
          <thead><tr><th scope="col">Work or witness</th><th scope="col">Composition</th><th scope="col">Identified surviving copy</th><th scope="col">What it is</th></tr></thead>
          <tbody>{TEXT_WITNESSES.map(row => <tr key={row.work}><th scope="row">{row.work}</th><td>{row.composition}</td><td>{row.copy}</td><td>{row.distinction}</td></tr>)}</tbody>
        </table>
      </div>
      <p>Related language traditions are not automatically independent first-century witnesses. Whealey traces the Arabic and Syriac versions she studies through Syriac Eusebius. Origen’s earlier statement that Josephus did not accept Jesus as Christ and Eusebius’s later quotation are important controls whose implications remain debated.</p>
      <SourceLinks ids={['witnesses', 'theophany-date', 'michael-edition', 'whealey', 'origen', 'eusebius']} />
    </section>
    <section className={styles.section} id="scholarship" aria-labelledby="scholarship-title">
      <h2 id="scholarship-title">Read the strongest competing arguments.</h2>
      <div className={styles.twoColumns}>{HISTORICAL_POSITIONS.map(position => <section className={styles.card} key={position.title}><h3>{position.title}</h3><p>{position.detail}</p><SourceLinks ids={position.sourceIds} /></section>)}</div>
      <p>These positions are a map of arguments, not a poll of scholars or a claim that all have equal support. An ancient author may relay a report without witnessing the event, and a text can be authentic without every reported event being established.</p>
      {DOSSIER_ANALYSES.map(analysis => <section className={styles.panel} key={analysis.id}><h3>{analysis.id === 'tf-transmission' ? 'What is established here?' : 'What remains a further inference?'}</h3><p>{analysis.observation}</p><SourceLinks ids={analysis.sources} /><AnalysisReview analysis={{ ...analysis, sourceLinks: sources }} /></section>)}
    </section>
    <section className={styles.panel} aria-labelledby="belief">
      <p className={styles.eyebrow}>Layer 3 · Christian belief</p>
      <h2 id="belief">Faith can speak honestly about the limits of an argument.</h2>
      <p>Christians confess Jesus as risen and read his passion in the light of Scripture. That confession should be stated as Christian belief. A disputed Josephus clause does not, on its own, prove or disprove it.</p>
      <p><strong>A salon question:</strong> What would a securely authentic sentence establish—and what would still require a different kind of evidence?</p>
      <Link href="/fellowship/scripture">Compare Psalm 22, Isaiah 53 and the passion accounts →</Link>
    </section>
    <section className={styles.section} id="dossier-sources" aria-labelledby="rights-title">
      <h2 id="rights-title">Sources and reuse</h2>
      <p>The historical Whiston translation is identified as public domain in the USA by its source catalogue. Only the received paragraph is reproduced, with attribution. The preprint and modern scholarship are linked and briefly summarized. Pines’s modern English translation of the Arabic version and manuscript photographs are not copied; their reuse would need separate permission.</p>
      <p>Correction proposals are local drafts. They preserve the claim ID and original revision and require a reason or source to check. No shared editorial review queue or live AI service is connected.</p>
      <ul className={styles.notes}>{sources.map(source => <li key={source.id}><a href={source.href} rel="noreferrer">{source.title}</a><br />{source.note}</li>)}</ul>
    </section>
  </article>;
}
