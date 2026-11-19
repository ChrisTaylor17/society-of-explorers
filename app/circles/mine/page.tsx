import type { Metadata } from 'next';
import PublicFooter from '@/components/PublicFooter';
import CircleSafetyNav from '../messages/CircleSafetyNav';
import { h1, label, lead, main, page } from '@/lib/circles/ui';
import MyCircles from './MyCircles';

export const metadata: Metadata = { title: 'My Circles', robots: { index: false, follow: false, nocache: true } };
export default function MyCirclesPage() {
  return <div style={page}><CircleSafetyNav /><main id="main" style={{ ...main, paddingTop: '2.5rem' }}>
    <p style={label}>Return to your community</p><h1 style={h1}>My Circles</h1>
    <p style={lead}>Return to Circles you joined or host, even when they are hidden or completed. You can leave any time. Hosts keep their completion controls after leaving membership.</p>
    <MyCircles />
  </main><PublicFooter /></div>;
}
