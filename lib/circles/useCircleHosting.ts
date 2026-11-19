'use client';

import { useEffect, useRef, useState } from 'react';
import { memberSessionDto } from '@/lib/auth/memberDto';
import { createClient } from '@/lib/supabase/client';
import type { CircleReadingEditionResponse } from './reading-program';
import { bindCircleAccess } from './browser-access';
import { circleHeaders } from '@/lib/circles/client';
import { circleCreateMutationBody, parseCircleCreateMutation, parseCircleHostingAccess, parseOwnedCircleCreateReceipt,
  type CircleCreateMutation, type CircleHostingAccess } from './hosting';
import { parseCircleDetail } from './membership';
import { clearCircleCreationReference, parseCircleCreationResult, preserveCircleCreationReference, readCircleCreationReference,
  type CircleCreationReference } from './hosting-recovery';
import type { CircleInput } from './schedule';

type Pending = { request: CircleCreateMutation; body: string; edition: CircleReadingEditionResponse | null; sent: boolean };
type View = { active: boolean; phase: 'idle' | 'loading' | 'editing' | 'review' | 'sending' | 'unknown' | 'created';
  access: CircleHostingAccess | null; preview: CircleCreateMutation | null; edition: CircleReadingEditionResponse | null;
  confirmed: boolean; retry: boolean; created: string | null; recovery: boolean; storageBlocked: boolean; notice: string };
const initial = (): View => ({ active: true, phase: 'idle', access: null, preview: null, edition: null,
  confirmed: false, retry: false, created: null, recovery: false, storageBlocked: false,
  notice: 'Check hosting access before entering your Circle details. No Circle is created by this check.' });
const refused = new Set([400, 401, 403, 404, 409, 413, 415, 429]);

/** The private retry body stays in this mounted view. Only an opaque reference
 * survives reload in this tab; list absence and quotas never settle a request. */
