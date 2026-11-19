import { randomBytes, createHash } from 'node:crypto';

export const DISCUSSION_CONTRACT = 'plan-discussion-v1';
export const DISCUSSION_COLLECTIONS = ['discussionMeta', 'discussionConsents', 'discussionPosts', 'discussionCases', 'discussionDecisions', 'discussionAppeals'];
export const DISCUSSION_WRITES = new Set(['discussion-consent', 'discussion-post', 'discussion-flag', 'discussion-decide', 'discussion-appeal']);
export const DISCUSSION_REASONS = ['credible_threat', 'personal_data', 'targeted_harassment', 'spam', 'no_violation', 'insufficient_context'];
export const DISCUSSION_POLICY = Object.freeze({ version: 'discussion-conduct-v1', rule: 'Review conduct and context. Conservative, liberal and other viewpoints are not violations. Rule suggestions never restrict a post. Only an assigned human reviewer can decide; a different eligible reviewer must decide an appeal.' });
export const exact = (x, keys) => x !== null && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length === keys.length && keys.every(k => Object.hasOwn(x, k));
const id = x => typeof x === 'string' && /^[a-zA-Z0-9._:-]{1,100}$/.test(x);
const positive = x => Number.isSafeInteger(x) && x > 0;
export const validDiscussionText = (x, max = 1200) => typeof x === 'string' && x.trim().length > 0 && x.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(x);
const rejected = error => ({ status: 'rejected', error });
const conflict = error => ({ status: 'conflict', error });
const fresh = prefix => `${prefix}-${randomBytes(16).toString('hex')}`;

