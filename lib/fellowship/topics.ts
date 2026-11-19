export const FELLOWSHIP_TOPICS = [
  {
    id: 'psalm-22', title: 'Psalm 22 · lament and hope',
    href: '/fellowship/scripture#cry-of-abandonment',
    question: 'How does the ending of Psalm 22 change what you hear in its opening?',
    brief: 'Read the whole psalm, from the cry of abandonment to rescue and public praise. Compare its Gospel quotations and the disputed hands-and-feet wording without merging text, interpretation and belief.',
  },
  {
    id: 'isaiah-53', title: 'Isaiah 53 · the suffering servant',
    href: '/fellowship/scripture#numbered-with-transgressors',
    question: 'What supports each reading of the servant, and what does the passage leave open?',
    brief: 'Begin at Isaiah 52:13 and read through 53:12 alongside the surrounding chapters. Compare named Christian and Jewish readings and distinguish an explicit quotation from a later comparison.',
  },
  {
    id: 'josephus', title: 'Josephus · text and historical evidence',
    href: '/fellowship/research/ancient-jesus-passage',
    question: 'What would an authentic Josephus sentence establish, and what would still need other evidence?',
    brief: 'Examine Antiquities 18.63–64, its received translation and competing arguments. Composition, translation and surviving-copy dates are different; the recent preprint is not a new first-century manuscript discovery.',
  },
] as const;

export type FellowshipTopicId = typeof FELLOWSHIP_TOPICS[number]['id'];

export function getFellowshipTopic(value: unknown) {
  return typeof value === 'string' ? FELLOWSHIP_TOPICS.find(topic => topic.id === value) : undefined;
}

export function parseFellowshipTopic(value: unknown): FellowshipTopicId | undefined {
  return getFellowshipTopic(value)?.id;
}

/** Public topic context is not a membership credential, event booking or post. */
export function withFellowshipTopic(href: string, topic?: FellowshipTopicId): string {
  if (!href.startsWith('/') || href.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(href)) throw new Error('Use an internal fellowship destination');
  const url = new URL(href, 'https://soe.invalid');
  if (url.origin !== 'https://soe.invalid') throw new Error('Use an internal fellowship destination');
  if (topic !== undefined && !getFellowshipTopic(topic)) throw new Error('Unknown fellowship topic');
  url.searchParams.delete('fellowship');
  if (topic) url.searchParams.set('fellowship', topic);
  return url.pathname + url.search + url.hash;
}

export function fellowshipDiscoveryHref(topic: FellowshipTopicId): string {
  return withFellowshipTopic('/circles?format=online', topic);
}

/** Prepared only after an explicit action; the member still reviews and posts. */
export function fellowshipDiscussionDraft(topic: FellowshipTopicId, origin?: string): string {
  const selected = getFellowshipTopic(topic);
  if (!selected) throw new Error('Unknown fellowship topic');
  let href: string = selected.href;
  if (origin !== undefined) {
    const base = new URL(origin);
    const local = base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname);
    if (base.protocol !== 'https:' && !local || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error('Use the public app origin');
    href = new URL(href, base).href;
  }
  return selected.question + '\n\n' + href;
}
