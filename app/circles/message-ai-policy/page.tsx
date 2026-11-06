import Link from 'next/link';
import { MESSAGE_AI_POLICY } from '@/lib/circles/message-ai-consent';
import { body, h1, h2, main, page, small } from '@/lib/circles/ui';
import styles from '../messages/safety.module.css';

export default function MessageAiPolicyPage() {
  return <div style={page}><main style={main} className={styles.scope}>
    <h1 style={h1}>Optional AI review of your message</h1>
    <p style={small}>Policy {MESSAGE_AI_POLICY} · Published November 4, 2026</p>
    <h2 style={h2}>Your choice, for one message</h2>
    <p style={body}>AI review is off unless you explicitly allow it for your own message. Keeping it off does not penalize you or prevent human review. Permission does not itself send anything: an eligible assigned reviewer must separately request advisory help.</p>
    <h2 style={h2}>What Anthropic receives</h2>
    <p style={body}>The text you posted is sent to Anthropic’s Claude Sonnet 4.6 with fixed community review instructions. Your profile, Circle roster, private reports, nearby messages, and app-added reply links stay within Society of Explorers. The text you write may include names or other personal details.</p>
    <h2 style={h2}>Retention and provider terms</h2>
    <p style={body}>This policy makes no zero-retention promise. Anthropic’s standard commercial API policy describes deletion within 30 days with exceptions for agreements, service features, policy enforcement, and law. Flagged content may be retained for up to two years; legal requirements can require longer retention. These exceptions mean 30 days is not a guaranteed maximum. <a href="https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data" rel="noreferrer">Anthropic’s commercial retention policy</a> and <a href="https://platform.claude.com/docs/en/manage-claude/api-and-data-retention" rel="noreferrer">API retention details</a>.</p>
    <p style={body}>Anthropic says commercial inputs and outputs are not used for training by default, with exceptions for feedback or explicit permission. This is not a guarantee about a particular account’s agreement or settings. Read <a href="https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training" rel="noreferrer">Anthropic’s training policy</a> and <a href="https://www.anthropic.com/legal/commercial-terms" rel="noreferrer">Commercial Terms</a>.</p>
    <h2 style={h2}>Changing your mind</h2>
    <p style={body}>You can check and revoke permission from your posted messages, including after leaving a Circle or when a message is hidden or withdrawn. Revocation prevents new requests. A request already in progress may still transmit or complete. Revocation cannot recall text already sent to Anthropic or erase copies already received. Changing a message requires its current settings to be checked again.</p>
    <h2 style={h2}>Advice is not a decision</h2>
    <p style={body}>AI advice can be wrong, incomplete, or biased. It does not hide, restore, or decide a case. Human reviewers remain responsible for checking the evidence and making any decision under the same community rules. No one must opt in to receive human review.</p>
    <Link href="/circles/contributions" prefetch={false}>Return to my posted messages</Link>
  </main></div>;
}
