'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { circleDetailHref } from '@/lib/circles/discovery';
import { isUuid } from '@/lib/ids/uuid';
import reading from '../../reading.module.css';

export default function CircleReturnLink() {
  const circles = useSearchParams().getAll('circle');
  if (circles.length !== 1 || !isUuid(circles[0])) return null;

  return <p className={reading.help}>
    <Link className={reading.bookLink} href={circleDetailHref(circles[0].toLowerCase(), false)} prefetch={false}>Return to Circle details</Link>
  </p>;
}
