import { admissionTime, canonicalAdmissionUuid, exactAdmissionKeys, isCircleApprovalCode, isCircleRecipientCode,
  parseCircleAdmissionAccess, parseCircleInvitationReview, parseCircleInvitedJoinReceipt,
  type CircleAdmissionAccess, type CircleInvitationCheck, type CircleInvitationRecovery,
  type CircleInvitationReview, type CircleInvitationRevokeInput } from '../../lib/circles/admission';
import { circleAdmissionMutationBody, type CircleAdmissionAction } from '../../lib/circles/admission-wire';
import { membershipRecord } from '../../lib/circles/membership';
import { approvedOrigin, type CircleTransport } from '../native/src/circles/host';
import type { VerifiedAccountOwner } from '../native/src/circles/verified-member-session';

export type CircleAdmissionConfig = {
  origin: string; circleId: string; memberId: string; owner: VerifiedAccountOwner;
  transport: CircleTransport; admissionTransport: CircleTransport; newRequestId: () => Promise<string>;
  timeoutMs?: number; initialOnline?: boolean; now?: () => Date;
};
export type CircleAdmissionReview = { kind: 'issue'; recipient: CircleInvitationReview }
  | { kind: 'join'; invitation: CircleInvitationCheck } | { kind: 'revoke'; retry: boolean };
export type CircleAdmissionModel = {
  epoch: number; connected: boolean; active: boolean; online: boolean; busy: boolean; closed: boolean;
  account: string; access: CircleAdmissionAccess | null; recipientCode: string; hostCode: string;
  approvalText: string; issuedApproval: string; shareConsent: boolean; confirmed: boolean;
  review: CircleAdmissionReview | null; uncertain: boolean; message: string;
  canCheck: boolean; canEdit: boolean; canGenerate: boolean; canReviewHost: boolean;
  canReviewJoin: boolean; canReviewRevoke: boolean; canConfirm: boolean; canCancel: boolean;
  canRecover: boolean; canNavigate: boolean;
};
type Intent = { kind: 'issue'; recipient: CircleInvitationReview; code: string }
  | { kind: 'join'; invitation: CircleInvitationCheck; token: string; requestId: string }
  | { kind: 'revoke'; body: CircleInvitationRevokeInput };
type Pending = { kind: 'join'; body: CircleInvitationRecovery; subject: string; sent: boolean }
  | { kind: 'revoke'; body: CircleInvitationRevokeInput; subject: string; sent: boolean };
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
class Refusal extends Error {
  constructor(readonly notAttempted: boolean) { super('Invitation request refused'); }
}

/** Each instance belongs to one member and salon. Retirement clears all codes,
 * names and review; only a sent account-bound receipt/revocation reference can
 * survive disconnect. A join is never resent by recovery. No durable storage. */
