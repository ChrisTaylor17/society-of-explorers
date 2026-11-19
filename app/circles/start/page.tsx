import type { Metadata } from 'next';
import Link from 'next/link';
import CircleSafetyNav from '../messages/CircleSafetyNav';
import PublicFooter from '@/components/PublicFooter';
import { gold, h1, label, lead, main, page } from '@/lib/circles/ui';
import StartCircleForm from './StartCircleForm';
import styles from '../participation.module.css';
import { parseReadingContext } from '@/lib/circles/reading-program';

export const metadata: Metadata = {
  title: 'Start a Circle',
  description: 'List a free weekly great-books circle in a public library, café or online. Takes about five minutes.',
  robots: { index: false, follow: true },
};

export default async function StartCirclePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) for (const item of value) query.append(key, item);
    else if (value !== undefined) query.append(key, value);
  }
  const { context, invalid } = parseReadingContext(query);
  const formats = query.getAll('format');
  const onlinePreset = formats.length === 1 && formats[0] === 'online';
  return (
    <div style={page}>
      <CircleSafetyNav />
      <main id="main" className={styles.scope} style={{ ...main, paddingTop: '2.5rem' }}>
        <p style={label}><Link href="/circles" style={{ color: gold }}>Circles</Link> · Start</p>
        <h1 style={h1}>Start a circle</h1>
        <p style={lead}>
          Choose a public venue or a private video link, then pick a weekly time and a start date. Choose the existing{' '}
          <Link href="/circles/path" style={{ color: gold }}>twelve-week starter path</Link> or agree 1 to 12 weekly readings from a pinned free book edition. Read the{' '}
          <Link href="/circles/host" style={{ color: gold }}>host toolkit</Link> and{' '}
          <Link href="/circles/norms" style={{ color: gold }}>norms</Link> before you list it.
        </p>
        <StartCircleForm key={JSON.stringify([context, invalid, onlinePreset])} initialContext={context} invalidContext={invalid} onlinePreset={onlinePreset} />
      </main>
      <PublicFooter />
    </div>
  );
}
