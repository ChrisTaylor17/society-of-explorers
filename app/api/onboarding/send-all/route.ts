import { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function safeRequestJson(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

async function safeResponseJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const body = await response.json();
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

function boundedString(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function parseStep(value: unknown) {
  const step = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(step) ? step : -1;
}

function onboardingBatchTriggerEnabled() {
  return process.env.ONBOARDING_BATCH_TRIGGER_ENABLED === 'true';
}

export async function POST(req: NextRequest) {
  const authorization = req.headers.get('authorization') ?? '';

  if (authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return privateJson({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await safeRequestJson(req);

    if (!body) {
      return privateJson({ error: 'Invalid body' }, { status: 400 });
    }

    const memberId = boundedString(body.memberId, 128);
    const step = parseStep(body.step);

    if (!memberId || step < 0) {
      return privateJson({ error: 'memberId and step required' }, { status: 400 });
    }

    if (!onboardingBatchTriggerEnabled()) {
      return privateJson({ triggered: false, reason: 'batch_disabled' });
    }

    const response = await fetch(new URL('/api/onboarding/trigger', req.url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization,
      },
      cache: 'no-store',
      body: JSON.stringify({ memberId, step }),
    });

    return privateJson({
      triggered: response.ok,
      status: response.status,
      result: await safeResponseJson(response),
    });
  } catch {
    console.warn('[onboarding/send-all] failed');
    return privateJson({ triggered: false, reason: 'server_error' }, { status: 500 });
  }
}
