import { createFieldRenderer } from './field-render.mjs';
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reasons = ['personal_data', 'credible_threat', 'targeted_harassment', 'spam', 'no_violation', 'insufficient_context'];
const label = x => esc(x.replaceAll('_', ' '));
const options = (selected = 'personal_data') => reasons.map(r => `<option value="${r}" ${r === selected ? 'selected' : ''}>${label(r)}</option>`).join('');
export function renderDiscussion(s) {
  const disabled = s.canAct ? '' : 'disabled';
  return `<section aria-label="Plan discussion"><h2>Discussion for this plan</h2>
  <p><strong>Local synthetic prototype. Rule-assisted fixtures only; no LLM call.</strong> Conduct rules apply equally to conservative, liberal and other viewpoints. Suggestions never hide a post.</p>
  <p>Separate opt-in shares your discussion posts with consenting accepted participants. Assigned safety reviewers may review reported or rule-suggested posts. Withdrawing consent stops future participant access; reported content and decisions remain in this local review record. It cannot recall copies already seen. This does not grant contact or private-message access.</p>
  <div role="status" aria-live="polite"><strong>${esc(s.phase)}</strong><p>${esc(s.message)}</p></div>
  <button data-discussion-action="refresh" ${s.busy ? 'disabled' : ''}>Refresh discussion access</button>
  ${s.pending ? `<p>One action is unconfirmed. Its recovery record contains only its original key/hash, not your text.</p><button data-discussion-action="reconcile" ${s.busy ? 'disabled' : ''}>Check original discussion receipt</button>` : ''}
  ${s.receipt ? `<p>Historical receipt: ${label(s.receipt.operation)} — ${label(s.receipt.outcome)}. Current access is checked separately.</p>` : ''}
  ${s.feed ? `<section><h3>Your discussion consent</h3><p>${s.feed.consented ? 'Enabled for this consent epoch.' : 'Off. Re-enabling starts a new epoch; old posts do not reappear.'}</p><button data-discussion-action="consent" data-enabled="${s.feed.consented ? 'false' : 'true'}" ${disabled}>${s.feed.consented ? 'Withdraw discussion consent' : 'Enable discussion consent'}</button>
    ${s.feed.consented ? `<label for="discussion-post">Post to this plan</label><textarea id="discussion-post" maxlength="1200" ${disabled}></textarea><button data-discussion-action="post" ${disabled}>Post discussion text</button>` : ''}
    <h3>Shared posts</h3>${s.feed.posts.map(p => `<article><p><strong>${esc(p.authorName)}</strong> · ${esc(p.status)}</p><p>${p.text === null ? 'Text restricted by a human reviewer.' : esc(p.text)}</p>
      ${p.decision ? `<p>Human decision: ${label(p.decision.action)} · ${label(p.decision.reasonCode)} · ${esc(p.decision.policyVersion)}</p>` : ''}
      ${!p.own && p.text !== null ? `<label for="flag-${p.postId}">Conduct concern</label><select id="flag-${p.postId}" ${disabled}>${options().replace(/<option value="(?:no_violation|insufficient_context)"[^>]*>.*?<\/option>/g, '')}</select><button data-discussion-action="flag" data-post-id="${p.postId}" ${disabled}>Request human review</button>` : ''}</article>`).join('') || '<p>No shared posts in the current consent epoch.</p>'}</section>` : '<p>Participant feed unavailable for this identity or current membership.</p>'}
  ${s.queue ? `<section aria-label="Assigned human review queue"><h3>Your assigned human review queue</h3><p>Review the whole context. A source excerpt and reason are required for restriction. Appeals require a different reviewer. Authors, reporters and stale assignments cannot decide their case.</p>
    ${s.queue.cases.map(r => `<article><h4>${r.phase === 'appeal_pending' ? 'Independent appeal' : 'Pending human review'}</h4><p>${esc(r.text)}</p>
      <p>Rule suggestions: ${r.suggestions.map(x => label(x.reasonCode)).join(', ') || 'none'}. Human concerns: ${r.humanFlagReasons.map(label).join(', ') || 'none'}. These are requests for review, not findings.</p>
      ${r.appeal ? `<p>Author’s appeal: ${esc(r.appeal.text)}</p>` : ''}
      ${r.decisions.map(d => `<p>Prior ${esc(d.stage)}: ${label(d.action)}, ${label(d.reasonCode)}. ${esc(d.explanation)}</p>`).join('')}
      <label for="action-${r.caseId}">Your decision</label><select id="action-${r.caseId}" ${disabled}><option value="keep">Keep visible</option><option value="restrict">Restrict text</option></select>
      <label for="reason-${r.caseId}">Conduct reason</label><select id="reason-${r.caseId}" ${disabled}>${options('no_violation')}</select>
      <label for="explanation-${r.caseId}">Specific explanation (20–800 characters; author can read it)</label><textarea id="explanation-${r.caseId}" minlength="20" maxlength="800" ${disabled}></textarea>
      <label for="excerpt-${r.caseId}">Exact source excerpt (required for restriction, 3–300 characters)</label><input id="excerpt-${r.caseId}" maxlength="300" ${disabled}>
      <button data-discussion-action="decide" data-case-id="${r.caseId}" ${disabled}>Record human decision</button></article>`).join('') || '<p>No currently eligible pending cases. Ineligible cases are not disclosed here.</p>'}</section>` : ''}
  ${s.notices ? `<section aria-label="Your decisions and appeals"><h3>Your decisions and appeals</h3>${s.notices.notices.map(n => `<article><p>${esc(n.phase)}${n.appealStatus ? ' · ' + label(n.appealStatus) : ''}</p>
    ${n.decisions.map(d => `<p>${esc(d.stage)} human decision: ${label(d.action)} · ${label(d.reasonCode)}</p><p>${esc(d.explanation)}</p><p>Source excerpt: ${esc(d.excerpt)}</p>`).join('')}
    ${n.canAppeal ? `<label for="appeal-${n.caseId}">Context for an independent appeal</label><textarea id="appeal-${n.caseId}" maxlength="800" ${disabled}></textarea><button data-discussion-action="appeal" data-case-id="${n.caseId}" ${disabled}>Request independent human review</button>` : ''}</article>`).join('') || '<p>No decisions to show.</p>'}</section>` : ''}
  <p>No response time, staffed service or production clearance is claimed. This fixture never reads private messages or contact relays.</p></section>`;
}

