import type { Metadata } from 'next';
import { SHARE_OG_IMAGES, SHARE_TWITTER_IMAGES } from '@/lib/site/shareCard';

export const metadata: Metadata = {
  title: 'Boston Physical Node Proposal',
  description:
    'Explore the conditional proposal for a first Society of Explorers physical node in Boston, subject to access, lease, repair, and landlord alignment.',
  alternates: {
    canonical: '/92b',
  },
  openGraph: {
    title: 'Boston Physical Node Proposal | Society of Explorers',
    description:
      'A transparent, conditional path toward a privacy-first salon for deep conversation, Great Books, music, and human-centered AI.',
    url: '/92b',
    siteName: 'Society of Explorers',
    type: 'website',
    images: SHARE_OG_IMAGES,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Boston Physical Node Proposal | Society of Explorers',
    description:
      'Explore the conditional path toward a first privacy-first Society of Explorers salon in Boston.',
    images: SHARE_TWITTER_IMAGES,
  },
};

export default function NinetyTwoBLayout({ children }: { children: React.ReactNode }) {
  return children;
}
