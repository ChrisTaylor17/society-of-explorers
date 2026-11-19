import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const route = readFileSync(join(process.cwd(), 'app/api/twiddle/cron/route.ts'), 'utf8');
const handler = route.slice(route.indexOf('export async function GET'));

const checks = [
  {
    name: 'twiddle cron fails closed when CRON_SECRET is missing or blank',
    ok:
      route.includes('const cronSecret = process.env.CRON_SECRET?.trim()') &&
      route.includes('return Boolean(cronSecret)') &&
      route.includes('if (!cronAuthorized(req))'),
  },
  {
    name: 'twiddle cron authorization runs before privileged clients are created',
    ok:
      handler.indexOf('if (!cronAuthorized(req))') < handler.indexOf('getSupabaseAdmin()') &&
      handler.indexOf('if (!cronAuthorized(req))') < handler.indexOf('createAnthropicClient()'),
  },
  {
    name: 'legacy fail-open authorization is absent',
    ok: !route.includes('if (process.env.CRON_SECRET &&'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nTwiddle cron auth smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nTwiddle cron auth smoke passed.');
