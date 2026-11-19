import { createOperatorClient } from './operator-client.mjs';
import { RECIPIENT } from './fixture-contract.mjs';
const $ = id => document.getElementById(id);
let tabStorage = null; try { tabStorage = sessionStorage; } catch {}
const client = createOperatorClient({ storage: tabStorage });
const dialog = $('action-dialog');
const time = stamp => new Date(stamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const wording = {
  pause: ['Pause this fictional plan?', 'This stores a local hold and withdraws future contact access. Copies already returned cannot be recalled.', 'Confirm pause'],
  handoff: ['Propose a targeted handoff?', 'The server will choose an eligible fictional safety assignment. The expected recipient in this fixture is Mina (A-S). A proposal is not an acceptance.', 'Confirm proposal'],
  accept: ['Accept this local handoff?', 'This records your fictional account’s acknowledgement as the selected recipient. It does not establish that a person reviewed a report or took action.', 'Record acceptance'],
  decline: ['Decline this local handoff?', 'This records your fictional account’s decline as the selected recipient. The plan stays paused. No acceptance or fallback recipient is assigned, and no notification is sent.', 'Record decline'],
};

function render(s) {
  const busy = ['connecting', 'submitting'].includes(s.phase), signed = Boolean(s.actor && s.phase !== 'signed-out' && s.phase !== 'connecting');
  $('signin-panel').hidden = signed; $('workspace').hidden = !signed; $('sign-out').hidden = !signed;
  $('operator-name').textContent = s.actor?.name ?? 'Choose an operator'; $('operator-role').textContent = s.actor?.role ?? 'Fictional accounts only'; $('avatar').textContent = s.actor?.name[0] ?? '—';
  document.title = (s.actor?.name ? s.actor.name + ' · ' : '') + 'Local operator desk';
  for (const button of document.querySelectorAll('[data-persona]')) button.disabled = busy || Boolean(s.pending && s.pending.actorId !== button.dataset.persona);
  $('connection').textContent = s.fresh ? 'Current local data' : s.connection === 'disconnected' ? 'Disconnected' : signed ? 'Status unverified' : 'Not connected';
  $('review-tag').textContent = s.fixture?.independentReview?.includes('OPS01') ? 'Repair pending re-review' : 'Contract review pending';
  const data = s.snapshot?.data, assignment = s.fresh && data?.assignments.find(a => a.assignmentId === s.actor?.assignmentId);
  const hold = s.fresh && data?.holds.find(h => h.state === 'held');
  const cancelled = s.fresh && data?.holds.some(h => h.state === 'cancelled');
  const handoff = s.fresh && data?.handoffs.filter(h => h.holdId === hold?.holdId).at(-1);
  const available = Boolean(s.fresh && assignment && !busy && !s.pending);
  $('freshness').textContent = s.fresh ? 'Verified local snapshot' : 'Current status unverified';
  $('checked-at').textContent = s.checkedAt ? (s.fresh ? 'Checked ' : 'Last seen ') + time(s.checkedAt) : 'No current check';
  $('plan-status').textContent = !s.fresh ? 'Status unverified' : cancelled ? 'Cancelled' : hold ? 'Paused' : 'No active pause';
  $('plan-indicator').className = 'state-dot' + (!s.fresh ? '' : cancelled ? ' cancelled' : hold ? ' held' : ' open');
  $('plan-description').textContent = !s.fresh ? 'Current status and authority must be checked before an action.' : cancelled ? 'This local cancellation is terminal. A new action cannot reopen it.' : hold ? 'Future plan access is paused. Previous contact grants stay withdrawn.' : 'An authorized fictional operator can pause this plan.';
  $('pause').disabled = !available || Boolean(hold || cancelled);
  $('pause').textContent = hold ? 'Plan is paused' : cancelled ? 'Plan is cancelled' : 'Pause plan';
  $('refresh').disabled = busy || !signed;
  $('handoff').hidden = assignment?.role === 'safety';
  $('handoff').disabled = !available || assignment?.role !== 'lead' || !hold || Boolean(handoff);
  $('accept').hidden = !handoff || handoff.recipientAssignmentId !== s.actor?.assignmentId || handoff.state !== 'requested';
  $('accept').disabled = !available || handoff?.epochAtRequest !== assignment?.epoch;
  $('decline').hidden = $('accept').hidden;
  $('decline').disabled = $('accept').disabled;
  const targetKnown = !handoff || handoff.recipientAssignmentId === RECIPIENT.assignmentId;
  $('recipient-name').textContent = targetKnown ? RECIPIENT.name : 'Selected assignment';
  $('recipient-role').textContent = targetKnown ? 'Fictional safety recipient · A-S' : handoff.recipientAssignmentId;
  const accepted = handoff?.state === 'acknowledged';
  $('accept-mark').hidden = !accepted;
  $('handoff-pill').textContent = !s.fresh ? 'Unverified' : accepted ? 'Accepted' : handoff?.state === 'requested' ? 'Pending acceptance' : handoff?.state === 'declined' ? 'Declined' : 'Not proposed';
  $('handoff-pill').className = 'pill ' + (accepted ? 'accepted' : handoff?.state === 'requested' ? 'pending' : 'neutral');
  $('handoff-status').textContent = !s.fresh ? 'Current handoff unverified' : accepted ? (targetKnown ? 'Accepted by Mina' : 'Selected assignment accepted') : handoff?.state === 'requested' ? (targetKnown ? 'Waiting for Mina' : 'Waiting for selected assignment') : handoff?.state === 'declined' ? 'Recipient declined' : hold ? 'Ready to propose' : cancelled ? 'Plan cancelled' : 'Pause the plan first';
  $('handoff-description').textContent = !s.fresh ? 'A last-seen result is not current confirmation. Check the local API.' : accepted ? 'The selected fictional account acknowledged this handoff. Human review remains unverified.' : handoff?.state === 'requested' ? 'The proposal is stored. The intended recipient has not accepted it.' : handoff?.state === 'declined' ? 'No acceptance is recorded. The plan remains paused. No fallback recipient is assigned.' : 'A proposal is pending until the selected recipient responds.';
  $('step-pause').className = hold || cancelled ? 'done' : s.fresh ? 'current' : '';
  $('step-request').className = handoff ? 'done' : hold ? 'current' : '';
  $('step-accept').className = accepted || handoff?.state === 'declined' ? 'done' : handoff?.state === 'requested' ? 'current' : '';
  let title = 'Nothing submitted', icon = '·', iconClass = '';
  if (s.phase === 'submitting') { title = 'Awaiting confirmation'; icon = '…'; iconClass = 'unknown'; }
  else if (s.pending) { title = s.pending.stage === 'absent' ? 'No receipt at last check' : s.pending.stage === 'conflict' ? 'Action conflict · unconfirmed' : 'Action unconfirmed'; icon = '?'; iconClass = 'unknown'; }
  else if (s.receipt?.state === 'stored') {
    const declined = s.receipt.facts.data.operation === 'handoff-ack' && s.receipt.facts.data.outcome === 'declined';
    title = ({ hold: 'Pause stored', 'handoff-request': 'Handoff proposal stored', 'handoff-ack': declined ? 'Account decline stored' : 'Account acceptance stored' })[s.receipt.facts.data.operation] ?? 'Receipt stored';
    icon = declined ? '—' : '✓'; iconClass = declined ? '' : 'stored';
  }
  else if (s.receipt?.state === 'rejected') { title = 'Request rejected'; icon = '—'; }
  $('receipt-title').textContent = title; $('receipt-icon').textContent = icon; $('receipt-icon').className = 'receipt-icon ' + iconClass;
  $('message').textContent = s.message;
  const key = s.pending?.key ?? s.receipt?.key;
  $('receipt-detail').textContent = key ? 'Original action …' + key.slice(-10) + (s.receipt?.state === 'stored' ? ' · receipt version ' + s.receipt.facts.version + (s.receipt.recovered ? ' · recovered by lookup' : '') : '') : '';
  $('check-receipt').hidden = !s.pending || !signed; $('check-receipt').disabled = busy;
  $('retry').hidden = !(s.pending?.stage === 'absent' && s.pending.canRetry && s.fresh); $('retry').disabled = busy;
  if (s.proposal) {
    const [title, description, confirm] = wording[s.proposal.kind];
    $('dialog-title').textContent = title; $('dialog-description').textContent = description; $('dialog-confirm').textContent = confirm;
    if (!dialog.open) dialog.showModal();
  } else if (dialog.open) dialog.close();
}
client.subscribe(render);
for (const button of document.querySelectorAll('[data-persona]')) button.addEventListener('click', () => client.connect(button.dataset.persona));
$('sign-out').addEventListener('click', () => client.signOut());
$('pause').addEventListener('click', () => client.prepare('pause'));
$('handoff').addEventListener('click', () => client.prepare('handoff'));
$('accept').addEventListener('click', () => client.prepare('accept'));
$('decline').addEventListener('click', () => client.prepare('decline'));
$('refresh').addEventListener('click', () => client.refresh());
$('check-receipt').addEventListener('click', () => client.checkReceipt());
$('retry').addEventListener('click', () => client.retry());
$('dialog-cancel').addEventListener('click', () => client.cancelProposal());
$('dialog-confirm').addEventListener('click', () => client.confirm());
dialog.addEventListener('cancel', event => { event.preventDefault(); client.cancelProposal(); });
window.addEventListener('offline', () => client.noteOffline());
window.addEventListener('online', () => client.refresh());
