import { privateJson } from '@/lib/http/routeError';

export function GET() {
  return privateJson({ error: 'Practice answers are available to their authors.' }, { status: 410 });
}
