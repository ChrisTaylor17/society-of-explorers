import { notFound, redirect } from 'next/navigation';
import { circleDetailHref } from '@/lib/circles/discovery';
import { isCircleInviteId } from '@/lib/circles/invite';

export default async function CircleInvitePage({ params }: { params: Promise<{ circleId: string }> }) {
  const { circleId } = await params;
  if (!isCircleInviteId(circleId)) notFound();
  redirect(circleDetailHref(circleId, false));
}
