import type { Metadata } from 'next';
import CircleSafetyNav from '../../circles/messages/CircleSafetyNav';
import QuestCircle from '../[circleId]/QuestCircle';

export const metadata: Metadata = { title: 'My Quest Browser contributions', robots: { index: false, follow: false, nocache: true } };

/** Account-level entry: no Circle lookup, membership or Circle identifier. */
export default function QuestContributionsPage() {
  return <><CircleSafetyNav /><QuestCircle /></>;
}