export function useCircleHosting(clearPrivateDraft: () => void) {
  const [view, setView] = useState<View>(initial);
  const clear = useRef(clearPrivateDraft); clear.current = clearPrivateDraft;
  const ref = useRef({ mounted: false, observing: false, active: true, busy: false, generation: 0, epoch: 0,
    owner: null as string | null, pending: null as Pending | null, reference: null as CircleCreationReference | null,
    storageBlocked: false, unsentReference: null as CircleCreationReference | null, controller: null as AbortController | null, view: initial() });
  const core = ref.current;
  const storage = () => window.sessionStorage;
  const publish = (value: Partial<View>) => { core.view = { ...core.view, ...value }; core.epoch++; if (core.mounted) setView(core.view); };
  useEffect(() => {
    core.mounted = true; core.active = document.visibilityState === 'visible' && navigator.onLine !== false;
    core.view = { ...initial(), active: core.active }; setView(core.view);
    const retire = (inactive: boolean) => {
      core.generation++; core.epoch++; core.busy = false; core.controller?.abort(); core.controller = null;
      if (inactive) core.active = false;
      core.owner = null; core.reference = null; core.storageBlocked = false; if (!core.pending?.sent) core.pending = null;
      clear.current(); core.view = { ...initial(), active: core.active,
        notice: 'Private details and review cleared. Check your current account before continuing. Sent creation references remain private to this tab session.' };
      if (core.mounted) setView(core.view);
    };
    const activate = () => { if (core.mounted && core.observing && document.visibilityState === 'visible' && navigator.onLine !== false) {
      core.active = true; core.view = { ...core.view, active: true }; setView(core.view);
    } };
    const offline = () => retire(true);
    window.addEventListener('offline', offline); window.addEventListener('online', activate);
    const dispose = bindCircleAccess({ window, document,
      subscribeAuth(listener) { try { const { data } = createClient().auth.onAuthStateChange(listener); core.observing = true; return () => data.subscription.unsubscribe(); }
        catch { retire(true); return () => {}; } },
      onInactive: () => retire(true), onActive: activate, onIdentity: () => retire(false),
    });
    return () => { core.mounted = false; retire(true); core.pending = null; core.observing = false; dispose();
      window.removeEventListener('offline', offline); window.removeEventListener('online', activate); };
  // Unmount clears private bytes, not the tab-session reference or a sent request.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const epoch = core.epoch;
  const valid = () => core.mounted && core.observing && core.active && !core.busy && core.epoch === epoch;
  async function run(prepared: CircleInput | null = null, edition: CircleReadingEditionResponse | null = null, confirm = false, recover = false) {
    if (!valid() || prepared && (core.view.phase !== 'editing' || core.pending?.sent || core.reference || core.storageBlocked)) return;
    const pending = confirm ? core.pending : null, earlierUnknown = pending?.sent === true;
    if (confirm && (!pending || core.view.phase !== 'review' || !core.view.confirmed)) return;
    const reviewedOwner = prepared ? core.owner : pending?.request.expectedMemberId;
    const previousOwner = core.owner;
    if (!confirm && !core.pending?.sent) core.pending = null;
    core.owner = null; core.reference = null; core.storageBlocked = false;
    core.busy = true; const generation = ++core.generation, controller = new AbortController(); core.controller = controller;
    publish({ phase: confirm ? 'sending' : 'loading', access: null, preview: null, edition: null, confirmed: false, retry: false, created: null, recovery: false, storageBlocked: false,
      notice: confirm ? 'Checking the current account and creating the reviewed Circle…' : recover ? 'Checking the earlier creation result without sending it again…' : 'Checking current hosting access…' });
    const current = () => core.mounted && core.active && core.generation === generation && !controller.signal.aborted;
    let posted = false, definiteRefusal = false;
    const settle = (reference: CircleCreationReference, circleId: string) => {
      const cleared = clearCircleCreationReference(storage, reference);
      core.pending = null; core.reference = cleared ? null : reference; core.storageBlocked = !cleared;
      publish({ phase: 'created', created: circleId, recovery: !cleared, storageBlocked: !cleared,
        notice: cleared ? 'Circle creation confirmed and current host access checked. Open your Circle to review its latest details.'
          : 'Circle creation is confirmed. Open your Circle or My Circles. This tab could not clear its recovery reference; new creation stays paused. Check the earlier result again to retry that local cleanup.' });
    };
    const aborted = new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(Error('Hosting request retired')), { once: true }));
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      await Promise.race([aborted, (async () => {
        const headers = new Headers(await circleHeaders()); if (!current()) return;
        const actorResponse = await fetch('/api/auth/member', { headers, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal });
        if (!current() || actorResponse.status !== 200) throw Error('Canonical member unavailable');
        const actor = await actorResponse.json(); if (!current()) return;
        const member = memberSessionDto(actor?.member), auth = actor?.auth;
        if (!member || member.id !== member.id.toLowerCase() || !auth || !['supabase', 'wallet'].includes(auth.provider)
          || typeof auth.subject !== 'string' || !auth.subject) throw Error('Canonical member unavailable');
        if (previousOwner && previousOwner !== member.id) clear.current();
        if (core.pending && core.pending.request.expectedMemberId !== member.id) {
          core.pending = null; clear.current();
        }
        if (reviewedOwner && reviewedOwner !== member.id) { clear.current(); core.owner = null; throw Error('Review owner changed'); }
        if (pending && core.pending !== pending) throw Error('Review retired');
        core.owner = member.id; headers.set('X-Soe-Expected-Member', member.id);
        let stored = readCircleCreationReference(storage, member.id);
        core.storageBlocked = !stored.ok;
        if (!stored.ok) throw Error('Creation recovery storage unavailable');
        // Keep known no-send/definite-refusal facts in memory when a storage
        // write or cleanup failed. A reload cannot assume those facts.
        if (core.unsentReference?.memberId === member.id) {
          if (!stored.reference || stored.reference.requestId === core.unsentReference.requestId) {
            if (!clearCircleCreationReference(storage, core.unsentReference)) { core.storageBlocked = true; throw Error('Creation cleanup unavailable'); }
            stored = { ok: true, reference: null };
          }
          core.unsentReference = null;
        }
        core.reference = stored.reference;
        if (core.pending?.sent) {
          const reference: CircleCreationReference = { version: 1, memberId: member.id, requestId: core.pending.request.requestId };
          if (!preserveCircleCreationReference(storage, reference)) { core.storageBlocked = true; throw Error('Creation recovery reference changed'); }
          core.reference = reference;
        }
        if (core.reference && pending && !pending.sent) { core.pending = null; throw Error('Earlier creation must be resolved'); }
        if (recover) {
          const reference = core.reference;
          if (!reference) { publish({ phase: 'idle', notice: 'No earlier creation reference is available for this account in this tab. Check hosting access to continue.' }); return; }
          clear.current();
          const result = await fetch(`/api/circles/start/receipt?requestId=${reference.requestId}`, {
            headers, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal });
          if (!current() || result.status !== 200) throw Error('Creation result unavailable');
          const value = await result.json(); if (!current()) return;
          const receipt = parseCircleCreationResult(value, reference); if (!receipt) throw Error('Creation result mismatched');
          if (receipt.circleId) settle(reference, receipt.circleId);
          else publish({ phase: 'unknown', recovery: true,
            notice: 'No matching creation receipt is visible yet. The earlier request may still complete. Nothing was resent, and a new listing remains paused. Check again later or visit My Circles.' });
          return;
        }
        const response = await fetch('/api/circles/start', { headers, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal });
        if (!current() || response.status !== 200) throw Error('Hosting access unavailable');
        const value = await response.json(); if (!current()) return;
        const access = parseCircleHostingAccess(value, member.id); if (!access) throw Error('Hosting owner unavailable');
        if (pending) {
          if (!pending.sent && !access.canCreate) { core.pending = null; clear.current(); publish({ phase: 'idle', access,
            notice: 'Hosting is currently unavailable. Active and recent creation limits are checked separately. Review My Circles and check access later.' }); return; }
          clear.current();
          const writeHeaders = new Headers(headers); writeHeaders.set('content-type', 'application/json');
          const reference: CircleCreationReference = { version: 1, memberId: member.id, requestId: pending.request.requestId };
          if (!preserveCircleCreationReference(storage, reference)) {
            core.storageBlocked = true;
            if (!pending.sent) { core.unsentReference = reference; core.pending = null; }
            throw Error('Cannot preserve creation reference');
          }
          core.reference = reference;
          posted = true; pending.sent = true;
          const written = await fetch('/api/circles', { method: 'POST', headers: writeHeaders, body: pending.body,
            credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal });
          if (!current()) return;
          if (![200, 201].includes(written.status)) {
            if (refused.has(written.status) || written.status === 503) {
              const failure = await written.json(); if (!current()) return;
              definiteRefusal = failure !== null && typeof failure === 'object' && !Array.isArray(failure)
                && Object.keys(failure).length === 2 && typeof failure.error === 'string' && failure.error.length > 0 && failure.outcome === 'not_attempted';
            }
            throw Error('Creation refused');
          }
          const receiptValue = await written.json(); if (!current()) return;
          const receipt = parseOwnedCircleCreateReceipt(receiptValue, pending.request.requestId, member.id);
          if (!receipt) throw Error('Creation receipt invalid');
          const readback = await fetch(`/api/circles/${receipt.circleId}`, { headers, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal });
          if (!current() || readback.status !== 200) throw Error('Created Circle unavailable');
          const readValue = await readback.json(); if (!current()) return;
          const detail = parseCircleDetail(readValue, receipt.circleId);
          if (!detail || !detail.viewer.signed_in || !detail.viewer.is_host || detail.revision < receipt.state.revision) throw Error('Created Circle readback invalid');
          settle(reference, receipt.circleId);
        } else if (core.reference) {
          clear.current();
          publish({ phase: 'unknown', access, recovery: true,
            notice: 'An earlier Circle creation is still uncertain. Check its result without resending it. Hosting counts and My Circles cannot prove it failed; a new listing remains paused.' });
        } else if (prepared && access.canCreate) {
          const request = parseCircleCreateMutation({ expectedMemberId: member.id, requestId: crypto.randomUUID(), ...prepared });
          if (!request) throw Error('Reviewed listing invalid');
          core.pending = { request, body: circleCreateMutationBody(request), edition, sent: false };
          publish({ phase: 'review', access, preview: request, edition,
            notice: 'Current account and hosting access checked. Review these details before confirming your listing.' });
        } else publish({ phase: access.canCreate ? 'editing' : 'idle', access, notice: access.canCreate
          ? 'Hosting access checked. Enter your details, then review the listing before creating it.'
          : `Hosting is currently unavailable. You host ${access.activeHosted} active Circles; the active limit is ${access.maxActiveHosted}. Recent creation limits also apply. Review My Circles and check access later.` });
      })()]);
    } catch {
      if (core.mounted && core.active && core.generation === generation) {
        clear.current();
        if (pending && posted && definiteRefusal && !earlierUnknown && core.reference) {
          core.unsentReference = core.reference;
          const cleared = clearCircleCreationReference(storage, core.reference);
          core.pending = null; core.storageBlocked = !cleared; if (cleared) { core.reference = null; core.unsentReference = null; }
        }
        const uncertain = Boolean(core.owner && (core.reference || core.pending?.sent && core.pending.request.expectedMemberId === core.owner));
        publish({ phase: uncertain || core.storageBlocked ? 'unknown' : 'idle', access: null, preview: null, edition: null, confirmed: false, retry: false,
          recovery: uncertain, storageBlocked: core.storageBlocked, notice: core.storageBlocked
            ? 'This tab could not verify its creation recovery reference. No new request was sent without preserving one. New creation is paused; check hosting access again when browser storage is available.'
            : uncertain ? 'The creation reply could not be confirmed. A Circle may have been created. Check the earlier result without resending it, or visit My Circles. A new listing remains paused.'
              : 'Current account, hosting access or creation could not be verified. Check your sign-in and hosting access. No empty hosting history or saved Circle is being assumed.' });
      }
    } finally { clearTimeout(timer); if (core.generation === generation) { core.busy = false; core.controller = null; if (core.mounted) setView({ ...core.view }); } }
  }
  return { ...view, epoch, busy: core.busy, uncertain: view.recovery || view.storageBlocked,
    canCheckReceipt: view.recovery && Boolean(core.reference) && core.owner === core.reference?.memberId,
    canRetry: view.phase === 'unknown' && !view.storageBlocked && Boolean(view.access) && core.pending?.sent === true && core.owner === core.pending.request.expectedMemberId,
    guardEdit: (edit: () => void) => { if (valid() && core.view.phase === 'editing' && !core.pending?.sent && !core.reference && !core.storageBlocked) edit(); },
    clearDraft: () => { if (valid() && core.view.phase === 'editing') { clear.current(); publish({ notice: 'Draft cleared. Enter your details before reviewing again.' }); } },
    invalid: (notice: string) => { if (valid() && core.view.phase === 'editing') publish({ notice }); },
    load: () => { if (valid() && !['review', 'created'].includes(core.view.phase)) void run(); },
    checkReceipt: () => { if (valid() && core.reference && core.owner === core.reference.memberId) void run(null, null, false, true); },
    review: (prepared: CircleInput, edition: CircleReadingEditionResponse | null) => { if (valid()) void run(prepared, edition); },
    confirm: () => { if (valid()) void run(null, null, true); },
    check: (confirmed: boolean) => { if (valid() && core.view.phase === 'review') publish({ confirmed }); },
    retryRequest: () => { if (valid() && !core.storageBlocked && core.view.phase === 'unknown' && core.view.access && core.pending?.sent && core.owner === core.pending.request.expectedMemberId) {
      publish({ phase: 'review', preview: core.pending.request, edition: core.pending.edition, retry: true, confirmed: false,
        notice: 'Review the exact original listing. Its account, request ID, meeting details and reading plan are unchanged. This may recover a Circle already created.' });
    } },
    cancel: () => { if (valid() && core.view.phase === 'review') { const unknown = core.pending?.sent; if (!unknown) core.pending = null;
      publish({ phase: unknown ? 'unknown' : 'editing', preview: null, edition: null, confirmed: false, retry: false,
        notice: unknown ? 'The earlier creation is still uncertain. Nothing was retried.' : 'Review cancelled. Edit your details before reviewing again.' }); } },
    close: () => { if (valid()) { core.generation++; core.pending = null; core.reference = null; core.owner = null; core.storageBlocked = false; clear.current();
      publish({ ...initial(), active: core.active,
        notice: 'Hosting view closed and private draft cleared. Sent creation references stay in this tab session. Check the same account to recover a result; closing does not cancel a sent request.' }); } },
  };
}
