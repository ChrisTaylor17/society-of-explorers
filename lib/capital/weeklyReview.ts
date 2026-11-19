import { CAPITAL_CAMPAIGN_GOAL_DOLLARS } from '@/lib/capital/campaign';
import {
  buildCapitalPrepReadiness,
  buildCapitalPrepReceipt,
  type CapitalPrepReadiness,
  type CapitalPrepReceipt,
} from '@/lib/capital/prepReceipts';

export type ReviewMetric = {
  id: string;
  label: string;
  prompt: string;
  format: 'money' | 'count' | 'percent' | 'text';
};

export type ReviewQuestion = {
  id: string;
  label: string;
  prompt: string;
};

export type ReviewDecision = {
  id: string;
  label: string;
  meaning: string;
  requiresApproval: boolean;
};

export type CapitalWeeklyReview = {
  generatedAt: string;
  storageKey: string;
  campaign: {
    name: string;
    goal: number;
    cadence: string;
    boundary: string;
  };
  metrics: ReviewMetric[];
  weeklyQuestions: ReviewQuestion[];
  decisions: ReviewDecision[];
  sevenDayLoop: string[];
  noGoRules: string[];
  readiness: CapitalPrepReadiness;
  prepReceipt: CapitalPrepReceipt;
};

export function buildCapitalWeeklyReview(): CapitalWeeklyReview {
  const generatedAt = new Date().toISOString();

  return {
    generatedAt,
    storageKey: 'soe.capital.weeklyReview.v1',
    campaign: {
      name: '92B Founding Node',
      goal: CAPITAL_CAMPAIGN_GOAL_DOLLARS,
      cadence: 'Monday review, Friday checkpoint, seven-day sprint.',
      boundary:
        'Local review only. This does not send outreach, deploy, create checkout sessions, replay webhooks, contact the landlord, mutate connected tools, print materials, or publish claims.',
    },
    metrics: [
      {
        id: 'cashCollected',
        label: 'Cash collected',
        prompt: 'Actual paid pledge, membership, or project dollars in the ledger this week.',
        format: 'money',
      },
      {
        id: 'committedPledges',
        label: 'Committed pledges',
        prompt: 'Verbal or written pledge intent that still needs approved follow-up or payment path.',
        format: 'money',
      },
      {
        id: 'pledgeConversations',
        label: 'Pledge conversations',
        prompt: 'Number of real conversations, calls, or warm replies about becoming a patron.',
        format: 'count',
      },
      {
        id: 'approvedOutreachSent',
        label: 'Approved outreach sent',
        prompt: 'Only count outreach Chris explicitly approved and actually sent outside this app.',
        format: 'count',
      },
      {
        id: 'replies',
        label: 'Replies',
        prompt: 'Meaningful replies from approved outreach, posts, in-person talks, or referrals.',
        format: 'count',
      },
      {
        id: 'callsBooked',
        label: 'Calls booked',
        prompt: 'Patron or partnership conversations scheduled for the next seven days.',
        format: 'count',
      },
      {
        id: 'referrals',
        label: 'Referrals',
        prompt: 'New warm intros offered by existing members, patrons, creators, or friends.',
        format: 'count',
      },
      {
        id: 'pageConversion',
        label: 'Page conversion',
        prompt: 'Campaign visits that became pledge starts, patron interest, or direct conversations.',
        format: 'percent',
      },
    ],
    weeklyQuestions: [
      {
        id: 'strongestStory',
        label: 'Strongest story',
        prompt: 'Which sentence, example, or promise made people understand why Society of Explorers matters?',
      },
      {
        id: 'topObjection',
        label: 'Top objection',
        prompt: 'What made people hesitate: trust, clarity, timing, price, lease uncertainty, or something else?',
      },
      {
        id: 'nextAsk',
        label: 'Next ask',
        prompt: 'What exact ask should Chris approve next: a patron tier, intro request, call batch, or page revision?',
      },
      {
        id: 'stopDoing',
        label: 'Stop doing',
        prompt: 'What activity consumed time without producing trust, money, learning, or useful relationships?',
      },
      {
        id: 'approvalNeeded',
        label: 'Approval needed',
        prompt: 'What specific external action needs explicit approval before the next sprint can move?',
      },
    ],
    decisions: [
      {
        id: 'hold',
        label: 'Hold',
        meaning: 'Keep preparing locally because the next action needs approval, env setup, or copy cleanup.',
        requiresApproval: false,
      },
      {
        id: 'refine_page',
        label: 'Refine campaign page',
        meaning: 'Improve the public story, objections, or tier clarity before broader attention.',
        requiresApproval: false,
      },
      {
        id: 'approve_batch_request',
        label: 'Request outreach approval',
        meaning: 'Prepare exact recipient batch, channel, and message text for Chris to approve.',
        requiresApproval: true,
      },
      {
        id: 'widen_outreach_request',
        label: 'Request wider push',
        meaning: 'Ask for approval to move from first warm batch to a broader approved campaign rhythm.',
        requiresApproval: true,
      },
      {
        id: 'review_physical_path',
        label: 'Review physical path',
        meaning: 'Prepare landlord/window/buildout decision materials while keeping all physical action blocked.',
        requiresApproval: true,
      },
    ],
    sevenDayLoop: [
      'Record paid cash, committed pledges, real conversations, replies, calls, referrals, strongest story, top objection, and next ask.',
      'Compare collected and committed money against the $120k campaign goal.',
      'Choose one story to strengthen on the campaign page and one objection to answer in the patron brief.',
      'Prepare exact approval text for any outreach, deployment, payment test, landlord, or window action.',
      'Decide whether the next seven days should tighten the message, widen approved outreach, or prepare the physical-node path.',
    ],
    noGoRules: [
      'Do not treat local notes as pledge ledger data.',
      'Do not store private names, emails, phone numbers, wallet addresses, payment ids, or relationship history in this browser-local review.',
      'Do not send, post, deploy, create payments, replay webhooks, import contacts, mutate connected tools, or contact the landlord from this review.',
      'Do not imply equity, debt, securities, dividends, guaranteed returns, secured lease status, finalized access, or guaranteed buildout.',
    ],
    readiness: buildCapitalPrepReadiness(),
    prepReceipt: buildCapitalPrepReceipt({
      action: 'weekly_review_prepared',
      generatedAt,
      allowedUse: 'Record redacted weekly capital learnings and prepare the next approval request without treating local notes as ledger or CRM data.',
      detail: 'Prepared the private weekly review locally. No ledger rows, CRM records, messages, checkout sessions, deploys, landlord contact, window actions, connected-tool mutations, or public posts occurred.',
    }),
  };
}
