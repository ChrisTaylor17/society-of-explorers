// G10: sign-in / create-account helpers and the /login page wiring.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_NEXT_PATH,
  MIN_PASSWORD_LENGTH,
  friendlyAuthError,
  getSafeNextPath,
  isExistingAccountSignup,
  modeFromSearch,
  validateCredentials,
} from '../../lib/auth/loginForm';
import { FREE_SIGNUP_PATH } from '../../lib/join/content';

const root = join(import.meta.dir, '../..');
const page = readFileSync(join(root, 'app/login/page.tsx'), 'utf8');

test('G10a next path keeps same-site paths, query and hash', () => {
  expect(getSafeNextPath('/practice')).toBe('/practice');
  expect(getSafeNextPath('/salon?welcome=1#top')).toBe('/salon?welcome=1#top');
  expect(getSafeNextPath(decodeURIComponent('%2Fpractice'))).toBe('/practice');
});

test('G10b next path refuses open redirects', () => {
  for (const bad of [null, undefined, '', 'https://evil.example', '//evil.example', '/\\evil.example', '\\\\evil', 'javascript:alert(1)', '/\t/evil.example', '/\n/evil.example']) {
    expect(getSafeNextPath(bad as string | null)).toBe(DEFAULT_NEXT_PATH);
  }
});

test('G10c the free signup link opens create-account mode and returns to practice', () => {
  const url = new URL(FREE_SIGNUP_PATH, 'http://x');
  expect(modeFromSearch(url.search)).toBe('signup');
  expect(getSafeNextPath(url.searchParams.get('next'))).toBe('/practice');
  expect(modeFromSearch('?next=/practice')).toBe('signin');
  expect(modeFromSearch('?mode=SIGNUP')).toBe('signin');
});

test('G10d validation runs before any network call', () => {
  expect(validateCredentials('signin', '', 'x')).toMatch(/email/i);
  expect(validateCredentials('signin', 'a@b', 'x')).toMatch(/email/i);
  expect(validateCredentials('signin', 'a@b.co', '')).toMatch(/password/i);
  expect(validateCredentials('signin', ' a@b.co ', 'short')).toBeNull();
  expect(validateCredentials('signup', 'a@b.co', 'x'.repeat(MIN_PASSWORD_LENGTH - 1))).toMatch(String(MIN_PASSWORD_LENGTH));
  expect(validateCredentials('signup', 'a@b.co', 'x'.repeat(MIN_PASSWORD_LENGTH))).toBeNull();
});

test('G10e Supabase errors become plain, actionable copy', () => {
  expect(friendlyAuthError({ message: 'Invalid login credentials', status: 400 }, 'signin')).toMatch(/do not match/);
  expect(friendlyAuthError({ code: 'email_not_confirmed' }, 'signin')).toMatch(/confirm your email/);
  expect(friendlyAuthError({ message: 'User already registered' }, 'signup')).toMatch(/Sign in instead/);
  expect(friendlyAuthError({ code: 'weak_password' }, 'signup')).toMatch(/stronger password/);
  expect(friendlyAuthError({ status: 429, message: 'x' }, 'signin')).toMatch(/Too many attempts/);
  expect(friendlyAuthError({ code: 'over_email_send_rate_limit' }, 'signup')).toMatch(/Too many attempts/);
  expect(friendlyAuthError(new TypeError('Failed to fetch'), 'signin')).toMatch(/connection/);
});

test('G10f unknown errors never echo raw server text', () => {
  const raw = 'pg: relation "auth.users" constraint xyz_secret violated';
  const out = friendlyAuthError({ message: raw }, 'signup');
  expect(out).not.toContain('auth.users');
  expect(out).toMatch(/create your account/);
  expect(friendlyAuthError(null, 'signin')).toMatch(/sign you in/);
  expect(friendlyAuthError({ message: 42 }, 'signin')).toMatch(/sign you in/);
});

test('G10g an already-registered signup (empty identities) is detected', () => {
  expect(isExistingAccountSignup({ user: { identities: [] }, session: null })).toBe(true);
  expect(isExistingAccountSignup({ user: { identities: [{ id: 'x' }] }, session: null })).toBe(false);
  expect(isExistingAccountSignup({ user: null })).toBe(false);
  expect(isExistingAccountSignup(null)).toBe(false);
});

test('G10h login page: labelled inputs, autocomplete, live status, no stuck spinner', () => {
  expect(page).toContain('htmlFor="login-email"');
  expect(page).toContain('htmlFor="login-password"');
  expect(page).toContain('autoComplete="email"');
  expect(page).toContain("'new-password' : 'current-password'");
  expect(page).toContain('aria-live="polite"');
  expect(page).toContain('role="alert"');
  // loading is always cleared, even when Supabase throws
  expect(page).toMatch(/finally \{\s*setLoading\(false\);/);
  // the page no longer shows raw Supabase messages
  expect(page).not.toContain('setError(error.message)');
  // helpers come from the tested module, not an inline copy
  expect(page).not.toMatch(/function getSafeNextPath/);
  // non-submit buttons inside/near the form do not submit it
  expect(page.match(/type="button"/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
});

test('G10i /login has metadata and is not indexed', () => {
  const layout = readFileSync(join(root, 'app/login/layout.tsx'), 'utf8');
  expect(layout).toContain('index: false');
  expect(layout).toContain("canonical: '/login'");
});
