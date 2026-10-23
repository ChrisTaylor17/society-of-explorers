// Remember which Stripe event ids were fully processed so a redelivered event is
// acknowledged without repeating side effects. Rows are written only after the
// handler succeeds, so a failed attempt is still retried by Stripe.
//
// Needs table public.stripe_webhook_events (supabase/migrations/20261024_stripe_webhook_events.sql).
// Until that migration is applied the check reports `available: false` and the
// webhook behaves exactly as before (membership writes are idempotent by nature,
// pledges are already de-duplicated by the pledge ledger).
import type { SupabaseClient } from '@supabase/supabase-js';

export const WEBHOOK_EVENTS_TABLE = 'stripe_webhook_events';

type PgError = { code?: string; message?: string } | null;

export function isMissingTableError(error: PgError): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === 'PGRST205' || new RegExp(WEBHOOK_EVENTS_TABLE).test(error.message || '');
}

export async function wasEventProcessed(
  supabase: SupabaseClient,
  eventId: string,
): Promise<{ available: boolean; processed: boolean }> {
  const { data, error } = await supabase.from(WEBHOOK_EVENTS_TABLE).select('event_id').eq('event_id', eventId).maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return { available: false, processed: false };
    throw new Error('Webhook idempotency lookup failed');
  }
  return { available: true, processed: Boolean(data) };
}

export async function markEventProcessed(
  supabase: SupabaseClient,
  event: { id: string; type: string; livemode?: boolean | null; created?: number | null },
  outcome: string,
): Promise<void> {
  const { error } = await supabase.from(WEBHOOK_EVENTS_TABLE).upsert(
    {
      event_id: event.id,
      event_type: event.type,
      livemode: Boolean(event.livemode),
      stripe_created_at: event.created ? new Date(event.created * 1000).toISOString() : null,
      outcome,
      processed_at: new Date().toISOString(),
    },
    { onConflict: 'event_id' },
  );
  // Recording is best effort: the work already succeeded, and a replay is safe.
  if (error && !isMissingTableError(error)) console.warn('[webhook] Could not record processed Stripe event');
}
