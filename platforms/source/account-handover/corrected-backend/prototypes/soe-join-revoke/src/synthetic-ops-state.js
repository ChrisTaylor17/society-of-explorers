import { DatabaseSync } from 'node:sqlite';
import { closeSync, lstatSync, openSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import { validateState, validatePrivacyBaseState } from './sqlite-state.js';
import { QUEUE_WRITES, PRIVACY_COLLECTIONS, QUEUE_CONTRACT } from './privacy-queue.js';
import { OPS_COLLECTIONS, OPS_WRITES, freshOpsId } from './synthetic-ops.js';

const APPLICATION_ID = 0x534f4531;
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const text = x => typeof x === 'string' && x.length > 0;
const epoch = x => Number.isSafeInteger(x) && x >= 1;
const timestamp = x => text(x) && Number.isFinite(Date.parse(x));
const exact = (row, keys) => object(row) && Object.keys(row).length === keys.length && keys.every(k => Object.hasOwn(row, k));
const requireState = ok => { if (!ok) throw Error('Invalid synthetic operator checkpoint; refusing to reseed or serve it.'); };
const parse = bytes => { try { return JSON.parse(bytes); } catch { throw Error('Invalid synthetic checkpoint JSON; contents omitted.'); } };

export function validateOpsState(state, privacy = false) {
  const allWrites = new Set([...OPS_WRITES, ...(privacy ? QUEUE_WRITES : [])]);
  const publicActions = privacy ? new Set(['hold', 'hold-resolve', 'assignment-revoke', 'safety-request']) : OPS_WRITES;
  const roleNames = privacy ? ['lead', 'safety', 'safety_triage'] : ['lead', 'safety'];
  const collectionNames = [...OPS_COLLECTIONS, ...(privacy ? PRIVACY_COLLECTIONS : [])];
  requireState(object(state) && state.format === (privacy ? 4 : 3) && Object.keys(state).length === (privacy ? 19 : 17) && Array.isArray(state.idempotency));
  const base = { ...state, format: 2, idempotency: state.idempotency.filter(row => !allWrites.has(row?.[0]?.split('\u0000')[1])) };
  for (const name of collectionNames) delete base[name];
  (privacy ? validatePrivacyBaseState : validateState)(base); // Existing people, session, report, consent and receipt rules stay intact.
  const maps = {};
  for (const name of [...collectionNames, 'idempotency']) {
    const rows = state[name];
    requireState(Array.isArray(rows) && rows.every(row => Array.isArray(row) && row.length === 2 && text(row[0]) && object(row[1])));
    maps[name] = new Map(rows); requireState(maps[name].size === rows.length);
  }
  const people = new Map(state.people), plans = new Map(state.plans), grants = new Map(state.grants), reports = new Map(state.reports);
  const { assignments, holds, handoffs, opsAudit, resumePolicies, reportRefs, idempotency } = maps;
  for (const [key, a] of assignments) {
    requireState(exact(a, ['assignmentId', 'personId', 'role', 'planId', 'epoch', 'status', 'revokedAt']) && key === a.assignmentId && people.has(a.personId) && plans.has(a.planId) && roleNames.includes(a.role) && epoch(a.epoch));
    requireState(a.status === 'active' && a.revokedAt === null || a.status === 'revoked' && timestamp(a.revokedAt));
  }
  const boundReports = new Set();
  for (const [key, ref] of reportRefs) {
    const report = reports.get(ref.reportId);
    requireState(exact(ref, ['ref', 'reportId', 'planId']) && /^ref-[a-f0-9]{32}$/.test(key) && ref.ref === key && report && report.planId === ref.planId && plans.has(ref.planId) && !boundReports.has(report.id));
    boundReports.add(report.id);
  }
  requireState([...reports.values()].filter(r => r.planId !== null).every(r => boundReports.has(r.id)));
  for (const [key, h] of holds) {
    const opener = assignments.get(h.openedByAssignmentId), resolver = assignments.get(h.resolvedByAssignmentId);
    requireState(exact(h, ['holdId', 'planId', 'state', 'openedByAssignmentId', 'openedAt', 'resolvedByAssignmentId', 'resolvedAt', 'revokedGrantIds', 'implicatedIds', 'reportRef']) && /^hold-[a-f0-9]{32}$/.test(key) && h.holdId === key && plans.has(h.planId) && opener?.planId === h.planId && timestamp(h.openedAt));
    requireState(h.state === 'held' && h.resolvedAt === null && h.resolvedByAssignmentId === null || ['resumed', 'cancelled'].includes(h.state) && timestamp(h.resolvedAt) && resolver?.planId === h.planId && resolver.role === 'lead');
    requireState(Array.isArray(h.implicatedIds) && new Set(h.implicatedIds).size === h.implicatedIds.length && h.implicatedIds.every(p => people.has(p)) && !h.implicatedIds.includes(opener.personId));
    requireState(Array.isArray(h.revokedGrantIds) && new Set(h.revokedGrantIds).size === h.revokedGrantIds.length && h.revokedGrantIds.every(id => grants.get(id)?.resourceId === h.planId && grants.get(id).status === 'revoked' && grants.get(id).revokedReason === `hold:${key}`));
    requireState(h.reportRef === null || reportRefs.get(h.reportRef)?.planId === h.planId);
  }
  for (const planId of plans.keys()) {
    const closed = [...holds.values()].filter(h => h.planId === planId && ['held', 'cancelled'].includes(h.state));
    requireState(closed.length <= 1);
    if (closed.length) requireState([...grants.values()].every(g => g.resourceId !== planId || g.status !== 'active'));
  }
  for (const [key, h] of handoffs) {
    const hold = holds.get(h.holdId), requester = assignments.get(h.requestedByAssignmentId), recipient = assignments.get(h.recipientAssignmentId);
    requireState(exact(h, ['handoffId', 'planId', 'holdId', 'reportRef', 'requestedByAssignmentId', 'recipientAssignmentId', 'recipientPersonId', 'epochAtRequest', 'state', 'requestedAt', 'ackAt']) && /^handoff-[a-f0-9]{32}$/.test(key) && key === h.handoffId && hold?.planId === h.planId && requester?.planId === h.planId && requester.role === 'lead' && recipient?.planId === h.planId && recipient.role === 'safety' && recipient.personId === h.recipientPersonId && recipient.personId !== requester.personId && !hold.implicatedIds.includes(recipient.personId) && epoch(h.epochAtRequest) && h.epochAtRequest <= recipient.epoch && timestamp(h.requestedAt));
    requireState(h.state === 'requested' && h.ackAt === null || ['acknowledged', 'declined'].includes(h.state) && timestamp(h.ackAt));
    requireState(h.reportRef === null || reportRefs.get(h.reportRef)?.planId === h.planId && reports.get(reportRefs.get(h.reportRef).reportId).subjectId !== recipient.personId);
  }
  for (const [key, p] of resumePolicies) requireState(exact(p, ['planId', 'testOnly', 'allowResume']) && key === p.planId && plans.has(key) && p.testOnly === true && p.allowResume === true);
  for (const [key, a] of opsAudit) {
    requireState(exact(a, ['seq', 'at', 'planId', 'actorRole', 'action', 'targetRef', 'outcome']) && epoch(a.seq) && String(a.seq) === key && a.seq <= opsAudit.size && timestamp(a.at) && plans.has(a.planId) && ['lead', 'safety'].includes(a.actorRole) && publicActions.has(a.action) && text(a.outcome));
    requireState(holds.has(a.targetRef) || handoffs.has(a.targetRef) || assignments.has(a.targetRef) || privacy && maps.reviewRequests.has(a.targetRef));
  }
  const highest = Math.max(...[...plans.values()].map(p => p.version));
  for (const [key, row] of idempotency) {
    const [actor, endpoint, ...keyParts] = key.split('\u0000');
    if (!allWrites.has(endpoint)) continue;
    const a = assignments.get(row.authority?.assignmentId), result = row.result, data = result?.data;
    requireState(exact(row, ['payloadHash', 'result', 'authority']) && people.has(actor) && keyParts.join('\u0000').length > 0 && /^[a-f0-9]{64}$/.test(row.payloadHash));
    requireState(exact(row.authority, ['assignmentId', 'planId', 'epoch']) && a?.personId === actor && a.planId === row.authority.planId && epoch(row.authority.epoch) && row.authority.epoch <= a.epoch);
    requireState(exact(result, privacy && ['review-dispatch', 'review-escalate', 'handoff-ack'].includes(endpoint) ? ['status', 'version', 'data', 'privateRevision', 'revisionDomain'] : ['status', 'version', 'data']) && result.status === 'committed' && epoch(result.version) && result.version <= highest && object(data) && data.operation === endpoint && data.planId === a.planId && timestamp(data.committedAt));
    const extra = endpoint === 'hold' || endpoint === 'hold-resolve' ? ['holdId'] : endpoint === 'assignment-revoke' ? ['targetAssignmentId'] : privacy && QUEUE_WRITES.has(endpoint) ? ['requestId', 'holdId'] : ['handoffId', 'holdId'];
    requireState(exact(data, ['operation', 'outcome', 'planId', 'committedAt', ...extra]));
    requireState((!data.requestId || maps.reviewRequests.get(data.requestId)?.planId === data.planId) && (!data.holdId || holds.get(data.holdId)?.planId === data.planId) && (!data.handoffId || handoffs.get(data.handoffId)?.planId === data.planId) && (!data.targetAssignmentId || assignments.get(data.targetAssignmentId)?.planId === data.planId));
  }
  if (privacy) {
    const { reviewRequests, privateAudit } = maps;
    for (const [key, r] of reviewRequests) {
      const hold = holds.get(r.holdId), requester = assignments.get(r.requestedByAssignmentId), offer = handoffs.get(r.offerId);
      requireState(exact(r, ['requestId','planId','holdId','requestedByAssignmentId','requesterPersonId','expectedEpoch','reportRef','recordedAt','phase','offerId','escalationRequired']) && /^review-[a-f0-9]{32}$/.test(key) && key === r.requestId && hold?.planId === r.planId && requester?.role === 'lead' && requester.personId === r.requesterPersonId && requester.planId === r.planId && epoch(r.expectedEpoch) && r.expectedEpoch <= requester.epoch && timestamp(r.recordedAt));
      requireState(r.reportRef === null || reportRefs.get(r.reportRef)?.planId === r.planId);
      requireState(['unassigned','offered','acknowledged','declined','blocked_needs_independent_review'].includes(r.phase) && typeof r.escalationRequired === 'boolean');
      requireState(r.offerId === null || offer && offer.holdId === r.holdId && offer.reportRef === r.reportRef);
      requireState(!['offered','acknowledged','declined'].includes(r.phase) || Boolean(offer));
      if (r.phase === 'offered') requireState(offer.state === 'requested');
      if (['acknowledged','declined'].includes(r.phase)) requireState(offer.state === r.phase);
    }
    for (const [key, a] of privateAudit) {
      requireState(exact(a, ['seq','at','planId','actorRole','action','targetRef','outcome','visibleTo']) && key === String(a.seq) && epoch(a.seq) && a.seq <= privateAudit.size && timestamp(a.at) && plans.has(a.planId) && ['safety','safety_triage'].includes(a.actorRole) && ['review-dispatch','review-escalate','handoff-ack'].includes(a.action) && (reviewRequests.has(a.targetRef) || handoffs.has(a.targetRef)) && text(a.outcome) && Array.isArray(a.visibleTo) && a.visibleTo.every(p => people.has(p)));
    }
    for (const [key, row] of idempotency) {
      const endpoint = key.split('\u0000')[1], result = row.result;
      if (['review-dispatch','review-escalate','handoff-ack'].includes(endpoint)) {
        const actor = key.split('\u0000')[0], view = endpoint === 'handoff-ack' ? 'recipient' : 'triage';
        requireState(epoch(result.privateRevision) && result.privateRevision <= privateAudit.size && result.revisionDomain === `${QUEUE_CONTRACT}:${view}:${result.data.planId}:${actor}`);
        requireState(endpoint === 'handoff-ack' ? ['acknowledged','declined'].includes(result.data.outcome) : result.data.outcome === 'recorded');
      }
      if (endpoint === 'safety-request') requireState(result.data.outcome === 'queued');
    }
  }
  return state;
}

function upgrade(state) {
  validateState(state);
  const next = { ...state, format: 3, ...Object.fromEntries(OPS_COLLECTIONS.map(name => [name, []])) };
  for (const [, report] of state.reports) if (report.planId) {
    const ref = freshOpsId('ref'); next.reportRefs.push([ref, { ref, reportId: report.id, planId: report.planId }]);
  }
  return validateOpsState(next);
}

function openStore(databasePath, initialState, hooks = {}, migrate = false, privacy = false) {
  const format = privacy ? 4 : 3;
  const validate = state => validateOpsState(state, privacy);
  if (typeof databasePath !== 'string' || !isAbsolute(databasePath)) throw Error('Explicit absolute synthetic database path required');
  const directory = lstatSync(dirname(databasePath));
  if (!directory.isDirectory() || directory.isSymbolicLink() || (directory.mode & 0o022) !== 0) throw Error('Trusted owner-only synthetic directory required');
  let created = false;
  if (!migrate) {
    try { const fd = openSync(databasePath, 'wx', 0o600); closeSync(fd); created = true; }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  const file = lstatSync(databasePath);
  if (!file.isFile() || file.isSymbolicLink() || (file.mode & 0o077) !== 0) throw Error('Regular owner-only synthetic database required');
  const db = new DatabaseSync(databasePath);
  let closed = false;
  const rollback = () => { try { db.exec('ROLLBACK'); } catch {} };
  const createTable = () => db.exec(`CREATE TABLE soe_state (id INTEGER PRIMARY KEY CHECK(id=1), format_version INTEGER NOT NULL CHECK(format_version=${format}), state_json TEXT NOT NULL) STRICT`);
  const insert = state => db.prepare(`INSERT INTO soe_state(id,format_version,state_json) VALUES(1,${format},?)`).run(JSON.stringify(state));
  const readState = format => {
    const rows = db.prepare('SELECT id,format_version,state_json FROM soe_state').all();
    if (rows.length !== 1 || rows[0].id !== 1 || rows[0].format_version !== format) throw Error('Missing synthetic checkpoint; refusing to reseed');
    return parse(rows[0].state_json);
  };
  try {
    db.exec('PRAGMA busy_timeout=5000; PRAGMA synchronous=EXTRA; PRAGMA fullfsync=ON; BEGIN IMMEDIATE');
    const application = db.prepare('PRAGMA application_id').get().application_id;
    const version = db.prepare('PRAGMA user_version').get().user_version;
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all();
    if (!migrate && created && application === 0 && version === 0 && tables.length === 0) {
      validate(initialState); createTable(); insert(initialState);
      db.exec(`PRAGMA application_id=${APPLICATION_ID}; PRAGMA user_version=${format}`);
    } else if (migrate && application === APPLICATION_ID && version === 2 && tables.length === 1 && tables[0].name === 'soe_state') {
      const prior = readState(2), next = upgrade(prior);
      for (const key of Object.keys(prior)) if (key !== 'format' && JSON.stringify(next[key]) !== JSON.stringify(prior[key])) throw Error('Migration changed a preserved v2 key');
      db.exec('ALTER TABLE soe_state RENAME TO soe_state_v2_migration');
      createTable(); insert(next);
      db.exec('DROP TABLE soe_state_v2_migration; PRAGMA user_version=3');
      hooks.migrationBeforeCommit?.();
    } else if (migrate || application !== APPLICATION_ID || version !== format || tables.length !== 1 || tables[0].name !== 'soe_state') {
      throw Error(privacy ? 'Unsupported synthetic database; privacy queue v4 requires fresh owned storage, no migration or reseed' : 'Unsupported synthetic database; explicit offline 2-to-3 migration required, no reseed');
    }
    validate(readState(format)); db.exec('COMMIT');
    db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=EXTRA; PRAGMA fullfsync=ON');
  } catch (error) { rollback(); db.close(); throw error; }
  const read = db.prepare('SELECT state_json FROM soe_state WHERE id=1');
  const write = db.prepare('UPDATE soe_state SET state_json=? WHERE id=1');
  return {
    transaction(run) {
      if (closed) throw Error('Synthetic operator storage is closed');
      let active = false;
      try {
        db.exec('BEGIN IMMEDIATE'); active = true;
        const row = read.get(); if (!row) throw Error('Missing synthetic checkpoint');
        const before = validate(parse(row.state_json));
        const { state, result } = run(before); validate(state);
        const serialized = JSON.stringify(state); if (serialized !== row.state_json) write.run(serialized);
        hooks.beforeCommit?.(); db.exec('COMMIT'); active = false; hooks.afterCommit?.(); return result;
      } catch (error) { if (active) rollback(); throw error; }
    },
    close() { if (!closed) { db.close(); closed = true; } },
  };
}

export const openSyntheticOpsStore = (path, initial, hooks) => openStore(path, initial, hooks);
export const openPrivacyQueueStore = (path, initial, hooks) => openStore(path, initial, hooks, false, true);

/** Explicit local disposable-copy migration. Never called by ordinary startup. */
export function migrateSyntheticOpsStorage(path, { marker, testHooks = {} } = {}) {
  if (marker !== 'TEST_ONLY') throw Error('Explicit TEST_ONLY migration marker required');
  const store = openStore(path, undefined, testHooks, true); store.close();
  return { testOnly: true, schemaVersion: 3, checkpointFormat: 3 };
}
