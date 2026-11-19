import type { Metadata } from 'next';
import PublicFooter from '@/components/PublicFooter';
import CircleSafetyNav from '../messages/CircleSafetyNav';
import { h1, label, lead, main, page } from '@/lib/circles/ui';
import PassageComposer from './PassageComposer';

export const metadata: Metadata = { title: 'Discuss a source passage', robots: { index: false, follow: false, nocache: true } };
export default async function PassagePage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams || {})) {
    if (typeof value === 'string') query.append(key, value);
    else if (Array.isArray(value)) for (const item of value) query.append(key, item);
  }
  return <div style={page}><CircleSafetyNav /><main id="main" style={{ ...main, paddingTop: '2.5rem' }}>
    <p style={label}>Read, reflect, discuss</p><h1 style={h1}>Bring a source to your Circle</h1>
    <p style={lead}>Verify an edition, add your own thoughts, then review the complete message before you post it. Nothing posts automatically.</p>
    <PassageComposer key={query.toString()} search={query.toString()} />
  </main><PublicFooter /></div>;
}
