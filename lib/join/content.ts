// Public copy does not enable a purchase; readiness comes from the server offer.
export const FREE_SIGNUP_PATH = '/login?mode=signup&next=%2Fpractice';
export const SUPPORTER_RETURN_PATH = '/join?intent=supporter';
export const SUPPORTER_SIGNIN_PATH = `/login?next=${encodeURIComponent(SUPPORTER_RETURN_PATH)}`;
export const SUPPORTER_SIGNUP_PATH = `/login?mode=signup&next=${encodeURIComponent(SUPPORTER_RETURN_PATH)}`;
export type JoinTier = { id: string; name: string; price: string; period: string; badge: string | null; featured: boolean; cta: string; ctaAction: 'oauth' | 'checkout'; tagline: string; features: string[]; note?: string };
// Shared with the roadmap to keep the public offer consistent.
export const TIERS: JoinTier[] = [
  { id: 'explorer', name: 'Free community', price: 'Free', period: '', badge: null, featured: false, cta: 'READ FREE', ctaAction: 'oauth', tagline: 'Read and meet people', features: ['Complete local source editions, free to read', 'Find, join or host free volunteer reading Circles', 'Save your reading place with a free account', 'Community norms and reporting tools'] },
  { id: 'supporter', name: 'Supporter', price: '$10', period: '/mo', badge: 'OPTIONAL', featured: true, cta: 'REVIEW SUPPORTER OPTIONS', ctaAction: 'checkout', tagline: 'Help keep the community going', features: ['Contribute toward free books, Circles and community infrastructure', 'The same free reading and Circle access for everyone', 'A monthly subscription, only when new purchases are available'], note: 'Optional support is separate from access to the free community.' },
];
export function checkoutErrorMessage(status: number, code = ''): string {
  if (status === 401) return 'Sign in, then explicitly check your billing options again.';
  if (status === 403) return 'Billing options are not available for this account.';
  if (status === 409) return 'Billing state changed or needs review. Load current billing status before continuing.';
  if (status === 429) return 'Billing requests are temporarily limited. Wait before checking again.';
  if (code === 'sales_closed') return 'New supporter purchases are currently closed. Existing subscription management remains separate.';
  return 'Billing could not be confirmed. Load current status before making another change.';
}
export const FAQS = [
  { q: 'Do I need to pay to read or join a Circle?', a: 'No. Complete source editions and volunteer reading Circles stay free. A free account is needed for joining, hosting, posting and saved reading progress.' },
  { q: 'What does optional support provide?', a: 'Support contributes toward maintaining the free books, Circles and community infrastructure. It does not change your reading or Circle access, and it does not include a separate AI-service allowance.' },
  { q: 'How does the monthly subscription work?', a: 'The proposed supporter price is $10 USD per month. You review the current offer and confirm before a checkout session can be prepared. Stripe shows the final payment terms before you subscribe. New purchases may be closed while billing readiness is checked.' },
  { q: 'How can I manage an existing subscription?', a: 'Open Billing and explicitly load your current status. If management is available, review and open your own Stripe billing portal to view payment details or cancellation options. New-sales availability does not determine existing subscription access.' },
  { q: 'What about an older membership?', a: 'Existing Seeker, Scholar, Philosopher and Oracle records remain separate. This supporter offer does not rename them or claim they have been migrated. Billing can show when an existing account needs individual review.' },
  { q: 'Is support tax-deductible?', a: 'No tax-deductibility claim is made. Review the final amount, any displayed tax and recurring terms in Stripe before deciding.' },
];
