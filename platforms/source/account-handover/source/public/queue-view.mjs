const escape = x => String(x ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
export function renderQueueView(s) {
  const lead = s.actor?.view === 'requester', triage = s.actor?.view === 'triage';
  const data = s.fresh ? s.snapshot?.data : null, held = data?.holds.find(h => h.state === 'held');
  const busy = ['connecting','submitting'].includes(s.phase), enabled = s.fresh && !busy && !s.pending;
  let html = `<h2>${escape(s.actor?.name ?? 'Not signed in')}</h2><p>${s.fresh ? 'Verified local snapshot' : 'Current status unverified'}</p>`;
  if (data) {
    html += `<p>Plan: <strong>${held ? 'Held' : data.holds.some(h=>h.state==='cancelled') ? 'Cancelled' : 'No active hold'}</strong></p>`;
    if (lead) {
      const request = data.requests.find(r=>r.holdId===held?.holdId);
      html += request ? '<p data-public-status>Review request recorded. Plan remains held. Recipient and response details are restricted. Assignment and human review are not confirmed here.</p>' : '<p>No review request recorded for this hold.</p>';
      html += `<button data-action="pause" ${!enabled||held?'disabled':''}>Hold fictional plan</button> <button data-action="handoff" ${!enabled||!held||request?'disabled':''}>Record safety review request</button>`;
    } else if (triage) {
      html += '<p>Private fictional triage queue. No notifications or real staff are assigned. Escalation flags are stored locally.</p>';
      for (const row of data.cases) html += `<section><p>${escape(row.requestId)} · ${escape(row.phase)} · ${row.open?'Open held case':'Hold resolved'}</p><p>Recorded ${escape(row.recordedAt)}${row.escalationRequired?' · Independent review required; external escalation is unstaffed':''}</p><button data-action="dispatch" data-request="${escape(row.requestId)}" ${!enabled||!row.open?'disabled':''}>Dispatch / recheck</button> <button data-action="escalate" data-request="${escape(row.requestId)}" ${!enabled||!row.open?'disabled':''}>Flag local escalation required</button></section>`;
    } else {
      html += '<p>Private exact-recipient view. An account response does not establish human review.</p>';
      for (const offer of data.offers) html += `<section><p>${escape(offer.handoffId)} · ${escape(offer.state)}</p><button data-action="accept" data-handoff="${escape(offer.handoffId)}" ${!enabled||offer.state!=='requested'?'disabled':''}>Accept fictional offer</button> <button data-action="decline" data-handoff="${escape(offer.handoffId)}" ${!enabled||offer.state!=='requested'?'disabled':''}>Decline fictional offer</button></section>`;
    }
  }
  html += `<p>${escape(s.message)}</p><p>${s.receipt?.state==='stored'?'Historical action receipt stored. Current authority is checked separately.':''}</p>`;
  if (s.pending) html += `<button id="lookup" ${busy?'disabled':''}>Check original receipt</button>${s.pending.stage==='absent'&&s.pending.canRetry&&s.fresh?'<button id="retry">Explicit same-intent retry</button>':''}`;
  if (s.proposal) html += `<section role="dialog" aria-modal="true"><p>Confirm ${escape(s.proposal.kind)}${s.proposal.body.handoffId ? ' for offer '+escape(s.proposal.body.handoffId) : ' for this fictional local workflow'}?</p><button id="cancel">Cancel — no write</button><button id="confirm">Confirm once</button></section>`;
  return html;
}
