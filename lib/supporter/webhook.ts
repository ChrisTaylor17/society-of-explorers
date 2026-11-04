import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';
import { supporterConfig } from './config';
import { createSupporterProvider } from './provider';
import { supporterRpc, SupporterFailure } from './repository';
import { providerWait } from './server';
const TYPES = new Set(['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired',
  'customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','customer.subscription.paused','customer.subscription.resumed',
  'invoice.paid','invoice.payment_failed','invoice.payment_action_required','invoice.finalization_failed','invoice.updated','invoice.voided','invoice.marked_uncollectible',
  'charge.refunded','charge.dispute.created','radar.early_fraud_warning.created']);
async function bytes(req: NextRequest): Promise<Uint8Array> {
  const max = 1_000_000, chunks: Uint8Array[] = []; let total = 0;
  if (!req.body) { const b = new TextEncoder().encode(await req.text()); if (b.length>max) throw new SupporterFailure(413); return b; }
  const reader = req.body.getReader();
  try { while (true) { const part = await reader.read(); if (part.done) break; total += part.value.byteLength; if (total>max) { void reader.cancel().catch(()=>{}); throw new SupporterFailure(413); } chunks.push(part.value); } }
  finally { reader.releaseLock(); }
  const out = new Uint8Array(total); let offset = 0; for (const b of chunks) { out.set(b,offset); offset += b.length; } return out;
}
export async function supporterWebhookPost(req: NextRequest) {
  try {
    const c = supporterConfig(); if (!c?.webhookSecret) throw new SupporterFailure();
    const p = createSupporterProvider(c), body = await bytes(req); let event;
    try { event = p.event(body,req.headers.get('stripe-signature') || ''); } catch { throw new SupporterFailure(400); }
    await providerWait(p.verifyAccount());
    if (!TYPES.has(event.type)) return privateJson({ received:true,ignored:true });
    const targets = await providerWait(p.targets(event));
    if (targets.length>1) throw new SupporterFailure(); // One event cannot acknowledge a partially applied multi-account outcome.
    if (!targets.length) return privateJson({ received:true,ignored:true });
    const target = targets[0], hash = createHash('sha256').update(body).digest('hex');
    for (let retry = 0; retry<3; retry++) {
      const s = await supporterRpc('soe_supporter_event_state',{ p_scope:c.scope,p_account_id:target.accountId,p_customer_id:target.customerId });
      const fresh = await providerWait(p.state(target.customerId,target.accountId));
      if (!fresh.ownershipVerified) throw new SupporterFailure();
      const kind = target.kind === 'risk' || fresh.review ? 'risk' : target.kind;
      const terminal = target.session?.status === 'complete' ? 'completed' : target.session?.status === 'expired' ? 'expired' : null;
      if (terminal === 'completed' && (!target.session?.subscriptionId || target.session.subscriptionId !== fresh.subscription?.id)) throw new SupporterFailure();
      try {
        await supporterRpc('soe_supporter_apply_event',{ p_scope:c.scope,p_event_id:event.id,p_payload_hash:hash,p_account_id:target.accountId,p_customer_id:target.customerId,p_expected_revision:s.revision,
          p_event_kind:kind,p_snapshot:kind === 'risk' ? null : fresh.subscription,
          p_attempt_request_id: terminal ? target.requestId : null,p_attempt_status:terminal,
          p_session_id:terminal ? target.session!.id : null,p_session_url:terminal ? target.session!.url : null,p_session_expires_at:terminal ? target.session!.expiresAt : null,
          p_session_subscription_id:terminal === 'completed' ? target.session!.subscriptionId : null });
        return privateJson({ received:true });
      } catch (e) { if (!(e instanceof SupporterFailure) || e.status !== 409 || retry === 2) throw e; }
      // CAS conflict requires fresh provider state above; never reuse the older snapshot.
    }
    throw new SupporterFailure();
  } catch (e) { return privateJson({ error:'Supporter event could not be verified or persisted.' },{ status:e instanceof SupporterFailure && e.status === 400 ? 400 : e instanceof SupporterFailure && e.status === 413 ? 413 : 503 }); }
}
