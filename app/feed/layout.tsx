import type { Metadata } from 'next';
import { SHARE_OG_IMAGES, SHARE_TWITTER_IMAGES } from '@/lib/site/shareCard';

const title = 'Community Feed — Society of Explorers';
const description = 'Find the Daily Practice question, explore the latest Clips, and bring a question to a Circle.';

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  openGraph: { title, description, siteName: 'Society of Explorers', type: 'website', images: SHARE_OG_IMAGES },
  twitter: { card: 'summary_large_image', title, description, images: SHARE_TWITTER_IMAGES },
};

export default function FeedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
