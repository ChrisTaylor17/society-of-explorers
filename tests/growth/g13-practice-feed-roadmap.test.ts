// G13: /practice always has a question, /feed never spins forever, the roadmap
// is dated and agrees with /join, and small text on the homepage is readable.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FALLBACK_QUESTIONS, pickFallbackQuestion, dayIndex } from '../../lib/practice/fallbackQuestions';
import { fetchPulse, isPulsePayload, PULSE_TIMEOUT_MS } from '../../lib/feed/pulseClient';
import { TIERS as JOIN_TIERS } from '../../lib/join/content';

const root = join(import.meta.dir, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const THINKERS = ['socrates', 'plato', 'aurelius', 'nietzsche', 'einstein', 'jobs'];

test('fallback questions are valid and well formed', () => {
  expect(FALLBACK_QUESTIONS.length).toBeGreaterThanOrEqual(7);
  for (const q of FALLBACK_QUESTIONS) {
    expect(THINKERS).toContain(q.thinker_id);
    expect(q.question_text.trim().length).toBeGreaterThan(10);
    expect(q.question_text.length).toBeLessThanOrEqual(200);
    expect(q.question_text.endsWith('?')).toBe(true);
    expect(q.question_context.trim().length).toBeGreaterThan(0);
  }
});

test('fallback pick is deterministic per date and rotates across days', () => {
  expect(pickFallbackQuestion('2026-10-25')).toEqual(pickFallbackQuestion('2026-10-25'));
  const seen = new Set<string>();
  for (let d = 1; d <= 14; d++) seen.add(pickFallbackQuestion(`2026-11-${String(d).padStart(2, '0')}`).question_text);
  expect(seen.size).toBeGreaterThan(1);
  expect(Number.isInteger(dayIndex('2026-10-25'))).toBe(true);
  expect(pickFallbackQuestion('not-a-date')).toBeDefined();
});

test('today question no longer uses the retired model and falls back instead of failing', () => {
  const src = read('lib/practice/todayQuestion.ts');
  expect(src).not.toContain("'claude-sonnet-4-20250514'");
  expect(src).toContain("TODAY_QUESTION_MODEL_FALLBACK = 'claude-sonnet-4-6'");
  expect(src).toContain('pickFallbackQuestion(');
  expect(src).toMatch(/timeout/i);
});

const goodPayload = { recentResponses: [], stats: { totalResponses: 0 }, todayQuestion: null };
const fakeFetch = (res: { ok: boolean; body?: unknown; throws?: boolean }) =>
  async () => {
    if (res.throws) throw new Error('offline');
    return { ok: res.ok, json: async () => res.body };
  };

test('fetchPulse returns data for a good payload', async () => {
  const r = await fetchPulse(fakeFetch({ ok: true, body: goodPayload }));
  expect(r).toEqual({ ok: true, data: goodPayload });
});

test('fetchPulse reports http, shape and network failures', async () => {
  expect(await fetchPulse(fakeFetch({ ok: false, body: { error: 'x' } }))).toEqual({ ok: false, reason: 'http' });
  expect(await fetchPulse(fakeFetch({ ok: true, body: { error: 'Failed' } }))).toEqual({ ok: false, reason: 'shape' });
  expect(await fetchPulse(fakeFetch({ ok: true, body: null }))).toEqual({ ok: false, reason: 'shape' });
  expect(await fetchPulse(fakeFetch({ ok: true, throws: true }))).toEqual({ ok: false, reason: 'network' });
});

test('fetchPulse times out a stalled request instead of waiting forever', async () => {
  const stalled = (_: string, init?: { signal?: AbortSignal }) =>
    new Promise<{ ok: boolean; json: () => Promise<unknown> }>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    });
  const started = Date.now();
  const r = await fetchPulse(stalled, 50);
  expect(r).toEqual({ ok: false, reason: 'timeout' });
  expect(Date.now() - started).toBeLessThan(2000);
  expect(PULSE_TIMEOUT_MS).toBeLessThanOrEqual(15_000);
});

test('isPulsePayload rejects error bodies', () => {
  expect(isPulsePayload({ error: 'nope', recentResponses: [], stats: {} })).toBe(false);
  expect(isPulsePayload(goodPayload)).toBe(true);
});

test('feed page has an error state with retry and honest recency copy', () => {
  const src = read('app/feed/page.tsx');
  expect(src).toContain('fetchPulse');
  expect(src).toContain('We could not load the community feed right now.');
  expect(src).toContain('TRY AGAIN');
  expect(src).toContain('setLoading(false)');
  expect(src).not.toContain('in the last few hours');
  expect(src).not.toContain("TODAY'S WISDOM MOMENTS");
});

test('roadmap is dated Oct 25, 2026 and shares tiers with /join', () => {
  const src = read('app/roadmap/page.tsx');
  expect(src).toContain("ROADMAP_LAST_UPDATED = 'October 25, 2026'");
  expect(src).not.toContain('April 19, 2026');
  expect(src).toContain("from '@/lib/join/content'");
  expect(src).not.toContain('pending a database migration');
  expect(src).toContain('Project pledges are switched off');
  expect(JOIN_TIERS.map(t => t.id)).toEqual(['explorer', 'supporter']);
});

// WCAG 2.x contrast helpers.
function lum(hex: string) {
  const n = hex.replace('#', '');
  const c = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

test('brand gold, muted grey and feed thinker colours meet 4.5:1 on the dark background', () => {
  for (const c of ['#c9a84c', '#9a8f7a', '#C9A94E', '#9B8BF5', '#A88D6E', '#F0475F', '#6F8FF0', '#A0A0A0']) {
    expect(ratio(c, '#0d0d0d')).toBeGreaterThanOrEqual(4.5);
  }
});

test('homepage and footer no longer fade small text with opacity or 7-8px sizes', () => {
  for (const f of ['app/HomePageClient.tsx', 'components/PublicFooter.tsx']) {
    const src = read(f);
    expect(src).not.toMatch(/fontSize: '[5-8]px'/);
    expect(src).not.toMatch(/color: muted[^}]*opacity: 0\.[0-6]/);
    expect(src).not.toMatch(/fontSize: '(?:[5-9]|1[0-9])px'[^}]*color: gold, opacity: 0\.[0-6]/);
  }
});
