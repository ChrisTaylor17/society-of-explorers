// G12: 404 and error screens, default share card, page metadata coverage,
// and sitemap entries that point at real pages.
import { test, expect } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RECOVERY_LINKS } from '../../lib/site/recoveryLinks';
import { SHARE_CARD, SHARE_IMAGE_PATH, SHARE_OG_IMAGES, SITE_DESCRIPTION } from '../../lib/site/shareCard';
import sitemap from '../../app/sitemap';
import robots from '../../app/robots';

const root = join(import.meta.dir, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const pageFor = (path: string) => join(root, 'app', path === '/' ? '' : path, 'page.tsx');

test('G12a 404, route error and global error screens exist', () => {
  for (const f of ['app/not-found.tsx', 'app/error.tsx', 'app/global-error.tsx']) expect(existsSync(join(root, f))).toBe(true);
  expect(read('app/not-found.tsx')).toContain('index: false');
  expect(read('app/error.tsx').startsWith("'use client'")).toBe(true);
  expect(read('app/global-error.tsx')).toContain('<html lang="en">');
});

test('G12b error screens never render or log the raw error message or stack', () => {
  for (const f of ['app/error.tsx', 'app/global-error.tsx']) {
    const src = read(f);
    expect(src).not.toContain('error.message');
    expect(src).not.toContain('error.stack');
    expect(src).not.toMatch(/console\.error\([^)]*\berror\)/);
    expect(src).toContain('unstable_retry');
  }
});

test('G12c every recovery link is a real, free page', () => {
  expect(RECOVERY_LINKS.length).toBeGreaterThanOrEqual(3);
  for (const l of RECOVERY_LINKS) {
    expect(l.href.startsWith('/')).toBe(true);
    expect(existsSync(pageFor(l.href))).toBe(true);
    expect(l.href).not.toMatch(/capital|checkout|pledge|fund/);
  }
});

test('G12d default share card: build-time image, factual copy, no invented numbers', () => {
  const og = read('app/opengraph-image.tsx');
  expect(og).toContain("from 'next/og'");
  expect(og).not.toMatch(/fetch\(|https?:\/\//);
  expect(SHARE_CARD.width).toBe(1200);
  expect(SHARE_CARD.height).toBe(630);
  const copy = [SHARE_CARD.title, SHARE_CARD.subtitle, SHARE_CARD.alt, SITE_DESCRIPTION].join(' ');
  expect(copy).not.toMatch(/\d{2,}|thousands|members love|most popular|#1|rated/i);
});

test('G12e root layout sets a large X card and viewport', () => {
  const layout = read('app/layout.tsx');
  expect(layout).toContain("card: 'summary_large_image'");
  expect(layout).toContain('export const viewport');
  expect(layout).not.toContain('Prompt Atlas and the Society');
});

test('G12f key entry pages have their own title and description', () => {
  for (const r of ['practice', 'salons', 'projects', 'login', 'join']) {
    const src = read(`app/${r}/layout.tsx`);
    expect(src).toMatch(/title: '/);
    expect(src).toMatch(/description/);
    expect(src).toContain(`canonical: '/${r}'`);
  }
});

test('G12g every sitemap URL is a real page and not blocked by robots', () => {
  const disallow = ([] as string[]).concat((robots().rules as { disallow?: string | string[] }).disallow ?? []);
  for (const entry of sitemap()) {
    const path = new URL(entry.url).pathname.replace(/\/$/, '') || '/';
    expect(existsSync(pageFor(path))).toBe(true);
    const blocked = disallow.some((d) => (d.endsWith('/') ? path.startsWith(d) : path === d || path.startsWith(d + '/')));
    expect(`${path} blocked=${blocked}`).toBe(`${path} blocked=false`);
  }
});

test('G12h routes that override openGraph keep the share card image', () => {
  // A child openGraph object replaces the root one, so without this the
  // root opengraph-image silently disappears from these routes' previews.
  expect(existsSync('app/opengraph-image.tsx')).toBe(true);
  expect(SHARE_OG_IMAGES[0]).toEqual({ url: SHARE_IMAGE_PATH, width: 1200, height: 630, alt: SHARE_CARD.alt });
  for (const r of ['practice', 'salons', 'projects']) {
    const src = read(`app/${r}/layout.tsx`);
    expect(src).toContain('images: SHARE_OG_IMAGES');
    expect(src).toContain('images: SHARE_TWITTER_IMAGES');
  }
});
