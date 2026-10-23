import { CAPITAL_CAMPAIGN_GOAL_DOLLARS, NINETY_TWO_B_TIERS, type PatronTier } from '@/lib/capital/campaign';
import {
  buildCapitalPrepReadiness,
  buildCapitalPrepReceipt,
  type CapitalPrepReadiness,
  type CapitalPrepReceipt,
} from '@/lib/capital/prepReceipts';

type TierId = 'supporter' | 'patron' | 'founder' | 'architect';

type ScenarioCounts = Record<TierId, number>;

export type CapitalScenario = {
  id: string;
  label: string;
  thesis: string;
  counts: ScenarioCounts;
  total: number;
  surplus: number;
  patrons: number;
  averagePledge: number;
  mix: Array<{
    tierId: TierId;
    label: string;
    amount: number;
    count: number;
    total: number;
    shareOfGoal: number;
  }>;
  operatorNote: string;
};

export type CapitalPaceTarget = {
  days: number;
  dailyTarget: number;
  weeklyTarget: number;
  architectEquivalentPerWeek: number;
  founderEquivalentPerWeek: number;
};

export type CapitalMilestone = {
  label: string;
  amount: number;
  purpose: string;
  status: 'not_started' | 'in_progress' | 'complete';
};

export type CapitalScenarioPlanner = {
  generatedAt: string;
  campaign: {
    name: string;
    goal: number;
    boundary: string;
    physicalNodeCondition: string;
  };
  tierReference: Array<{
    id: TierId;
    label: string;
    amount: number;
  }>;
  paceTargets: CapitalPaceTarget[];
  milestones: CapitalMilestone[];
  scenarios: CapitalScenario[];
  nextOperatorMoves: string[];
  noGoRules: string[];
  readiness: CapitalPrepReadiness;
  prepReceipt: CapitalPrepReceipt;
};

const scenarioInputs: Array<{
  id: string;
  label: string;
  thesis: string;
  counts: ScenarioCounts;
  operatorNote: string;
}> = [
  {
    id: 'high-trust-compact',
    label: 'High-trust compact circle',
    thesis: 'A small number of strongly aligned patrons carry most of the campaign.',
    counts: {
      architect: 90,
      founder: 30,
      patron: 40,
      supporter: 41,
    },
    operatorNote: 'Best if Chris can personally reach high-trust believers who already understand the mission.',
  },
  {
    id: 'architect-led',
    label: 'Architect-led first circle',
    thesis: 'Architect Patrons anchor credibility, then Founders and Patrons fill the middle.',
    counts: {
      architect: 60,
      founder: 70,
      patron: 150,
      supporter: 134,
    },
    operatorNote: 'Best fit for the 92B story: enough high-signal patrons to justify a physical-node conversation.',
  },
  {
    id: 'balanced-community',
    label: 'Balanced community campaign',
    thesis: 'A wider mix reduces dependence on the highest tier while still requiring meaningful founder energy.',
    counts: {
      architect: 40,
      founder: 80,
      patron: 250,
      supporter: 423,
    },
    operatorNote: 'Useful if creator content and warm introductions generate more mid-tier participation.',
  },
  {
    id: 'community-wide',
    label: 'Community-wide patronage',
    thesis: 'The campaign proves breadth more than elite concentration.',
    counts: {
      architect: 20,
      founder: 80,
      patron: 350,
      supporter: 912,
    },
    operatorNote: 'Requires a working public funnel and content engine; do not start here before the checkout path is verified.',
  },
];

const milestones: CapitalMilestone[] = [
  {
    label: 'Signal',
    amount: 10_000,
    purpose: 'Enough proof to justify deeper page, payment, and call iteration.',
    status: 'not_started',
  },
  {
    label: 'First circle',
    amount: 25_000,
    purpose: 'Enough patron interest to discuss the physical-node path with more credibility after approval.',
    status: 'not_started',
  },
  {
    label: 'Viability review',
    amount: 60_000,
    purpose: 'Enough demand to review lease/buildout feasibility seriously without claiming the location is secured.',
    status: 'not_started',
  },
  {
    label: 'Campaign goal',
    amount: CAPITAL_CAMPAIGN_GOAL_DOLLARS,
    purpose: 'Full 92B campaign target for the digital network and conditional first physical node path.',
    status: 'not_started',
  },
];

