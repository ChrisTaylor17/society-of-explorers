import type { Metadata } from 'next';
import { membershipOffersJsonLd, serializeJsonLd } from '@/lib/join/structuredData';
const description = 'Read complete source editions and join volunteer reading Circles for free. Optional $10 USD monthly support contributes toward community infrastructure; purchase availability is checked separately.';
export const metadata: Metadata = { title: 'Free community and optional support', description, alternates: { canonical: '/join' }, openGraph: { title: 'Free community and optional support | Society of Explorers', description, url: '/join', type: 'website' } };
export default function JoinLayout({ children }: { children: React.ReactNode }) { return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(membershipOffersJsonLd()) }} />{children}</>; }
