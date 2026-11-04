import type { Metadata } from 'next';
import Link from 'next/link';
import PublicFooter from '@/components/PublicFooter';
import CircleSafetyNav from '@/app/circles/messages/CircleSafetyNav';
import { gold, h1, label, lead, main, page, small } from '@/lib/circles/ui';
import MessageReviews from './MessageReviews';

export const metadata: Metadata = { title: 'Review Circle messages', robots: { index: false, follow: false, nocache: true } };
export default function MessageReviewPage() {
  return <div style={page}><CircleSafetyNav /><main id="main" style={{ ...main, paddingTop: '2.5rem' }}>
    <p style={label}>Assigned human reviewers</p><h1 style={h1}>Review Circle messages</h1>
    <p style={lead}>Read current evidence and explain decisions about conduct. Political or religious disagreement alone does not justify a restriction.</p>
    <p style={{ ...small, marginBottom: '1rem' }}><Link href="/login?next=/moderation/messages" style={{ color: gold, display: 'inline-flex', alignItems: 'center', minHeight: '44px', minWidth: '44px', maxWidth: '100%', verticalAlign: 'middle' }}>Sign in</Link> · <Link href="/moderation/circles" style={{ color: gold, display: 'inline-flex', alignItems: 'center', minHeight: '44px', minWidth: '44px', maxWidth: '100%', verticalAlign: 'middle' }}>Circle listing reviews</Link></p>
    <MessageReviews />
  </main><PublicFooter /></div>;
}