function tierById(id: TierId): PatronTier {
  const tier = NINETY_TWO_B_TIERS.find((item) => item.id === id);
  if (!tier) throw new Error(`Missing capital tier: ${id}`);
  return tier;
}

function roundDollars(value: number): number {
  return Math.round(value);
}

function buildScenario(input: (typeof scenarioInputs)[number]): CapitalScenario {
  const mix = (Object.entries(input.counts) as Array<[TierId, number]>).map(([tierId, count]) => {
    const tier = tierById(tierId);
    const total = tier.amount * count;
    return {
      tierId,
      label: tier.name,
      amount: tier.amount,
      count,
      total,
      shareOfGoal: total / CAPITAL_CAMPAIGN_GOAL_DOLLARS,
    };
  });
  const total = mix.reduce((sum, item) => sum + item.total, 0);
  const patrons = mix.reduce((sum, item) => sum + item.count, 0);

  return {
    id: input.id,
    label: input.label,
    thesis: input.thesis,
    counts: input.counts,
    total,
    surplus: total - CAPITAL_CAMPAIGN_GOAL_DOLLARS,
    patrons,
    averagePledge: patrons > 0 ? roundDollars(total / patrons) : 0,
    mix,
    operatorNote: input.operatorNote,
  };
}

function buildPaceTargets(): CapitalPaceTarget[] {
  return [30, 21, 14, 7].map((days) => {
    const dailyTarget = CAPITAL_CAMPAIGN_GOAL_DOLLARS / days;
    const weeklyTarget = dailyTarget * 7;
    return {
      days,
      dailyTarget: roundDollars(dailyTarget),
      weeklyTarget: roundDollars(weeklyTarget),
      architectEquivalentPerWeek: Math.ceil(weeklyTarget / tierById('architect').amount),
      founderEquivalentPerWeek: Math.ceil(weeklyTarget / tierById('founder').amount),
    };
  });
}

export function buildCapitalScenarioPlanner(): CapitalScenarioPlanner {
  const generatedAt = new Date().toISOString();

  return {
    generatedAt,
    campaign: {
      name: '92B Founding Node',
      goal: CAPITAL_CAMPAIGN_GOAL_DOLLARS,
      boundary:
        'Private planning only. This surface does not create checkout sessions, send outreach, deploy, contact the landlord, or imply that the Boston space is secured.',
      physicalNodeCondition:
        'The Boston storefront remains an intended first physical node only if lease status, repairs, access, and landlord alignment make the path viable.',
    },
    tierReference: (['supporter', 'patron', 'founder', 'architect'] as TierId[]).map((id) => {
      const tier = tierById(id);
      return {
        id,
        label: tier.name,
        amount: tier.amount,
      };
    }),
    paceTargets: buildPaceTargets(),
    milestones,
    scenarios: scenarioInputs.map(buildScenario),
    nextOperatorMoves: [
      'Use the Architect-led scenario as the default call strategy until real conversion data exists.',
      'Aim for the first $10k signal milestone before widening outreach beyond high-trust relationships.',
      'Use /capital/patron-brief to rehearse the ask, then /capital/approvals before any real send or call action.',
      'Review scenario assumptions weekly against actual pledge ledger totals after Stripe tests are approved and live.',
    ],
    noGoRules: [
      'Do not treat scenario math as pledged revenue.',
      'Do not create checkout sessions from this planner.',
      'Do not claim the lease, buildout, or storefront activation is secured.',
      'Do not use investment-return framing to make the numbers easier.',
    ],
    readiness: buildCapitalPrepReadiness(),
    prepReceipt: buildCapitalPrepReceipt({
      action: 'scenario_planner_prepared',
      generatedAt,
      allowedUse: 'Compare patron tier mixes, pace targets, and milestones before any approved outreach, payment, or deployment action.',
      detail: 'Prepared private scenario math locally. No pledges, payments, checkout sessions, outreach, deploys, landlord contact, window actions, or public claims occurred.',
    }),
  };
}
