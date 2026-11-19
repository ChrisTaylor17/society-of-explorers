import {
  buildCapitalPrepReadiness,
  buildCapitalPrepReceipt,
  type CapitalPrepReadiness,
  type CapitalPrepReceipt,
} from './prepReceipts';

const coreCampaignLink = 'https://www.societyofexplorers.com/92b/fund?utm_source=warm_outreach&utm_medium=direct&utm_campaign=92b_founding_node';

export type OutreachSegment = {
  id: string;
  label: string;
  priority: number;
  whyItMatters: string;
  bestAsk: string;
  recommendedDraftId: string;
  utmLink: string;
};

export type OutreachDraft = {
  id: string;
  label: string;
  subject: string;
  body: string;
  bestFor: string;
  riskCheck: string;
};

export type OutreachBatchTemplate = {
  id: string;
  label: string;
  segmentId: string;
  draftId: string;
  targetSlots: number;
  ask: string;
  approvalText: string;
};

export type CapitalOutreachLab = {
  generatedAt: string;
  storageKey: string;
  campaignLink: string;
  boundary: string;
  localStateWarning: string;
  segments: OutreachSegment[];
  drafts: OutreachDraft[];
  batchTemplates: OutreachBatchTemplate[];
  dailyReview: string[];
  noGoRules: string[];
  readiness: CapitalPrepReadiness;
  prepReceipt: CapitalPrepReceipt;
};

const segments: OutreachSegment[] = [
  {
    id: 'warm-believers',
    label: 'Warm believers',
    priority: 1,
    whyItMatters: 'Highest trust and fastest signal for the first $10k.',
    bestAsk: 'Start with one $25 Supporter pledge or one aligned introduction.',
    recommendedDraftId: 'supporter-first-pledge',
    utmLink: coreCampaignLink,
  },
  {
    id: 'boston-locals',
    label: 'Boston locals',
    priority: 2,
    whyItMatters: 'Can validate whether the conditional physical-node story feels credible.',
    bestAsk: 'Read and react to the Boston storefront framing.',
    recommendedDraftId: 'boston-local',
    utmLink: 'https://www.societyofexplorers.com/92b/fund?utm_source=boston_warm&utm_medium=direct&utm_campaign=92b_founding_node',
  },
  {
    id: 'operators',
    label: 'Operators and builders',
    priority: 3,
    whyItMatters: 'Can sharpen credibility, funnel clarity, and operational risk before launch.',
    bestAsk: 'Give blunt feedback before asking for money.',
    recommendedDraftId: 'operator-feedback',
    utmLink: coreCampaignLink,
  },
  {
    id: 'creators',
    label: 'Creators and philosophers',
    priority: 4,
    whyItMatters: 'Can amplify the mission authentically if the story is crisp.',
    bestAsk: 'Share the story or refer one patron.',
    recommendedDraftId: 'creator-philosopher',
    utmLink: 'https://www.societyofexplorers.com/92b/fund?utm_source=creator_referral&utm_medium=direct&utm_campaign=92b_founding_node',
  },
  {
    id: 'past-leads',
    label: 'Past founding-interest leads',
    priority: 5,
    whyItMatters: 'Already expressed some interest and may need a clearer first ask.',
    bestAsk: 'Re-engage around the $120k push.',
    recommendedDraftId: 'follow-up',
    utmLink: coreCampaignLink,
  },
];

