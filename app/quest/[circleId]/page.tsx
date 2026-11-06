import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isUuid } from '@/lib/ids/uuid';
import { reelDiscussionId, withReelDiscussion } from '@/lib/clips/salon';
import CircleSafetyNav from '../../circles/messages/CircleSafetyNav';
import QuestCircle from './QuestCircle';

export const metadata: Metadata = { title: 'Quest Circle', robots: { index: false, follow: false } };

export default async function QuestCirclePage({ params, searchParams }: {
  params: Promise<{ circleId: string }>;
  searchParams: Promise<{ reel?: string | string[] }>;
}) {
  const { circleId } = await params;
  if (!isUuid(circleId)) notFound();
  const id = circleId.toLowerCase();
  const reel = reelDiscussionId((await searchParams).reel);
  const signInHref = reel ? `/login?next=${encodeURIComponent(withReelDiscussion(`/quest/${id}`, reel))}` : undefined;
  return <><CircleSafetyNav signInHref={signInHref} /><QuestCircle key={`${id}:${reel ?? ''}`} circleId={id} reel={reel}
    sharedSalon={process.env.SOE_SHARED_SALON_ENABLED === 'true'} /></>;
}
