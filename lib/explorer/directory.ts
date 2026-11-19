// Static directory for the /explorer index page.
//
// These are the six AI thinker guides that pose the daily question on
// /practice and appear on /feed. They are AI personas inspired by historical
// figures, not the people themselves, and not members. Ids and lenses mirror
// lib/practice/todayQuestion.ts; colours mirror the audited feed palette
// (all >= 6.5:1 on #0d0d0d).
//
// Member profiles (/explorer/[id]) are deliberately NOT listed here: there is
// no opt-in "list me publicly" flag on members, so the index never enumerates
// real people or shows engagement numbers.

export interface ThinkerGuide {
  id: string;
  name: string;
  initials: string;
  era: string;
  lens: string;
  color: string;
}

export const THINKER_GUIDES: ThinkerGuide[] = [
  { id: 'socrates', name: 'Socrates', initials: 'SO', era: '470–399 BC', lens: 'Finds the question behind the question.', color: '#C9A94E' },
  { id: 'plato', name: 'Plato', initials: 'PL', era: '428–348 BC', lens: 'Sees systems and structures beneath the surface.', color: '#9B8BF5' },
  { id: 'aurelius', name: 'Marcus Aurelius', initials: 'MA', era: '121–180 AD', lens: 'Cuts through noise to what is in our control.', color: '#A88D6E' },
  { id: 'nietzsche', name: 'Nietzsche', initials: 'FN', era: '1844–1900', lens: 'Challenges comfort zones and comfortable lies.', color: '#F0475F' },
  { id: 'einstein', name: 'Einstein', initials: 'AE', era: '1879–1955', lens: 'Finds elegant simplifications through analogy.', color: '#6F8FF0' },
  { id: 'jobs', name: 'Steve Jobs', initials: 'SJ', era: '1955–2011', lens: 'Focuses on what the user should feel.', color: '#A0A0A0' },
];
