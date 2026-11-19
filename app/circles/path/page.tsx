import type { Metadata } from 'next';
import Link from 'next/link';
import CircleSafetyNav from '../messages/CircleSafetyNav';
import PublicFooter from '@/components/PublicFooter';
import { CIRCLE_PATH } from '@/lib/circles/path';
import { body, card, gold, h1, label, lead, main, muted, page, parchment, small } from '@/lib/circles/ui';
import styles from '../participation.module.css';

export const metadata: Metadata = {
  title: 'The 12-Week Reading Path',
  description: 'Twelve weekly readings from Genesis to Lincoln, each with a source link and a discussion guide.',
};

export default function CirclePathPage() {
  return (
    <div style={page}>
      <CircleSafetyNav />
      <main id="main" className={styles.scope} style={main}>
        <p style={label}><Link href="/circles" style={{ color: gold }}>Circles</Link> · Reading path</p>
        <h1 style={h1}>The 12-week reading path</h1>
        <p style={lead}>
          One short reading a week, from the oldest questions about human worth to the founding arguments about
          freedom and self-government. Source links and discussion guides accompany each reading. Most take under an hour.
        </p>
        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '10px' }}>
          {CIRCLE_PATH.map((r) => (
            <li key={r.week} style={{ ...card, display: 'flex', gap: '14px' }}>
              <span style={{ fontFamily: 'Cinzel, serif', fontSize: '15px', color: gold, minWidth: '64px' }}>Week {r.week}</span>
              <div>
                <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: '17px', fontWeight: 400, margin: '0 0 4px' }}>
                  <Link href={`/circles/path/${r.week}`} style={{ color: parchment }}>{r.title}</Link>
                </h2>
                <p style={{ ...small, margin: '0 0 4px' }}>{r.author} · about {r.minutes} min</p>
                <p style={{ fontSize: '16px', color: muted, margin: 0 }}>
                  {r.sources.map((s, i) => (
                    <span key={s.url}>
                      {i > 0 && ' · '}
                      <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: gold }}>{s.label}</a>
                    </span>
                  ))}
                  {' · '}
                  <Link href={`/circles/path/${r.week}`} style={{ color: gold }}>Discussion guide</Link>
                </p>
              </div>
            </li>
          ))}
        </ol>
        <p style={{ ...body, marginTop: '2rem' }}>
          Source links lead to Project Gutenberg and the Yale Law School Avalon Project. Check the edition’s
          terms and your local law. The <Link href="/great-books" style={{ color: gold }}>local library</Link> provides
          eight complete editions with source credits and a US-specific rights assessment; that assessment does not cover every external source in this path.
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}
