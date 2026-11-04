import type { Metadata } from 'next';
import CircleSafetyNav from '../messages/CircleSafetyNav';
import PublicFooter from '@/components/PublicFooter';
import { main, page } from '@/lib/circles/ui';
import CircleDetail from './CircleDetail';
import { notFound } from 'next/navigation';
import { isUuid } from '@/lib/ids/uuid';

export const metadata: Metadata = {
  title: 'Circle',
  description: 'A free weekly great-books circle on the SoE 12-week reading path.',
  robots: { index: false, follow: true },
};

export default async function CirclePage({ params }: { params: Promise<{ circleId: string }> }) {
  const { circleId } = await params;
  if (!isUuid(circleId)) notFound();
  return (
    <div style={page}>
      <CircleSafetyNav />
      <main id="main" style={{ ...main, paddingTop: '2.5rem' }}>
        <CircleDetail key={circleId.toLowerCase()} circleId={circleId.toLowerCase()} />
      </main>
      <PublicFooter />
    </div>
  );
}
