'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { circleDetailHref } from '@/lib/circles/discovery';
import { scriptureDiscussionHref } from '@/lib/circles/scripture-discussion';
import type { ScriptureStudyId } from '@/lib/root-kernel/scripture-studies';
import { isUuid } from '@/lib/ids/uuid';
import reading from '../../reading.module.css';

export default function CircleReturnLink({ study }: { study: ScriptureStudyId }) {
  const circles = useSearchParams().getAll('circle');
  if (circles.length !== 1 || !isUuid(circles[0])) return null;

  const circleId = circles[0].toLowerCase();
  return <nav className={reading.nav} aria-label="Circle reading">
    <Link className={reading.bookLink} href={circleDetailHref(circleId, false)} prefetch={false}>Return to Circle details</Link>
    <Link className={reading.bookLink} href={scriptureDiscussionHref(circleId, study)} prefetch={false}>Discuss this study</Link>
  </nav>;
}
