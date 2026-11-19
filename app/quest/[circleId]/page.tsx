import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isUuid } from '@/lib/ids/uuid';
import { reelDiscussionId, withReelDiscussion } from '@/lib/clips/salon';
import { parseFellowshipTopic, withFellowshipTopic } from '@/lib/fellowship/topics';
import CircleSafetyNav from '../../circles/messages/CircleSafetyNav';
import QuestCircle from './QuestCircle';

export const metadata: Metadata = { title: 'Quest Circle', robots: { index: false, follow: false } };

export default async function QuestCirclePage({ params, searchParams }: {
  params: Promise<{ circleId: string }>;
  searchParams: Promise<{ reel?: string | string[]; fellowship?: string | string[] }>;
}) {
  const { circleId } = await params;
  if (!isUuid(circleId)) notFound();
  const id = circleId.toLowerCase();
  const query = await searchParams;
  const reel = query.fellowship === undefined ? reelDiscussionId(query.reel) : undefined;
  const fellowship = query.reel === undefined ? parseFellowshipTopic(query.fellowship) : undefined;
  const signInHref = reel || fellowship ? `/login?next=${encodeURIComponent(withFellowshipTopic(withReelDiscussion(`/quest/${id}`, reel), fellowship))}` : undefined;
  return <><CircleSafetyNav signInHref={signInHref} /><QuestCircle key={`${id}:${reel ?? fellowship ?? ''}`} circleId={id} reel={reel} fellowship={fellowship}
    sharedSalon={process.env.SOE_SHARED_SALON_ENABLED === 'true'} /></>;
}
