import type { Metadata } from 'next';
import HomePage from './HomePageClient';
import { SHARE_OG_IMAGES, SHARE_TWITTER_IMAGES, SITE_DESCRIPTION } from '@/lib/site/shareCard';

// The homepage is a client component, so its metadata lives in this thin
// server wrapper. The root layout's openGraph would otherwise point the share
// card at metadataBase (www.societyofexplorers.com), which is served by a
// different project where /opengraph-image 404s. SHARE_OG_IMAGES resolves to
// this project's own production host on Vercel. Canonical URLs are unchanged.
export const metadata: Metadata = {
  openGraph: {
    siteName: 'Society of Explorers',
    type: 'website',
    locale: 'en_US',
    title: 'Society of Explorers',
    description: SITE_DESCRIPTION,
    images: SHARE_OG_IMAGES,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Society of Explorers',
    description: SITE_DESCRIPTION,
    images: SHARE_TWITTER_IMAGES,
  },
};


export default function Page() {
  return <HomePage />;
}
