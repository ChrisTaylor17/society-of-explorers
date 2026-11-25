import { test, expect } from 'bun:test';
import { roomIsStopped } from '../../lib/salon/miraHold';
import { capKeepingQuestion } from '../../lib/salon/guideReply';

const u = (content: string) => ({ role: 'user' as const, content });
const a = (content: string) => ({ role: 'assistant' as const, content });
const TROUBLE = 'Dee, thank you for saying that, and I am sorry you are carrying it. I am an AI and not the right help, so please reach someone you trust or a crisis line now: in the United States call or text 988, and anywhere else call your local emergency number. Chris, who built this room, will write to you privately now.';
const HOLDING = 'I cannot hear how that was said, so I am stopping here for a moment, and Chris will check in with you privately.';

test('G22 after the trouble reply, guest lines are held until a [room] note', () => {
  expect(roomIsStopped([u("Dee: I don't see the point in living"), a(TROUBLE), u('Ben: Thrasymachus is right')])).toBe(true);
  expect(roomIsStopped([u('Ana: no point in any of it'), a(HOLDING), u('Ben: Thrasymachus is right')])).toBe(true);
  expect(roomIsStopped([u('x'), a(TROUBLE), u('Ben: hi'), a('I am waiting for Chris.'), u('Cal: hello?')])).toBe(true);
});

test('G22 a [room] note, anywhere in the message, restarts the room', () => {
  expect(roomIsStopped([u('x'), a(TROUBLE), u('[room] round 3')])).toBe(false);
  expect(roomIsStopped([u('x'), a(TROUBLE), u('Ben: hi\n[room] next: Cal')])).toBe(false);
  // A guest quoting "[room]" mid-line is not a note.
  expect(roomIsStopped([u('x'), a(TROUBLE), u('Ben: type [room] round 3')])).toBe(true);
});

test('G22 ordinary replies and the single-reader question are not held', () => {
  expect(roomIsStopped([u('Ana: he is right'), a('Ben, how do you answer Ana?'), u('Ben: no')])).toBe(false);
  expect(roomIsStopped([u('no point in any of it'), a('Was that about the argument, or about you?'), u('the argument')])).toBe(false);
  expect(roomIsStopped([u('[room] start. Guests: Ana')])).toBe(false);
});

test('G22 the fixed trouble replies survive the three-sentence cap whole', () => {
  for (const line of [TROUBLE, HOLDING]) expect(capKeepingQuestion(line, 3)).toEqual({ text: line, capped: false });
});
