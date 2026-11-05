import { privateJson } from '@/lib/http/routeError';

export function POST() {
  // The legacy endpoint let clients choose an amount without a verified reading event.
  return privateJson({ error: 'Direct reading awards are unavailable.' }, { status: 410 });
}
