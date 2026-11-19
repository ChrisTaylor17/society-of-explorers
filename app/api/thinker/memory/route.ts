import { privateJson } from '@/lib/http/routeError';

export const runtime = 'nodejs';

// Legacy callers cannot bypass per-memory member review. No provider or storage call.
export async function POST() {
  return privateJson({ error: 'Unreviewed memory saves are disabled. Open the memory review controls.', memoryReviewRequired: true }, { status: 410 });
}
