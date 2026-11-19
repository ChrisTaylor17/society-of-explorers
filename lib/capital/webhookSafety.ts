import type Stripe from 'stripe';

export function shouldSendCapitalWebhookEmail(event: Pick<Stripe.Event, 'livemode'>): boolean {
  return event.livemode === true && process.env.CAPITAL_WEBHOOK_EMAIL_NOTIFICATIONS_ENABLED === 'true';
}

export function capitalWebhookEmailSkipReason(event: Pick<Stripe.Event, 'livemode'>): string | null {
  if (shouldSendCapitalWebhookEmail(event)) return null;

  if (event.livemode !== true) {
    return 'Stripe event is test-mode; outbound capital webhook email is suppressed.';
  }

  return 'CAPITAL_WEBHOOK_EMAIL_NOTIFICATIONS_ENABLED is not true; outbound capital webhook email is suppressed.';
}
