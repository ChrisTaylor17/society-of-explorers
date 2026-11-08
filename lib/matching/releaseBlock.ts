import 'server-only';
import { privateJson } from '@/lib/http/routeError';
import { scoredMatchingAvailable } from '@/lib/matching/releaseAvailability';

/** Run before parsing a request, resolving identity or opening any data client. */
export function matchingReleaseBlock(): Response | null {
  if (scoredMatchingAvailable()) return null;
  return privateJson({
    code: 'MATCHING_NOT_AVAILABLE',
    error: 'Scored matching is not available in this release.',
    alternatives: { people: '/members', salons: '/book-salons' },
  }, { status: 503 });
}
