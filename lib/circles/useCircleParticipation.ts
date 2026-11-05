'use client';

import { useEffect, useRef, useState } from 'react';
import { memberSessionDto } from '@/lib/auth/memberDto';
import { createClient } from '@/lib/supabase/client';
import { bindCircleAccess } from './browser-access';
import { circleCompleteMutationBody, parseOwnedCircleCompleteReceipt } from './hosting';
import { circleHeaders } from '@/lib/circles/client';
import { circleAttendanceMutationBody, parseCircleAttendanceReceipt, parseCircleDetail, parseCircleManagement,
  parseCircleMembershipReceipt, type CircleDetail, type CircleManagement } from './membership';

export type ParticipationIntent = { action: 'join' } | { action: 'leave' } | { action: 'complete' }
  | { action: 'rsvp'; date: string; status: 'going' | 'not_going' };
type Pending = { intent: ParticipationIntent; expectedRevision: number; requestId: string; memberId: string;
  management: boolean; body: string; sent: boolean };
type View = { active: boolean; phase: 'idle' | 'loading' | 'ready' | 'review' | 'sending' | 'unknown';
  detail: CircleDetail | null; management: CircleManagement | null; intent: ParticipationIntent | null;
  confirmed: boolean; retry: boolean; notice: string };
const initial = (): View => ({ active: true, phase: 'idle', detail: null, management: null, intent: null, confirmed: false, retry: false,
  notice: 'Load this Circle to check current membership, meeting details and available actions.' });
const refused = new Set([400, 401, 403, 404, 409, 413, 415, 429]);
const allowed = (detail: CircleDetail | null, management: CircleManagement | null, intent: ParticipationIntent) => {
  const capabilities = detail?.capabilities ?? management?.capabilities;
  return intent.action === 'join' ? Boolean(detail?.capabilities.canJoin)
    : intent.action === 'leave' ? Boolean(capabilities?.canLeave)
      : intent.action === 'complete' ? Boolean(capabilities?.canComplete)
        : Boolean(detail?.capabilities.canRsvp && detail.meetings.some(meeting => meeting.date === intent.date));
};

/** The current view owns its exact unresolved requests. Retirement hides the
 * review and private data; only a fresh same-member read can expose a retry.
 * Browser cookies remain supported, with a server-checked actor precondition. */
