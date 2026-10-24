import type { Metadata } from 'next';
import { SHARE_OG_IMAGES, SHARE_TWITTER_IMAGES } from '@/lib/site/shareCard';

const description =
  'Propose a Society of Explorers salon for your city, gather supporters, and follow the conditional plan for the first physical node in Boston.';

export const metadata: Metadata = {
  title: 'Global Salons',
  description,
  alternates: { canonical: '/salons' },
  openGraph: {
    title: 'Global Salons | Society of Explorers',
    description,
    url: '/salons',
    siteName: 'Society of Explorers',
    type: 'website',
    images: SHARE_OG_IMAGES,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Global Salons | Society of Explorers',
    description,
    images: SHARE_TWITTER_IMAGES,
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