const drafts: OutreachDraft[] = [
  {
    id: 'supporter-first-pledge',
    label: 'First Supporter Pledge',
    subject: 'Would you be one of the first Society supporters?',
    bestFor: 'The smallest warm ask after production promotion: one trusted person who can validate the live pledge path.',
    riskCheck: 'One recipient only; patronage only; no investment, pressure, or secured-location language.',
    body:
      'I am opening the first small patronage path for Society of Explorers: a privacy-first AI salon network built around philosophical practice, personal AI mirrors, encrypted memory, and real human community.\n\nThe first physical node is planned for Boston only if the location, repairs, access, and landlord path are viable. The smallest tracked pledge is the $25 Supporter tier. It is patronage, not equity or a financial return.\n\nIf you want to be one of the first people to make the signal real, the reviewed funding page is here:\n\n{campaign_link}',
  },
  {
    id: 'architect-patron',
    label: 'Architect Patron',
    subject: 'Founding the first Society of Explorers room',
    bestFor: 'Warm believers who may pledge at the highest founding tier or make a strong intro.',
    riskCheck: 'Patronage only; no investment or secured-location language.',
    body:
      'I am building Society of Explorers as a private, human-centric AI network: daily philosophical practice, personal AI mirrors, encrypted memory, Great Thinker guides, and real community rituals.\n\nThere is a prominent Boston storefront that could become the first physical node if the lease/buildout/landlord path is viable. I am raising toward a $120,000 patronage goal before I take the next physical step.\n\nThe highest founding tier is the $1,111 Architect Patron: recognition, founding access, ritual priority, membership credit, and a private founding strategy session. This is patronage, not investment or financial return.\n\nWould you be open to looking at the campaign page and telling me whether this feels worth backing or introducing?\n\n{campaign_link}',
  },
  {
    id: 'operator-feedback',
    label: 'Builder / Operator Friend',
    subject: 'Can I get your operator eye on this?',
    bestFor: 'Operators who can diagnose clarity, credibility, and funnel risk before broader launch.',
    riskCheck: 'Ask for feedback first unless the relationship is clearly high-trust.',
    body:
      'I am turning Society of Explorers into a real patronage engine around a $120,000 push.\n\nThe campaign funds the digital network and, if viable, the first Boston physical node: a small AI/philosophy salon with encrypted personal pods, Great Thinker conversations, creator rituals, and member-owned data.\n\nI am not asking you to judge it as a normal startup pitch. I want your operator read: is the page clear, credible, and worth sharing with a few aligned people?\n\n{campaign_link}',
  },
  {
    id: 'creator-philosopher',
    label: 'Creator / Philosopher',
    subject: 'A private AI salon for serious people',
    bestFor: 'Creators, writers, philosophers, and hosts who can refer one aligned patron.',
    riskCheck: 'Keep the ask personal; do not ask for public posting without approval.',
    body:
      'I am building Society of Explorers for people who want AI to make them more thoughtful, sovereign, and connected, not more addicted or surveilled.\n\nThe 92B campaign is a 30-day patronage push toward the first physical node in Boston if the location path becomes viable. Patrons get founding recognition, access, rituals, and artifacts, not financial return.\n\nI would love your take on the story and whether you know one person who would understand this immediately.\n\n{campaign_link}',
  },
  {
    id: 'boston-local',
    label: 'Boston / Local Angle',
    subject: 'This could become a Boston AI salon',
    bestFor: 'Boston-aware relationships who can judge the physical-node story.',
    riskCheck: 'Say may become, not secured, open, ready, or guaranteed.',
    body:
      'There is a prominent Boston storefront that may be able to become the first Society of Explorers physical node.\n\nThe idea is simple: a room for human-centric AI, philosophy, encrypted personal memory, creator rituals, and small gatherings that make technology feel humane again.\n\nThe space is not being represented as secured or ready. The campaign is intentionally conditional: raise toward $120,000, prove the patron base, then decide whether securing and building out the location is responsible.\n\nWould you be willing to read the campaign and give me your honest signal?\n\n{campaign_link}',
  },
  {
    id: 'follow-up',
    label: 'Follow-Up',
    subject: 'Quick follow-up on 92B',
    bestFor: 'Past leads or warm relationships who already heard some version of the mission.',
    riskCheck: 'No pressure framing; ask for one aligned introduction if a pledge is not right.',
    body:
      'Quick follow-up because this is the thing I am putting real energy behind.\n\nSociety of Explorers is the AI network I wish existed: private memory, daily philosophical practice, Great Thinker guides, and a real community layer.\n\nThe $120,000 patronage campaign is the bridge from digital movement to first physical node if the Boston location path becomes viable.\n\nNo pressure to pledge. If it resonates, the most useful thing may be one aligned introduction.\n\n{campaign_link}',
  },
];

