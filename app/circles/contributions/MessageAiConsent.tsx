'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
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
  const [notice, setNotice] = useState('Check this message’s current AI review settings before choosing. A change sent earlier may still finish.');
  const sending = useRef(false);
  const interaction = useRef(0);
  const [renderedInteraction, setRenderedInteraction] = useState(0);
  const mounted = useRef(false);
  const advance = useCallback(() => { setRenderedInteraction(++interaction.current); }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // Aborting a request only retires this view. It cannot cancel a server write.
  // Keep this uncertainty across temporary retirement; a read alone never
  // confirms our decision. Remounted views make the same limitation explicit.
  const uncertain = useRef(false);
  const retire = useCallback(() => {
    advance();
    setState(null); setConfirmed(false); sending.current = false;
    setNotice('AI review settings cleared. Check current settings again. A change already sent may have been saved.');
  }, [advance]);
  const { active, busy, perform } = useReviewAccess(retire);
  const disabled = !parentActive || !active || busy;
  const currentAction = () => mounted.current && interaction.current === renderedInteraction;
  const url = `/api/circles/${encodeURIComponent(circleId)}/messages/${encodeURIComponent(messageId)}/ai-consent`;
  const matches = (value: Consent) => value.circleId === circleId.toLowerCase() && value.messageId === messageId.toLowerCase();
  function unavailable(status?: number, unknown = false) {
    advance();
    sending.current = false; setState(null); setConfirmed(false);
    if (status === 401 || status === 403 || status === 404) onAccessDenied?.(status);
    setNotice(status === 401 ? 'Sign in to check your message’s AI review settings.' : status === 403 || status === 404 ? 'These settings are not available for this account.'
      : status === 409 ? 'The message or permission changed. Check current settings before choosing again.'
      : unknown || uncertain.current ? 'The change could not be confirmed and may still finish. Check current settings, then explicitly choose whether to keep future AI review off or allow it. Nothing is retried automatically.'
      : 'AI review settings are unavailable. Permission is not being assumed. Check again when available.');
  }
  function load() {
    if (!currentAction() || disabled || sending.current) return;
    advance();
    setState(null); setConfirmed(false); setNotice('Checking AI review settings…');
    void perform(url, { method: 'GET' }, ({ status, body }) => {
      const current = status === 200 ? parseMessageAiConsent(body) : null;
      if (!current || !matches(current)) return unavailable(status);
      advance();
      setState(current); setNotice(uncertain.current
        ? 'The earlier change is still uncertain. This read does not cancel it. Choose a new decision below to settle your preference.'
        : 'Current saved settings are shown. A change sent earlier may still finish. Choose a decision below to settle your preference.');
    }, () => unavailable());
  }
  function change(allowed: boolean) {
    if (!currentAction() || disabled || sending.current || !state || state.consentRevision >= Number.MAX_SAFE_INTEGER || allowed && (!confirmed || !state.canEnable)) return;
    advance();
    const checked = state;
    const previouslyUncertain = uncertain.current;
    uncertain.current = true;
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
        uncertain.current = false;
        advance();
        setState(current); setNotice(allowed ? 'Permission confirmed for this message. This setting does not itself send the message.' : 'Future AI review is confirmed off. A review request already in progress may still transmit or complete; text already sent to Anthropic cannot be recalled.');
      }, () => unavailable(undefined, true));
    }, sent => { uncertain.current = previouslyUncertain || sent; unavailable(undefined, sent); });
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
      <p style={small}>{state.allowed ? 'Last checked: AI review permission is on for this message.' : 'Last checked: AI review permission is off for this message.'}</p>
      <button type="button" style={button} disabled={disabled || state.consentRevision >= Number.MAX_SAFE_INTEGER} onClick={() => change(false)}>{state.allowed ? 'Revoke future AI review' : 'Keep future AI review off'}</button>
      {state.canEnable ? <>
          <label className={styles.check}><input type="checkbox" checked={confirmed} disabled={disabled} onChange={event => {
            if (!currentAction() || disabled || sending.current || event.target.checked === confirmed) return;
            advance();
            setConfirmed(event.target.checked);
          }} />I read this policy and allow this message’s text to be sent to Anthropic for advisory review.</label>
          <button type="button" style={primary} disabled={disabled || !confirmed || state.consentRevision >= Number.MAX_SAFE_INTEGER} onClick={() => change(true)}>{state.allowed ? 'Keep Anthropic review allowed for this message' : 'Allow Anthropic review of this message'}</button>
        </> : <p style={small}>AI review cannot be enabled for this message in its current state.</p>}
      {state.consentRevision >= Number.MAX_SAFE_INTEGER ? <p style={small}>This permission has reached its revision limit. New AI review requests are blocked; contact support before changing it.</p> : null}
    </> : null}
    <p style={small}>Closing or leaving this view clears its local settings. A decision already sent may still finish. After returning, check settings and explicitly choose your preference. Nothing is retried automatically.</p>
  </section>;
}
