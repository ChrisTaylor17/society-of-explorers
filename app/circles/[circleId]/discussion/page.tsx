import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import PublicFooter from '@/components/PublicFooter';
import CircleSafetyNav from '../../messages/CircleSafetyNav';
import { isUuid } from '@/lib/ids/uuid';
import { discussionHref } from '@/lib/circles/thread';
import { getScriptureDiscussion, scriptureDiscussionHref } from '@/lib/circles/scripture-discussion';
import { h1, lead, main, page } from '@/lib/circles/ui';
import DiscussionBrowser from './DiscussionBrowser';
import styles from './discussion.module.css';
import { reelDiscussionId, withReelDiscussion } from '@/lib/clips/salon';

export const metadata: Metadata = { title: 'Circle discussion archive', robots: { index: false, follow: false, nocache: true } };
export default async function DiscussionPage({ params, searchParams }: { params: Promise<{ circleId: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { circleId } = await params;
  if (!isUuid(circleId)) notFound();
  const query = await searchParams || {};
  const keys = Object.keys(query), message = query.message, reel = reelDiscussionId(query.reel);
  const study = getScriptureDiscussion(query.study);
  const invalid = keys.some(key => key !== 'message' && key !== 'reel' && key !== 'study')
    || message !== undefined && (typeof message !== 'string' || !isUuid(message)) || query.reel !== undefined && !reel
    || query.study !== undefined && (!study || message !== undefined || query.reel !== undefined);
  const messageId = !invalid && typeof message === 'string' ? message.toLowerCase() : null;
  const selectedReel = invalid ? undefined : reel;
  const selectedStudy = invalid ? undefined : study?.id;
  const returnHref = selectedStudy ? scriptureDiscussionHref(circleId, selectedStudy)
    : selectedReel ? withReelDiscussion(discussionHref(circleId, messageId), selectedReel) : undefined;
  const signInHref = returnHref ? `/login?next=${encodeURIComponent(returnHref)}` : undefined;
  return <div style={page}><CircleSafetyNav signInHref={signInHref} /><main id="main" className={styles.scope} style={{ ...main, paddingTop: '2.5rem' }}>
    <h1 style={h1}>Circle discussion</h1>
    <p style={lead}>Read earlier conversations, follow a reply to its parent, and add your own thoughts. Discussion stays available only to current members of this visible Circle.</p>
    <DiscussionBrowser key={`${circleId.toLowerCase()}:${messageId || ''}:${invalid}:${selectedReel ?? selectedStudy ?? ''}`} circleId={circleId.toLowerCase()} messageId={messageId} invalidIntent={invalid} reel={selectedReel} study={selectedStudy} />
    <p style={{ marginTop: '2rem' }}><Link href={discussionHref(circleId)}>Discussion archive</Link></p>
  </main><PublicFooter /></div>;
}
