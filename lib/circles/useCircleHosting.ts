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
import type { CircleInput } from './schedule';

type Pending = { request: CircleCreateMutation; body: string; edition: CircleReadingEditionResponse | null; sent: boolean };
type View = { active: boolean; phase: 'idle' | 'loading' | 'editing' | 'review' | 'sending' | 'unknown' | 'created';
  access: CircleHostingAccess | null; preview: CircleCreateMutation | null; edition: CircleReadingEditionResponse | null;
  confirmed: boolean; retry: boolean; created: string | null; notice: string };
const initial = (): View => ({ active: true, phase: 'idle', access: null, preview: null, edition: null,
  confirmed: false, retry: false, created: null,
  notice: 'Check hosting access before entering your Circle details. No Circle is created by this check.' });
const refused = new Set([400, 401, 403, 404, 409, 413, 415, 429]);

/** Recovery belongs to this mounted hosting context. Temporary retirement hides
 * its private payload; neither an empty list nor an unchanged quota settles it. */
export function useCircleHosting(clearPrivateDraft: () => void) {
  const [view, setView] = useState<View>(initial);
  const clear = useRef(clearPrivateDraft); clear.current = clearPrivateDraft;
  const ref = useRef({ mounted: false, observing: false, active: true, busy: false, generation: 0, epoch: 0,
    owner: null as string | null, pending: null as Pending | null, controller: null as AbortController | null, view: initial() });
  const core = ref.current;
  const publish = (value: Partial<View>) => { core.view = { ...core.view, ...value }; core.epoch++; if (core.mounted) setView(core.view); };
  useEffect(() => {
    core.mounted = true; core.active = document.visibilityState === 'visible' && navigator.onLine !== false;
    core.view = { ...initial(), active: core.active }; setView(core.view);
    const retire = (inactive: boolean) => {
      core.generation++; core.epoch++; core.busy = false; core.controller?.abort(); core.controller = null;
      if (inactive) core.active = false;
      core.owner = null; if (!core.pending?.sent) core.pending = null;
      clear.current(); core.view = { ...initial(), active: core.active, notice: core.pending
        ? 'Private details and review cleared. A creation request may still complete. Check hosting access with the same account before reviewing an exact retry.'
        : 'Private details and draft cleared. Check hosting access to continue.' };
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
  // The mounted form owns recovery; unmount is a terminal close, never a cancellation of a sent request.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const epoch = core.epoch;
  const valid = () => core.mounted && core.observing && core.active && !core.busy && core.epoch === epoch;
  async function run(prepared: CircleInput | null = null, edition: CircleReadingEditionResponse | null = null, confirm = false) {
    if (!valid() || prepared && (core.view.phase !== 'editing' || core.pending?.sent)) return;
    const pending = confirm ? core.pending : null, earlierUnknown = pending?.sent === true;
    if (confirm && (!pending || core.view.phase !== 'review' || !core.view.confirmed)) return;
    const reviewedOwner = prepared ? core.owner : pending?.request.expectedMemberId;
    if (!confirm && !core.pending?.sent) core.pending = null;
    core.busy = true; const generation = ++core.generation, controller = new AbortController(); core.controller = controller;
    publish({ phase: confirm ? 'sending' : 'loading', access: null, preview: null, edition: null, confirmed: false, retry: false, created: null,
      notice: confirm ? 'Checking the current account and creating the reviewed Circle…' : 'Checking current hosting access…' });
    const current = () => core.mounted && core.active && core.generation === generation && !controller.signal.aborted;
    let posted = false, postStatus: number | null = null, discardedCreation = false;
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
        if (core.owner && core.owner !== member.id) clear.current();
        if (core.pending && core.pending.request.expectedMemberId !== member.id) {
          discardedCreation = core.pending.sent; core.pending = null; clear.current();
        }
        if (reviewedOwner && reviewedOwner !== member.id) { clear.current(); core.owner = null; throw Error('Review owner changed'); }
        if (pending && core.pending !== pending) throw Error('Review retired');
        core.owner = member.id; headers.set('X-Soe-Expected-Member', member.id);
        const response = await fetch('/api/circles/start', { headers, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal });
        if (!current() || response.status !== 200) throw Error('Hosting access unavailable');
        const value = await response.json(); if (!current()) return;
        const access = parseCircleHostingAccess(value, member.id); if (!access) throw Error('Hosting owner unavailable');
        if (pending) {
          if (!pending.sent && !access.canCreate) { core.pending = null; clear.current(); publish({ phase: 'idle', access,
            notice: 'Hosting is currently unavailable. Active and recent creation limits are checked separately. Review My Circles and check access later.' }); return; }
          clear.current();
          const writeHeaders = new Headers(headers); writeHeaders.set('content-type', 'application/json');
          posted = true; pending.sent = true;
          const written = await fetch('/api/circles', { method: 'POST', headers: writeHeaders, body: pending.body,
            credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal });
          postStatus = written.status;
          if (!current() || ![200, 201].includes(written.status)) throw Error('Creation refused');
          const receiptValue = await written.json(); if (!current()) return;
          const receipt = parseOwnedCircleCreateReceipt(receiptValue, pending.request.requestId, member.id);
          if (!receipt) throw Error('Creation receipt invalid');
          const readback = await fetch(`/api/circles/${receipt.circleId}`, { headers, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal });
          if (!current() || readback.status !== 200) throw Error('Created Circle unavailable');
          const readValue = await readback.json(); if (!current()) return;
          const detail = parseCircleDetail(readValue, receipt.circleId);
          if (!detail || !detail.viewer.signed_in || !detail.viewer.is_host || detail.revision < receipt.state.revision) throw Error('Created Circle readback invalid');
          core.pending = null; publish({ phase: 'created', created: receipt.circleId,
            notice: 'Circle creation confirmed and current state checked. Open your Circle to review its latest details.' });
        } else if (core.pending?.sent) {
          publish({ phase: 'unknown', access, notice: 'The earlier creation is still uncertain. Hosting counts and My Circles cannot prove it failed. Review the exact original request before retrying.' });
        } else if (prepared && access.canCreate) {
          const request = parseCircleCreateMutation({ expectedMemberId: member.id, requestId: crypto.randomUUID(), ...prepared });
          if (!request) throw Error('Reviewed listing invalid');
          core.pending = { request, body: circleCreateMutationBody(request), edition, sent: false };
          publish({ phase: 'review', access, preview: request, edition,
            notice: 'Current account and hosting access checked. Review these details before confirming your listing.' });
        } else publish({ phase: access.canCreate ? 'editing' : 'idle', access, notice: (discardedCreation
          ? 'The account changed. Earlier retry information was discarded; a Circle may still be created for the earlier account. Check that account’s My Circles before deliberately listing another. ' : '') + (access.canCreate
          ? 'Hosting access checked. Enter your details, then review the listing before creating it.'
          : `Hosting is currently unavailable. You host ${access.activeHosted} active Circles; the active limit is ${access.maxActiveHosted}. Recent creation limits also apply. Review My Circles and check access later.`) });
      })()]);
    } catch {
      if (core.mounted && core.active && core.generation === generation) {
        clear.current();
        if (pending && posted && refused.has(postStatus ?? 0) && !earlierUnknown) core.pending = null;
        const uncertain = Boolean(core.pending?.sent);
        publish({ phase: uncertain ? 'unknown' : 'idle', access: null, preview: null, edition: null, confirmed: false, retry: false, notice: uncertain
          ? 'The creation reply could not be confirmed. A Circle may have been created. Check hosting access before reviewing an exact retry; another listing could create a duplicate.'
          : discardedCreation ? 'The account changed. Earlier retry information was discarded; a Circle may still be created for the earlier account. Check that account’s My Circles before deliberately listing another.'
            : 'Current account, hosting access or creation could not be verified. Check your sign-in and hosting access. No empty hosting history or saved Circle is being assumed.' });
      }
    } finally { clearTimeout(timer); if (core.generation === generation) { core.busy = false; core.controller = null; if (core.mounted) setView({ ...core.view }); } }
  }
  return { ...view, epoch, busy: core.busy, uncertain: Boolean(core.pending?.sent),
    canRetry: view.phase === 'unknown' && Boolean(view.access) && core.owner === core.pending?.request.expectedMemberId,
    guardEdit: (edit: () => void) => { if (valid() && core.view.phase === 'editing' && !core.pending?.sent) edit(); },
    clearDraft: () => { if (valid() && core.view.phase === 'editing') { clear.current(); publish({ notice: 'Draft cleared. Enter your details before reviewing again.' }); } },
    invalid: (notice: string) => { if (valid() && core.view.phase === 'editing') publish({ notice }); },
    load: () => { if (valid() && !['review', 'created'].includes(core.view.phase)) void run(); },
    review: (prepared: CircleInput, edition: CircleReadingEditionResponse | null) => { if (valid()) void run(prepared, edition); },
    confirm: () => { if (valid()) void run(null, null, true); },
    check: (confirmed: boolean) => { if (valid() && core.view.phase === 'review') publish({ confirmed }); },
    retryRequest: () => { if (valid() && core.view.phase === 'unknown' && core.view.access && core.pending?.sent && core.owner === core.pending.request.expectedMemberId) {
      publish({ phase: 'review', preview: core.pending.request, edition: core.pending.edition, retry: true, confirmed: false,
        notice: 'Review the exact original listing. Its account, request ID, meeting details and reading plan are unchanged. This may recover a Circle already created.' });
    } },
    cancel: () => { if (valid() && core.view.phase === 'review') { const unknown = core.pending?.sent; if (!unknown) core.pending = null;
      publish({ phase: unknown ? 'unknown' : 'editing', preview: null, edition: null, confirmed: false, retry: false,
        notice: unknown ? 'The earlier creation is still uncertain. Nothing was retried.' : 'Review cancelled. Edit your details before reviewing again.' }); } },
    close: () => { if (valid()) { const sent = core.pending?.sent; core.generation++; core.pending = null; core.owner = null; clear.current();
      publish({ ...initial(), active: core.active, notice: sent
        ? 'Hosting view closed and retry information discarded. A sent creation may still complete. Check My Circles before deliberately starting another; its absence does not cancel the earlier request.'
        : 'Hosting view closed. Check hosting access to start again.' }); } },
  };
}
