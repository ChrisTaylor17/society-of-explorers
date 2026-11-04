import { privateJson } from '@/lib/http/routeError';

// Publishing a profile does not authorize publishing activity or earnings.
// Keep this boundary closed until a separate contribution consent model exists.
export async function GET() {
  return privateJson(
    { error: 'Leaderboard unavailable.', code: 'leaderboard_unavailable' },
    { status: 503 },
  );
}
