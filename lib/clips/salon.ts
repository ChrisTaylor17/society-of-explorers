import { reelHref } from './contracts';

export const REEL_QUESTIONS = {
  'night-sky-traffic': 'What brightness limit would you set for satellites, and what evidence would change your mind?',
  'telescope-first-tilt': 'What test would convince you that the telescope can produce sharp images?',
  'which-height': 'How would you report both heights so a reader can tell what each number measures and where it was measured from?',
  'new-species': 'What would you compare before calling it a new species?',
} as const;

export type ReelDiscussionId = keyof typeof REEL_QUESTIONS;

export function reelDiscussionId(value: unknown): ReelDiscussionId | undefined {
  return typeof value === 'string' && Object.hasOwn(REEL_QUESTIONS, value) ? value as ReelDiscussionId : undefined;
}

export function withReelDiscussion(href: string, reel?: ReelDiscussionId): string {
  return reel ? `${href}${href.includes('?') ? '&' : '?'}reel=${reel}` : href;
}

export function reelDiscussionDraft(reel: ReelDiscussionId, origin?: string): string {
  const href = reelHref(reel);
  return `${REEL_QUESTIONS[reel]}\n\n${origin === undefined ? href : new URL(href, origin).href}`;
}
