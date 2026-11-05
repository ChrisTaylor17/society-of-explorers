import type { Metadata } from 'next';
import CircleSafetyNav from '../messages/CircleSafetyNav';
import PublicFooter from '@/components/PublicFooter';
import { main, page } from '@/lib/circles/ui';
import CircleDetail from './CircleDetail';
import { notFound } from 'next/navigation';
import { isUuid } from '@/lib/ids/uuid';
import { circleDetailHref } from '@/lib/circles/discovery';

export const metadata: Metadata = {
  title: 'Circle',
  description: 'A free weekly great-books circle on the SoE 12-week reading path.',
  robots: { index: false, follow: true },
};

export default async function CirclePage({ params, searchParams }: {
  params: Promise<{ circleId: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const { circleId } = await params;
  if (!isUuid(circleId)) notFound();
  const id = circleId.toLowerCase();
  const fromOnline = (await searchParams).from === 'online';
  return (
    <div style={page}>
      <CircleSafetyNav signInHref={`/login?next=${encodeURIComponent(circleDetailHref(id, fromOnline))}`} />
      <main id="main" style={{ ...main, paddingTop: '2.5rem' }}>
        <CircleDetail circleId={id} fromOnline={fromOnline} />
      </main>
      <PublicFooter />
    </div>
  );
}
