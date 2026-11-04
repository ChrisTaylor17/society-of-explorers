import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign in or create a free account',
  description:
    'Sign in to the Society of Explorers, or create a free Explorer account to answer the Daily Practice question.',
  alternates: { canonical: '/login' },
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
