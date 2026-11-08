'use client';
import { useState } from 'react';
import { ANALYSIS_STATUS, getPassage, referenceTitle, STUDY_CLAIMS, STUDY_SOURCES, type Relationship } from '@/lib/fellowship/study';
import AnalysisReview from './AnalysisReview';
import styles from '@/app/fellowship/fellowship.module.css';

export default function StudyExplorer() {
  const [theme, setTheme] = useState('all');
  const [relationship, setRelationship] = useState<Relationship | 'all'>('all');
  const visible = STUDY_CLAIMS.filter(c => (theme === 'all' || c.theme === theme) && (relationship === 'all' || c.relationship === relationship));
  return <section className={styles.section} aria-labelledby="compare-claims">
    <h2 id="compare-claims">Follow a connection. Inspect the claim.</h2>
    <p>Each card separates the words on the page, a Christian reading, another relevant reading and the limits of the inference.</p>
    <div className={styles.filters}>
      <label>Passage family
        <select aria-label="Passage family" value={theme} onChange={event => setTheme(event.target.value)}>
          <option value="all">Both studies</option><option value="psalm">Psalm 22</option><option value="isaiah">Isaiah 53</option>
        </select>
      </label>
      <label>Relationship
        <select aria-label="Relationship" value={relationship} onChange={event => setRelationship(event.target.value as Relationship | 'all')}>
          <option value="all">All relationships</option><option value="quotation">Quotation</option><option value="allusion">Allusion</option><option value="comparison">Comparison</option><option value="textual issue">Textual issue</option>
        </select>
      </label>
    </div>
    <p role="status">{visible.length} connections shown.</p>
    {!visible.length && <p>No connection has this combination. Choose another relationship or both studies.</p>}
    {STUDY_CLAIMS.map(claim => <article className={styles.claim} key={claim.id} id={claim.id} data-claim={claim.id} hidden={!visible.some(c => c.id === claim.id)}>
      <span className={styles.badge}>{claim.relationship}</span>
      <p className={styles.eyebrow}>{claim.theme === 'psalm' ? 'Psalm 22' : 'Isaiah 53'}</p>
      <h3>{claim.title}</h3>
      <p><strong>What the sources say.</strong> {claim.observation}</p>
      <details>
        <summary>Read the cited passages</summary>
        {claim.references.map(reference => {
          const passage = getPassage(reference.passageId);
          if (!passage) return null;
          return <section key={referenceTitle(reference)}>
            <h4>{referenceTitle(reference)}</h4>
            <blockquote>{passage.verses.filter(v => v.verse >= reference.first && v.verse <= reference.last).map(verse => <span className={styles.verse} key={verse.verse} data-quoted-verse={passage.id + ':' + verse.verse}><sup>{verse.verse}</sup>{verse.text || ' '}{'\n'}</span>)}</blockquote>
            <a href={'#text-' + passage.id + '-v' + reference.first}>Read this passage in context below</a>
          </section>;
        })}
      </details>
      <details>
        <summary>Compare interpretations and limits</summary>
        <h4>Christian interpretation</h4><p>{claim.christian}</p>
        <h4>Other relevant readings</h4><p>{claim.other}</p>
        <h4>What this connection does not settle</h4><p>{claim.limit}</p>
        <p><strong>A question for your salon.</strong> {claim.question}</p>
      </details>
      <details>
        <summary>Inspect sources and review status</summary>
        <p className={styles.muted}>{ANALYSIS_STATUS}. No live AI generation or numerical certainty score is used here.</p>
        <ul className={styles.notes}>{claim.sources.map(id => <li key={id}><a href={STUDY_SOURCES[id].href} rel="noreferrer">{STUDY_SOURCES[id].title}</a><br />{STUDY_SOURCES[id].role}</li>)}</ul>
      </details>
      <AnalysisReview analysis={claim} />
    </article>)}
  </section>;
}
