import { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return privateJson({ error: 'Unauthorized' }, { status: 401 });
  }
  // Job authentication is not consent to memory profiling or proactive contact.
  return privateJson({ error: 'Proactive check-ins need a separate member-approved workflow.', processed: 0 }, { status: 503 });
}
