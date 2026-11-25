// After Mira stops the seminar for a guest in trouble, the prompt says she replies
// only "I am waiting for Chris." until a [room] note arrives. In the live check on
// the preview she carried on with the next guest line instead, so the route holds
// the line in code and never asks the model while the room is stopped.

export const WAITING_FOR_CHRIS = 'I am waiting for Chris.';

// The fixed trouble reply (the name comes first, so match its middle) and the
// fixed holding reply. The single-reader holding reply asks a question instead,
// and the reader's answer to it must reach the model, so it is not matched.
const STOPPED = [
  /I am an AI and not the right help, so please reach someone you trust or a crisis line now/,
  /^I cannot hear how that was said, so I am stopping here for a moment, and Chris will check in with you privately\.$/,
  /^I am waiting for Chris\.$/,
];

type Turn = { role: 'user' | 'assistant'; content: string };

/** True when Mira's last reply stopped the room and the new message has no [room] note. */
export function roomIsStopped(turns: Turn[]): boolean {
  const last = turns[turns.length - 1];
  const previous = turns[turns.length - 2];
  if (!last || last.role !== 'user' || !previous || previous.role !== 'assistant') return false;
  if (!STOPPED.some(pattern => pattern.test(previous.content.trim()))) return false;
  return !last.content.split('\n').some(line => line.trimStart().startsWith('[room]'));
}
