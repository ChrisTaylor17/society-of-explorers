export const CAPITAL_CAMPAIGN_SLUG = '92b-founding-node';
export const CAPITAL_CAMPAIGN_GOAL_CENTS = 120_000_00;
export const CAPITAL_CAMPAIGN_GOAL_DOLLARS = CAPITAL_CAMPAIGN_GOAL_CENTS / 100;

export const PLEDGE_TYPES = {
  NINETY_TWO_B: '92b',
  PROJECT: 'project',
} as const;

export type PledgeType = (typeof PLEDGE_TYPES)[keyof typeof PLEDGE_TYPES];

export interface PatronTier {
  id: string;
  name: string;
  amount: number;
  exp: number;
  perks: string[];
}

export interface UseOfFundsItem {
  label: string;
  amount: number;
  summary: string;
}

export const CAPITAL_USE_OF_FUNDS: UseOfFundsItem[] = [
  {
    label: 'Location due diligence and lease path',
    amount: 30000,
    summary: 'Legal, access, repair, insurance, and terms review before any physical commitment.',
  },
  {
    label: 'Repairs and code-ready buildout planning',
    amount: 35000,
    summary: 'Early contractor, architect, permitting, and restoration planning if the Boston path is viable.',
  },
  {
    label: 'Salon equipment and pod kit',
    amount: 20000,
    summary: 'Small-room AI salon setup, recording corner, privacy-first member devices, and secure operations.',
  },
  {
    label: 'Founder wall and window activation',
    amount: 10000,
    summary: 'Conditional storefront signal, patron recognition artifacts, opening ritual materials, and public QR flow.',
  },
  {
    label: 'Creator and operating runway',
    amount: 20000,
    summary: 'Movement scripts, patron updates, community rituals, admin tooling, and campaign operations.',
  },
  {
    label: 'Contingency',
    amount: 5000,
    summary: 'Reserved for uncertainty in access, buildout, and physical-node timing.',
  },
];

export const NINETY_TWO_B_TIERS: PatronTier[] = [
  {
    id: 'supporter',
    name: 'SUPPORTER',
    amount: 25,
    exp: 50,
    perks: [
      'Your name on the digital Founders Wall',
      'Construction and campaign updates',
      '50 EXP tokens',
    ],
  },
  {
    id: 'patron',
    name: 'PATRON',
    amount: 100,
    exp: 200,
    perks: [
      'Everything in Supporter',
      'Invitation priority for the first opening ritual',
      '1 month Seeker membership credit',
      '200 EXP tokens',
    ],
  },
  {
    id: 'founder',
    name: 'RENAISSANCE FOUNDER',
    amount: 500,
    exp: 1000,
    perks: [
      'Everything in Patron',
      'Founding member status',
      'Private Council Mode session with all 6 thinkers',
      '1 year Philosopher membership credit',
      '1,000 EXP tokens',
    ],
  },
  {
    id: 'architect',
    name: 'ARCHITECT PATRON',
    amount: 1111,
    exp: 2222,
    perks: [
      'Everything in Renaissance Founder',
      'Private founding strategy session with Chris',
      'Priority invitation to the first physical-node dinner',
      'Window campaign acknowledgment if the storefront activation proceeds',
      '2,222 EXP tokens',
    ],
  },
];

export const PROJECT_PLEDGE_TIERS: PatronTier[] = [
  { id: 'supporter', name: 'SUPPORTER', amount: 25, exp: 50, perks: [] },
  { id: 'patron', name: 'PATRON', amount: 100, exp: 200, perks: [] },
  { id: 'founder', name: 'FOUNDER', amount: 500, exp: 1000, perks: [] },
  { id: 'architect', name: 'ARCHITECT', amount: 1111, exp: 2222, perks: [] },
];

export function dollarsToCents(amount: number): number {
  return Math.round(Number(amount || 0) * 100);
}

export function centsToDollars(cents: number): number {
  return Math.round(Number(cents || 0)) / 100;
}

export function getTierById(tiers: PatronTier[], id: string | null | undefined): PatronTier | null {
  if (!id) return null;
  return tiers.find((tier) => tier.id === id) || null;
}

export function getTierByLabelOrAmount(
  tiers: PatronTier[],
  label: string | null | undefined,
  amountDollars: number,
): PatronTier | null {
  const normalized = (label || '').toLowerCase();
  return (
    tiers.find((tier) => tier.name.toLowerCase() === normalized || tier.id === normalized) ||
    tiers.find((tier) => tier.amount === amountDollars) ||
    null
  );
}
