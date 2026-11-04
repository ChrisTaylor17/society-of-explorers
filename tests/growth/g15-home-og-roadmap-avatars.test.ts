import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

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

test('G15 homepage is a server wrapper whose link preview carries the share card image', () => {
  const page = read('app/page.tsx');
  expect(page).not.toContain("'use client'");
  expect(page).toContain('export const metadata');
  expect(page).toContain('images: SHARE_OG_IMAGES');
  expect(page).toContain('images: SHARE_TWITTER_IMAGES');
  expect(page).not.toMatch(/canonical:|alternates:|metadataBase:/);
  expect(read('app/HomePageClient.tsx').startsWith("'use client';")).toBe(true);
  // the site-wide base address is unchanged
  expect(read('app/layout.tsx')).toContain("metadataBase: new URL('https://www.societyofexplorers.com')");
});

test('G15 roadmap title relies on the layout template instead of repeating the site name', () => {
  const src = read('app/roadmap/page.tsx');
  expect(src).toContain("title: 'Roadmap',");
  expect(src).not.toContain("title: 'Roadmap — Society of Explorers'");
});

test('G15 thinker avatar initials on the reflection feed are at least 12px and colours clear 4.5:1', () => {
  for (const f of ['app/feed/page.tsx']) {
    const src = read(f);
    const avatars = [...src.matchAll(/fontSize: '(\d+)px'[^}]*\}\}>\{(?:tAvatar|qThinkerAvatar)\}/g)];
    expect(avatars.length).toBeGreaterThan(0);
    for (const m of avatars) expect(Number(m[1])).toBeGreaterThanOrEqual(12);
    const block = src.match(/THINKER_COLORS: Record<string, string> = \{([^}]*)\}/)![1];
    for (const hex of block.match(/#[0-9A-Fa-f]{6}/g)!) expect(ratio(hex, '#0d0d0d')).toBeGreaterThanOrEqual(4.5);
  }
});
