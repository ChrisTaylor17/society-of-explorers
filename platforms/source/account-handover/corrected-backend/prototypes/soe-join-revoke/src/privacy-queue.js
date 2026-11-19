import { createSyntheticOps, freshOpsId } from './synthetic-ops.js';

export const QUEUE_CONTRACT = 'safety-queue-v1';
export const QUEUE_WRITES = new Set(['safety-request', 'review-dispatch', 'review-escalate']);
export const PRIVACY_COLLECTIONS = ['reviewRequests', 'privateAudit'];
export const RHEA = Object.freeze({ id: 'rhea', magicName: 'rhea', displayName: 'Rhea (fictional triage)',
  passcode: 'synthetic-rhea', interests: ['Synthetic safety review'], availability: ['Test only'], relay: 'relay:synthetic.rhea' });
const rejected = error => ({ status: 'rejected', error });
const exact = (x, fields, optional = []) => x && typeof x === 'object' && !Array.isArray(x) &&
  fields.every(k => Object.hasOwn(x, k)) && Object.keys(x).every(k => [...fields, ...optional].includes(k));
const id = x => typeof x === 'string' && /^[a-zA-Z0-9._:-]{1,100}$/.test(x);
const epoch = x => Number.isSafeInteger(x) && x >= 1;

/** Explicit synthetic v4 mode. No worker, provisioning, notification or report reader. */
export function createPrivacyOps(config) {
  const base = createSyntheticOps(config), c = config.collections;
  const { people, plans, assignments, holds, handoffs, reviewRequests, opsAudit, privateAudit } = c;
  const at = () => new Date(config.now()).toISOString();
  const own = (person, plan, role) => [...assignments.values()].filter(a => a.personId === person.id &&
    a.planId === plan && a.status === 'active' && (!role || a.role === role));
  const domain = (view, plan, person) => `${QUEUE_CONTRACT}:${view}:${plan}:${person.id}`;
  const privateVersion = (view, person) => view === 'triage' ? privateAudit.size :
    [...privateAudit.values()].filter(a => a.visibleTo.includes(person.id)).length;
  function endpointAllowed(person, endpoint) {
    // Role namespace gate precedes key/target lookup. Revoked own-role history is
    // still recoverable; authorize() separately rejects every fresh stale write.
    if (endpoint === 'handoff-request') return false;
    if (['review-dispatch', 'review-escalate'].includes(endpoint)) return [...assignments.values()].some(a=>a.personId===person.id&&a.planId==='plan-riverside'&&a.role==='safety_triage');
    if (endpoint === 'handoff-ack') return [...assignments.values()].some(a=>a.personId===person.id&&a.planId==='plan-riverside'&&a.role==='safety');
    return true;
  }
  function publicCommit(a, operation, target, data) {
    const committedAt = at(), seq = opsAudit.size + 1;
    opsAudit.set(String(seq), { seq, at: committedAt, planId: a.planId, actorRole: a.role, action: operation, targetRef: target, outcome: 'queued' });
    return { status: 'committed', version: config.bump(plans.get(a.planId)), data: { operation, outcome: 'queued', planId: a.planId, committedAt, ...data } };
  }
  function privateCommit(person, a, operation, target, internalOutcome, data, visibleTo = []) {
    const committedAt = at(), seq = privateAudit.size + 1;
    privateAudit.set(String(seq), { seq, at: committedAt, planId: a.planId, actorRole: a.role,
      action: operation, targetRef: target, outcome: internalOutcome, visibleTo: [...new Set(visibleTo)] });
    const view = a.role === 'safety_triage' ? 'triage' : 'recipient';
    return { status: 'committed', version: plans.get(a.planId).version,
      privateRevision: privateVersion(view, person), revisionDomain: domain(view, a.planId, person),
      data: { operation, outcome: operation === 'handoff-ack' ? internalOutcome : 'recorded', planId: a.planId, committedAt, ...data } };
  }
  function shape(endpoint, body) {
    const common = ['planId', 'assignmentId', 'expectedEpoch'];
    const fields = endpoint === 'safety-request' ? ['holdId'] : endpoint === 'handoff-ack' ? ['handoffId', 'decision'] : ['requestId'];
    return exact(body, [...common, ...fields], endpoint === 'safety-request' ? ['reportRef'] : []) &&
      ['planId', 'assignmentId', ...fields.filter(k => k !== 'decision')].every(k => id(body[k])) &&
      epoch(body.expectedEpoch) && (!Object.hasOwn(body, 'reportRef') || id(body.reportRef)) &&
      (endpoint !== 'handoff-ack' || ['acknowledged', 'declined'].includes(body.decision));
  }
  function phase(row) {
    const offer = handoffs.get(row.offerId);
    if (offer?.state === 'requested') {
      const a = assignments.get(offer.recipientAssignmentId), p = people.get(offer.recipientPersonId);
      if (!a || a.status !== 'active' || a.epoch !== offer.epochAtRequest || p?.deletedAt ||
        base.isImplicated(p.id, holds.get(row.holdId))) return 'recipient_unavailable';
    }
    return row.phase;
  }
  function apply(person, endpoint, body) {
    if (endpoint === 'handoff-request') return rejected('not_authorized');
    if (!QUEUE_WRITES.has(endpoint) && endpoint !== 'handoff-ack') return base.apply(person, endpoint, body);
    if (!endpointAllowed(person, endpoint)) return rejected('not_authorized');
    if (!shape(endpoint, body)) return rejected('malformed');
    const row = body.requestId ? reviewRequests.get(body.requestId) : body.handoffId ?
      [...reviewRequests.values()].find(r => r.offerId === body.handoffId) : null;
    const hold = holds.get(body.holdId ?? row?.holdId);
    const report = base.reportFor(body.reportRef ?? row?.reportRef ?? hold?.reportRef, body.planId);
    const roles = endpoint === 'safety-request' ? ['lead'] : endpoint === 'handoff-ack' ? ['safety'] : ['safety_triage'];
    const auth = base.authorize(person, body, roles, hold, report);
    if (auth.error) return auth.error;
    if (!hold || hold.planId !== body.planId || row && row.planId !== body.planId) return rejected('scope_mismatch');
    if (hold.state !== 'held') return rejected('hold_not_active');
    const a = auth.assignment;
    if (endpoint === 'safety-request') {
      const ref = body.reportRef ?? hold.reportRef;
      if (ref && !report || hold.reportRef && body.reportRef && hold.reportRef !== body.reportRef) return rejected('report_ref_unavailable');
      const requestId = freshOpsId('review');
      reviewRequests.set(requestId, { requestId, planId: body.planId, holdId: hold.holdId,
        requestedByAssignmentId: a.assignmentId, requesterPersonId: person.id, expectedEpoch: a.epoch,
        reportRef: ref ?? null, recordedAt: at(), phase: 'unassigned', offerId: null, escalationRequired: false });
      return publicCommit(a, endpoint, requestId, { holdId: hold.holdId, requestId });
    }
    if (!row) return rejected('not_authorized');
    if (endpoint === 'review-escalate') {
      row.escalationRequired = true;
      return privateCommit(person, a, endpoint, row.requestId, 'escalation_required', { requestId: row.requestId, holdId: row.holdId });
    }
    if (endpoint === 'review-dispatch') {
      // Explicit manual action: no selector is called during queue admission.
      const old = handoffs.get(row.offerId);
      if (old && phase(row) !== 'recipient_unavailable') {
        return privateCommit(person, a, endpoint, row.requestId, row.phase, { requestId: row.requestId, holdId: row.holdId });
      }
      config.hooks?.beforeSelection?.();
      const recipient = [...assignments.values()].sort((x, y) => x.assignmentId.localeCompare(y.assignmentId)).find(candidate =>
        candidate.planId === row.planId && candidate.role === 'safety' && candidate.status === 'active' &&
        candidate.personId !== row.requesterPersonId && !people.get(candidate.personId).deletedAt &&
        !base.isImplicated(candidate.personId, hold, report));
      if (!recipient) {
        row.phase = 'blocked_needs_independent_review'; row.escalationRequired = true;
        return privateCommit(person, a, endpoint, row.requestId, 'blocked', { requestId: row.requestId, holdId: row.holdId });
      }
      const handoffId = freshOpsId('handoff');
      handoffs.set(handoffId, { handoffId, planId: row.planId, holdId: row.holdId, reportRef: row.reportRef,
        requestedByAssignmentId: row.requestedByAssignmentId, recipientAssignmentId: recipient.assignmentId,
        recipientPersonId: recipient.personId, epochAtRequest: recipient.epoch, state: 'requested', requestedAt: at(), ackAt: null });
      row.offerId = handoffId; row.phase = 'offered';
      return privateCommit(person, a, endpoint, row.requestId, 'offered', { requestId: row.requestId, holdId: row.holdId }, [recipient.personId]);
    }
    const offer = handoffs.get(body.handoffId);
    if (!offer || offer.state !== 'requested') return rejected('handoff_not_requested');
    if (offer.recipientPersonId !== person.id || offer.recipientAssignmentId !== a.assignmentId) return rejected('not_authorized');
    if (offer.epochAtRequest !== a.epoch) return rejected('authority_stale');
    offer.state = body.decision; offer.ackAt = at(); row.phase = body.decision;
    if (body.decision === 'declined') row.escalationRequired = true;
    return privateCommit(person, a, endpoint, offer.handoffId, body.decision,
      { handoffId: offer.handoffId, holdId: row.holdId }, [person.id]);
  }
  function read(person, planId) {
    const original = base.read(person, planId);
    if (original.status !== 'ok') return original;
    const ownRequests = [...reviewRequests.values()].filter(r => r.planId === planId && r.requesterPersonId === person.id &&
      !base.isImplicated(person.id, holds.get(r.holdId)));
    return { status: 'ok', contract: QUEUE_CONTRACT, version: original.version, data: {
      assignments: original.data.assignments, holds: original.data.holds, reportRefs: original.data.reportRefs,
      requests: ownRequests.map(r => ({ requestId: r.requestId, holdId: r.holdId, state: holds.get(r.holdId)?.state === 'held' ? 'queued' : 'closed', recordedAt: r.recordedAt })),
      audit: original.data.audit,
    } };
  }
  function readPrivate(person, planId, view) {
    const role = view === 'triage' ? 'safety_triage' : view === 'recipient' ? 'safety' : null;
    if (!role || !own(person, planId, role).length) return rejected('not_authorized');
    const hold = base.stateForPlan(planId);
    if (base.isImplicated(person.id, hold)) return rejected('not_authorized');
    const original = base.read(person, planId);
    if (original.status !== 'ok') return rejected('not_authorized');
    const scoped = [...reviewRequests.values()].filter(r => r.planId === planId && !base.isImplicated(person.id, holds.get(r.holdId)));
    const offers = [...handoffs.values()].filter(h => h.planId === planId &&
      (view === 'triage' || h.recipientPersonId === person.id && assignments.get(h.recipientAssignmentId)?.status === 'active' && assignments.get(h.recipientAssignmentId)?.epoch === h.epochAtRequest) &&
      !base.isImplicated(person.id, holds.get(h.holdId))).map(({ handoffId, holdId, state, recipientAssignmentId, epochAtRequest }) =>
        ({ handoffId, holdId, state, recipientAssignmentId, epochAtRequest }));
    return { status: 'ok', contract: QUEUE_CONTRACT, version: original.version,
      privateRevision: privateVersion(view, person), revisionDomain: domain(view, planId, person),
      data: { assignments: original.data.assignments.filter(a => a.role === role), holds: original.data.holds, offers,
        ...(view === 'triage' ? { cases: scoped.map(r => ({ requestId: r.requestId, holdId: r.holdId,
          recordedAt: r.recordedAt, phase: phase(r), escalationRequired: r.escalationRequired,
          open: holds.get(r.holdId)?.state === 'held' })), audit: [...privateAudit.values()].map(({ visibleTo, ...a }) => a) } : {}) } };
  }
  return { ...base, apply, read, readPrivate, endpointAllowed };
}
