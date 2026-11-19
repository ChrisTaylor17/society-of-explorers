import type { Metadata } from 'next';
import Link from 'next/link';
import CircleSafetyNav from './messages/CircleSafetyNav';
import PublicFooter from '@/components/PublicFooter';
import { SHARE_OG_IMAGES, SHARE_TWITTER_IMAGES } from '@/lib/site/shareCard';
import { WEEKLY_LOOP } from '@/lib/circles/path';
import { body, button, card, gold, h1, h2, label, lead, main, page, small } from '@/lib/circles/ui';
import CirclesBrowser, { CircleStartLink } from './CirclesBrowser';
import { parseDiscoveryQuery } from '@/lib/circles/discovery';
import { getReadingEdition, readingStartHref } from '@/lib/circles/reading-program';
import styles from './participation.module.css';

const description =
  'Free Great Books communities in a library, café or online. Agree a book edition and weekly readings, or follow the twelve-week starter path.';

export const metadata: Metadata = {
  title: 'Circles',
  description,
  openGraph: { title: 'SoE Circles — Society of Explorers', description, siteName: 'Society of Explorers', type: 'website', images: SHARE_OG_IMAGES },
  twitter: { card: 'summary_large_image', title: 'SoE Circles — Society of Explorers', description, images: SHARE_TWITTER_IMAGES },
};

export default async function CirclesPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams ?? {})) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item);
  }
  const query = parseDiscoveryQuery(params), pinned = !query.invalidContext && query.book ? getReadingEdition(query.book, query.edition) : null;
  const startHref = pinned ? readingStartHref({ bookId: pinned.bookId, editionId: pinned.editionId, from: query.from ?? 0, to: query.to ?? pinned.blockCount - 1 }) : '/circles/start';
  return (
    <div style={page}>
      <CircleSafetyNav />
      <main id="main" tabIndex={-1} className={styles.scope} style={{ ...main, paddingTop: '2.5rem' }}>
        <p style={label}>SoE Circles</p>
        <h1 style={h1}>Read together in a weekly salon</h1>
        <p style={lead}>
          A circle is 3 to 12 people who meet once a week, in a public library, café or online, to talk about one short
          reading. Agree a pinned book edition and weekly selections, or follow the twelve-week starter path with its
          source links and discussion guides. First-time readers are welcome: good texts and honest conversation bring us together.
        </p>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', margin: '0 0 2rem' }}>
          <CircleStartLink initialHref={startHref} initialInvalid={Boolean(query.invalidContext)} />
          <Link href="/circles/path" style={button}>See the 12-week path</Link>
        </div>

        <section aria-labelledby="find-heading">
          <h2 id="find-heading" style={h2}>Find a circle</h2>
          <CirclesBrowser />
        </section>

        <section aria-labelledby="loop-heading">
          <h2 id="loop-heading" style={h2}>What happens each week</h2>
          <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '8px' }}>
            {WEEKLY_LOOP.map((s, i) => (
              <li key={s.step} style={{ ...card, display: 'flex', gap: '14px', alignItems: 'baseline' }}>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', color: gold, minWidth: '22px' }}>{i + 1}</span>
                <div>
                  <p style={{ ...body, margin: 0 }}>
                    <strong style={{ color: '#f5f0e8' }}>{s.step}</strong> · {s.minutes} min
                  </p>
                  <p style={small}>{s.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="more-heading">
          <h2 id="more-heading" style={h2}>Before you go</h2>
          <ul style={{ ...body, paddingLeft: '1.2rem' }}>
            <li><Link href="/circles/norms" style={{ color: gold }}>Community norms and safety</Link>: public places only, first names are fine, and how to report a problem.</li>
            <li><Link href="/circles/host" style={{ color: gold }}>Host toolkit</Link>: how to run a good first meeting, keep time and handle hard moments.</li>
            <li><Link href="/circles/path" style={{ color: gold }}>The 12-week reading path</Link>: from Genesis to Lincoln, with a guide for every week.</li>
          </ul>
          <p style={small}>Circles are free. Society of Explorers does not run or supervise individual circles; hosts are volunteers.</p>
          <p style={small}>Optional <Link href="/join" style={{ color: gold }}>supporter membership</Link> contributes toward the free library and community infrastructure. Paying does not change Circle access or moderation decisions.</p>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
