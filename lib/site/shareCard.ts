// lib/site/shareCard.ts
// Text for the default link-preview card (Open Graph / X). Plain, factual copy:
// no member counts, ratings, testimonials or other claims we cannot verify.

export const SHARE_CARD = {
  eyebrow: 'SOCIETY OF EXPLORERS',
  title: 'Read together. Meet online.',
  subtitle: 'Small weekly salons for Scripture, the Great Books, and honest conversation.',
  alt: 'Society of Explorers. Read together. Meet online.',
  width: 1200,
  height: 630,
} as const;

export const SITE_DESCRIPTION =
  'Small weekly salons rooted in Christian faith. Read Scripture and the Great Books, make room for prayer, and welcome people who disagree in good faith.';

// A route that sets its own `openGraph`/`twitter` object replaces the root one,
// which drops the root opengraph-image. Spread these into such routes so their
// link previews keep the share card.
export const SHARE_IMAGE_PATH = '/opengraph-image';

// metadataBase is www.societyofexplorers.com, which is currently served by a
// different Vercel project, so a relative image path resolves to a 404 there.
// On Vercel, point the image at this project's own production host instead;
// locally and in tests the relative path is kept.
export function shareOrigin(env: Record<string, string | undefined> = process.env): string | null {
  const host = (env.VERCEL_PROJECT_PRODUCTION_URL || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return /^[a-z0-9.-]+$/i.test(host) ? `https://${host}` : null;
}
export function shareImageUrl(env: Record<string, string | undefined> = process.env): string {
  return (shareOrigin(env) ?? '') + SHARE_IMAGE_PATH;
}
const SHARE_IMAGE_URL = shareImageUrl();
export const SHARE_OG_IMAGES = [
  { url: SHARE_IMAGE_URL, width: SHARE_CARD.width, height: SHARE_CARD.height, alt: SHARE_CARD.alt },
];
export const SHARE_TWITTER_IMAGES = [SHARE_IMAGE_URL];
