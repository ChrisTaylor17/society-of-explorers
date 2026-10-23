import { CAPITAL_CAMPAIGN_GOAL_DOLLARS, CAPITAL_USE_OF_FUNDS, type UseOfFundsItem } from '@/lib/capital/campaign';
import {
  buildCapitalPrepReadiness,
  buildCapitalPrepReceipt,
  type CapitalPrepReadiness,
  type CapitalPrepReceipt,
} from '@/lib/capital/prepReceipts';

export type PatronAsk = {
  id: string;
  label: string;
  amount: string;
  bestFor: string;
  value: string;
  askLine: string;
};

export type PatronObjection = {
  id: string;
  objection: string;
  response: string;
  followUp: string;
};

export type PatronBrief = {
  generatedAt: string;
  campaign: {
    name: string;
    goal: number;
    stance: string;
    coreLink: string;
    useOfFunds: UseOfFundsItem[];
    boundary: string;
  };
  story: {
    oneLine: string;
    short: string;
    callOpening: string;
    close: string;
  };
  askLadder: PatronAsk[];
  callFlow: Array<{
    step: string;
    prompt: string;
  }>;
  objections: PatronObjection[];
  proofPoints: string[];
  followUpTemplates: Array<{
    id: string;
    label: string;
    body: string;
  }>;
  noGoLanguage: string[];
  readiness: CapitalPrepReadiness;
  prepReceipt: CapitalPrepReceipt;
};

const coreLink = 'https://www.societyofexplorers.com/92b/fund?utm_source=warm_outreach&utm_medium=direct&utm_campaign=92b_founding_node';

