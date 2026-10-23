// G3: /api/events accepts only allowlisted funnel events and logs no personal data.
import { test, expect, beforeEach, afterEach } from 'bun:test';
import { installMocks, makeReq } from '../security/fakes';
import { sanitizeProps } from '../../lib/analytics/events';

installMocks();
const route = await import('../../app/api/events/route.ts');
const { resetRateLimits } = await import('../../lib/rateLimit.ts');

let lines: string[] = [];
const realLog = console.log;
beforeEach(() => { resetRateLimits(); lines = []; console.log = (...a: any[]) => { lines.push(a.join(' ')); }; });
afterEach(() => { console.log = realLog; });

const send = (body: any, ip = '203.0.113.7') => route.POST(makeReq(body, { headers: { 'x-forwarded-for': ip } }));
const payloadOf = (line: string) => JSON.parse(line.slice('[soe-event] '.length));

test('G3a allowlisted event is accepted and logged as one [soe-event] line', async () => {
  const r = await send({ event: 'checkout_start', props: { tier: 'seeker', path: '/join?ref=x' } });
  expect(r.status).toBe(202);
  expect(lines.length).toBe(1);
  expect(lines[0]).toStartWith('[soe-event]');
  const payload = payloadOf(lines[0]);
  expect(payload.event).toBe('checkout_start');
  expect(payload.props).toEqual({ tier: 'seeker', path: '/join' });
});

test('G3b unknown events and malformed bodies are rejected without logging', async () => {
  expect((await send({ event: 'drop_table' })).status).toBe(400);
  expect((await send([1, 2])).status).toBe(400);
  expect((await send(undefined)).status).toBe(400);
  expect(lines.length).toBe(0);
});

test('G3c personal data and unknown keys are stripped; IP is never logged', async () => {
  const r = await send({ event: 'signup_start', props: { tier: 'explorer', email: 'ada@example.test', cta: 'ada@example.test', source: 'a b c <script>', code: 'x'.repeat(200) } }, '198.51.100.9');
  expect(r.status).toBe(202);
  expect(lines[0]).not.toContain('ada@example.test');
  expect(lines[0]).not.toContain('198.51.100.9');
  expect(lines[0]).not.toContain('<script>');
  expect(payloadOf(lines[0]).props).toEqual({ tier: 'explorer' });
});

test('G3d oversized bodies are rejected', async () => {
  expect((await send({ event: 'join_view', pad: 'x'.repeat(5000) })).status).toBe(400);
});

test('G3e per-IP rate limit returns 429', async () => {
  let last = 0;
  for (let i = 0; i < 61; i++) last = (await send({ event: 'join_view' }, '192.0.2.1')).status;
  expect(last).toBe(429);
  expect((await send({ event: 'join_view' }, '192.0.2.2')).status).toBe(202);
});

test('G3f sanitizeProps handles junk input', () => {
  expect(sanitizeProps(null)).toEqual({});
  expect(sanitizeProps('x')).toEqual({});
  expect(sanitizeProps({ tier: 42, mode: 'TEST' })).toEqual({ mode: 'test' });
  expect(sanitizeProps({ cta: 'a%40b.test' })).toEqual({});
});
