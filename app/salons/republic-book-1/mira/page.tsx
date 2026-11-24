import type { Metadata } from 'next';
import MiraHost from './MiraHost';

// The screen Chris shares on the Dec 3 call. Not linked from the site.
export const metadata: Metadata = {
  title: 'Mira Vale, AI tutor: Republic, Book I salon',
  description: 'The shared screen for the Dec 3 salon on Plato’s Republic, Book I, led by Mira Vale, an AI tutor.',
  robots: { index: false, follow: false },
};

export default function MiraSalonPage() {
  return <MiraHost />;
}
