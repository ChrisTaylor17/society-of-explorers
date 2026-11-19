import type { Metadata } from 'next';
import { SHARE_OG_IMAGES, SHARE_TWITTER_IMAGES } from '@/lib/site/shareCard';

export const metadata: Metadata = {
  title: 'Physical-Space Funding Proposal',
  description:
    'Review the earlier Boston venue funding proposal. The campaign is on hold and pledges are not open.',
  alternates: {
    canonical: '/92b/fund',
  },
  openGraph: {
    title: 'Physical-Space Funding Proposal | Society of Explorers',
    description:
      'A proposed physical-space budget and the questions to settle before a future offer. Pledges are not open.',
    url: '/92b/fund',
    siteName: 'Society of Explorers',
    type: 'website',
    images: SHARE_OG_IMAGES,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Physical-Space Funding Proposal | Society of Explorers',
    description:
      'The Boston venue funding proposal is under review. The campaign is on hold and pledges are not open.',
    images: SHARE_TWITTER_IMAGES,
  },
};

export default function FundLayout({ children }: { children: React.ReactNode }) {
  return children;
}
