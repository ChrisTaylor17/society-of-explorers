import type { Metadata } from 'next';
import PublicFooter from '@/components/PublicFooter';
import { h1, label, lead, main, page } from '@/lib/circles/ui';
import CircleSafetyNav from '../messages/CircleSafetyNav';
import Contributions from './Contributions';

export const metadata: Metadata = { title: 'My posted Circle messages', robots: { index: false, follow: false, nocache: true } };
export default function ContributionsPage() {
  return <div style={page}><CircleSafetyNav /><main id="main" style={{ ...main, paddingTop: '2.5rem' }}>
    <p style={label}>Your contributions</p><h1 style={h1}>My posted messages</h1>
    <p style={lead}>Review your Circle messages and remove them from member views when you choose.</p>
    <Contributions />
  </main><PublicFooter /></div>;
}
