// lib/auth/loginForm.ts
// Pure helpers for the /login page (sign in and create account).
// Kept free of React and Supabase so they can be unit tested.

export const DEFAULT_NEXT_PATH = '/dashboard';
export const MIN_PASSWORD_LENGTH = 8;

/** Only same-site relative paths are allowed as a post-login destination. */
export function getSafeNextPath(candidate: string | null | undefined): string {
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) {
    return DEFAULT_NEXT_PATH;
  }
  // Control characters (tabs, newlines) can be stripped by browsers and turn
  // "/\t/evil.com" into a protocol-relative URL.
  if (/[\u0000-\u001f\u007f]/.test(candidate)) return DEFAULT_NEXT_PATH;
  try {
    const parsed = new URL(candidate, 'http://localhost');
    if (parsed.origin !== 'http://localhost') return DEFAULT_NEXT_PATH;
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return DEFAULT_NEXT_PATH;
  }
}

export type AuthMode = 'signin' | 'signup';

export function modeFromSearch(search: string): AuthMode {
  return new URLSearchParams(search).get('mode') === 'signup' ? 'signup' : 'signin';
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Client-side checks before any network call. Returns a message or null. */
export function validateCredentials(mode: AuthMode, email: string, password: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return 'Enter your email address.';
  if (!EMAIL_PATTERN.test(trimmed)) return 'That email address does not look complete.';
  if (!password) return 'Enter your password.';
  if (mode === 'signup' && password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`;
  }
  return null;
}

type AuthErrorLike = { message?: unknown; status?: unknown; code?: unknown } | null | undefined;

/**
 * Turn a Supabase auth error into plain, actionable copy. Never echoes raw
 * server text that might include internals; unknown errors get a generic line.
 */
export function friendlyAuthError(error: AuthErrorLike, mode: AuthMode): string {
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  const code = typeof error?.code === 'string' ? error.code.toLowerCase() : '';
  const status = typeof error?.status === 'number' ? error.status : 0;

  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return 'That email and password do not match. Check them, or create a free account.';
  }
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return 'Please confirm your email first. Look for the confirmation link we sent you.';
  }
  if (code === 'user_already_exists' || message.includes('already registered')) {
    return 'An account with this email already exists. Sign in instead.';
  }
  if (code === 'weak_password' || message.includes('password should be')) {
    return `Choose a stronger password (at least ${MIN_PASSWORD_LENGTH} characters).`;
  }
  if (code.includes('rate_limit') || status === 429 || message.includes('rate limit')) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  if (message.includes('failed to fetch') || message.includes('network')) {
    return 'We could not reach the server. Check your connection and try again.';
  }
  return mode === 'signup'
    ? 'We could not create your account right now. Please try again.'
    : 'We could not sign you in right now. Please try again.';
}

/**
 * Supabase returns a user with no identities (and no error) when someone signs
 * up with an email that already has a confirmed account. Detect that so the
 * page can say so instead of promising a confirmation email that never comes.
 */
export function isExistingAccountSignup(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const user = (data as { user?: { identities?: unknown } | null }).user;
  return !!user && Array.isArray(user.identities) && user.identities.length === 0;
}
