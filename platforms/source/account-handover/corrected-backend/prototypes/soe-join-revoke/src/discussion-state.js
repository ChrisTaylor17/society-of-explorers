import { DatabaseSync } from 'node:sqlite';
import { closeSync, lstatSync, openSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import { validateOpsState } from './synthetic-ops-state.js';
import { validateMessageState } from './message-state.js';
import { DISCUSSION_COLLECTIONS, DISCUSSION_CONTRACT, DISCUSSION_WRITES, DISCUSSION_REASONS, DISCUSSION_POLICY, exact, validDiscussionText, suggestDiscussionReview } from './discussion.js';

const check = value => { if (!value) throw Error('Invalid discussion checkpoint; refusing to serve or reseed.'); };
const positive = x => Number.isSafeInteger(x) && x > 0;
const timestamp = x => typeof x === 'string' && Number.isFinite(Date.parse(x));
const hasId = (prefix, x) => typeof x === 'string' && new RegExp(`^${prefix}-[a-f0-9]{32}$`).test(x);
export function validateDiscussionState(s) {
  check(s?.format === 6 && [4, 5].includes(s.discussionBaseFormat));
  const base = { ...s, format: s.discussionBaseFormat }; delete base.discussionBaseFormat;
  for (const key of DISCUSSION_COLLECTIONS) delete base[key];
  check(Array.isArray(s.idempotency));
  base.idempotency = s.idempotency.filter(row => !DISCUSSION_WRITES.has(row?.[0]?.split('\u0000')[1]));
  if (s.discussionBaseFormat === 5) validateMessageState(base, 4); else validateOpsState(base, true);
  const c = {};
  for (const key of DISCUSSION_COLLECTIONS) {
    check(Array.isArray(s[key]) && s[key].every(row => Array.isArray(row) && row.length === 2 && typeof row[0] === 'string' && row[1] && typeof row[1] === 'object'));
    c[key] = new Map(s[key]); check(c[key].size === s[key].length);
  }
  const people = new Map(s.people), plans = new Map(s.plans), assignments = new Map(s.assignments);
  const meta = c.discussionMeta.get('config');
  check(c.discussionMeta.size === 1 && exact(meta, ['contract', 'instanceId', 'revision']) && meta.contract === DISCUSSION_CONTRACT && /^[a-f0-9]{32}$/.test(meta.instanceId) && Number.isSafeInteger(meta.revision) && meta.revision >= 0);
  for (const [key, row] of c.discussionConsents) check(exact(row, ['personId', 'planId', 'enabled', 'epoch']) && key === `${row.personId}\u0000${row.planId}` && people.has(row.personId) && plans.has(row.planId) && typeof row.enabled === 'boolean' && positive(row.epoch));
  const authorCounts = new Map();
  for (const [id, p] of c.discussionPosts) {
    const consent = c.discussionConsents.get(`${p.authorId}\u0000${p.planId}`);
    check(exact(p, ['postId', 'planId', 'authorId', 'consentEpoch', 'text', 'createdAt']) && p.postId === id && hasId('post', id) && people.has(p.authorId) && plans.has(p.planId) && positive(p.consentEpoch) && consent && p.consentEpoch <= consent.epoch && validDiscussionText(p.text) && timestamp(p.createdAt));
    authorCounts.set(p.authorId, (authorCounts.get(p.authorId) ?? 0) + 1);
  }
  check([...authorCounts.values()].every(n => n <= 100));
  const boundPosts = new Set();
  for (const [id, r] of c.discussionCases) {
    const post = c.discussionPosts.get(r.postId), decision = c.discussionDecisions.get(r.decisionId), appeal = c.discussionAppeals.get(r.appealId);
    check(exact(r, ['caseId', 'postId', 'planId', 'phase', 'revision', 'reporterIds', 'flagReasons', 'suggestions', 'decisionId', 'appealId', 'createdAt']) && id === r.caseId && hasId('case', id) && post?.planId === r.planId && !boundPosts.has(post.postId) && positive(r.revision) && ['pending', 'decided', 'appeal_pending', 'appeal_decided'].includes(r.phase) && timestamp(r.createdAt));
    boundPosts.add(post.postId);
    check(Array.isArray(r.reporterIds) && new Set(r.reporterIds).size === r.reporterIds.length && r.reporterIds.every(p => people.has(p) && p !== post.authorId));
    check(Array.isArray(r.flagReasons) && r.flagReasons.length === r.reporterIds.length && r.flagReasons.every(x => DISCUSSION_REASONS.includes(x) && !['no_violation', 'insufficient_context'].includes(x)));
    check(JSON.stringify(r.suggestions) === JSON.stringify(suggestDiscussionReview(post.text)));
    check(r.decisionId === null || decision?.caseId === id);
    check(r.appealId === null || appeal?.caseId === id);
    check(r.phase === 'pending' ? r.decisionId === null && r.appealId === null : Boolean(decision));
    if (r.phase === 'decided') check(decision.stage === 'initial' && r.appealId === null);
    if (r.phase === 'appeal_pending') check(decision.stage === 'initial' && decision.action === 'restrict' && appeal?.decisionId === decision.decisionId);
    if (r.phase === 'appeal_decided') check(decision.stage === 'appeal' && Boolean(appeal));
  }
  for (const [id, d] of c.discussionDecisions) {
    const row = c.discussionCases.get(d.caseId), post = row && c.discussionPosts.get(row.postId), a = assignments.get(d.assignmentId), prior = c.discussionDecisions.get(d.priorDecisionId);
    check(exact(d, ['decisionId', 'caseId', 'planId', 'reviewerId', 'assignmentId', 'assignmentEpoch', 'action', 'reasonCode', 'explanation', 'excerpt', 'stage', 'priorDecisionId', 'policyVersion', 'createdAt']) && id === d.decisionId && hasId('decision', id) && row?.planId === d.planId && a?.personId === d.reviewerId && a.planId === d.planId && ['safety', 'safety_triage'].includes(a.role) && positive(d.assignmentEpoch) && d.assignmentEpoch <= a.epoch && d.reviewerId !== post.authorId);
    check(['keep', 'restrict'].includes(d.action) && DISCUSSION_REASONS.includes(d.reasonCode) && validDiscussionText(d.explanation, 800) && d.explanation.trim().length >= 20 && typeof d.excerpt === 'string' && d.excerpt.length <= 300 && d.policyVersion === DISCUSSION_POLICY.version && timestamp(d.createdAt));
    if (d.action === 'restrict') check(!['no_violation', 'insufficient_context'].includes(d.reasonCode) && d.excerpt.trim().length >= 3 && post.text.includes(d.excerpt));
    else check(['no_violation', 'insufficient_context'].includes(d.reasonCode));
    check(d.stage === 'initial' ? d.priorDecisionId === null : d.stage === 'appeal' && prior?.caseId === d.caseId && prior.stage === 'initial' && prior.action === 'restrict' && prior.reviewerId !== d.reviewerId);
  }
  for (const [id, a] of c.discussionAppeals) {
    const row = c.discussionCases.get(a.caseId), post = row && c.discussionPosts.get(row.postId), decision = c.discussionDecisions.get(a.decisionId);
    check(exact(a, ['appealId', 'caseId', 'authorId', 'decisionId', 'text', 'createdAt']) && id === a.appealId && hasId('appeal', id) && row?.appealId === id && post?.authorId === a.authorId && decision?.caseId === a.caseId && decision.stage === 'initial' && decision.action === 'restrict' && validDiscussionText(a.text, 800) && timestamp(a.createdAt));
  }
  const postReceipts = new Set(), decisionReceipts = new Set(), appealReceipts = new Set();
  for (const [key, entry] of s.idempotency) {
    const [actor, endpoint, ...parts] = key.split('\u0000'); if (!DISCUSSION_WRITES.has(endpoint)) continue;
    const result = entry.result, data = result?.data;
    check(exact(entry, ['payloadHash', 'result']) && /^[a-f0-9]{64}$/.test(entry.payloadHash) && people.has(actor) && /^[A-Za-z0-9._:-]{1,100}$/.test(parts.join('\u0000')) &&
      exact(result, ['status', 'version', 'discussionRevision', 'revisionDomain', 'data']) && result.status === 'committed' && positive(result.version) && result.version <= plans.get(data?.planId)?.version && positive(result.discussionRevision) && result.discussionRevision <= meta.revision && result.revisionDomain === `${DISCUSSION_CONTRACT}:${meta.instanceId}:${data.planId}:${actor}` && data.operation === endpoint && timestamp(data.committedAt));
    const extras = endpoint === 'discussion-post' ? ['postId', 'suggestedReview'] : endpoint === 'discussion-flag' ? ['caseId'] : endpoint === 'discussion-decide' ? ['caseId', 'decisionId'] : endpoint === 'discussion-appeal' ? ['caseId', 'appealId'] : [];
    check(exact(data, ['operation', 'planId', 'outcome', 'committedAt', ...extras]));
    if (endpoint === 'discussion-post') { check(c.discussionPosts.get(data.postId)?.authorId === actor && !postReceipts.has(data.postId)); postReceipts.add(data.postId); }
    if (endpoint === 'discussion-decide') { check(c.discussionDecisions.get(data.decisionId)?.reviewerId === actor && !decisionReceipts.has(data.decisionId)); decisionReceipts.add(data.decisionId); }
    if (endpoint === 'discussion-appeal') { check(c.discussionAppeals.get(data.appealId)?.authorId === actor && !appealReceipts.has(data.appealId)); appealReceipts.add(data.appealId); }
  }
  check(postReceipts.size === c.discussionPosts.size && decisionReceipts.size === c.discussionDecisions.size && appealReceipts.size === c.discussionAppeals.size);
  return s;
}

/** Same owner-only, transactional checkpoint pattern as the existing message store.
 * Fresh format 6 only: never migrates or adopts a previous prototype database. */
export function openDiscussionStore(path, initial, hooks = {}) {
  if (typeof path !== 'string' || !isAbsolute(path)) throw Error('Explicit absolute discussion database required');
  const dir = lstatSync(dirname(path)); if (!dir.isDirectory() || dir.isSymbolicLink() || dir.mode & 0o022) throw Error('Trusted discussion directory required');
  let created = false; try { const fd = openSync(path, 'wx', 0o600); closeSync(fd); created = true; } catch (e) { if (e.code !== 'EEXIST') throw e; }
  const file = lstatSync(path); if (!file.isFile() || file.isSymbolicLink() || file.mode & 0o077) throw Error('Owner-only regular discussion database required');
  const db = new DatabaseSync(path); let closed = false;
  const rollback = () => { try { db.exec('ROLLBACK'); } catch {} };
  const parse = value => { try { return JSON.parse(value); } catch { throw Error('Invalid discussion checkpoint JSON; contents omitted'); } };
  try {
    db.exec('PRAGMA busy_timeout=5000; PRAGMA synchronous=EXTRA; PRAGMA fullfsync=ON; BEGIN IMMEDIATE');
    const app = db.prepare('PRAGMA application_id').get().application_id, version = db.prepare('PRAGMA user_version').get().user_version, tables = db.prepare("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all();
    if (created && app === 0 && version === 0 && tables.length === 0) {
      validateDiscussionState(initial); db.exec('PRAGMA application_id=1397703985; PRAGMA user_version=6; CREATE TABLE soe_state(id INTEGER PRIMARY KEY CHECK(id=1),format_version INTEGER NOT NULL CHECK(format_version=6),state_json TEXT NOT NULL) STRICT');
      db.prepare('INSERT INTO soe_state VALUES(1,6,?)').run(JSON.stringify(initial));
    } else if (app !== 0x534f4531 || version !== 6 || tables.length !== 1 || tables[0].name !== 'soe_state') throw Error('Unsupported discussion store; fresh owned format6 required, no migration or reseed');
    const rows = db.prepare('SELECT * FROM soe_state').all(); if (rows.length !== 1 || rows[0].id !== 1 || rows[0].format_version !== 6) throw Error('Missing discussion checkpoint');
    validateDiscussionState(parse(rows[0].state_json)); db.exec('COMMIT; PRAGMA journal_mode=DELETE');
  } catch (error) { rollback(); db.close(); throw error; }
  return { transaction(run) {
    if (closed) throw Error('Discussion store closed'); let active = false;
    try {
      db.exec('BEGIN IMMEDIATE'); active = true;
      const row = db.prepare('SELECT state_json FROM soe_state WHERE id=1').get(); if (!row) throw Error('Missing discussion checkpoint');
      const next = run(validateDiscussionState(parse(row.state_json))); validateDiscussionState(next.state);
      const serialized = JSON.stringify(next.state); if (serialized !== row.state_json) db.prepare('UPDATE soe_state SET state_json=? WHERE id=1').run(serialized);
      hooks.beforeCommit?.(); const denial = next.authorize?.(); if (denial) { const e = Error('Discussion authorization expired at commit'); e.authorizationResult = denial; throw e; }
      db.exec('COMMIT'); active = false; hooks.afterCommit?.(); return next.result;
    } catch (error) { if (active) rollback(); throw error; }
  }, close() { if (!closed) { db.close(); closed = true; } } };
}
