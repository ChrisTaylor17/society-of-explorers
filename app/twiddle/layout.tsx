import Link from 'next/link';
import { ONLINE_CIRCLES_HREF } from '@/lib/circles/discovery';
import { h1, label, lead, main, page, primary } from '@/lib/circles/ui';
import { LEGACY_TWIDDLE_AVAILABLE } from '@/lib/twiddle/release';

export default function TwiddleLayout({ children }: { children: React.ReactNode }) {
  if (LEGACY_TWIDDLE_AVAILABLE) return children;

  return (
    <div style={page}>
      <main id="main" style={main}>
        <p style={label}>Society of Explorers</p>
        <h1 style={h1}>Twiddle is paused</h1>
        <p style={lead}>Find an online salon, choose a reading, and keep the conversation going in Circles.</p>
        <Link href={ONLINE_CIRCLES_HREF} style={primary} prefetch={false}>Find an online salon</Link>
      </main>
    </div>
  );
}
