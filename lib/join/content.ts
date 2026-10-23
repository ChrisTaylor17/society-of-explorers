// lib/join/content.ts
// Membership tiers and FAQ copy for /join. Kept out of the page so the server
// layout can build structured data from the same prices the page shows.
// Copy rule: no invented users, testimonials or metrics.

// Free sign-up lands on the Daily Practice so a new member does something on day one.
export const FREE_SIGNUP_PATH = '/login?mode=signup&next=%2Fpractice';

export type JoinTier = {
  id: string;
  name: string;
  price: string;
  period: string;
  badge: string | null;
  featured: boolean;
  cta: string;
  ctaAction: 'oauth' | 'checkout';
  tagline: string;
  features: string[];
  note?: string;
};

export const TIERS: JoinTier[] = [
  {
    id: 'explorer', name: 'Explorer', price: 'Free', period: '', badge: null, featured: false,
    cta: 'START FREE', ctaAction: 'oauth' as const,
    tagline: 'Begin your journey',
    features: [
      '3 Council questions per day',
      'Daily Practice included — start your streak today',
      'Browse the Constellation',
      'Read verdict cards',
    ],
  },
  {
    id: 'seeker', name: 'Seeker', price: '$19', period: '/mo', badge: 'RECOMMENDED', featured: true,
    cta: 'BECOME A SEEKER', ctaAction: 'checkout' as const,
    tagline: 'Find your people',
    features: [
      'Unlimited Council access',
      'Matched philosophical conversations — AI pairs you with fellow explorers',
      'Join a 7-week salon',
      'Earn $EXP tokens',
      'Voice conversations with thinkers',
    ],
    note: 'Covers our infrastructure costs',
  },
  {
    id: 'scholar', name: 'Scholar', price: '$49', period: '/mo', badge: null, featured: false,
    cta: 'BECOME A SCHOLAR', ctaAction: 'checkout' as const,
    tagline: 'Go deeper',
    features: [
      'Everything in Seeker',
      'Priority salon placement',
      'Guide candidacy — lead your own salon',
      '$EXP treasury when you become a Guide',
      'Scholar-level project rooms',
    ],
  },
  {
    id: 'philosopher', name: 'Philosopher', price: '$99', period: '/mo', badge: null, featured: false,
    cta: 'BECOME A PHILOSOPHER', ctaAction: 'checkout' as const,
    tagline: 'Lead the way',
    features: [
      'Everything in Scholar',
      'Advanced memory — thinkers remember everything',
      'Private ritual rooms',
      'Priority artifact generation',
      'Direct oracle consultations',
    ],
  },
  {
    id: 'oracle', name: 'Oracle', price: '$499', period: ' lifetime', badge: 'FOUNDING', featured: false,
    cta: 'BECOME AN ORACLE', ctaAction: 'checkout' as const,
    tagline: 'Founding member',
    features: [
      'Everything in Philosopher, forever',
      'Founding member status',
      'Direct line to all 6 thinkers',
      'Governance votes (HATS)',
      'Name on the founders wall at 92B South St',
    ],
  },
];

export function checkoutErrorMessage(status: number, code: string): string {
  if (status === 409 || code === 'email_required') return 'Add an email to your member profile before choosing this tier.';
  if (code === 'checkout_unconfigured') return 'Paid memberships are not open on this site yet. Nothing was charged. You can start free today.';
  if (status === 503) return 'This membership tier is not available right now. Nothing was charged.';
  if (status === 429) return 'Too many attempts. Please wait a minute and try again.';
  return 'Checkout could not start. Your membership was not changed.';
}

export const FAQS = [
  { q: 'What is a salon?', a: 'A 7-week program with 7 people. You meet 5 days a week, rotating through three tracks: Singularity & AI, Blockchain & Data Sovereignty, and The Secret & Consciousness. Every member leads sessions. Graduates become Guides with their own salon.' },
  { q: 'What are AI thinkers?', a: 'Six historical minds — Socrates, Plato, Marcus Aurelius, Nietzsche, Einstein, and Steve Jobs — reimagined as modern advisors. They debate your questions in Council Mode, remember your journey across sessions, and can create tasks, award $EXP, and take real actions on your behalf.' },
  { q: 'What is $EXP?', a: '$EXP is a non-transferable reputation token earned by participating. Attend sessions, lead discussions, complete tasks, receive awards from thinkers. It\'s proof of intellectual contribution, not a speculative asset.' },
  { q: 'Can I cancel anytime?', a: 'Yes. Monthly memberships can be cancelled at any time. Oracle (lifetime) is a one-time purchase.' },
  { q: 'What if I\'m not in Boston?', a: 'Digital salons are available for all members. Video sessions run on Daily.co. The full Council Mode and thinker experience works from anywhere.' },
];