export function bindDiscussionPane(root, client) {
  const fields = createFieldRenderer(root); let formGeneration = 0, latest, previousScope = null;
  const stop = client.subscribe(s => {
    latest = s;
    const scope = s.actor && s.phase !== 'signed-out' && s.phase !== 'needs-refresh' ? `${s.actor}:${s.feed?.instanceId ?? s.queue?.instanceId ?? s.notices?.instanceId ?? ''}` : null;
    if (scope === null && previousScope !== null) formGeneration++;
    previousScope = scope;
    const bindings = [];
    if (s.feed?.consented) bindings.push({ id: 'discussion-post', scope, enabled: s.canAct });
    for (const p of s.feed?.posts ?? []) if (!p.own && p.text !== null) bindings.push({ id: `flag-${p.postId}`, scope, enabled: s.canAct, initial: 'personal_data' });
    for (const r of s.queue?.cases ?? []) for (const key of ['action', 'reason', 'explanation', 'excerpt']) bindings.push({ id: `${key}-${r.caseId}`, scope, enabled: s.canAct, initial: key === 'action' ? 'keep' : key === 'reason' ? 'no_violation' : '' });
    for (const n of s.notices?.notices ?? []) if (n.canAppeal) bindings.push({ id: `appeal-${n.caseId}`, scope, enabled: s.canAct });
    fields.render(renderDiscussion(s), bindings, formGeneration);
  });
  const value = id => root.querySelector('#' + id)?.value ?? '';
  async function handler(event) {
    const target = event.target.closest?.('[data-discussion-action]'); if (!target || target.disabled) return;
    const action = target.dataset.discussionAction;
    if (action === 'refresh' || action === 'reconcile') return client[action]();
    if (!latest.canAct) return;
    let endpoint, body;
    if (action === 'consent') { endpoint = 'discussion-consent'; body = { enabled: target.dataset.enabled === 'true' }; }
    if (action === 'post') { endpoint = 'discussion-post'; body = { text: value('discussion-post') }; }
    if (action === 'flag') { endpoint = 'discussion-flag'; body = { postId: target.dataset.postId, reasonCode: value('flag-' + target.dataset.postId) }; }
    if (action === 'decide') {
      const row = latest.queue?.cases.find(r => r.caseId === target.dataset.caseId), assignment = latest.queue?.assignments[0]; if (!row || !assignment) return;
      endpoint = 'discussion-decide'; body = { caseId: row.caseId, expectedRevision: row.revision, assignmentId: assignment.assignmentId, expectedEpoch: assignment.epoch, action: value('action-' + row.caseId), reasonCode: value('reason-' + row.caseId), explanation: value('explanation-' + row.caseId), excerpt: value('excerpt-' + row.caseId) };
    }
    if (action === 'appeal') {
      const row = latest.notices?.notices.find(r => r.caseId === target.dataset.caseId); if (!row?.canAppeal) return;
      endpoint = 'discussion-appeal'; body = { caseId: row.caseId, decisionId: row.decisions.at(-1).decisionId, text: value('appeal-' + row.caseId) };
    }
    if (endpoint) { formGeneration++; return client.act(endpoint, body); }
  }
  root.addEventListener('click', handler);
  return () => { stop(); fields.dispose(); root.removeEventListener('click', handler); client.dispose(); };
}
