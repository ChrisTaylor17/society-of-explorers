#!/usr/bin/env node
// SoE funnel summary from first-party [soe-event] runtime log lines (app/api/events).
//
// Usage:
//   vercel logs --environment production --since 7d --json -n 5000 -q soe-event \
//     | node scripts/soe-funnel-summary.mjs
//   node scripts/soe-funnel-summary.mjs saved-logs.jsonl [--json] [--env preview] [--include-test]
//   node scripts/soe-funnel-summary.mjs --fetch 7d          # runs the vercel logs command above
//
// Accepts Vercel `--json` log lines or plain text lines containing `[soe-event] {...}`.
// Figures are EVENT COUNTS, not unique people: events carry no user id by design
// (lib/analytics/events.ts), so a person who reloads /join twice is counted twice.
// Events whose source ends in "-verify" or is "test" are deploy checks, not visitors,
// and are excluded unless --include-test is given. Nothing is estimated or filled in.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const FUNNEL_STAGES = [
  { event: 'page_view', label: 'Page view' },
  { event: 'join_view', label: '/join view' },
  { event: 'signup_start', label: 'Signup start' },
  { event: 'checkout_start', label: 'Checkout start' },
  { event: 'checkout_redirect', label: 'Sent to Stripe' },
  { event: 'checkout_welcome_view', label: 'Welcome (paid return)' },
];

const MARKER = '[soe-event]';

export function isTestTraffic(record) {
  const source = record?.props?.source || '';
  return source === 'test' || /-verify$/.test(source);
}

// Pull every `[soe-event] {...}` payload out of one input line.
export function extractEvents(line) {
  const out = [];
  const text = String(line || '').trim();
  if (!text) return out;
  const messages = [];
  if (text.startsWith('{')) {
    try {
      const obj = JSON.parse(text);
      if (typeof obj.message === 'string') messages.push(obj.message);
      for (const l of Array.isArray(obj.logs) ? obj.logs : []) if (typeof l?.message === 'string') messages.push(l.message);
    } catch {
      messages.push(text);
    }
  } else {
    messages.push(text);
  }
  for (const m of messages) {
    let idx = m.indexOf(MARKER);
    while (idx !== -1) {
      const start = m.indexOf('{', idx + MARKER.length);
      if (start === -1) break;
      const json = balancedJson(m, start);
      if (json) {
        try {
          const rec = JSON.parse(json);
          if (rec && typeof rec.event === 'string') out.push({ event: rec.event, props: rec.props && typeof rec.props === 'object' ? rec.props : {}, env: rec.env || null, at: rec.at || null });
        } catch { /* not an event payload */ }
      }
      idx = m.indexOf(MARKER, idx + MARKER.length);
    }
  }
  return out;
}

function balancedJson(s, start) {
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i += 1) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth += 1;
    else if (c === '}') { depth -= 1; if (depth === 0) return s.slice(start, i + 1); }
  }
  return null;
}

// The same log line appears as `message` and inside `logs[]`; count each event once.
export function parseLines(lines) {
  const seen = new Set();
  const events = [];
  for (const line of lines) {
    for (const ev of extractEvents(line)) {
      const key = JSON.stringify([ev.event, ev.at, ev.env, ev.props]);
      if (seen.has(key)) continue;
      seen.add(key);
      events.push(ev);
    }
  }
  return events;
}

function bump(map, key) { map[key] = (map[key] || 0) + 1; }

