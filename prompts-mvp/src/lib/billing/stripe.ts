import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  PROMPT_ATLAS_PRO_CURRENCY,
  PROMPT_ATLAS_PRO_INTERVAL,
  PROMPT_ATLAS_PRO_INTERVAL_COUNT,
  PROMPT_ATLAS_PRO_MONTHLY_CENTS,
} from "@/lib/billing/plan";

let stripe: Stripe | null = null;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function getStripe(): Stripe {
  if (stripe) return stripe;
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe configuration is missing.");
  }
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2 });
  return stripe;
}

export function checkoutBaseUrl(request: NextRequest): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/$/, "");
}

function isLocalUrl(value: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(value).hostname);
  } catch {
    return false;
  }
}

export function blockLocalLiveStripe(
  request: NextRequest,
  baseUrl: string,
  flow: string,
): NextResponse | null {
  const secret = process.env.STRIPE_SECRET_KEY || "";
  if (!secret.startsWith("sk_live_")) return null;
  if (!isLocalUrl(request.nextUrl.origin) && !isLocalUrl(baseUrl)) return null;

  return NextResponse.json(
    {
      error: `${flow} is blocked because live Stripe credentials cannot be used with a local origin. Use test-mode credentials for local billing checks.`,
    },
    { status: 403, headers: { "Cache-Control": "private, no-store" } },
  );
}

export function isStripePortalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "billing.stripe.com";
  } catch {
    return false;
  }
}

export function isStripeCheckoutUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "checkout.stripe.com";
  } catch {
    return false;
  }
}

export function matchesPromptAtlasProPriceTerms(
  price: Stripe.Price,
  expectedPriceId: string,
): boolean {
  return (
    price.id === expectedPriceId &&
    price.type === "recurring" &&
    price.billing_scheme === "per_unit" &&
    price.unit_amount === PROMPT_ATLAS_PRO_MONTHLY_CENTS &&
    price.currency === PROMPT_ATLAS_PRO_CURRENCY &&
    price.recurring?.interval === PROMPT_ATLAS_PRO_INTERVAL &&
    price.recurring.interval_count === PROMPT_ATLAS_PRO_INTERVAL_COUNT &&
    price.recurring.usage_type === "licensed" &&
    price.custom_unit_amount === null
  );
}

export function isPromptAtlasProCheckoutPrice(
  price: Stripe.Price,
  expectedPriceId: string,
): boolean {
  return price.active && matchesPromptAtlasProPriceTerms(price, expectedPriceId);
}