export function useCircleParticipation(circleId: string) {
  const [view, setView] = useState<View>(initial);
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
      core.owner = null;
      if (!core.pending?.sent) core.pending = null;
      core.view = { ...initial(), active: core.active, notice: core.pending
        ? 'Private Circle details and review cleared. A request may still complete. Load current access before reviewing an exact retry.'
        : 'Private Circle details, conversation and action drafts cleared. Load current access to continue.' };
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
  // A Circle key owns this lifetime. A different Circle never inherits recovery.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circleId]);

  const epoch = core.epoch;
  const valid = () => core.mounted && core.observing && core.active && !core.busy && core.epoch === epoch;
  async function run(management: boolean, requested: ParticipationIntent | null = null, confirm = false) {
    if (!valid() || requested && core.pending?.sent) return;
    const pending = confirm ? core.pending : null, earlierUnknown = pending?.sent === true;
    if (confirm && (!pending || core.view.phase !== 'review' || !core.view.confirmed)) return;
    if (!confirm && !core.pending?.sent) core.pending = null;
    core.busy = true; const generation = ++core.generation, controller = new AbortController(); core.controller = controller;
    publish({ phase: confirm ? 'sending' : 'loading', detail: null, management: null, intent: null, confirmed: false, retry: false,
      notice: confirm ? 'Checking the current account and saving the reviewed participation request…' : 'Checking current Circle state…' });
    const current = () => core.mounted && core.active && core.generation === generation && !controller.signal.aborted;
    let posted = false, postStatus: number | null = null, receiptRevision: number | null = null;
    const aborted = new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(Error('Circle request retired')), { once: true }));
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      await Promise.race([aborted, (async () => {
        const headers = new Headers(await circleHeaders());
        if (!current()) return;
        const actorResponse = await fetch('/api/auth/member', { headers, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal });
        if (!current()) return;
        let memberId: string | null = null;
        if (actorResponse.status === 200) {
          const value = await actorResponse.json(); if (!current()) return;
          const member = memberSessionDto(value?.member), auth = value?.auth;
          if (!member || member.id !== member.id.toLowerCase() || !auth || !['supabase', 'wallet'].includes(auth.provider)
            || typeof auth.subject !== 'string' || !auth.subject) throw Error('Canonical member unavailable');
          memberId = member.id;
        } else if (actorResponse.status !== 401) throw Error('Canonical member unavailable');
        if (core.pending && core.pending.memberId !== memberId) { core.pending = null; if (pending) throw Error('Account changed before confirmation'); }
        core.owner = memberId;
        if ((requested || confirm || management || core.pending) && !memberId) throw Error('Current member required');
        if (pending && (core.pending !== pending || pending.memberId !== memberId)) throw Error('Review owner changed');
        if (memberId) headers.set('X-Soe-Expected-Member', memberId);
        const path = `/api/circles/${circleId}`;
        if (pending) {
          if (!current()) return;
          const writeHeaders = new Headers(headers); writeHeaders.set('content-type', 'application/json'); writeHeaders.set('X-Soe-Expected-Member', memberId!);
          posted = true; pending.sent = true;
          const response = await fetch(`${path}/${pending.intent.action}`, { method: 'POST', headers: writeHeaders, body: pending.body,
            credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal });
          postStatus = response.status;
          if (!current() || response.status !== 200) throw Error('Participation change refused');
          const value = await response.json(); if (!current()) return;
          const receipt = pending.intent.action === 'rsvp'
            ? parseCircleAttendanceReceipt(value, circleId, pending.requestId, pending.memberId)
            : pending.intent.action === 'complete' ? parseOwnedCircleCompleteReceipt(value, circleId, pending.requestId, pending.memberId)
              : parseCircleMembershipReceipt(value, pending.intent.action, circleId, pending.requestId);
          if (!receipt || receipt.state.revision < pending.expectedRevision + (pending.intent.action === 'rsvp' ? 1 : 0)
            || pending.intent.action === 'rsvp' && (receipt.receipt.date !== pending.intent.date || receipt.receipt.status !== pending.intent.status)) throw Error('Participation receipt invalid');
          receiptRevision = receipt.state.revision;
        }
        if (!current()) return;
        const response = await fetch(path + (management ? '/membership' : ''), { headers, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal });
        if (!current() || response.status !== 200) throw Error('Current Circle unavailable');
        const value = await response.json(); if (!current()) return;
        const detail = management ? null : parseCircleDetail(value, circleId), controls = management ? parseCircleManagement(value, circleId) : null;
        const state = detail ?? controls;
        if (!state || state.viewer.signed_in !== (memberId !== null) || state.revision < (receiptRevision ?? 0)) throw Error('Current Circle state invalid');
        const held = core.pending;
        if (held && state.revision < held.expectedRevision) throw Error('Circle revision regressed');
        if (pending && receiptRevision !== null) {
          core.pending = null;
          publish({ detail, management: controls, phase: 'ready', notice: 'Request confirmed. Current state is shown below; an earlier receipt does not override later changes.' });
        } else if (held?.sent && state.revision === held.expectedRevision) {
          publish({ detail, management: controls, phase: 'unknown', notice: 'The earlier request is still uncertain. Unchanged Circle state does not prove it failed. Review an exact retry before sending it again.' });
        } else {
          if (held) core.pending = null;
          if (requested && memberId && allowed(detail, controls, requested)) {
            const requestId = crypto.randomUUID(), expectedRevision = state.revision;
            const body = requested.action === 'rsvp' ? circleAttendanceMutationBody({ expectedMemberId: memberId, requestId, expectedRevision, date: requested.date, status: requested.status })
              : requested.action === 'complete' ? circleCompleteMutationBody({ expectedMemberId: memberId, requestId, expectedRevision })
                : JSON.stringify({ requestId, expectedRevision });
            core.pending = { intent: requested, memberId, requestId, expectedRevision, management, body, sent: false };
            publish({ detail, management: controls, intent: requested, phase: 'review', notice: 'Current access checked. Review and confirm this action. Nothing has been changed yet.' });
          } else publish({ detail, management: controls, phase: 'ready', notice: held?.sent
            ? 'A newer Circle revision now prevents the earlier request from changing it. Current state is shown.'
            : requested ? 'That action is no longer available. Review the current membership and meeting dates.'
              : management ? 'Current membership controls loaded. Meeting and listing details have not been verified.' : 'Current Circle state loaded. Each change checks current access again before confirmation.' });
        }
      })()]);
    } catch {
      if (core.mounted && core.active && core.generation === generation) {
        if (pending && posted && receiptRevision === null && refused.has(postStatus ?? 0) && !earlierUnknown) core.pending = null;
        const uncertain = Boolean(core.pending?.sent);
        publish({ phase: uncertain ? 'unknown' : 'idle', detail: null, management: null, intent: null, confirmed: false, retry: false, notice: uncertain
          ? 'The reply could not be confirmed. This change may have been saved. Load current access before reviewing an exact retry.'
          : 'Current Circle access or this change could not be verified. Check your sign-in and load current access. No saved change or available seat is being assumed.' });
      }
    } finally { clearTimeout(timer); if (core.generation === generation) { core.busy = false; core.controller = null; if (core.mounted) setView({ ...core.view }); } }
  }
  return { ...view, epoch, busy: core.busy, uncertain: Boolean(core.pending?.sent),
    canRetry: view.phase === 'unknown' && Boolean(view.detail || view.management) && core.owner === core.pending?.memberId,
    load: (intent: ParticipationIntent | null = null) => { if (valid() && core.view.phase !== 'review') void run(false, intent); },
    loadMembership: (intent: ParticipationIntent | null = null) => { if (valid() && core.view.phase !== 'review') void run(true, intent); },
    confirm: () => { if (valid()) void run(core.pending?.management ?? false, null, true); },
    check: (value: boolean) => { if (valid() && core.view.phase === 'review') publish({ confirmed: value }); },
    retryRequest: () => { if (valid() && core.view.phase === 'unknown' && core.pending?.sent && core.owner === core.pending.memberId && (core.view.detail || core.view.management)) {
      publish({ phase: 'review', intent: core.pending.intent, retry: true, confirmed: false, notice: 'Review an exact retry. Its original meeting, status, revision and request ID are unchanged.' });
    } },
    cancel: () => { if (valid() && core.view.phase === 'review') { const unknown = core.pending?.sent; if (!unknown) core.pending = null;
      publish({ intent: null, confirmed: false, retry: false, phase: unknown ? 'unknown' : 'ready', notice: unknown ? 'The earlier request is still uncertain. Nothing was retried.' : 'Review cancelled. Nothing was sent.' }); } },
    close: () => { if (valid()) { const sent = core.pending?.sent; core.generation++; core.pending = null; core.owner = null;
      publish({ ...initial(), active: core.active, notice: sent ? 'Circle view closed. A sent request may still complete; its retry information was discarded. Load current access before another change.' : 'Circle view closed. Load current access to continue.' }); } },
  };
}