const batchTemplates: OutreachBatchTemplate[] = [
  {
    id: 'one-supporter-validation',
    label: 'One Supporter validation',
    segmentId: 'warm-believers',
    draftId: 'supporter-first-pledge',
    targetSlots: 1,
    ask: 'Ask exactly one trusted person for the smallest tracked $25 Supporter pledge after production is promoted and verified.',
    approvalText: 'Approve sending this outreach batch: [one warm recipient], [channel], First Supporter Pledge draft, [send window].',
  },
  {
    id: 'first-10-architects',
    label: 'First 10 Architect asks',
    segmentId: 'warm-believers',
    draftId: 'architect-patron',
    targetSlots: 10,
    ask: 'Find ten high-trust people who could pledge, introduce an Architect Patron, or pressure-test the offer.',
    approvalText: 'Approve sending this outreach batch: [10 recipients], [channels], Architect Patron draft, [send window].',
  },
  {
    id: 'boston-signal-5',
    label: 'Boston signal batch',
    segmentId: 'boston-locals',
    draftId: 'boston-local',
    targetSlots: 5,
    ask: 'Get precise feedback on whether the conditional storefront story is credible and worth backing.',
    approvalText: 'Approve sending this outreach batch: [5 Boston-local recipients], [channels], Boston / Local Angle draft, [send window].',
  },
  {
    id: 'operator-feedback-8',
    label: 'Operator feedback batch',
    segmentId: 'operators',
    draftId: 'operator-feedback',
    targetSlots: 8,
    ask: 'Improve page clarity and trust before widening the campaign.',
    approvalText: 'Approve sending this outreach batch: [8 operator recipients], [channels], Builder / Operator Friend draft, [send window].',
  },
  {
    id: 'creator-intro-6',
    label: 'Creator intro batch',
    segmentId: 'creators',
    draftId: 'creator-philosopher',
    targetSlots: 6,
    ask: 'Ask for one aligned intro, not a broad public post.',
    approvalText: 'Approve sending this outreach batch: [6 creator/philosopher recipients], [channels], Creator / Philosopher draft, [send window].',
  },
];

export function buildCapitalOutreachLab(): CapitalOutreachLab {
  const generatedAt = new Date().toISOString();

  return {
    generatedAt,
    storageKey: 'soe.capital.outreachLab.v1',
    campaignLink: coreCampaignLink,
    boundary:
      'Draft lab only. Do not send, schedule, import contacts, DM, email, text, call, post, publish, or automate outreach without exact approval of recipient, channel, and final copy.',
    localStateWarning:
      'Use redacted labels only. Local browser notes are preparation state, not authorization and not a CRM.',
    segments,
    drafts,
    batchTemplates,
    dailyReview: [
      'Which batch is the smallest useful next request?',
      'Which exact recipient labels are ready for Chris to approve?',
      'Which objection should be answered before sending anything?',
      'Which one intro would most improve the odds of reaching the first $10k signal milestone?',
      'Does every draft still avoid investment, secured-location, and guaranteed-buildout language?',
    ],
    noGoRules: [
      'Do not paste private emails, phone numbers, or sensitive relationship context into local notes.',
      'Do not import contacts from Gmail, Slack, Drive, Sheets, or any other connected tool without exact approval.',
      'Do not send, schedule, DM, email, call, text, or post from this lab.',
      'Do not imply the Boston location is secured, repaired, permitted, open, or guaranteed.',
      'Do not describe patronage as equity, debt, securities, dividends, profit, upside, or financial return.',
    ],
    readiness: buildCapitalPrepReadiness(),
    prepReceipt: buildCapitalPrepReceipt({
      action: 'outreach_lab_loaded',
      generatedAt,
      allowedUse: 'Prepare redacted local outreach batches and exact approval text for Chris review.',
      detail: 'Loaded local outreach drafts only. No messages were sent, scheduled, imported, charged, deployed, placed, or published.',
    }),
  };
}
