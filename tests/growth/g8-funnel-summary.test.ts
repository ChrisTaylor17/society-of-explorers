// G8: funnel summary script parses [soe-event] log lines (Vercel --json and plain text),
// counts each event once, excludes deploy checks, and never invents numbers.
import { test, expect } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-ignore plain ESM script
import { extractEvents, parseLines, summarize, formatSummary, toEastern } from '../../scripts/soe-funnel-summary.mjs';

const ev = (event: string, props: Record<string, string> = {}, at = '2026-10-23T23:00:00.000Z', env = 'production') =>
  `[soe-event] ${JSON.stringify({ event, props, env, at })}`;
// Shape of `vercel logs --json`: the message appears at the top level and again in logs[].
const vercelLine = (msg: string) => JSON.stringify({ id: 'x', level: 'info', message: msg, requestPath: '/api/events', responseStatusCode: 202, logs: [{ level: 'info', message: msg }] });

test('G8a extracts events from Vercel JSON lines and plain text; ignores noise', () => {
  expect(extractEvents(vercelLine(ev('join_view')))[0].event).toBe('join_view');
  expect(extractEvents(`2026-10-23 info ${ev('checkout_start', { tier: 'seeker' })}`)[0].props).toEqual({ tier: 'seeker' });
  expect(extractEvents('Stripe webhook event: checkout.session.completed')).toEqual([]);
  expect(extractEvents('[soe-event] {not json')).toEqual([]);
  expect(extractEvents('')).toEqual([]);
});

test('G8b the duplicated message/logs[] copy is counted once', () => {
  expect(parseLines([vercelLine(ev('join_view'))]).length).toBe(1);
});

test('G8c funnel counts, step conversion, tier and source breakdowns', () => {
  const lines = [
    ...Array.from({ length: 10 }, (_, i) => vercelLine(ev('join_view', {}, `2026-10-23T20:0${i}:00.000Z`))),
    ...Array.from({ length: 4 }, (_, i) => vercelLine(ev('signup_start', { tier: 'seeker', source: 'paid_tier' }, `2026-10-23T20:1${i}:00.000Z`))),
    vercelLine(ev('checkout_start', { tier: 'seeker' }, '2026-10-23T20:20:00.000Z')),
    vercelLine(ev('checkout_start', { tier: 'scholar' }, '2026-10-23T20:21:00.000Z')),
    vercelLine(ev('checkout_redirect', { tier: 'seeker', mode: 'live' }, '2026-10-23T20:22:00.000Z')),
    vercelLine(ev('checkout_error', { tier: 'scholar', code: 'network' }, '2026-10-23T20:23:00.000Z')),
    vercelLine(ev('page_view', { path: '/join', source: 'prod-verify' }, '2026-10-23T23:18:43.716Z')),
  ];
  const s = summarize(parseLines(lines));
  const byEvent = Object.fromEntries(s.stages.map((x: any) => [x.event, x]));
  expect(byEvent.page_view.count).toBe(0);
  expect(byEvent.join_view.count).toBe(10);
  expect(byEvent.signup_start.fromPrevious).toBeCloseTo(0.4);
  expect(byEvent.checkout_start.fromPrevious).toBeCloseTo(0.5);
  expect(byEvent.checkout_redirect.fromPrevious).toBeCloseTo(0.5);
  expect(byEvent.checkout_welcome_view.count).toBe(0);
  expect(byEvent.checkout_welcome_view.fromPrevious).toBe(0);
  expect(s.byTier.checkout_start).toEqual({ seeker: 1, scholar: 1 });
  expect(s.errorsByCode).toEqual({ network: 1 });
  expect(s.excluded.test).toBe(1);
  const text = formatSummary(s);
  expect(text).toContain('not unique people');
  expect(text).toContain('does not currently send page_view');
});

test('G8d environment filter and include-test flag', () => {
  const events = parseLines([ev('join_view', {}, 'a', 'preview'), ev('join_view', {}, 'b', 'production'), ev('join_view', { source: 'prod-verify' }, 'c')]);
  expect(summarize(events, { env: 'production' }).counts.join_view).toBe(1);
  expect(summarize(events, { env: 'production', includeTest: true }).counts.join_view).toBe(2);
  expect(summarize(events).counts.join_view).toBe(2);
});

test('G8e empty input yields zeros and says so, with no rates', () => {
  const s = summarize([]);
  expect(s.totalEvents).toBe(0);
  expect(s.stages.every((x: any) => x.count === 0 && x.fromPrevious === null)).toBe(true);
  expect(formatSummary(s)).toContain('No funnel events in this window.');
});

test('G8f times are shown in Eastern time', () => {
  expect(toEastern('2026-10-23T23:18:43.716Z')).toBe('Oct 23, 2026, 7:18 PM EDT');
  expect(toEastern(null)).toBe('n/a');
});

test('G8g CLI reads a file and prints JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'funnel-'));
  const file = join(dir, 'logs.jsonl');
  writeFileSync(file, [vercelLine(ev('join_view')), vercelLine(ev('checkout_welcome_view', {}, '2026-10-23T23:30:00.000Z'))].join('\n'));
  const out = JSON.parse(execFileSync('node', ['scripts/soe-funnel-summary.mjs', file, '--json'], { encoding: 'utf8' }));
  expect(out.counts).toEqual({ join_view: 1, checkout_welcome_view: 1 });
});
