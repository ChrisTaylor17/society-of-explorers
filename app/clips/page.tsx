import type { Metadata } from 'next';
import Link from 'next/link';
import { clipCatalog } from '@/lib/clips/catalog';
import ClipPlayer from './ClipPlayer';
import styles from './clips.module.css';
export const metadata: Metadata = { title: 'Clips & Passages — Society of Explorers', description: 'Short credited readings and reviewed audio or video for thoughtful conversation.' };
export const dynamic = 'force-dynamic';
export default async function ClipsPage() {
  const catalog = await clipCatalog();
  return <div className={styles.page}><main className={styles.main}>
    <nav className={styles.nav} aria-label="Reading and community"><Link href="/">Society of Explorers</Link><Link href="/great-books">Great Books</Link><Link href="/circles">Circles</Link></nav>
    <h1>Clips &amp; passages</h1>
    <p className={styles.lead}>A short reading or a carefully credited clip can open a thoughtful conversation. Start with the source, make room for questions, and welcome a different point of view.</p>
    <section aria-labelledby="text-clips"><h2 id="text-clips">Read a passage</h2>
      <p>These excerpts are resolved from the exact local source editions. Project Gutenberg’s public-domain determinations apply in the United States; other territories have not been assessed here.</p>
      {catalog.texts.length === 0 && <p>The verified passages are unavailable at this check. <Link href="/great-books">Open the library</Link> to choose a source.</p>}
      <div className={styles.grid}>{catalog.texts.map(clip => <article key={clip.id} className={styles.card}>
        <h3>{clip.title}</h3><blockquote>{clip.quote}</blockquote><p className={styles.credit}>{clip.credit}</p>
        <div className={styles.controls}><Link href={clip.readerHref} prefetch={false}>Read in context</Link><Link href={clip.discussHref} prefetch={false}>Bring this passage to a Circle</Link></div>
        <details><summary>Edition credits and license</summary><p>{clip.licenseNotice}</p><a href={clip.sourcePage} target="_blank" rel="noopener noreferrer">Source edition</a> · <a href={clip.licenseUrl} target="_blank" rel="noopener noreferrer">Full Project Gutenberg License</a></details>
      </article>)}</div>
    </section>
    <section aria-labelledby="media-clips"><h2 id="media-clips">Watch or listen</h2>
      <p>Media loads only when you choose Load. Playback starts with the player controls. Every available clip includes source credits, a transcript and captions.</p>
      {catalog.media.length === 0 ? <p className={styles.notice}>Reviewed audio and video are not available yet. The text passages above are ready to explore; no unreviewed recording is being substituted.</p>
        : <div className={styles.grid}>{catalog.media.map(clip => <ClipPlayer key={`${clip.id}:${clip.media.sha256}`} clip={clip} />)}</div>}
    </section>
    <footer><p>Original community media and source excerpts have their own credits. A short clip does not replace its full context.</p><Link href="/great-books">Keep reading</Link> · <Link href="/circles">Find a Circle</Link></footer>
  </main></div>;
}
