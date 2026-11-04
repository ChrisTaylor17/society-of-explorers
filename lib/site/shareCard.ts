// lib/site/shareCard.ts
// Text for the default link-preview card (Open Graph / X). Plain, factual copy:
// no member counts, ratings, testimonials or other claims we cannot verify.

export const SHARE_CARD = {
  eyebrow: 'SOCIETY OF EXPLORERS',
  title: 'One honest question a day.',
  subtitle: 'Answer it, read a reflection, and see how other explorers answered. Free to start.',
  alt: 'Society of Explorers: one honest question a day. Free to start.',
  width: 1200,
  height: 630,
} as const;

export const SITE_DESCRIPTION =
  'Society of Explorers: a daily question to answer, reflections from Great Thinker guides, and a privacy-first community for deep conversation. Free to start.';

// A route that sets its own `openGraph`/`twitter` object replaces the root one,
// which drops the root opengraph-image. Spread these into such routes so their
// link previews keep the share card.
export const SHARE_IMAGE_PATH = '/opengraph-image';

// metadataBase is www.societyofexplorers.com, which is currently served by a
// different Vercel project, so a relative image path resolves to a 404 there.
// On Vercel, point the image at this project's own production host instead;
// locally and in tests the relative path is kept.
export function shareImageUrl(env: Record<string, string | undefined> = process.env): string {
  const host = (env.VERCEL_PROJECT_PRODUCTION_URL || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return /^[a-z0-9.-]+$/i.test(host) ? `https://${host}${SHARE_IMAGE_PATH}` : SHARE_IMAGE_PATH;
}
const SHARE_IMAGE_URL = shareImageUrl();
export const SHARE_OG_IMAGES = [
  { url: SHARE_IMAGE_URL, width: SHARE_CARD.width, height: SHARE_CARD.height, alt: SHARE_CARD.alt },
];
export const SHARE_TWITTER_IMAGES = [SHARE_IMAGE_URL];
