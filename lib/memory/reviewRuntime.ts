import type { ReviewedMemoryService } from './reviewedMemory';

// No hosted storage adapter or provider is activated by the local implementation.
// Verification injects synthetic adapters into the same handlers and service.
export function getReviewedMemoryService(): ReviewedMemoryService | null {
  return null;
}

export async function getReviewedGuideContext(memberId: string, thinkerId: string) {
  const service = getReviewedMemoryService();
  return service ? service.context(memberId, thinkerId) : null;
}
