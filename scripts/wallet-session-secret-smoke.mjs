#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const source = readFileSync(join(root, 'lib/auth/walletSession.ts'), 'utf8');

const checks = [
  {
    name: 'wallet sessions prefer dedicated auth secrets',
    ok:
      source.includes('process.env.WALLET_SESSION_SECRET') &&
      source.includes('process.env.NEXTAUTH_SECRET'),
  },
  {
    name: 'wallet sessions do not fall back to the Supabase service-role key',
    ok: !source.includes('process.env.SUPABASE_SERVICE_ROLE_KEY'),
  },
  {
    name: 'wallet session signing still fails closed when no auth secret exists',
    ok: source.includes("return process.env.WALLET_SESSION_SECRET || process.env.NEXTAUTH_SECRET || '';"),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nWallet session secret smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nWallet session secret smoke passed.');
