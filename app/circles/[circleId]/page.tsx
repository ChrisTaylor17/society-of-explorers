import type { Metadata } from 'next';
import CircleSafetyNav from '../messages/CircleSafetyNav';
import PublicFooter from '@/components/PublicFooter';
import { main, page } from '@/lib/circles/ui';
import CircleDetail from './CircleDetail';
import { notFound } from 'next/navigation';
import { isUuid } from '@/lib/ids/uuid';
import { circleDetailHref } from '@/lib/circles/discovery';
import { reelDiscussionId, withReelDiscussion } from '@/lib/clips/salon';
import { parseFellowshipTopic, withFellowshipTopic } from '@/lib/fellowship/topics';

export const metadata: Metadata = {
  title: 'Circle',
  description: 'A free weekly great-books circle on the SoE 12-week reading path.',
  robots: { index: false, follow: true },
};

export default async function CirclePage({ params, searchParams }: {
  params: Promise<{ circleId: string }>;
  searchParams: Promise<{ from?: string | string[]; reel?: string | string[]; fellowship?: string | string[] }>;
}) {
  const { circleId } = await params;
  if (!isUuid(circleId)) notFound();
  const id = circleId.toLowerCase();
  const query = await searchParams, fromOnline = query.from === 'online';
  const reel = query.fellowship === undefined ? reelDiscussionId(query.reel) : undefined;
  const fellowship = query.reel === undefined ? parseFellowshipTopic(query.fellowship) : undefined;
  return (
    <div style={page}>
      <CircleSafetyNav signInHref={`/login?next=${encodeURIComponent(withFellowshipTopic(withReelDiscussion(circleDetailHref(id, fromOnline), reel), fellowship))}`} />
      <main id="main" tabIndex={-1} style={{ ...main, paddingTop: '2.5rem' }}>
        <CircleDetail key={`${id}:${reel ?? fellowship ?? ''}`} circleId={id} fromOnline={fromOnline} reel={reel} fellowship={fellowship} />
      </main>
      <PublicFooter />
    </div>
  );
}
