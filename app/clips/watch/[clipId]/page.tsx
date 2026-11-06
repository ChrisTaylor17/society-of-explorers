import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { reelHref } from '@/lib/clips/contracts';
import { approvedReel } from '@/lib/clips/server';
import { SHARE_OG_IMAGES, SHARE_TWITTER_IMAGES, shareOrigin } from '@/lib/site/shareCard';
import ClipPlayer from '../../ClipPlayer';
import styles from '../../clips.module.css';

type Props = { params: Promise<{ clipId: string }> };
export const dynamic = 'force-dynamic';
const loadReel = cache((id: string) => approvedReel(id));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const clip = await loadReel((await params).clipId);
  if (!clip) return { title: 'Reel unavailable', robots: { index: false } };
  const { title, description } = clip;
  const origin = shareOrigin();
  const url = origin ? origin + reelHref(clip.id) : undefined;
  return {
    title, description,
    ...(url ? { alternates: { canonical: url } } : {}),
    openGraph: { title, description, url, siteName: 'Society of Explorers', type: 'website', images: SHARE_OG_IMAGES },
    twitter: { title, description, card: 'summary_large_image', images: SHARE_TWITTER_IMAGES },
  };
}

export default async function ReelPage({ params }: Props) {
  const clip = await loadReel((await params).clipId);
  if (!clip) notFound();
  return <>
    <a href="#reel-title" className="soe-skip-link">Skip to content</a>
    <div className={styles.page}><main className={styles.main}>
      <nav className={styles.nav} aria-label="Reading and community">
        <Link href="/">Society of Explorers</Link><Link href="/clips">All clips and passages</Link>
      </nav>
      <p className={styles.credit}>Archivist Reel</p>
      <h1 id="reel-title" tabIndex={-1}>{clip.title}</h1>
      <ClipPlayer clip={clip} standalone />
    </main></div>
  </>;
}
