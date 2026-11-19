import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import CircleSafetyNav from '../../messages/CircleSafetyNav';
import PublicFooter from '@/components/PublicFooter';
import { CIRCLE_PATH, WEEKLY_LOOP, getReading } from '@/lib/circles/path';
import { body, button, card, gold, h1, h2, ivory85, label, lead, main, page, parchment, small } from '@/lib/circles/ui';
import { readingReaderHref, starterReadingContext } from '@/lib/circles/reading-program';
import { isUuid } from '@/lib/ids/uuid';
import styles from '../../participation.module.css';

export const dynamicParams = false;

export function generateStaticParams() {
  return CIRCLE_PATH.map((r) => ({ week: String(r.week) }));
}

export async function generateMetadata({ params }: { params: Promise<{ week: string }> }): Promise<Metadata> {
  const { week } = await params;
  const r = getReading(Number(week));
  if (!r) return { title: 'Reading not found' };
  return {
    title: `Week ${r.week}: ${r.title} — Discussion Guide`,
    description: `A free discussion guide for ${r.title} (${r.author}): context, questions, a counterpoint and a small practice.`,
  };
}

export default async function ReadingGuidePage({ params, searchParams }: { params: Promise<{ week: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { week } = await params;
  const r = getReading(Number(week));
  if (!r) notFound();
  const prev = getReading(r.week - 1);
  const next = getReading(r.week + 1);
  const query = await searchParams;
  const circle = typeof query?.circle === 'string' && isUuid(query.circle) ? query.circle.toLowerCase() : null;
  const suffix = circle ? `?circle=${circle}` : '';
  const context = starterReadingContext(r.week);

  return (
    <div style={page}>
      <CircleSafetyNav />
      <main id="main" className={styles.scope} style={main}>
        <p style={label}>
          <Link href="/circles" style={{ color: gold }}>Circles</Link> · <Link href="/circles/path" style={{ color: gold }}>Path</Link> · Week {r.week}
        </p>
        <h1 style={h1}>{r.title}</h1>
        <p style={lead}>{r.author}</p>
        {circle && <p style={small}><Link href={`/circles/${circle}`} style={button}>Return to the Circle and discussion</Link></p>}

        <div style={{ ...card, margin: '0 0 1.5rem' }}>
          <p style={{ ...body, margin: '0 0 6px' }}><strong style={{ color: parchment }}>Read:</strong> {r.selection} (about {r.minutes} min)</p>
          <ul style={{ ...body, margin: 0, paddingLeft: '1.2rem' }}>
            {r.sources.map((s) => (
              <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: gold }}>{s.label}</a> (external source; check edition terms and local law)</li>
            ))}
          </ul>
          {context && <p style={{ ...body, marginTop: '1rem' }}><Link href={readingReaderHref(context, context, circle ?? undefined)} style={button}>Read this selection in the verified local edition</Link></p>}
        </div>

        <h2 style={h2}>Context</h2>
        <p style={body}>{r.context}</p>

        <h2 style={h2}>Questions</h2>
        <ol style={{ ...body, paddingLeft: '1.4rem' }}>
          {r.questions.map((q) => <li key={q} style={{ marginBottom: '0.6rem' }}>{q}</li>)}
        </ol>
        <p style={small}>Hosts: open with one question and let the group find the rest. There are no right answers.</p>

        <h2 style={h2}>Counterpoint</h2>
        <p style={body}>{r.counterpoint}</p>

        <h2 style={h2}>This week&rsquo;s practice</h2>
        <p style={body}>{r.practice}</p>

        <h2 style={h2}>Running the meeting</h2>
        <ul style={{ ...body, paddingLeft: '1.2rem' }}>
          {WEEKLY_LOOP.map((s) => <li key={s.step}><strong style={{ color: parchment }}>{s.step}</strong> ({s.minutes} min): {s.detail}</li>)}
        </ul>

        <p style={{ ...small, color: ivory85, margin: '2rem 0 1.5rem' }}>
          Society of Explorers prepared this discussion guide with AI assistance. Check claims and quotations
          against the linked edition; translations differ. The guide does not establish rights outside the source’s stated jurisdiction.
        </p>

        <nav aria-label="Other weeks" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {prev && <Link href={`/circles/path/${prev.week}${suffix}`} style={button}>← Week {prev.week}</Link>}
          {next && <Link href={`/circles/path/${next.week}${suffix}`} style={button}>Week {next.week} →</Link>}
          <Link href="/circles" style={button}>Find a circle</Link>
        </nav>
      </main>
      <PublicFooter />
    </div>
  );
}
