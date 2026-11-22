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

const SELF_NAMES: Record<string, string[]> = {
  socrates: ['Socrates'],
  plato: ['Plato'],
  aurelius: ['Marcus Aurelius', 'Aurelius', 'Marcus'],
  nietzsche: ['Friedrich Nietzsche', 'Nietzsche'],
  einstein: ['Albert Einstein', 'Einstein'],
  jobs: ['Steve Jobs', 'Jobs'],
  'steve-jobs': ['Steve Jobs', 'Jobs'],
  'marcus-aurelius': ['Marcus Aurelius', 'Aurelius', 'Marcus'],
};

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Turns a guide's talk about its own thinker in the third person
// ("Nietzsche would ask", "Einstein's habit") into the first person
// ("I would ask", "my habit"). Other thinkers' names are left alone.
export function rewriteSelfReference(text: string, thinkerId: string): string {
  const names = SELF_NAMES[thinkerId];
  if (!names) return text;
  const alt = names.map(escapeRegExp).join('|');
  const atStart = (offset: number, whole: string) => offset === 0 || /[.!?]["'”’)\]]*\s+$|\n\s*$/.test(whole.slice(Math.max(0, offset - 4), offset));
  return text
    .replace(new RegExp(`\\b(?:${alt})(?:['’]s|['’])(?=\\s)`, 'g'), (_m, offset: number, whole: string) => (atStart(offset, whole) ? 'My' : 'my'))
    .replace(new RegExp(`\\b(?:${alt})(?=\\s+(?:would|might|could|will|wants|asks|says|thinks|sees|tends|believes|argues|insists|reminds|holds|warns|wonders)\\b)`, 'g'), 'I')
    .replace(/\bI\s+(asks|says|thinks|sees|tends|believes|argues|insists|reminds|holds|warns|wonders|wants)\b/g, (_m, verb: string) => `I ${verb.replace(/s$/, '')}`);
}

// Streaming wrapper: holds back a short tail so a name split across chunks is
// still rewritten before it reaches the member.
export function createSelfReferenceRewriter(thinkerId: string, holdBack = 28) {
  let pending = '';
  return {
    push(chunk: string): string {
      pending = rewriteSelfReference(pending + chunk, thinkerId);
      if (pending.length <= holdBack) return '';
      let cut = pending.length - holdBack;
      const code = pending.charCodeAt(cut);
      if (code >= 0xdc00 && code <= 0xdfff) cut -= 1;
      const out = pending.slice(0, cut);
      pending = pending.slice(cut);
      return out;
    },
    finish(): string {
      const out = rewriteSelfReference(pending, thinkerId);
      pending = '';
      return out;
    },
  };
}
