import 'server-only';

import { privateJson } from '@/lib/http/routeError';

// Reopening requires a release review of visibility, posting and provider consent.
export const LEGACY_TWIDDLE_AVAILABLE: boolean = false;

export function legacyTwiddleUnavailable() {
  return privateJson({ error: 'Twiddle is paused. Find conversations in Circles.' }, { status: 410 });
}
