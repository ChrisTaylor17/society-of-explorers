import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Fund the First Physical Node',
  description:
    'Support a patronage campaign toward a possible first Society of Explorers physical node in Boston. Patronage offers recognition, access, community, and artifacts, not financial returns.',
  alternates: {
    canonical: '/92b/fund',
  },
  openGraph: {
    title: 'Fund the First Physical Node | Society of Explorers',
    description:
      'Help fund the responsible work required to determine whether a first privacy-first physical salon in Boston can become viable.',
    url: '/92b/fund',
    siteName: 'Society of Explorers',
    type: 'website',
    images: [
      {
        url: '/images/hero-renaissance.jpeg',
        alt: 'A possible first Society of Explorers physical node',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Fund the First Physical Node | Society of Explorers',
    description:
      'Patronage for a possible privacy-first physical salon in Boston, with conditional claims and no promise of financial return.',
    images: ['/images/hero-renaissance.jpeg'],
  },
};

export default function FundLayout({ children }: { children: React.ReactNode }) {
  return children;
}
