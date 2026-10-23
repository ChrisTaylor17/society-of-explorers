import type { Metadata } from 'next';
import { membershipOffersJsonLd, serializeJsonLd } from '@/lib/join/structuredData';

const description =
  'Join the Society of Explorers. Start free with the Daily Practice and Council questions, or choose Seeker ($19/mo), Scholar ($49/mo), Philosopher ($99/mo) or Oracle ($499 lifetime).';

export const metadata: Metadata = {
  title: 'Membership and Pricing',
  description,
  alternates: { canonical: '/join' },
  openGraph: {
    title: 'Membership and Pricing | Society of Explorers',
    description,
    url: '/join',
    siteName: 'Society of Explorers',
    type: 'website',
    images: [{ url: '/images/hero-guild.jpeg', alt: 'Society of Explorers' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Membership and Pricing | Society of Explorers',
    description,
    images: ['/images/hero-guild.jpeg'],
  },
};

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(membershipOffersJsonLd()) }} />
      {children}
    </>
  );
}
