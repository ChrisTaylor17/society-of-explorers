// Shared by the salon tutor routes: the page shows at most three sentences, so a
// longer reply is cut, and the cut must never drop the closing question.

const SENTENCE = /[^.!?]+(?:[.!?]+["'”’)\]]*)(?=\s|$)|[^.!?]+$/g;

/** Where each sentence starts and ends: an end mark (with any closing quote or bracket) then space. */
export function sentenceSpans(text: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  for (const match of text.matchAll(SENTENCE)) {
    const raw = match[0];
    const lead = raw.length - raw.trimStart().length;
    const body = raw.trim();
    if (!body) continue;
    const start = (match.index ?? 0) + lead;
    spans.push({ start, end: start + body.length });
  }
  return spans;
}

const isQuestion = (sentence: string) => /\?["'”’)\]]*$/.test(sentence);

/**
 * Keep at most `limit` sentences, keeping the last one when it is a question.
 * Line breaks between kept sentences stay, so a two-line voice reply
 * ("Voice of Thrasymachus (338c): ..." then "My question: ...") keeps its shape.
 */
export function capKeepingQuestion(text: string, limit: number): { text: string; capped: boolean } {
  const spans = sentenceSpans(text);
  if (spans.length <= limit) return { text: text.trim(), capped: false };
  const last = spans[spans.length - 1];
  const kept = isQuestion(text.slice(last.start, last.end)) ? [...spans.slice(0, limit - 1), last] : spans.slice(0, limit);
  let out = '';
  kept.forEach((span, i) => {
    if (i > 0) out += /\n/.test(text.slice(kept[i - 1].end, span.start)) ? '\n' : ' ';
    out += text.slice(span.start, span.end);
  });
  return { text: out, capped: true };
}
