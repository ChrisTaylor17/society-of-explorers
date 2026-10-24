import type { Metadata } from 'next';

const description =
  'Community projects in the Society of Explorers: what each one is building, its goal, and its progress so far.';

export const metadata: Metadata = {
  title: 'Projects',
  description,
  alternates: { canonical: '/projects' },
  openGraph: {
    title: 'Projects | Society of Explorers',
    description,
    url: '/projects',
    siteName: 'Society of Explorers',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Projects | Society of Explorers',
    description,
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
