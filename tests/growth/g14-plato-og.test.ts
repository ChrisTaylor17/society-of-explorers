import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { SHARE_IMAGE_PATH, shareImageUrl } from '../../lib/site/shareCard';

const read = (f: string) => readFileSync(f, 'utf8');

function lum(hex: string) {
  const n = hex.replace('#', '');
  const c = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

test('G14 Plato PL avatar uses #9B8BF5 on /feed and /explorer and clears 6.5:1 (v. 4.7:1 before) on the dark background', () => {
  for (const f of ['app/feed/page.tsx', 'app/explorer/[id]/page.tsx']) {
    const src = read(f);
    expect(src).toContain("plato: '#9B8BF5'");
    expect(src).not.toContain("plato: '#7B68EE'");
    expect(src).toContain("plato: 'PL'");
  }
  expect(ratio('#9B8BF5', '#0d0d0d')).toBeGreaterThanOrEqual(6.5);
});

test('G14 /feed and /explorer link previews carry the share card image', () => {
  const feed = read('app/feed/layout.tsx');
  const explorer = read('app/explorer/[id]/page.tsx');
  for (const src of [feed, explorer]) {
    expect((src.match(/images: SHARE_OG_IMAGES/g) || []).length).toBe(2);
    expect((src.match(/images: SHARE_TWITTER_IMAGES/g) || []).length).toBe(2);
  }
});

test('G14 share image URL points at this project\'s production host on Vercel, relative elsewhere', () => {
  expect(shareImageUrl({})).toBe(SHARE_IMAGE_PATH);
  expect(shareImageUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'society-of-explorers.vercel.app' })).toBe('https://society-of-explorers.vercel.app/opengraph-image');
  expect(shareImageUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'https://x.example.com/' })).toBe('https://x.example.com/opengraph-image');
  expect(shareImageUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'bad host/<script>' })).toBe(SHARE_IMAGE_PATH);
});
