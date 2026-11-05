import type { Metadata } from 'next';
import CircleSafetyNav from '@/app/circles/messages/CircleSafetyNav';
import { main, page } from '@/lib/circles/ui';
import QuestReviews from './QuestReviews';

export const metadata: Metadata = {
  title: 'Assigned reviews in Quest Browser',
  robots: { index: false, follow: false, nocache: true },
};

export default function QuestReviewsPage() {
  return <div style={page}><CircleSafetyNav /><main id="main" style={{ ...main, paddingTop: '2.5rem' }}><QuestReviews /></main></div>;
}