export function createCircleAdmission(config: CircleAdmissionConfig) {
  const origin = approvedOrigin(config.origin), { circleId, memberId } = config, timeout = config.timeoutMs ?? 15000;
  if (!canonicalAdmissionUuid(circleId) || !canonicalAdmissionUuid(memberId)
    || !config.owner || !['scope', 'credentials', 'subscribe'].every(k => typeof config.owner[k as keyof VerifiedAccountOwner] === 'function')
    || typeof config.transport !== 'function' || typeof config.admissionTransport !== 'function' || typeof config.newRequestId !== 'function'
    || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000
    || config.initialOnline !== undefined && typeof config.initialOnline !== 'boolean'
    || config.now !== undefined && typeof config.now !== 'function') throw Error('Verified salon invitation connection required');
  let attached = false, closed = false, active = true, online = config.initialOnline ?? false;
  let scope: string | null = null, generation = 0, epoch = 0, attachment = 0, busy = false, verified = false;
  let account = '', access: CircleAdmissionAccess | null = null, recipientCode = '', hostCode = '', approvalText = '', issuedApproval = '';
  let shareConsent = false, confirmed = false, intent: Intent | null = null, pending: Pending | null = null;
  let message = 'Check your current account and salon access before using an invitation.', offOwner = () => {};
  const listeners = new Set<(m: CircleAdmissionModel) => void>(), requests = new Set<AbortController>();
  const enabled = () => !closed && attached && active && online && scope !== null && config.owner.scope() === scope;
  function model(): CircleAdmissionModel {
    const visible = enabled(), usable = visible && !busy, ready = usable && verified && access !== null;
    const review: CircleAdmissionReview | null = !visible || !intent ? null : intent.kind === 'issue'
      ? { kind: 'issue', recipient: copy(intent.recipient) } : intent.kind === 'join'
        ? { kind: 'join', invitation: copy(intent.invitation) } : { kind: 'revoke', retry: pending?.kind === 'revoke' };
    return { epoch, connected: !closed && attached && scope !== null && config.owner.scope() === scope,
      active, online, busy, closed, account: visible ? account : '', access: visible ? copy(access) : null,
      recipientCode: visible ? recipientCode : '', hostCode: visible ? hostCode : '', approvalText: visible ? approvalText : '',
      issuedApproval: visible ? issuedApproval : '', shareConsent: visible && shareConsent, confirmed: visible && confirmed,
      review, uncertain: pending?.sent === true, message,
      canCheck: usable && !intent, canEdit: ready && !intent && !pending,
      canGenerate: ready && !intent && !pending && shareConsent && access?.admissionMode === 'host_approval',
      canReviewHost: ready && !intent && !pending && access?.canIssue === true && isCircleRecipientCode(hostCode),
      canReviewJoin: ready && !intent && !pending && access?.admissionMode === 'host_approval' && !access.isMember && isCircleApprovalCode(approvalText),
      canReviewRevoke: ready && !intent && !pending && access?.canRevoke === true,
      canConfirm: ready && intent !== null && confirmed, canCancel: usable && intent !== null,
      canRecover: ready && !intent && pending?.sent === true, canNavigate: !busy && !intent && !pending };
  }
  const emit = () => { epoch++; for (const listener of listeners) { try { listener(model()); } catch { /* Observers grant no authority. */ } } };
  function clearPrivate() {
    account = ''; access = null; recipientCode = ''; hostCode = ''; approvalText = ''; issuedApproval = '';
    shareConsent = false; confirmed = false; intent = null; verified = false;
  }
  function retire(notice: string) {
    generation++; for (const request of requests) request.abort(); busy = false; clearPrivate();
    if (pending && !pending.sent) pending = null;
    message = notice + (pending ? ' A sent request may still finish. Check the same account to recover its result.' : ''); emit();
  }
  async function run(action: 'check' | 'code' | 'host' | 'join' | 'revoke' | 'confirm' | 'recover') {
    const m = model();
    if (!(action === 'check' ? m.canCheck : action === 'code' ? m.canGenerate : action === 'host' ? m.canReviewHost
      : action === 'join' ? m.canReviewJoin : action === 'revoke' ? m.canReviewRevoke : action === 'recover' ? m.canRecover : m.canConfirm)) return;
    const chosen = copy(intent), sourceCode = hostCode, sourceApproval = approvalText, hadPending = pending?.sent === true;
    const g = ++generation, expectedScope = scope!, abort = new AbortController();
    let subject: string | null = null, sent = false, timer: ReturnType<typeof setTimeout> | undefined;
    const current = () => enabled() && generation === g && scope === expectedScope && !abort.signal.aborted;
    const visible = () => enabled() && generation === g && scope === expectedScope;
    busy = true; confirmed = false; intent = null; issuedApproval = ''; message = 'Checking the current account and invitation…';
    requests.add(abort); emit();
    async function request(path: string, body?: string, mutation = false) {
      if (!current()) throw Error('Invitation view retired');
      const proof = await config.owner.credentials(expectedScope);
      if (!current() || !proof || !canonicalAdmissionUuid(proof.subject.toLowerCase()) || typeof proof.bearer !== 'string'
        || proof.bearer.length > 16377 || !/^[A-Za-z0-9._~+/-]+=*$/.test(proof.bearer)
        || subject !== null && subject !== proof.subject.toLowerCase()
        || pending && pending.subject !== proof.subject.toLowerCase()) throw Error('Invitation owner unavailable');
      subject = proof.subject.toLowerCase();
      if (mutation) { if (!pending) throw Error('No recovery reference'); pending.sent = true; sent = true; }
      if (!current()) throw Error('Invitation view retired');
      const url = origin + path, post = body !== undefined;
      const response = await (post ? config.admissionTransport : config.transport)(url, {
        method: post ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + proof.bearer, ...(post ? { 'Content-Type': 'application/json' } : {}) },
        ...(post ? { body } : {}), credentials: 'omit', cache: 'no-store', redirect: 'error', signal: abort.signal,
      });
      if (!current() || response.url !== url || response.redirected !== false || !Number.isInteger(response.status)) throw Error('Invitation response refused');
      const data = await response.json(); if (!current()) throw Error('Invitation response retired');
      if (response.status !== 200) throw new Refusal(membershipRecord(data) && data.outcome === 'not_attempted');
      return data;
    }
    const post = (action: CircleAdmissionAction, value: unknown, mutation = false) =>
      request('/api/circles/' + circleId + '/' + action, circleAdmissionMutationBody(action, value), mutation);
    const freshAccess = async () => {
      const data = await post('admission-access', { expectedMemberId: memberId });
      const parsed = parseCircleAdmissionAccess(data, memberId, circleId);
      if (!parsed) throw Error('Salon access unavailable'); return parsed;
    };
    const newId = async () => {
      const id = await config.newRequestId(); if (!current() || !canonicalAdmissionUuid(id)) throw Error('Request key unavailable'); return id;
    };
    const future = (value: string) => admissionTime(value) && Date.parse(value) > (config.now?.() ?? new Date()).getTime();
    try {
      await Promise.race([(async () => {
        const accountData = await request('/api/auth/member');
        if (!membershipRecord(accountData) || !membershipRecord(accountData.member) || !membershipRecord(accountData.auth)
          || accountData.member.id !== memberId || accountData.auth.provider !== 'supabase' || accountData.auth.subject !== subject
          || accountData.member.supabase_auth_id !== subject || typeof accountData.member.display_name !== 'string' || accountData.member.display_name.length > 400) throw Error('Current member unavailable');
        account = accountData.member.display_name.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() || 'Explorer'; verified = true;
        if (action === 'check') {
          access = await freshAccess(); clearInputs();
          message = pending ? 'Current account checked. Recover the earlier request before another change.'
            : 'Current account and salon access checked. Codes are shared only when you explicitly choose.'; return;
        }
        if (action === 'code') {
          const data = await post('recipient-code', { expectedMemberId: memberId, shareConsent: true });
          if (!membershipRecord(data) || !exactAdmissionKeys(data, ['memberId', 'circleId', 'recipientCode', 'expiresAt'])
            || data.memberId !== memberId || data.circleId !== circleId || !isCircleRecipientCode(data.recipientCode) || !future(String(data.expiresAt))) throw Error('Sharing code unavailable');
          recipientCode = data.recipientCode; shareConsent = false; message = 'Your one-hour sharing code is ready. Give it only to this salon’s host. Creating it has not joined anything.'; return;
        }
        if (action === 'host') {
          const data = await post('invitation-review', { expectedMemberId: memberId, recipientCode: sourceCode });
          const recipient = parseCircleInvitationReview(data, memberId, circleId, membershipRecord(data) ? String(data.targetMemberId) : '');
          if (!recipient || !future(recipient.expiresAt)) throw Error('Recipient review unavailable');
          intent = { kind: 'issue', recipient, code: sourceCode }; message = 'Review this recipient and expiry. No approval has been issued.'; return;
        }
        if (action === 'join') {
          const data = await post('invitation-check', { expectedMemberId: memberId, invitationToken: sourceApproval });
          const invitation = parseCircleAdmissionAccess(data, memberId, circleId, true) as CircleInvitationCheck | null;
          if (!invitation?.canJoin || !future(invitation.expiresAt)) throw Error('Joining unavailable');
          const requestId = await newId(); access = invitation;
          intent = { kind: 'join', invitation, token: sourceApproval, requestId };
          message = 'The approval matches this account. Review the salon and confirm before joining.'; return;
        }
        if (action === 'revoke') {
          const checked = await freshAccess(); if (!checked.canRevoke) throw Error('Host access unavailable');
          const requestId = await newId(); access = checked;
          intent = { kind: 'revoke', body: { expectedMemberId: memberId, requestId, expectedRevision: checked.revision, expectedInvitationRevision: checked.invitationRevision } };
          message = 'Review revocation. Existing members stay; outstanding approvals will stop working.'; return;
        }
        if (action === 'recover') {
          const p = pending; if (!p?.sent) throw Error('Recovery unavailable');
          if (p.kind === 'revoke') { intent = { kind: 'revoke', body: copy(p.body) }; message = 'Review the exact revocation retry using its original request and revisions.'; return; }
          const data = await post('invitation-receipt', p.body), b = p.body;
          if (!membershipRecord(data) || !exactAdmissionKeys(data, ['memberId', 'circleId', 'requestId', 'approvalNonce', 'proofHash', 'expectedRevision', 'recorded'])
            || data.memberId !== memberId || data.circleId !== circleId || data.requestId !== b.requestId || data.approvalNonce !== b.approvalNonce
            || data.proofHash !== b.proofHash || data.expectedRevision !== b.expectedRevision || typeof data.recorded !== 'boolean') throw Error('Recovery unavailable');
          if (data.recorded) { pending = null; clearPrivate(); message = 'Your earlier join was recorded. Check current salon access; membership may have changed since then.'; }
          else message = 'The join receipt is not visible yet. This does not prove failure. No join was retried; check again later.'; return;
        }
        if (!chosen) throw Error('Reviewed intent unavailable');
        if (chosen.kind === 'issue') {
          const r = chosen.recipient; if (!future(r.expiresAt)) throw Error('Review expired');
          const requestId = await newId();
          const data = await post('invitations', { expectedMemberId: memberId, recipientCode: chosen.code, targetMemberId: r.targetMemberId,
            requestId, expectedRevision: r.circleRevision, expectedInvitationRevision: r.invitationRevision, expectedTargetLabel: r.targetLabel, expiresAt: r.expiresAt });
          if (!membershipRecord(data) || !exactAdmissionKeys(data, ['memberId', 'requestId', 'circleId', 'targetMemberId', 'targetLabel', 'invitationRevision', 'expiresAt', 'invitationToken'])
            || data.memberId !== memberId || data.circleId !== circleId || data.requestId !== requestId || data.targetMemberId !== r.targetMemberId
            || data.targetLabel !== r.targetLabel || data.invitationRevision !== r.invitationRevision || data.expiresAt !== r.expiresAt || !isCircleApprovalCode(data.invitationToken)) throw Error('Approval unavailable');
          hostCode = ''; issuedApproval = data.invitationToken; message = 'Approval code ready for the reviewed recipient. It has not joined anyone. Share it privately with that person.'; return;
        }
        if (chosen.kind === 'join') {
          if (!future(chosen.invitation.expiresAt)) throw Error('Review expired');
          const body = { expectedMemberId: memberId, requestId: chosen.requestId, expectedRevision: chosen.invitation.revision, invitationToken: chosen.token };
          pending = { kind: 'join', subject: subject!, sent: false, body: { expectedMemberId: memberId, requestId: body.requestId,
            expectedRevision: body.expectedRevision, approvalNonce: chosen.invitation.approvalNonce, proofHash: chosen.invitation.proofHash } };
          clearInputs();
          const data = await post('join-invited', body, true);
          if (!parseCircleInvitedJoinReceipt(data, body, circleId)) throw Error('Join receipt unavailable');
          pending = null; clearPrivate(); message = 'Your join was recorded. Check current salon access to see your membership and meeting.'; return;
        }
        if (!pending) pending = { kind: 'revoke', body: chosen.body, subject: subject!, sent: false };
        const data = await post('invitations/revoke', chosen.body, true);
        if (!membershipRecord(data) || data.memberId !== memberId || data.circleId !== circleId || data.requestId !== chosen.body.requestId
          || typeof data.replayed !== 'boolean' || !membershipRecord(data.receipt)
          || !exactAdmissionKeys(data.receipt, ['action', 'invitationRevision']) || data.receipt.action !== 'revokeInvitations'
          || data.receipt.invitationRevision !== chosen.body.expectedInvitationRevision + 1) throw Error('Revocation receipt unavailable');
        pending = null; clearPrivate(); message = 'Revocation recorded. Existing members stay. Check access before issuing another approval.';
      })(), new Promise<never>((_, reject) => {
        abort.signal.addEventListener('abort', () => reject(Error('Invitation lifetime ended')), { once: true });
        timer = setTimeout(() => { abort.abort(); reject(Error('Invitation deadline')); }, timeout);
      })]);
    } catch (error) {
      if (!visible()) return;
      if (pending && !pending.sent || sent && !hadPending && error instanceof Refusal && error.notAttempted) pending = null;
      clearPrivate();
      message = pending ? 'The result is uncertain. A sent request may still complete. Check the same account, then recover its result.'
        : 'The current account or invitation could not be verified. Check access and review again. No admission is being assumed.';
    } finally {
      clearTimeout(timer); requests.delete(abort);
      if (visible()) { busy = false; emit(); }
    }
  }
  function clearInputs() { recipientCode = ''; hostCode = ''; approvalText = ''; issuedApproval = ''; shareConsent = false; confirmed = false; intent = null; }
  return {
    model, subscribe(listener: (m: CircleAdmissionModel) => void) { listeners.add(listener); listener(model()); return () => { listeners.delete(listener); }; },
    connect() {
      if (attached || closed) return; attached = true; const at = ++attachment;
      const stop = config.owner.subscribe(() => { if (!attached || closed || at !== attachment) return; scope = config.owner.scope(); retire('Account changed. Private invitation details cleared.'); });
      if (!attached || closed || at !== attachment) { stop(); return; } offOwner = stop; scope = config.owner.scope(); retire('Check your account and salon access when ready.');
    },
    disconnect() { attachment++; attached = false; scope = null; offOwner(); offOwner = () => {}; retire('Private invitation view hidden.'); },
    activity(value: boolean) { active = value; if (!value) retire('Private invitation details cleared while inactive.'); else emit(); },
    connectivity(value: boolean) { online = value; if (!value) retire('Private invitation details cleared while offline.'); else emit(); },
    check() { return run('check'); }, generate() { return run('code'); }, reviewHost() { return run('host'); },
    reviewJoin() { return run('join'); }, reviewRevoke() { return run('revoke'); }, send() { return run('confirm'); }, recover() { return run('recover'); },
    edit(field: 'hostCode' | 'approvalText', value: string) {
      if (!model().canEdit || typeof value !== 'string' || value.length > (field === 'hostCode' ? 1000 : 1600)) return;
      if (field === 'hostCode') hostCode = value; else approvalText = value; issuedApproval = ''; emit();
    },
    consent(value: boolean) { if (!model().canEdit) return; shareConsent = value === true; emit(); },
    confirm(value: boolean) { if (!enabled() || busy || !intent) return; confirmed = value === true; emit(); },
    cancel() { if (!model().canCancel) return; clearInputs(); message = pending ? 'The earlier request is still uncertain. Nothing was retried.' : 'Review cancelled. Nothing was sent.'; emit(); },
    close() {
      if (closed) return; closed = true; attached = false; attachment++; scope = null; offOwner(); offOwner = () => {}; pending = null;
      retire('Private invitation view closed. Codes and recovery references were discarded. A previously sent request may still complete.');
    },
  };
}
export type CircleAdmission = ReturnType<typeof createCircleAdmission>;