export function summarize(allEvents, { env = 'all', includeTest = false } = {}) {
  const excluded = { test: 0, otherEnv: 0 };
  const events = allEvents.filter((ev) => {
    if (env !== 'all' && ev.env !== env) { excluded.otherEnv += 1; return false; }
    if (!includeTest && isTestTraffic(ev)) { excluded.test += 1; return false; }
    return true;
  });
  const counts = {};
  const byTier = {};
  const bySource = {};
  const errorsByCode = {};
  const ctaClicks = {};
  let first = null, last = null;
  for (const ev of events) {
    bump(counts, ev.event);
    if (ev.props.tier) bump((byTier[ev.event] ||= {}), ev.props.tier);
    if (ev.props.source) bump((bySource[ev.event] ||= {}), ev.props.source);
    if (ev.event === 'checkout_error') bump(errorsByCode, ev.props.code || 'unknown');
    if (ev.event === 'cta_click') bump(ctaClicks, ev.props.cta || 'unknown');
    if (ev.at) { if (!first || ev.at < first) first = ev.at; if (!last || ev.at > last) last = ev.at; }
  }
  let previous = null;
  const stages = FUNNEL_STAGES.map(({ event, label }) => {
    const count = counts[event] || 0;
    const fromPrevious = previous && previous.count > 0 ? count / previous.count : null;
    const row = { event, label, count, fromPrevious, previousEvent: previous?.event ?? null };
    previous = row;
    return row;
  });
  return { totalEvents: events.length, excluded, env, includeTest, window: { first, last }, stages, counts, byTier, bySource, errorsByCode, ctaClicks };
}

export function toEastern(iso) {
  if (!iso) return 'n/a';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'n/a';
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(d);
}

const pct = (x) => (x == null ? '   -  ' : `${(x * 100).toFixed(1).padStart(5)}%`);

export function formatSummary(s) {
  const lines = [];
  lines.push('SoE funnel summary (event counts from [soe-event] logs; not unique people)');
  lines.push(`Environment: ${s.env}${s.includeTest ? ' (deploy-check events included)' : ''}`);
  lines.push(`Window: ${toEastern(s.window.first)} .. ${toEastern(s.window.last)}`);
  lines.push(`Events counted: ${s.totalEvents}; excluded deploy checks: ${s.excluded.test}; other environments: ${s.excluded.otherEnv}`);
  lines.push('');
  lines.push('Stage                      Count   vs previous');
  for (const st of s.stages) lines.push(`${st.label.padEnd(26)} ${String(st.count).padStart(5)}   ${pct(st.fromPrevious)}`);
  const withTier = ['tier_select', 'checkout_start', 'checkout_redirect'].filter((e) => s.byTier[e]);
  if (withTier.length) {
    lines.push('', 'By tier:');
    for (const e of withTier) lines.push(`  ${e}: ${Object.entries(s.byTier[e]).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }
  if (s.bySource.signup_start) lines.push('', `Signup sources: ${Object.entries(s.bySource.signup_start).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  if (Object.keys(s.errorsByCode).length) lines.push('', `Checkout errors: ${Object.entries(s.errorsByCode).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  if (Object.keys(s.ctaClicks).length) lines.push('', `CTA clicks: ${Object.entries(s.ctaClicks).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  if (!s.counts.page_view) lines.push('', 'Note: the site does not currently send page_view from the browser, so the funnel effectively starts at /join view.');
  if (!s.totalEvents) lines.push('', 'No funnel events in this window.');
  lines.push('', 'Paid return (welcome) is a page view after Stripe, not a confirmed payment; Stripe is the source of truth for revenue.');
  return lines.join('\n');
}

function parseArgs(argv) {
  const opts = { env: 'all', includeTest: false, json: false, files: [], fetch: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--include-test') opts.includeTest = true;
    else if (a === '--env') opts.env = argv[++i] || 'all';
    else if (a === '--fetch') { opts.fetch = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '7d'; if (opts.env === 'all') opts.env = 'production'; }
    else if (a === '--help' || a === '-h') opts.help = true;
    else opts.files.push(a);
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 14).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')); return; }
  let text = '';
  if (opts.fetch) {
    text = execFileSync('vercel', ['logs', '--environment', opts.env === 'preview' ? 'preview' : 'production', '--since', opts.fetch, '--json', '-n', '5000', '-q', 'soe-event', ...(process.env.VERCEL_SCOPE ? ['--scope', process.env.VERCEL_SCOPE] : [])], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] });
  } else if (opts.files.length) {
    text = opts.files.map((f) => readFileSync(f, 'utf8')).join('\n');
  } else {
    text = readFileSync(0, 'utf8');
  }
  const summary = summarize(parseLines(text.split(/\r?\n/)), opts);
  console.log(opts.json ? JSON.stringify(summary, null, 2) : formatSummary(summary));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
