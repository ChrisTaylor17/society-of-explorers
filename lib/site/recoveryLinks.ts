// lib/site/recoveryLinks.ts
// Where to send someone who hit a missing page or an error. Every href must be
// a real, public, free page (checked by tests/growth/g11-recovery-pages.test.ts).

export type RecoveryLink = { href: string; label: string; note: string };

export const RECOVERY_LINKS: readonly RecoveryLink[] = [
  { href: '/practice', label: "Today's question", note: 'Answer the Daily Practice question. Free.' },
  { href: '/manifesto', label: 'Manifesto', note: 'What the Society of Explorers is for.' },
  { href: '/join', label: 'Membership', note: 'Start free, or see the paid tiers.' },
  { href: '/', label: 'Home', note: 'Back to the front door.' },
];