export function buildCapitalPatronBrief(): PatronBrief {
  const generatedAt = new Date().toISOString();

  return {
    generatedAt,
    campaign: {
      name: '92B Founding Node',
      goal: CAPITAL_CAMPAIGN_GOAL_DOLLARS,
      stance: 'Patronage toward a conditional Boston physical node',
      coreLink,
      useOfFunds: CAPITAL_USE_OF_FUNDS,
      boundary:
        'Draft only. Do not send, publish, DM, email, text, call, post, deploy, create payments, contact the landlord, or place window materials without exact approval.',
    },
    story: {
      oneLine:
        'Society of Explorers is a private, human-centric AI network for daily philosophical practice, sovereign memory, personal AI mirrors, Great Thinker guides, and real community rituals.',
      short:
        'The 92B campaign is a 30-day patronage push toward a $120,000 goal. The Boston storefront is the intended first physical node only if lease status, repairs, access, and landlord alignment make the path viable.',
      callOpening:
        'I am building the AI network I wish existed: private memory, daily reflection, Great Thinker conversations, and a real room for people who want AI to make them more thoughtful and sovereign.',
      close:
        'The useful ask is either a patron pledge, one aligned introduction, or blunt feedback on whether the story is clear enough to earn trust.',
    },
    askLadder: [
      {
        id: 'signal',
        label: 'Signal backer',
        amount: '$25',
        bestFor: 'People who want to validate the movement without a large commitment.',
        value: 'Early supporter recognition and proof that the campaign has real human pull.',
        askLine: 'Would you put a small signal behind this and help show there is a real patron base?',
      },
      {
        id: 'patron',
        label: 'Founding patron',
        amount: '$100',
        bestFor: 'Warm believers who want access and recognition.',
        value: 'Founding recognition, campaign updates, and first access to community rituals.',
        askLine: 'Would you come in as a founding patron and help me get this first room across the line?',
      },
      {
        id: 'renaissance',
        label: 'Renaissance founder',
        amount: '$500',
        bestFor: 'People who understand the mission and want meaningful status without investment framing.',
        value: 'Founder-wall recognition if the physical node becomes viable, membership credit, and ritual priority.',
        askLine: 'Would you take one of the higher founding spots and become part of the first circle around this?',
      },
      {
        id: 'architect',
        label: 'Architect patron',
        amount: '$1,111',
        bestFor: 'High-trust believers, operators, creators, and local supporters who can anchor the campaign.',
        value: 'Architect recognition, founding access, private strategy session, membership credit, ritual priority, and artifacts.',
        askLine: 'Would you consider coming in as an Architect Patron, or introduce me to one person who immediately gets this?',
      },
      {
        id: 'intro',
        label: 'Aligned introduction',
        amount: 'No payment',
        bestFor: 'People who cannot pledge now but can compound trust.',
        value: 'One warm introduction to a patron, Boston local, creator, operator, or philosophical community builder.',
        askLine: 'If now is not the moment to pledge, is there one person you think would understand this immediately?',
      },
    ],
    callFlow: [
      {
        step: 'Open with the mission',
        prompt: 'Name the human problem: AI is powerful, but most products do not protect sovereignty, reflection, memory control, or community.',
      },
      {
        step: 'Explain the product',
        prompt: 'Describe daily philosophical practice, encrypted personal pods, personal AI mirrors, Great Thinker guides, creator rituals, and private collective intelligence.',
      },
      {
        step: 'Frame 92B carefully',
        prompt: 'Say the storefront is an intended first physical node only if the location path is viable. Do not imply it is secured, repaired, permitted, open, or guaranteed.',
      },
      {
        step: 'Make the ask',
        prompt: 'Ask for a pledge, an introduction, or feedback. Keep it patronage, not investment.',
      },
      {
        step: 'Capture the next step',
        prompt: 'Record interest, objection, intro, or follow-up locally. Do not send anything unless the exact recipient/channel/copy is approved.',
      },
    ],
    objections: [
      {
        id: 'investment',
        objection: 'Is this an investment?',
        response:
          'No. It is patronage. Patrons receive access, recognition, community artifacts, ritual priority, membership credit, and founding status. They do not receive equity, debt, securities, dividends, or promised financial return.',
        followUp: 'If someone wants financial upside, do not reshape this as an investment. Keep them out of the patronage ask.',
      },
      {
        id: 'space-secured',
        objection: 'Is the Boston space secured?',
        response:
          'No. The correct language is conditional: it is the intended first physical node if lease status, repairs, access, and landlord alignment make the path viable.',
        followUp: 'Offer to share updates after the campaign proves serious patron demand and the physical path is responsible.',
      },
      {
        id: 'location-fails',
        objection: 'What happens if that location does not work?',
        response:
          'The funds still support the same mission: the private AI network, encrypted personal pods, creator rituals, and a responsible future physical-node path. Updates should explain the decision and next use of funds.',
        followUp: 'Ask whether the mission still feels worth backing without that specific storefront.',
      },
      {
        id: 'goal',
        objection: 'Why $120,000?',
        response:
          'It is enough to prove serious patron demand, fund due diligence and buildout planning, support a window/founder-wall activation if viable, and create operating runway while digital membership and project pledges grow.',
        followUp: 'Tie the amount to proof of demand, not guaranteed buildout completion.',
      },
      {
        id: 'timing',
        objection: 'Why now?',
        response:
          'AI is moving fast, but most products are optimized for extraction, dependency, and generic output. Society of Explorers is built around sovereignty, memory control, reflection, and community.',
        followUp: 'Ask whether they know one person worried about the same direction of AI.',
      },
      {
        id: 'privacy',
        objection: 'How do I know this will not become another surveillance product?',
        response:
          'The product direction is sovereign by design: encrypted personal pods, inspectable memory, correction and do-not-use controls, wallet-sealed receipts, and aggregate intelligence without unnecessary personal exposure.',
        followUp: 'Point to the privacy-first product surfaces after they are ready for review.',
      },
    ],
    proofPoints: [
      'Private Capital Command Center exists locally with aggregate metrics and no raw donor PII in the admin response.',
      'Pledge ledger, metadata, webhook, and duplicate-counting guards are built for test verification.',
      'Sovereign pod export includes a manifest before encrypted download and excludes raw payload from preview.',
      'Live Council voice defaults transcript and memory retention off until the member opts in.',
      'Memory facts can be corrected, retracted, marked do-not-use, or forgotten.',
      'External-action approvals are tracked in a private local checklist and do not execute actions.',
    ],
    followUpTemplates: [
      {
        id: 'feedback',
        label: 'Feedback follow-up',
        body:
          'Thank you for reading this. The most useful response is blunt: does the story feel clear, credible, and worth backing, or does it need a simpler first ask?',
      },
      {
        id: 'intro',
        label: 'Introduction follow-up',
        body:
          'If one person comes to mind who cares about human-centric AI, privacy, philosophy, or Boston community spaces, an introduction would be more useful than a broad share.',
      },
      {
        id: 'higher-tier',
        label: 'Higher-tier follow-up',
        body:
          'If the mission resonates strongly, the Architect Patron tier is meant for people who want to anchor the first circle: recognition, founding access, ritual priority, membership credit, artifacts, and a private strategy session. It is patronage, not investment.',
      },
    ],
    noGoLanguage: [
      'Do not say the lease is secured, the space is open, or the buildout is guaranteed.',
      'Do not use investor, equity, debt, securities, dividends, profit, return, or upside framing except to explicitly reject it.',
      'Do not promise public recognition if a patron wants privacy.',
      'Do not claim funds are restricted only to the storefront if the viable-location condition is not met.',
      'Do not contact, send, publish, or post from this brief without exact approval.',
    ],
    readiness: buildCapitalPrepReadiness(),
    prepReceipt: buildCapitalPrepReceipt({
      action: 'patron_brief_prepared',
      generatedAt,
      allowedUse: 'Rehearse patron calls, objections, ask ladder, and follow-up copy before Chris approves any real outreach.',
      detail: 'Prepared the private patron brief locally. No calls, messages, emails, payments, deploys, landlord contact, window placement, or publishing occurred.',
    }),
  };
}
