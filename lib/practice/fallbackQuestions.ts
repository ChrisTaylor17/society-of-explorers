// Hand-written daily questions used when AI generation is unavailable, so
// /practice always has a question. Pure module: no network, no secrets.

export interface FallbackQuestion {
  thinker_id: string;
  question_text: string;
  question_context: string;
}

export const FALLBACK_QUESTIONS: readonly FallbackQuestion[] = [
  {
    thinker_id: 'socrates',
    question_text: 'What is one thing you believe today that you have never actually tested?',
    question_context: 'Untested beliefs are the easiest place to start an honest inquiry.',
  },
  {
    thinker_id: 'plato',
    question_text: 'Which habit in your week quietly shapes everything else, and did you choose it?',
    question_context: 'Structures we never chose still decide a lot for us.',
  },
  {
    thinker_id: 'aurelius',
    question_text: 'What is worrying you right now that is not actually in your control?',
    question_context: 'Separating what we control from what we do not is daily work.',
  },
  {
    thinker_id: 'nietzsche',
    question_text: 'Which comfortable story about yourself would you be afraid to give up?',
    question_context: 'The stories we protect most are often the ones worth examining.',
  },
  {
    thinker_id: 'einstein',
    question_text: 'What problem in your life would look simpler if you described it to a child?',
    question_context: 'Plain words often reveal the real shape of a problem.',
  },
  {
    thinker_id: 'jobs',
    question_text: 'What would you remove from your day if you had to make it half as complicated?',
    question_context: 'Focus is mostly about what you decide not to do.',
  },
  {
    thinker_id: 'socrates',
    question_text: 'When did you last change your mind about something important, and what did it?',
    question_context: 'Knowing how we change our minds tells us how we think.',
  },
  {
    thinker_id: 'aurelius',
    question_text: 'Who did you treat today the way you would want to be treated, and who did you not?',
    question_context: 'Character shows up in ordinary moments, not big ones.',
  },
  {
    thinker_id: 'plato',
    question_text: 'What do you say you value that your calendar does not show?',
    question_context: 'Where time goes is a quiet record of priorities.',
  },
  {
    thinker_id: 'einstein',
    question_text: 'What question have you stopped asking because you assumed the answer?',
    question_context: 'Curiosity fades fastest where we feel most certain.',
  },
  {
    thinker_id: 'nietzsche',
    question_text: 'What would you do differently this week if no one would ever find out?',
    question_context: 'Separating our wants from our audience shows what we really value.',
  },
  {
    thinker_id: 'jobs',
    question_text: 'What is one small thing you could make today that someone else would genuinely enjoy?',
    question_context: 'Making something for one real person is a good place to start.',
  },
  {
    thinker_id: 'aurelius',
    question_text: 'What would a calm version of you do about the hardest thing on your list today?',
    question_context: 'Calm is a choice we can practise, not only a mood.',
  },
  {
    thinker_id: 'socrates',
    question_text: 'What is a word you use often but could not define if someone asked you?',
    question_context: 'Many disagreements start with words we never defined.',
  },
];

/** Day number since the Unix epoch for a YYYY-MM-DD date string (UTC-based, stable). */
export function dayIndex(isoDate: string): number {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(ms)) return 0;
  return Math.floor(ms / 86_400_000);
}

/** Deterministic fallback question for a given ET date (YYYY-MM-DD). */
export function pickFallbackQuestion(isoDate: string): FallbackQuestion {
  const n = FALLBACK_QUESTIONS.length;
  const i = ((dayIndex(isoDate) % n) + n) % n;
  return FALLBACK_QUESTIONS[i];
}
