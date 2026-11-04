import type { Metadata } from 'next';
import Link from 'next/link';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { gold, h1, label, lead, main, page } from '@/lib/circles/ui';
import HostReviews from './HostReviews';

export const metadata: Metadata = {
  title: 'Your Circle Review Outcomes',
  description: 'Privately view reviewer decisions and explanations for circles you host.',
  robots: { index: false, follow: false },
};

export default function CircleHostReviewsPage() {
  return (
    <div style={page}>
      <PublicNav />
      <main id="main" style={main}>
        <p style={label}><Link href="/circles" style={{ color: gold }}>Circles</Link> · Your review outcomes</p>
        <h1 style={h1}>Your circle review outcomes</h1>
        <p style={lead}>Understand a visibility decision affecting a circle you host.</p>
        <HostReviews />
      </main>
      <PublicFooter />
    </div>
  );
}
