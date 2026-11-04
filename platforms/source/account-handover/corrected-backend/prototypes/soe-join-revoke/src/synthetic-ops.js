import { randomBytes } from 'node:crypto';

export const OPS_COLLECTIONS = ['assignments', 'holds', 'handoffs', 'opsAudit', 'resumePolicies', 'reportRefs'];
export const OPS_WRITES = new Set(['hold', 'hold-resolve', 'handoff-request', 'handoff-ack', 'assignment-revoke']);
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const id = x => typeof x === 'string' && /^[a-zA-Z0-9._:-]{1,100}$/.test(x);
const epoch = x => Number.isSafeInteger(x) && x >= 1;
const rejected = error => ({ status: 'rejected', error });
const exact = (value, required, optional = []) => object(value) && required.every(k => Object.hasOwn(value, k)) && Object.keys(value).every(k => [...required, ...optional].includes(k));
export const freshOpsId = prefix => `${prefix}-${randomBytes(16).toString('hex')}`;

export function createSyntheticOps({ collections: c, now, bump, fixtureAllowed }) {
  const { people, plans, grants, reports, assignments, holds, handoffs, opsAudit, resumePolicies, reportRefs } = c;
  const at = () => new Date(now()).toISOString();
  const stateForPlan = planId => [...holds.values()].find(h => h.planId === planId && h.state === 'cancelled') ?? [...holds.values()].find(h => h.planId === planId && h.state === 'held');
  function unavailable(planId) {
    const h = stateForPlan(planId);
    return h ? { ...rejected(h.state === 'cancelled' ? 'plan_cancelled' : 'plan_held'), planId, version: plans.get(planId).version } : null;
  }
  function reportFor(ref, planId) {
    const mapping = reportRefs.get(ref);
    return mapping?.planId === planId ? reports.get(mapping.reportId) : null;
  }
  function implicated(personId, hold, report) {
    if (hold?.implicatedIds.includes(personId) || report?.subjectId === personId) return true;
    if (!hold) return false;
    if (c.reviewRequests && [...c.reviewRequests.values()].some(link => link.holdId === hold.holdId && link.planId === hold.planId && link.reportRef && reportFor(link.reportRef, hold.planId)?.subjectId === personId)) return true;
    if (reportFor(hold.reportRef, hold.planId)?.subjectId === personId) return true;
    // Conflict context is the union of every committed report link on this hold,
    // including later handoffs. Acknowledgement, decline and authority changes
    // do not remove that context. Reads and mutations call this after restoring
    // the current checkpoint inside the transaction; no client supplies subjects.
    return [...handoffs.values()].some(link => link.holdId === hold.holdId && link.planId === hold.planId &&
      link.reportRef && reportFor(link.reportRef, hold.planId)?.subjectId === personId);
  }
  function current(person, authority) {
    const a = assignments.get(authority?.assignmentId);
    return Boolean(!person.deletedAt && a && a.personId === person.id && a.planId === authority.planId && a.status === 'active' && a.epoch === authority.epoch);
  }
  function present(row, person, replayed) {
    return { ...structuredClone(row.result), presentation: { replayed, authorityCurrent: current(person, row.authority) } };
  }
  function authorize(person, body, roles, hold, report) {
    const a = assignments.get(body.assignmentId);
    if (!a || a.personId !== person.id) return { error: rejected('not_authorized') };
    if (a.status !== 'active' || a.epoch !== body.expectedEpoch) return { error: rejected('authority_stale') };
    if (a.planId !== body.planId) return { error: rejected('scope_mismatch') };
    if (!roles.includes(a.role)) return { error: rejected('not_authorized') };
    if (implicated(person.id, hold, report)) return { error: rejected('implicated') };
    return { assignment: a };
  }
  function audit(a, action, targetRef, outcome) {
    const seq = opsAudit.size + 1;
    opsAudit.set(String(seq), { seq, at: at(), planId: a.planId, actorRole: a.role, action, targetRef, outcome });
  }
  function commit(a, operation, outcome, target, extra = {}) {
    const committedAt = at();
    audit(a, operation, target, outcome);
    return { status: 'committed', version: bump(plans.get(a.planId)), data: { operation, outcome, planId: a.planId, committedAt, ...extra } };
  }
  function validBody(endpoint, body) {
    const base = ['planId', 'assignmentId', 'expectedEpoch'];
    const shapes = {
      hold: [[...base, 'reasonCode'], ['reportRef']],
      'hold-resolve': [[...base, 'holdId', 'outcome'], []],
      'handoff-request': [[...base, 'holdId'], ['reportRef']],
      'handoff-ack': [[...base, 'handoffId', 'decision'], []],
      'assignment-revoke': [[...base, 'targetAssignmentId', 'targetExpectedEpoch'], []],
    };
    const shape = shapes[endpoint];
    if (!shape || !exact(body, ...shape) || !id(body.planId) || !id(body.assignmentId) || !epoch(body.expectedEpoch)) return false;
    for (const key of ['holdId', 'handoffId', 'reportRef', 'targetAssignmentId']) if (Object.hasOwn(body, key) && !id(body[key])) return false;
    if (endpoint === 'hold') return ['manual', 'host_unavailable', 'report'].includes(body.reasonCode) && (body.reasonCode !== 'report' || Boolean(body.reportRef));
    if (endpoint === 'hold-resolve') return ['resumed', 'cancelled'].includes(body.outcome);
    if (endpoint === 'handoff-ack') return ['acknowledged', 'declined'].includes(body.decision);
    if (endpoint === 'assignment-revoke') return epoch(body.targetExpectedEpoch);
    return true;
  }
  function apply(person, endpoint, body) {
    if (!validBody(endpoint, body)) return rejected('malformed');
    const plan = plans.get(body.planId);
    if (!plan) return rejected('scope_mismatch');
    const hold = body.holdId ? holds.get(body.holdId) : null;
    const handoff = body.handoffId ? handoffs.get(body.handoffId) : null;
    const targetHold = hold ?? (handoff ? holds.get(handoff.holdId) : null) ?? stateForPlan(body.planId);
    const ref = body.reportRef ?? handoff?.reportRef ?? targetHold?.reportRef;
    const report = ref ? reportFor(ref, body.planId) : null;
    const roles = ['hold', 'handoff-ack'].includes(endpoint) ? ['lead', 'safety'] : ['lead'];
    const auth = authorize(person, body, roles, targetHold, report);
    if (auth.error) return auth.error;
    const a = auth.assignment;
    if (ref && !report) return rejected('report_ref_unavailable');
    if (targetHold && targetHold.planId !== body.planId || handoff && handoff.planId !== body.planId) return rejected('scope_mismatch');
    if (endpoint === 'hold') {
      if (stateForPlan(body.planId)) return rejected(stateForPlan(body.planId).state === 'cancelled' ? 'plan_cancelled' : 'hold_already_active');
      const implicatedIds = [...new Set([...(body.reasonCode === 'host_unavailable' ? [plan.hostId] : []), ...(report ? [report.subjectId] : [])])];
      if (implicatedIds.includes(person.id)) return rejected('implicated');
      const holdId = freshOpsId('hold'), revokedGrantIds = [], openedAt = at();
      for (const g of grants.values()) if (g.resourceId === plan.id && g.status === 'active') {
        g.status = 'revoked'; g.revokedAt = openedAt; g.revokedReason = `hold:${holdId}`; revokedGrantIds.push(g.id);
      }
      holds.set(holdId, { holdId, planId: plan.id, state: 'held', openedByAssignmentId: a.assignmentId, openedAt,
        resolvedByAssignmentId: null, resolvedAt: null, revokedGrantIds, implicatedIds, reportRef: ref ?? null });
      return commit(a, endpoint, 'held', holdId, { holdId });
    }
    if (endpoint === 'hold-resolve') {
      if (!hold || hold.state !== 'held') return rejected('hold_not_active');
      if (body.outcome === 'resumed' && resumePolicies.get(body.planId)?.allowResume !== true) return rejected('resume_policy_unconfigured');
      hold.state = body.outcome; hold.resolvedAt = at(); hold.resolvedByAssignmentId = a.assignmentId;
      return commit(a, endpoint, body.outcome, hold.holdId, { holdId: hold.holdId });
    }
    if (endpoint === 'handoff-request') {
      if (!hold || hold.state !== 'held') return rejected('hold_not_active');
      if (hold.reportRef && body.reportRef && hold.reportRef !== body.reportRef) return rejected('report_ref_unavailable');
      const recipient = [...assignments.values()].sort((x, y) => x.assignmentId.localeCompare(y.assignmentId)).find(candidate =>
        candidate.planId === plan.id && candidate.role === 'safety' && candidate.status === 'active' &&
        candidate.personId !== person.id && !people.get(candidate.personId).deletedAt && !implicated(candidate.personId, hold, report));
      if (!recipient) return rejected('no_authorized_recipient');
      const handoffId = freshOpsId('handoff');
      handoffs.set(handoffId, { handoffId, planId: plan.id, holdId: hold.holdId, reportRef: ref ?? null,
        requestedByAssignmentId: a.assignmentId, recipientAssignmentId: recipient.assignmentId, recipientPersonId: recipient.personId,
        epochAtRequest: recipient.epoch, state: 'requested', requestedAt: at(), ackAt: null });
      return commit(a, endpoint, 'requested', handoffId, { handoffId, holdId: hold.holdId });
    }
    if (endpoint === 'handoff-ack') {
      if (!handoff || handoff.state !== 'requested') return rejected('handoff_not_requested');
      if (!targetHold || targetHold.state !== 'held') return rejected('hold_not_active');
      if (handoff.recipientPersonId !== person.id || handoff.recipientAssignmentId !== a.assignmentId) return rejected('not_authorized');
      if (handoff.epochAtRequest !== a.epoch) return rejected('authority_stale');
      handoff.state = body.decision; handoff.ackAt = at();
      return commit(a, endpoint, body.decision, handoff.handoffId, { handoffId: handoff.handoffId, holdId: handoff.holdId });
    }
    const target = assignments.get(body.targetAssignmentId);
    if (!target || target.planId !== body.planId || target.personId === person.id) return rejected('not_authorized');
    if (target.status !== 'active' || target.epoch !== body.targetExpectedEpoch) return rejected('target_authority_stale');
    target.status = 'revoked'; target.epoch++; target.revokedAt = at();
    return commit(a, endpoint, 'revoked', target.assignmentId, { targetAssignmentId: target.assignmentId });
  }
  function registerReport(report) {
    if (report.planId && ![...reportRefs.values()].some(r => r.reportId === report.id)) {
      const ref = freshOpsId('ref'); reportRefs.set(ref, { ref, reportId: report.id, planId: report.planId });
    }
  }
  function read(person, planId) {
    const own = [...assignments.values()].filter(a => a.personId === person.id && a.planId === planId && a.status === 'active');
    if (!own.length) return rejected('not_authorized');
    const activeHold = stateForPlan(planId);
    if (implicated(person.id, activeHold)) return rejected('implicated');
    const scoped = map => [...map.values()].filter(row => row.planId === planId);
    return { status: 'ok', version: plans.get(planId).version, data: {
      assignments: own.map(({ assignmentId, role, planId, epoch, status }) => ({ assignmentId, role, planId, epoch, status })),
      holds: scoped(holds).filter(h => !implicated(person.id, h)).map(({ holdId, state, openedAt, resolvedAt }) => ({ holdId, state, openedAt, resolvedAt })),
      handoffs: scoped(handoffs).filter(h => !implicated(person.id, holds.get(h.holdId), h.reportRef ? reportFor(h.reportRef, planId) : null))
        .map(({ handoffId, holdId, state, recipientAssignmentId, epochAtRequest, requestedAt, ackAt }) => ({ handoffId, holdId, state, recipientAssignmentId, epochAtRequest, requestedAt, ackAt })),
      reportRefs: scoped(reportRefs).filter(r => reports.get(r.reportId).subjectId !== person.id).map(({ ref }) => ({ ref })),
      audit: scoped(opsAudit).map(({ seq, at, actorRole, action, targetRef, outcome }) => ({ seq, at, actorRole, action, targetRef, outcome })),
    } };
  }
  function seedFixture(config) {
    if (!fixtureAllowed || config?.marker !== 'TEST_ONLY' || assignments.size !== 0 || !Array.isArray(config.assignments)) throw Error('Explicit empty synthetic TEST_ONLY fixture required');
    const rows = config.assignments;
    if (!rows.every(a => exact(a, ['assignmentId', 'personId', 'role', 'planId', 'epoch']) && id(a.assignmentId) && people.has(a.personId) && !people.get(a.personId).deletedAt && (c.reviewRequests ? ['lead', 'safety', 'safety_triage'] : ['lead', 'safety']).includes(a.role) && plans.has(a.planId) && epoch(a.epoch)) || new Set(rows.map(a => a.assignmentId)).size !== rows.length) throw Error('Invalid synthetic assignments');
    for (const a of rows) assignments.set(a.assignmentId, { ...a, status: 'active', revokedAt: null });
    return { testOnly: true, seededAssignments: rows.length };
  }
  function setPolicy(planId, config) {
    if (!fixtureAllowed || config?.marker !== 'TEST_ONLY' || config.allowResume !== true || !plans.has(planId)) throw Error('Explicit TEST_ONLY resume policy required');
    resumePolicies.set(planId, { planId, testOnly: true, allowResume: true });
    return { testOnly: true, configured: true };
  }
  return { unavailable, apply, present, read, registerReport, seedFixture, setPolicy, isImplicated: implicated, authorize, stateForPlan, reportFor };
}
