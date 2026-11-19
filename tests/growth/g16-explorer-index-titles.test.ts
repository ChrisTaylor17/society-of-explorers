import { describe, expect, test } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { THINKER_GUIDES } from '../../lib/explorer/directory';

const root = join(import.meta.dir, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

function lum(hex: string): number {
  const n = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe('/explorer index', () => {
  test('page exists, lists the six AI guides and labels them as AI personas', () => {
    expect(existsSync(join(root, 'app/explorer/page.tsx'))).toBe(true);
    const src = read('app/explorer/page.tsx');
    expect(THINKER_GUIDES.map((t) => t.id)).toEqual(['socrates', 'plato', 'aurelius', 'nietzsche', 'einstein', 'jobs']);
    expect(src).toContain('These are AI personas');
    expect(src).toContain('AI guide ·');
  });

  test('does not enumerate members or show engagement numbers', () => {
    const src = read('app/explorer/page.tsx') + read('lib/explorer/directory.ts');
    expect(src).not.toMatch(/supabase|from\('members'\)|current_streak|total_responses|exp_tokens/);
  });

  test('labels are at least 12px and guide colours meet contrast on #0d0d0d', () => {
    const src = read('app/explorer/page.tsx');
    for (const m of src.matchAll(/fontSize: '(\d+)px'/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(12);
    for (const t of THINKER_GUIDES) expect(ratio(t.color, '#0d0d0d')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('page titles are not doubled by the root template', () => {
  const files = [
    'app/vision/page.tsx', 'app/manifesto/page.tsx', 'app/movement/page.tsx', 'app/movement/p/[slug]/page.tsx',
    'app/tribekey/page.tsx', 'app/data-layer/page.tsx', 'app/three-pillars/page.tsx', 'app/tokens/page.tsx',
    'app/transparency/page.tsx', 'app/explorer/page.tsx',
  ];
  test.each(files)('%s top-level title has no site-name suffix', (f) => {
    const src = read(f);
    expect(src).not.toMatch(/^  title: [`'"][^\n]*Society of Explorers/m);
  });
  test('feed and explorer profile use absolute titles', () => {
    expect(read('app/feed/layout.tsx')).not.toMatch(/^\s+title, description,/m);
    expect(read('app/explorer/[id]/page.tsx')).not.toMatch(/^\s+title, description,/m);
    expect(read('app/feed/layout.tsx')).toContain('title: { absolute: title }');
  });
});

describe('small-text sweep', () => {
  test.each(['app/roadmap/page.tsx', 'app/practice/page.tsx', 'app/feed/page.tsx'])('%s has no text under 12px', (f) => {
    expect(read(f)).not.toMatch(/fontSize: '(8|9|10|11)px'/);
  });
  test('manifesto has an h1', () => {
    expect(read('app/manifesto/page.tsx')).toContain('<h1');
  });
});
