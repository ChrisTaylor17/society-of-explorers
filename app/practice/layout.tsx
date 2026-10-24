import type { Metadata } from 'next';
import { SHARE_OG_IMAGES, SHARE_TWITTER_IMAGES } from '@/lib/site/shareCard';

const description =
  'One question a day from a Great Thinker. Write a short answer, get a reflection on what you wrote, and see how other explorers answered. Free with an Explorer account.';

export const metadata: Metadata = {
  title: 'Daily Practice',
  description,
  alternates: { canonical: '/practice' },
  openGraph: {
    title: 'Daily Practice | Society of Explorers',
    description,
    url: '/practice',
    siteName: 'Society of Explorers',
    type: 'website',
    images: SHARE_OG_IMAGES,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Daily Practice | Society of Explorers',
    description,
    images: SHARE_TWITTER_IMAGES,
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
