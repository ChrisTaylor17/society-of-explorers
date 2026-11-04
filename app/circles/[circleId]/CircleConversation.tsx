'use client';
import { useLayoutEffect, useId, useMemo, useState } from 'react';
import type { DiscussionMessage } from '@/lib/circles/discussion-reader';
import { CIRCLE_MESSAGE_LIMIT } from '@/lib/circles/discussion-composer';
import { createCircleParticipationSession } from '@/lib/circles/participation-session';
import { circleParticipationRequest } from '@/lib/circles/participation-transport';
import { body, button, card, fieldLabel, gold, h2, input, primary, small } from '@/lib/circles/ui';
import Link from 'next/link';
import MessageActions from '../messages/MessageActions';

export default function CircleConversation({ circleId, active, accessEpoch }: {
  circleId: string; active: boolean; accessEpoch: number;
}) {
  const id = useId();
  const session = useMemo(() => ({
    accessEpoch, controller: createCircleParticipationSession(circleParticipationRequest, circleId),
  }), [circleId, accessEpoch]);
  const [snapshot, setSnapshot] = useState(() => ({ owner: session, model: session.controller.model() }));
  useLayoutEffect(() => {
    const unsubscribe = session.controller.subscribe(model => setSnapshot({ owner: session, model }));
    return () => {
      unsubscribe();
      // Close before paint; permanent disposal would break Strict Mode replay.
      session.controller.close();
    };
  }, [session]);
  useLayoutEffect(() => { session.controller.activity(active); }, [session, active]);
  const visible = active && snapshot.owner === session;
  const current = visible ? snapshot.model : session.controller.model();
  const read = visible ? current.read : { ...current.read, conversation: null, open: false, busy: false };
  const write = visible ? current.write : { ...current.write, draft: '', canEdit: false, canSend: false, canStartNew: false };
  async function post() { if (active) await session.controller.post(); }
  return <section aria-labelledby={`${id}-heading`} aria-busy={read.busy || write.busy} style={{ marginTop: '2rem' }}>
    <h2 id={`${id}-heading`} style={h2}>Circle conversation</h2>
    <p id={`${id}-privacy`} style={small}>Posting shares your message with this circle. Keep sensitive personal details out of the conversation. Clearing a draft does not delete posted messages.</p>
    <p style={small}><Link href="/circles/contributions" style={{ color: gold, display: 'inline-flex', alignItems: 'center', minHeight: '44px', minWidth: '44px', maxWidth: '100%' }}>Review or withdraw my posted messages</Link></p>
    <p role="status" aria-live="polite" style={{ ...small, marginTop: '0.75rem' }}>{active ? read.message : 'Conversation and draft cleared while inactive.'}</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
      <button type="button" style={button} disabled={!active || read.busy || write.busy} onClick={() => void (read.open ? session.controller.refresh() : session.controller.open())}>{read.busy ? 'Checking access…' : read.open ? 'Refresh conversation' : 'Read circle conversation'}</button>
      {read.open ? <button type="button" style={button} onClick={() => { session.controller.close(); }}>Close conversation</button> : null}
    </div>
    {read.conversation ? <><p style={{ ...small, marginTop: '1rem' }}>This view returns the latest 100 messages. Older messages may exist. A missing message here does not prove that an earlier post was not saved; do not use this view alone to decide whether to send it again.</p><CircleMessageList key={`${circleId}:${accessEpoch}`} circleId={circleId} active={active} messages={read.conversation.messages} onAccessDenied={() => session.controller.close()} /></> : null}
    <form style={{ ...card, marginTop: '1rem' }} onSubmit={event => { event.preventDefault(); void post(); }}>
      <label htmlFor={`${id}-draft`} style={fieldLabel}>Your message to this circle</label>
      <textarea id={`${id}-draft`} value={write.draft} rows={4} maxLength={CIRCLE_MESSAGE_LIMIT}
        aria-describedby={`${id}-privacy ${id}-remaining ${id}-write-status`} disabled={!active || !write.canEdit}
        style={{ ...input, resize: 'vertical', minHeight: '120px' }} onChange={event => session.controller.edit(event.currentTarget.value)} />
      <p id={`${id}-remaining`} style={small}>{write.remaining} characters remaining</p>
      <p id={`${id}-write-status`} role="status" aria-live="polite" style={{ ...small, margin: '0.75rem 0' }}>{active ? write.message : 'Private draft cleared while inactive.'}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        <button type="submit" style={primary} disabled={!active || !write.canSend}>{write.busy ? 'Posting…' : 'Post to circle'}</button>
        <button type="button" style={button} disabled={!active || !write.canEdit || !write.draft} onClick={() => session.controller.clearDraft()}>Clear draft</button>
        {write.phase === 'unknown' ? <button type="button" style={button} disabled={!active || !write.canStartNew} onClick={() => session.controller.startNewAfterReview()}>I reviewed the conversation; start a new message</button> : null}
      </div>
    </form>
  </section>;
}

export function CircleMessageList({ messages, circleId, active = true, onAccessDenied }: { messages: DiscussionMessage[]; circleId?: string; active?: boolean; onAccessDenied?: (status: number) => void }) {
  return <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
    {messages.length === 0 ? <p style={small}>No messages were returned for this circle.</p> : messages.map(message => circleId ? <MessageActions key={message.id} circleId={circleId} message={message} active={active} onAccessDenied={onAccessDenied} /> : <article key={message.id} style={card}>
      <p style={{ ...small, marginBottom: '0.5rem', overflowWrap: 'anywhere' }}>{message.member_name}{message.is_mine ? ' · you' : ''} · <time dateTime={message.created_at}>{new Date(message.created_at).toUTCString()}</time></p>
      <p style={{ ...body, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0 }}>{message.content}</p>
    </article>)}
  </div>;
}
