import type { Metadata } from 'next';

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
    images: [
      {
        url: '/images/hero-guild.jpeg',
        alt: 'A proposed Society of Explorers physical salon',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Boston Physical Node Proposal | Society of Explorers',
    description:
      'Explore the conditional path toward a first privacy-first Society of Explorers salon in Boston.',
    images: ['/images/hero-guild.jpeg'],
  },
};

export default function NinetyTwoBLayout({ children }: { children: React.ReactNode }) {
  return children;
}
