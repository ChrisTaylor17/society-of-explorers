import { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function getCheckoutBaseUrl(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (configured) return configured.replace(/\/$/, '');
  return req.nextUrl.origin;
}

function hostnameFromUrl(value: string): string | null {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function isLocalUrl(value: string): boolean {
  const hostname = hostnameFromUrl(value);
  return hostname ? LOCAL_HOSTS.has(hostname) : false;
}

export function isLiveStripeSecretKey(value: string): boolean {
  return value.startsWith('sk_live_');
}

export function blockLocalLiveStripeCheckout(
  req: NextRequest,
  stripeKey: string,
  baseUrl: string,
  flow: string,
) {
  const requestOrigin = req.nextUrl.origin;
  if (!isLiveStripeSecretKey(stripeKey)) return null;
  if (!isLocalUrl(requestOrigin) && !isLocalUrl(baseUrl)) return null;

  return privateJson(
    {
      error: `${flow} blocked: live-mode Stripe checkout cannot be created from a local origin. Use test-mode credentials for local checkout tests.`,
      externalActionAuthority: 'none',
      requiredApproval:
        'Approve creating checkout sessions or payments for [flow] using [test/live] mode.',
    },
    { status: 403 },
  );
}
