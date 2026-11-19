#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

const files = {
  helper: read('lib/auth/staleSupabaseAuth.ts'),
  session: read('lib/auth/getSession.ts'),
  client: read('lib/supabase/client.ts'),
};

const requiredPatterns = [
  'invalid refresh token',
  'refresh token not found',
  'refresh_token_not_found',
  'jwt expired',
  'jwt has expired',
  'invalid jwt',
  'invalid claim: missing sub claim',
  'user from sub claim in jwt does not exist',
];

const checks = [
  {
    name: 'stale auth helper tracks refresh-token failures',
    ok: requiredPatterns.slice(0, 3).every((pattern) => files.helper.includes(`'${pattern}'`)),
  },
  {
    name: 'stale auth helper also tracks expired or invalid JWT sessions',
    ok: requiredPatterns.slice(3).every((pattern) => files.helper.includes(`'${pattern}'`)),
  },
  {
    name: 'stale auth detection stays centralized in a shared pattern list',
    ok:
      files.helper.includes('const STALE_AUTH_PATTERNS = [') &&
      files.helper.includes('STALE_AUTH_PATTERNS.some((pattern) => message.includes(pattern))'),
  },
  {
    name: 'session helpers clear stale auth storage on lookup failures',
    ok:
      files.session.includes('if (isStaleSupabaseAuthError(error)) {') &&
      files.session.includes('clearSupabaseAuthStorage()') &&
      files.session.includes('Supabase session lookup') &&
      files.session.includes('Supabase user lookup'),
  },
  {
    name: 'signed-out user lookups stay quiet without weakening stale-token recovery',
    ok:
      files.session.includes('isAuthSessionMissingError') &&
      files.session.includes('if (isAuthSessionMissingError(error)) return null') &&
      files.session.indexOf('if (isAuthSessionMissingError(error)) return null') <
        files.session.indexOf('if (isStaleSupabaseAuthError(error)) {'),
  },
  {
    name: 'browser supabase client still installs the stale-auth recovery guard',
    ok: files.client.includes('installStaleSupabaseAuthRecoveryGuard()'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nStale Supabase auth smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nStale Supabase auth smoke passed.');
