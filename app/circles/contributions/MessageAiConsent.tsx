'use client';

import Link from 'next/link';
import { useCallback, useId, useRef, useState } from 'react';
import { MESSAGE_AI_POLICY, MESSAGE_AI_POLICY_HREF, parseMessageAiConsent, sameMessageAiConsent, type MessageAiConsent as Consent } from '@/lib/circles/message-ai-consent';
import { useReviewAccess } from '@/lib/circles/useReviewAccess';
import { button, card, h2, primary, small } from '@/lib/circles/ui';
import styles from '../messages/safety.module.css';

type Props = { circleId: string; messageId: string; active?: boolean; onAccessDenied?: (status: number) => void };
export default function MessageAiConsent(props: Props) {
  return <ConsentPanel key={`${props.circleId}:${props.messageId}:${props.active !== false}`} {...props} />;
}
function ConsentPanel({ circleId, messageId, active: parentActive = true, onAccessDenied }: Props) {
  const id = useId();
  const [state, setState] = useState<Consent | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [notice, setNotice] = useState('Check this message’s current AI review settings before choosing.');
  const sending = useRef(false);
  const retire = useCallback(() => {
    setState(null); setConfirmed(false); sending.current = false;
    setNotice('AI review settings cleared. Check current settings again. A change already sent may have been saved.');
  }, []);
  const { active, busy, perform } = useReviewAccess(retire);
  const disabled = !parentActive || !active || busy;
  const url = `/api/circles/${encodeURIComponent(circleId)}/messages/${encodeURIComponent(messageId)}/ai-consent`;
  const matches = (value: Consent) => value.circleId === circleId.toLowerCase() && value.messageId === messageId.toLowerCase();
  function unavailable(status?: number, unknown = false) {
    sending.current = false; setState(null); setConfirmed(false);
    if (status === 401 || status === 403 || status === 404) onAccessDenied?.(status);
    setNotice(status === 401 ? 'Sign in to check your message’s AI review settings.' : status === 403 || status === 404 ? 'These settings are not available for this account.'
      : status === 409 ? 'The message or permission changed. Check current settings before choosing again.'
      : unknown ? 'The change could not be confirmed and may have been saved. Check current settings before choosing again. Nothing is retried automatically.'
      : 'AI review settings are unavailable. Permission is not being assumed. Check again when available.');
  }
  function load() {
    if (disabled || sending.current) return;
    setState(null); setConfirmed(false); setNotice('Checking AI review settings…');
    void perform(url, { method: 'GET' }, ({ status, body }) => {
      const current = status === 200 ? parseMessageAiConsent(body) : null;
      if (!current || !matches(current)) return unavailable(status);
      setState(current); setNotice('Current AI review settings checked.');
    }, () => unavailable());
  }
  function change(allowed: boolean) {
    if (disabled || sending.current || !state || state.allowed === allowed || allowed && (!confirmed || !state.canEnable)) return;
    const checked = state;
    sending.current = true; setState(null); setConfirmed(false);
    setNotice(allowed ? 'Saving permission for this message…' : 'Revoking future AI review for this message…');
    void perform(url, { method: 'POST', body: JSON.stringify({ expectedConsentRevision: checked.consentRevision, contentHash: checked.contentHash, policy: MESSAGE_AI_POLICY, allowed }) }, ({ status, body }) => {
      const receipt = status === 200 ? parseMessageAiConsent(body) : null;
      if (!receipt || !matches(receipt) || receipt.allowed !== allowed || receipt.contentHash !== checked.contentHash
        || receipt.consentRevision !== checked.consentRevision + 1 || receipt.messageRevision < checked.messageRevision) return unavailable(status, true);
      setNotice('Permission receipt received. Reading current settings to verify…');
      void perform(url, { method: 'GET' }, result => {
        sending.current = false;
        const current = result.status === 200 ? parseMessageAiConsent(result.body) : null;
        if (!current || !matches(current) || !sameMessageAiConsent(current, receipt)) return unavailable(result.status, true);
        setState(current); setNotice(allowed ? 'Permission confirmed for this message. This setting does not itself send the message.' : 'Future AI review revoked. A request already in progress may still transmit or complete; text already sent to Anthropic cannot be recalled.');
      }, () => unavailable(undefined, true));
    }, sent => unavailable(undefined, sent));
  }
  return <section aria-label="Message AI review permission" aria-busy={busy} className={`${styles.scope} ${styles.stack}`} style={{ ...card, marginTop: '12px' }}>
    <h3 style={{ ...h2, margin: 0 }}>AI review permission</h3>
    <p style={small}>Optional for this message only. Human review does not require this permission, and choosing not to allow it carries no review penalty.</p>
    <p style={small}>An assigned reviewer may send this message’s text to Anthropic’s Claude for advisory safety review. We do not add your profile or author name, but names or other personal details may be present in your text. Anthropic may retain data under its terms, including safety and legal exceptions. This is not anonymous or zero-retention processing.</p>
    <p style={small}><Link href={MESSAGE_AI_POLICY_HREF} prefetch={false}>Read the message AI review policy</Link> · Policy <code>{MESSAGE_AI_POLICY}</code></p>
    <p style={small}>Revoking blocks new requests. A request already in progress may still transmit or complete; text already sent cannot be recalled. AI advice does not decide whether a message is hidden or restored.</p>
    <p id={`${id}-notice`} role="status" aria-live="polite" style={small}>{notice}</p>
    <button type="button" style={button} disabled={disabled} onClick={load}>Check AI review settings</button>
    {parentActive && active && state ? <>
      <p style={small}>{state.allowed ? 'AI review permission is on for this message.' : 'AI review permission is off for this message.'}</p>
      {state.allowed ? <button type="button" style={button} disabled={disabled} onClick={() => change(false)}>Revoke future AI review</button>
        : state.canEnable ? <>
          <label className={styles.check}><input type="checkbox" checked={confirmed} disabled={disabled} onChange={event => setConfirmed(event.target.checked)} />I read this policy and allow this message’s text to be sent to Anthropic for advisory review.</label>
          <button type="button" style={primary} disabled={disabled || !confirmed} onClick={() => change(true)}>Allow Anthropic review of this message</button>
        </> : <p style={small}>AI review cannot be enabled for this message in its current state.</p>}
    </> : null}
  </section>;
}
