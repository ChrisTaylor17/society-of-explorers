import { GUIDE_ACTION_NOTICE } from './guidePolicy';

export const GUIDE_ACTION_MARKER = '|||ACTIONS|||';

// Legacy clients can render deltas without consuming the final response.
// Hold only a possible marker prefix so no command fragment reaches that view.
export function createGuideTextStream() {
  let pending = '';
  let actionSeen = false;

  return {
    push(chunk: string): string {
      if (actionSeen) return '';
      pending += chunk;
      const markerAt = pending.indexOf(GUIDE_ACTION_MARKER);
      if (markerAt !== -1) {
        actionSeen = true;
        const text = pending.slice(0, markerAt);
        pending = '';
        return `${text}\n\n${GUIDE_ACTION_NOTICE}`;
      }

      let held = 0;
      for (let length = 1; length < GUIDE_ACTION_MARKER.length; length++) {
        if (pending.endsWith(GUIDE_ACTION_MARKER.slice(0, length))) held = length;
      }
      const text = pending.slice(0, pending.length - held);
      pending = pending.slice(pending.length - held);
      return text;
    },
    finish(): string {
      const text = pending;
      pending = '';
      return text;
    },
  };
}

// Stops a streamed reply cleanly after `max` complete sentences, so a reply
// that runs long is shortened at a sentence end, never mid-word.
export function createSentenceCap(max: number) {
  let out = '';
  let count = 0;
  let done = false;
  let afterEnd = false;
  return {
    get done() { return done; },
    get text() { return out; },
    push(chunk: string): string {
      if (done || !Number.isFinite(max)) {
        if (!done) out += chunk;
        return done ? '' : chunk;
      }
      let emit = '';
      for (const ch of chunk) {
        if (afterEnd) {
          if (/\s/.test(ch)) {
            count++;
            afterEnd = false;
            if (count >= max) { done = true; break; }
          } else if (!/[.!?"'”’)\]]/.test(ch)) {
            afterEnd = false;
          }
        }
        emit += ch;
        if (/[.!?]/.test(ch)) afterEnd = true;
      }
      out += emit;
      return emit;
    },
  };
}
