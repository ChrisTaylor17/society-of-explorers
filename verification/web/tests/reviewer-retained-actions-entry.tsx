import React from 'react';
import { createRoot } from 'react-dom/client';
import QuestReviews from '../../../app/quest/reviews/QuestReviews';
import CircleReviews from '../../../app/moderation/circles/CircleReviews';
import ReviewCoverage from '../../../app/moderation/ReviewCoverage';
import type { ReviewCoveragePage } from '../../../lib/circles/review-coverage';
import MessageReviews from '../../../app/moderation/messages/MessageReviews';

type CoverageProps = React.ComponentProps<typeof ReviewCoverage>;
type ExpiryInput = Pick<CoverageProps, 'endpoint' | 'circleId' | 'messageId' | 'revision' | 'contentHash'> & { reply: ReviewCoveragePage };
const expiryEvents: { kind: string; complete?: boolean | null }[] = [];
function StableCoverageExpiry({ input }: { input: ExpiryInput }) {
  const onProof = React.useCallback<CoverageProps['onProof']>(proof => { expiryEvents.push({ kind: 'proof', complete: proof?.complete ?? null }); }, []);
  const onAction = React.useCallback(() => { expiryEvents.push({ kind: 'action' }); }, []);
  const onClearDraft = React.useCallback(() => { expiryEvents.push({ kind: 'clear' }); }, []);
  const onUnavailable = React.useCallback(() => { expiryEvents.push({ kind: 'unavailable' }); }, []);
  const onEvidence = React.useCallback(() => { expiryEvents.push({ kind: 'evidence' }); }, []);
  // Replay one canonical SQL page synchronously to force coalesced clear/reply
  // commits. This is an explicit timing adapter, not an HTTP/SQL acceptance test.
  const perform = React.useCallback<CoverageProps['perform']>(async (_url, _init, onResult) => {
    expiryEvents.push({ kind: 'reply' }); onResult({ status: 200, body: structuredClone(input.reply) });
  }, [input]);
  return <ReviewCoverage {...input} active busy={false} perform={perform} onProof={onProof} onAction={onAction} onClearDraft={onClearDraft} onUnavailable={onUnavailable} onEvidence={onEvidence} />;
}
const root = createRoot(document.getElementById('root')!);
const listeners = new Set<(event: string) => void>();
const retained = new Map<number, (event: unknown) => unknown>();
let sequence = 0, generation = 0, credentialCalls = 0, factoryCalls = 0;
let credentialGate: Promise<void> | null = null, release: (() => void) | null = null;
const qa = {
  listeners,
  expiryProbe(input: ExpiryInput) { expiryEvents.length=0;root.render(<React.StrictMode key={++generation}><StableCoverageExpiry input={input} /></React.StrictMode>); },
  expiryEvents: () => [...expiryEvents],
  emit(event: string) { for (const listener of [...listeners]) listener(event); },
  show(view: 'message' | 'listing' | 'quest' = 'message') { root.render(<React.StrictMode key={++generation}>{view === 'quest' ? <QuestReviews /> : view === 'listing' ? <CircleReviews /> : <MessageReviews />}</React.StrictMode>); },
  retain(node: HTMLElement, event: string) {
    const key = Object.keys(node).find(name => name.startsWith('__reactProps$'));
    const props = key ? (node as unknown as Record<string, Record<string, unknown>>)[key] : null;
    if (!props || typeof props[event] !== 'function') throw Error('Actual React callback not found');
    const id = ++sequence; retained.set(id, props[event] as (event: unknown) => unknown); return id;
  },
  invoke(id: number, fields: { checked?: boolean; value?: string } = {}) {
    const fn = retained.get(id); if (!fn) throw Error('Captured callback missing');
    fn({ preventDefault() {}, target: fields, currentTarget: fields });
  },
  holdCredentials() { credentialGate = new Promise<void>(resolve => { release = resolve; }); },
  releaseCredentials() { release?.(); release = null; credentialGate = null; },
  credentialCalls: () => credentialCalls,
  factoryCalls: () => factoryCalls,
  async credentials(json: boolean) { credentialCalls++; if (credentialGate) await credentialGate; return json ? { 'Content-Type': 'application/json' } : {}; },
  factory() { factoryCalls++; return { auth: { onAuthStateChange(listener: (event: string) => void) {
    listeners.add(listener); return { data: { subscription: { unsubscribe() { listeners.delete(listener); } } } };
  } } }; },
  unmount() { root.unmount(); },
};
Object.assign(window, { reviewerRetainedQa: qa });
qa.show(new URLSearchParams(location.search).get('view') === 'quest' ? 'quest' : 'message');