// Small, explicit fixture rules, not an LLM or a guarantee that unsafe text is found.
export function suggestDiscussionReview(text) {
  const suggestions = [];
  for (const [reasonCode, pattern] of [
    ['personal_data', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
    ['personal_data', /(?:\+?\d[\d ().-]{7,}\d)/],
    ['credible_threat', /\bI (?:will|am going to) kill you\b/i],
    ['targeted_harassment', /\bkill yourself\b/i],
  ]) {
    const match = pattern.exec(text);
    if (match) suggestions.push({ reasonCode, excerpt: match[0], source: 'local_rule_fixture', decision: false });
  }
  return suggestions;
}

export function validDiscussionBody(endpoint, b) {
  const common = ['instanceId', 'planId'];
  const fields = {
    'discussion-consent': [...common, 'enabled'],
    'discussion-post': [...common, 'text'],
    'discussion-flag': [...common, 'postId', 'reasonCode'],
    'discussion-decide': [...common, 'caseId', 'expectedRevision', 'assignmentId', 'expectedEpoch', 'action', 'reasonCode', 'explanation', 'excerpt'],
    'discussion-appeal': [...common, 'caseId', 'decisionId', 'text'],
  }[endpoint];
  if (!fields || !exact(b, fields) || !/^[a-f0-9]{32}$/.test(b.instanceId) || !id(b.planId)) return false;
  if (endpoint === 'discussion-consent') return typeof b.enabled === 'boolean';
  if (endpoint === 'discussion-post') return validDiscussionText(b.text);
  if (endpoint === 'discussion-flag') return id(b.postId) && DISCUSSION_REASONS.includes(b.reasonCode) && !['no_violation', 'insufficient_context'].includes(b.reasonCode);
  if (endpoint === 'discussion-appeal') return id(b.caseId) && id(b.decisionId) && validDiscussionText(b.text, 800);
  return id(b.caseId) && positive(b.expectedRevision) && id(b.assignmentId) && positive(b.expectedEpoch) && ['keep', 'restrict'].includes(b.action) &&
    DISCUSSION_REASONS.includes(b.reasonCode) && validDiscussionText(b.explanation, 800) && b.explanation.trim().length >= 20 &&
    typeof b.excerpt === 'string' && b.excerpt.length <= 300 &&
    (b.action === 'keep' ? ['no_violation', 'insufficient_context'].includes(b.reasonCode) : !['no_violation', 'insufficient_context'].includes(b.reasonCode) && b.excerpt.trim().length >= 3);
}

export function createDiscussion({ collections: c, now, blocked, unavailable, reviewerAllowed }) {
  const meta = () => c.discussionMeta.get('config');
  const at = () => new Date(now()).toISOString();
  const consentKey = (personId, planId) => `${personId}\u0000${planId}`;
  const consent = (personId, planId) => c.discussionConsents.get(consentKey(personId, planId));
  function member(personId, planId) {
    const person = c.people.get(personId), plan = c.plans.get(planId);
    if (!person || person.deletedAt || !plan || plan.closed || unavailable(planId)) return false;
    if (personId === plan.hostId) return true;
    return !blocked(personId, plan.hostId) && [...c.invitations.values()].some(i => i.planId === planId && i.requesterId === personId && i.status === 'accepted');
  }
  const participant = (personId, planId) => member(personId, planId) && consent(personId, planId)?.enabled === true;
  const activeAssignments = (personId, planId) => reviewerAllowed(personId, planId) ? [...c.assignments.values()].filter(a => a.personId === personId && a.planId === planId && a.status === 'active' && ['safety', 'safety_triage'].includes(a.role) && !c.people.get(personId)?.deletedAt) : [];
  function eligible(personId, row) {
    const post = c.discussionPosts.get(row.postId);
    const previous = c.discussionDecisions.get(row.decisionId);
    return Boolean(!c.people.get(post.authorId)?.deletedAt && activeAssignments(personId, row.planId).length && personId !== post.authorId && !row.reporterIds.includes(personId) &&
      (row.phase !== 'appeal_pending' || previous?.reviewerId !== personId));
  }
  function commit(person, operation, planId, outcome, extra = {}) {
    meta().revision++;
    const ownRevision = [...c.idempotency.keys()].filter(key => key.startsWith(person.id+'\u0000') && DISCUSSION_WRITES.has(key.split('\u0000')[1])).length + 1;
    return { status: 'committed', version: c.plans.get(planId).version, discussionRevision: ownRevision,
      revisionDomain: `${DISCUSSION_CONTRACT}:${meta().instanceId}:${planId}:${person.id}`,
      data: { operation, planId, outcome, committedAt: at(), ...extra } };
  }
  function caseFor(post) {
    let row = [...c.discussionCases.values()].find(r => r.postId === post.postId);
    if (!row) {
      const caseId = fresh('case');
      row = { caseId, postId: post.postId, planId: post.planId, phase: 'pending', revision: 1, reporterIds: [], flagReasons: [], suggestions: suggestDiscussionReview(post.text), decisionId: null, appealId: null, createdAt: at() };
      c.discussionCases.set(caseId, row);
    }
    return row;
  }
  function afterCore() {
    // Leaving, blocking, deletion, a hold or cancellation ends future discussion
    // access; later re-entry needs a new consent epoch and never revives old posts.
    for (const row of c.discussionConsents.values()) if (row.enabled && !member(row.personId, row.planId)) { row.enabled = false; row.epoch++; meta().revision++; }
  }
  function apply(person, endpoint, b) {
    if (!validDiscussionBody(endpoint, b)) return rejected('invalid_discussion');
    if (b.instanceId !== meta().instanceId) return conflict('fixture_changed');
    if (!c.plans.has(b.planId)) return rejected('discussion_unavailable');
    if (endpoint === 'discussion-consent') {
      if (b.enabled && !member(person.id, b.planId)) return rejected('accepted_membership_required');
      const key = consentKey(person.id, b.planId), previous = c.discussionConsents.get(key);
      c.discussionConsents.set(key, { personId: person.id, planId: b.planId, enabled: b.enabled, epoch: previous?.enabled === b.enabled ? previous.epoch : (previous?.epoch ?? 0) + 1 });
      return commit(person, endpoint, b.planId, b.enabled ? 'consented' : 'withdrawn');
    }
    if (endpoint === 'discussion-post') {
      if (!participant(person.id, b.planId)) return rejected('discussion_consent_required');
      if ([...c.discussionPosts.values()].filter(p => p.authorId === person.id).length >= 100) return rejected('discussion_limit');
      const postId = fresh('post'), post = { postId, planId: b.planId, authorId: person.id, consentEpoch: consent(person.id, b.planId).epoch, text: b.text, createdAt: at() };
      c.discussionPosts.set(postId, post);
      const suggested = suggestDiscussionReview(post.text);
      if (suggested.length) caseFor(post);
      return commit(person, endpoint, b.planId, 'posted', { postId, suggestedReview: suggested.length > 0 });
    }
    if (endpoint === 'discussion-flag') {
      const post = c.discussionPosts.get(b.postId);
      if (!participant(person.id, b.planId) || !post || post.planId !== b.planId || post.authorId === person.id || !participant(post.authorId, b.planId) || consent(post.authorId, b.planId).epoch !== post.consentEpoch || blocked(person.id, post.authorId)) return rejected('discussion_unavailable');
      const row = caseFor(post);
      if (!row.reporterIds.includes(person.id)) { row.reporterIds.push(person.id); row.flagReasons.push(b.reasonCode); row.revision++; }
      return commit(person, endpoint, b.planId, 'review_requested', { caseId: row.caseId });
    }
    const row = c.discussionCases.get(b.caseId), post = row && c.discussionPosts.get(row.postId);
    if (!row || row.planId !== b.planId || !post) return rejected('discussion_unavailable');
    if (endpoint === 'discussion-appeal') {
      const decision = c.discussionDecisions.get(row.decisionId);
      if (post.authorId !== person.id || row.phase !== 'decided' || decision?.action !== 'restrict' || decision.decisionId !== b.decisionId || row.appealId) return rejected('appeal_unavailable');
      const appealId = fresh('appeal');
      c.discussionAppeals.set(appealId, { appealId, caseId: row.caseId, authorId: person.id, decisionId: decision.decisionId, text: b.text, createdAt: at() });
      row.appealId = appealId; row.phase = 'appeal_pending'; row.revision++;
      return commit(person, endpoint, b.planId, 'independent_review_requested', { caseId: row.caseId, appealId });
    }
    if (!eligible(person.id, row)) return rejected('independent_reviewer_required');
    const a = c.assignments.get(b.assignmentId);
    if (!a || a.personId !== person.id || a.planId !== b.planId || !['safety', 'safety_triage'].includes(a.role)) return rejected('not_authorized');
    if (a.status !== 'active' || a.epoch !== b.expectedEpoch) return rejected('authority_stale');
    if (!['pending', 'appeal_pending'].includes(row.phase) || row.revision !== b.expectedRevision) return conflict('review_changed');
    if (b.action === 'restrict' && !post.text.includes(b.excerpt)) return rejected('source_excerpt_required');
    const decisionId = fresh('decision'), appeal = row.phase === 'appeal_pending';
    c.discussionDecisions.set(decisionId, { decisionId, caseId: row.caseId, planId: b.planId, reviewerId: person.id, assignmentId: a.assignmentId, assignmentEpoch: a.epoch,
      action: b.action, reasonCode: b.reasonCode, explanation: b.explanation, excerpt: b.excerpt, stage: appeal ? 'appeal' : 'initial', priorDecisionId: row.decisionId, policyVersion: DISCUSSION_POLICY.version, createdAt: at() });
    row.decisionId = decisionId; row.phase = appeal ? 'appeal_decided' : 'decided'; row.revision++;
    return commit(person, endpoint, b.planId, b.action === 'restrict' ? 'restricted' : 'kept', { caseId: row.caseId, decisionId });
  }
  function read(person, planId, view) {
    if (!c.plans.has(planId) || !['feed', 'queue', 'notices'].includes(view)) return rejected('discussion_unavailable');
    const decisions = row => [...c.discussionDecisions.values()].filter(d => d.caseId === row.caseId).map(({ decisionId, action, reasonCode, explanation, excerpt, stage, policyVersion, createdAt }) => ({ decisionId, action, reasonCode, explanation, excerpt, stage, policyVersion, createdAt }));
    let data;
    if (view === 'feed') {
      if (!member(person.id, planId)) return rejected('accepted_membership_required');
      data = { consented: consent(person.id, planId)?.enabled === true, posts: [] };
      if (data.consented) data.posts = [...c.discussionPosts.values()].filter(p => p.planId === planId && participant(p.authorId, planId) && consent(p.authorId, planId).epoch === p.consentEpoch && !blocked(person.id, p.authorId)).map(p => {
        const row = [...c.discussionCases.values()].find(r => r.postId === p.postId), decision = row && c.discussionDecisions.get(row.decisionId);
        const restricted = decision?.action === 'restrict';
        return { postId: p.postId, authorName: c.people.get(p.authorId).displayName, own: p.authorId === person.id, createdAt: p.createdAt,
          status: restricted ? 'restricted_by_human' : 'visible', text: restricted ? null : p.text,
          decision: decision ? { action: decision.action, reasonCode: decision.reasonCode, policyVersion: decision.policyVersion } : null };
      });
    } else if (view === 'queue') {
      const assignments = activeAssignments(person.id, planId);
      if (!assignments.length) return rejected('not_authorized');
      data = { assignments: assignments.map(({ assignmentId, role, epoch }) => ({ assignmentId, role, epoch })), cases: [...c.discussionCases.values()].filter(row => row.planId === planId && ['pending', 'appeal_pending'].includes(row.phase) && eligible(person.id, row)).map(row => {
        const post = c.discussionPosts.get(row.postId), appeal = c.discussionAppeals.get(row.appealId);
        return { caseId: row.caseId, postId: post.postId, revision: row.revision, phase: row.phase, text: post.text,
          suggestions: structuredClone(row.suggestions), humanFlagReasons: [...new Set(row.flagReasons)], policy: DISCUSSION_POLICY, decisions: decisions(row), appeal: appeal ? { text: appeal.text, createdAt: appeal.createdAt } : null };
      }) };
    } else {
      data = { notices: [...c.discussionCases.values()].filter(row => row.planId === planId && c.discussionPosts.get(row.postId).authorId === person.id).map(row => ({ caseId: row.caseId, postId: row.postId, phase: row.phase, decisions: decisions(row), canAppeal: row.phase === 'decided' && c.discussionDecisions.get(row.decisionId)?.action === 'restrict' && !row.appealId,
        appealStatus: row.phase === 'appeal_pending' ? ([...c.people.keys()].some(id => eligible(id, row)) ? 'awaiting_independent_human' : 'independent_reviewer_unavailable') : null })) };
    }
    const payload = { ...data, policy: DISCUSSION_POLICY, assistance: 'local_rule_fixtures_only', instanceId: meta().instanceId };
    return { status: 'ok', snapshotId: createHash('sha256').update(JSON.stringify(payload)).digest('hex'), revisionDomain: `${DISCUSSION_CONTRACT}:${meta().instanceId}:${planId}:${view}:${person.id}`, data: payload };
  }
  return { apply, read, afterCore, instanceId: () => meta().instanceId };
}
