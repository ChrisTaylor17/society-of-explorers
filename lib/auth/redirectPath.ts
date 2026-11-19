// Shared browser/server return-path policy. A return path never grants access.
export const DEFAULT_AUTH_REDIRECT_PATH = '/dashboard';

export function getSafeAuthRedirectPath(candidate: string | null | undefined): string {
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//') ||
      candidate.includes('\\') || /[\u0000-\u001f\u007f]/.test(candidate) ||
      /%5c/i.test(candidate) || /^\/%2f/i.test(candidate)) return DEFAULT_AUTH_REDIRECT_PATH;
  try {
    const parsed = new URL(candidate, 'https://return.invalid');
    if (parsed.origin !== 'https://return.invalid') return DEFAULT_AUTH_REDIRECT_PATH;
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return DEFAULT_AUTH_REDIRECT_PATH;
  }
}
