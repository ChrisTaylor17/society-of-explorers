/**
 * The pilot does not offer legacy scoring or automatic introductions.
 * This is deliberately not a runtime, browser, environment or request flag.
 * Reopening requires a reviewed consent, authorization and validity contract.
 */
export function scoredMatchingAvailable(): boolean {
  return false;
}
