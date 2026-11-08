import 'server-only';
import { privateJson } from '@/lib/http/routeError';

/**
 * The online pilot does not open the historical venue campaign or city intake.
 * Run before reading a body, environment, identity, ledger or notification client.
 * There is deliberately no request/env override. Reopening requires a reviewed
 * offer, authority, accounting/consent contract and separate release acceptance.
 * The nullable type preserves the retained downstream implementation for review.
 */
export function physicalSpaceReleaseBlock(): Response | null {
  return privateJson({
    code: 'PHYSICAL_SPACE_ON_HOLD',
    error: 'Physical-space fundraising and city-interest submissions are not open in this pilot.',
    alternatives: { pilot: '/salons/pilot', onlineCircles: '/circles?format=online' },
  }, { status: 503 });
}
