import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { SHARE_IMAGE_PATH, shareImageUrl } from '../../lib/site/shareCard';

const read = (f: string) => readFileSync(f, 'utf8');

test('G14 the public feed shows the question without legacy private-response avatars', () => {
  const src = read('app/feed/page.tsx');
  expect(src).toContain('question.question_text');
  expect(src).toContain('dateTime={question.date}');
  expect(src).not.toMatch(/recentResponses|tAvatar|qThinkerAvatar/);
});

test('G14 feed and generic noindex explorer previews carry the share card image', () => {
  const feed = read('app/feed/layout.tsx');
  const explorer = read('app/explorer/[id]/page.tsx');
  for (const [src, count] of [[feed, 1], [explorer, 1]] as const) {
    expect((src.match(/images: SHARE_OG_IMAGES/g) || []).length).toBe(count);
    expect((src.match(/images: SHARE_TWITTER_IMAGES/g) || []).length).toBe(count);
  }
  expect(explorer).toContain('robots: { index: false, follow: false }');
  expect(explorer).not.toContain('recentResponses');
});

test('G14 share image URL points at this project\'s production host on Vercel, relative elsewhere', () => {
  expect(shareImageUrl({})).toBe(SHARE_IMAGE_PATH);
  expect(shareImageUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'society-of-explorers.vercel.app' })).toBe('https://society-of-explorers.vercel.app/opengraph-image');
  expect(shareImageUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'https://x.example.com/' })).toBe('https://x.example.com/opengraph-image');
  expect(shareImageUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'bad host/<script>' })).toBe(SHARE_IMAGE_PATH);
});
