import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isUuid } from '@/lib/ids/uuid';
import CircleSafetyNav from '../../circles/messages/CircleSafetyNav';
import QuestCircle from './QuestCircle';

export const metadata: Metadata = { title: 'Quest Circle', robots: { index: false, follow: false } };

export default async function QuestCirclePage({ params }: { params: Promise<{ circleId: string }> }) {
  const { circleId } = await params;
  if (!isUuid(circleId)) notFound();
  return <><CircleSafetyNav /><QuestCircle key={circleId.toLowerCase()} circleId={circleId.toLowerCase()} /></>;
}
