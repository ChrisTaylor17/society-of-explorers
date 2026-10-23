#!/usr/bin/env node

const allowedArgs = new Set(['--json']);
const args = process.argv.slice(2);
const unknownArgs = args.filter((arg) => !allowedArgs.has(arg));

if (unknownArgs.length > 0) {
  console.error(`Unknown paid-traffic packet argument(s): ${unknownArgs.join(', ')}`);
  console.error('Usage: npm run capital:paid-traffic:packet -- [--json]');
  process.exit(1);
}

const promotedPreviewDeploymentId = 'dpl_GAdFZyzEinPbfqXRrrkUPaqRryQC';
const promotedPreviewUrl = 'https://society-of-explorers-jzd7yvty1-chris-projects-03dec906.vercel.app';
const productionDeploymentId = 'dpl_2hkoxV6BewU9RCWtEhWUD5XUuTJR';
const productionDeploymentUrl = 'https://society-of-explorers-kaxpq0qxn-chris-projects-03dec906.vercel.app';
const productionFundUrl = 'https://www.societyofexplorers.com/92b/fund';
const productionPromotionReceipt =
  'Preview deployment dpl_GAdFZyzEinPbfqXRrrkUPaqRryQC was promoted to production as dpl_2hkoxV6BewU9RCWtEhWUD5XUuTJR for www.societyofexplorers.com and societyofexplorers.com on 2026-06-19.';
const tierContract = [
  { id: 'supporter', label: 'SUPPORTER', amount: 25, amountCents: 2500 },
  { id: 'patron', label: 'PATRON', amount: 100, amountCents: 10000 },
  { id: 'founder', label: 'RENAISSANCE FOUNDER', amount: 500, amountCents: 50000 },
  { id: 'architect', label: 'ARCHITECT PATRON', amount: 1111, amountCents: 111100 },
];
const minimumLiveCheckoutValidationApproval =
  'Approve creating checkout sessions or payments for one 92B Supporter pledge validation from https://www.societyofexplorers.com/92b/fund using live mode.';
const firstSupporterOutreachApproval =
  'Approve sending this outreach batch: [one warm recipient], [channel], First Supporter Pledge draft, [send window].';
const firstSupporterDraft =
  'I am opening the first small patronage path for Society of Explorers: a privacy-first AI salon network built around philosophical practice, personal AI mirrors, encrypted memory, and real human community.\n\nThe first physical node is planned for Boston only if the location, repairs, access, and landlord path are viable. The smallest tracked pledge is the $25 Supporter tier. It is patronage, not equity or a financial return.\n\nIf you want to be one of the first people to make the signal real, the reviewed funding page is here:\n\n[production funding link].';
const postPromotionVerifyCommand = `npm run capital:post-promotion:verify -- --vercel-read --stripe-read --deployment=${promotedPreviewUrl}`;
const measurementCommands = [
  'npx vercel env run --environment=production -- npm run capital:live-payment:readiness -- --stripe-read',
  'npx vercel env run --environment=production -- npm run capital:revenue:snapshot -- --stripe-read',
  `npm run capital:profit:gate -- --vercel-read --stripe-read --deployment=${promotedPreviewUrl}`,
  `npm run capital:first-revenue:readiness -- --vercel-read --stripe-read --deployment=${promotedPreviewUrl}`,
];

const packet = {
  generatedAt: new Date().toISOString(),
  status: 'ready_for_first_revenue_approval',
  noExternalActionReceipt:
    'Prepared a local paid-traffic packet only. No deploy, promotion, checkout session, payment, webhook replay, outreach send, landlord contact, window placement, connected-tool mutation, or public post occurred.',
  prerequisiteGate: {
    productionDeploymentId,
    productionDeploymentUrl,
    promotedPreviewDeploymentId,
    promotedPreviewUrl,
    productionFundUrl,
    productionPromotionReceipt,
    productionVerifier: 'npm run capital:production:verify',
  },
  postPromotionVerification: [
    postPromotionVerifyCommand,
    'npm run capital:production:verify',
    ...measurementCommands,
  ],
  liveCheckoutValidation: {
    minimumApprovalText: minimumLiveCheckoutValidationApproval,
    requestBodyShape: {
      tierId: 'supporter',
      email: '[approved operator/customer email]',
      utm: {
        utm_source: 'codex',
        utm_medium: 'validation',
        utm_campaign: '92b-live-checkout',
      },
    },
    expectedServerDerivedTier: tierContract[0],
    expectedMetadata: {
      type: '92b_pledge',
      pledge_type: '92b',
      campaign_slug: '92b-founding-node',
      tier_id: 'supporter',
      tier_label: 'SUPPORTER',
      amount: '25',
      amount_cents: '2500',
      source: '92b_fund_page',
    },
    stopRules: [
      'Stop before paying if the Stripe-hosted Checkout page is not checkout.stripe.com.',
      'Stop before paying if the Checkout amount is not USD $25.00 for SUPPORTER.',
      'Stop before paying if the return URL is not https://www.societyofexplorers.com/92b/fund.',
      'Stop if the route accepts a caller-supplied amount, label, product, or non-allowlisted UTM key.',
    ],
  },
  tierContract,
  firstConversionSequence: {
    status: 'ready_for_exact_first_conversion_approval',
    minimumMeasurableWin:
      'One verified paid 92B Checkout session on the production funding page. A Supporter pledge is the smallest live validation unit; do not call it profit until the Stripe cash contribution snapshot is positive and operating expenses are separately reviewed.',
    likelyStripeContributionInflection:
      'A single paid Supporter session should be enough to test whether Stripe cash contribution turns positive from the current negative balance, but the revenue snapshot is the only authority.',
    exactSequence: [
      'Production promotion is complete; run production verification and stop on any failure.',
      'Get exact approval for exactly one first-conversion action.',
      'Execute only the approved action, with the approved recipient/channel/payment mode/window.',
      'Run the aggregate measurement commands and first-revenue readiness immediately after the action and again after Stripe webhook settlement if needed.',
      'If paid sessions remain zero, choose one next approved action; do not widen outreach or paid traffic without a new exact approval.',
    ],
    measurementCommands,
    approvalReadyActions: [
      {
        id: 'supporter-live-checkout-validation',
        approvalText: minimumLiveCheckoutValidationApproval,
        goal: 'Confirm the production funding page can create one live-mode $25 Supporter Checkout and return through the verified webhook path.',
        reviewedLink: `${productionFundUrl}?utm_source=codex&utm_medium=validation&utm_campaign=92b-live-checkout`,
        expectedResult: 'paidCheckoutSessionsLast30Days increases and paidNinetyTwoBTiersLast30Days.supporter appears after successful payment/webhook settlement.',
      },
      {
        id: 'one-supporter-validation-outreach',
        approvalText: firstSupporterOutreachApproval,
        goal: 'Ask one warm believer for the smallest tracked pledge so the first production conversion can be measured without widening outreach.',
        draftVersion: 'first-supporter-pledge-v1',
        draft: firstSupporterDraft,
        reviewedLink: `${productionFundUrl}?utm_source=warm_outreach&utm_medium=direct&utm_campaign=92b_founding_node&utm_content=supporter_v1`,
        expectedResult: 'At least one tracked Supporter, Patron, Founder, or Architect Checkout session if the recipient chooses to pledge.',
        localPrepSurface: '/capital/outreach-lab',
        localBatchId: 'one-supporter-validation',
      },
      {
        id: 'one-architect-call-ask',
        approvalText:
          'Approve sending this outreach batch: [one architect-patron candidate], [channel], [92b-architect-call-v1 draft below], [send window].',
        goal: 'Ask one high-trust candidate for a founding strategy conversation that can lead to an Architect, Founder, Patron, or Supporter pledge.',
        draftVersion: '92b-architect-call-v1',
        draft:
          'I am assembling the first patron circle for Society of Explorers. The practical target is $120k for due diligence, viable terms, repairs, and a privacy-first salon room if the Boston path comes together. This is patronage with recognition, access, and founding artifacts, not an investment or promised return. Would you be open to a 20-minute founding strategy conversation this week?',
        reviewedLink: `${productionFundUrl}?utm_source=warm_outreach&utm_medium=direct&utm_campaign=92b_founding_node&utm_content=architect_call_v1`,
        expectedResult: 'A qualified conversation or tracked pledge intent; no send occurs without approved recipient/channel/draft/window.',
      },
    ],
  },
  firstPaidTrafficOptions: [
    {
      id: 'one-supporter-validation-outreach',
      purpose:
        'Ask exactly one approved warm recipient for the $25 Supporter pledge after production promotion and verification.',
      approvalText: firstSupporterOutreachApproval,
      localPrep:
        'Use /capital/outreach-lab, the One Supporter validation batch, and the First Supporter Pledge draft; keep recipient labels redacted locally until Chris approves the exact recipient/channel/window.',
      stopRule:
        'Stop if production is not promoted and verified, or if recipient, channel, copy, send window, link target, or pledge framing differs from the approval.',
    },
    {
      id: 'live-checkout-validation',
      purpose:
        'Validate the production 92B funding checkout path with live-mode Checkout only after production verification and exact payment approval.',
      approvalText:
        'Approve creating checkout sessions or payments for 92B funding page pledge validation using live mode.',
      localPrep:
        'Use the verified funding page, tier list, checkout metadata guard, and webhook dedupe guard before any live Checkout session is created.',
      stopRule:
        'Stop before sharing or paying if mode, domain, amount, tier metadata, return URL, or Stripe-hosted destination differs from the reviewed 92B flow.',
    },
    {
      id: 'warm-founder-outreach',
      purpose:
        'Start with a small warm batch that asks for patronage without importing contacts or sending anything until the exact recipient/channel/draft/window is approved.',
      approvalText:
        'Approve sending this outreach batch: [recipients], [channels], [final draft/version], [send window].',
      localPrep:
        'Use /capital/outreach-lab and the founder outreach drafts with redacted slots; keep UTM links pointed at the verified production funding page.',
      stopRule:
        'Stop if recipient, channel, copy, send window, or link target differs from the approval.',
    },
    {
      id: 'window-qr-activation',
      purpose:
        'Prepare physical discovery only after production is updated, the QR destination is verified on mobile, and placement permission is settled.',
      approvalText:
        'Approve printing or placing the 92B window sign at [location] using [copy/version] and QR destination [url].',
      localPrep:
        'Use /capital/window-kit, the QR SVG, and the conditional physical-node language; do not imply a secured lease, open location, or guaranteed buildout.',
      stopRule:
        'Stop if the location, copy, QR destination, permission status, or public claim differs from the approval.',
    },
  ],
  first24HourLoop: [
    'Production promotion is complete; run the post-promotion verification commands and stop on any failure.',
    'Choose exactly one paid-traffic option and obtain its exact approval before action.',
    'After the approved action, run the aggregate revenue snapshot, profit gate, and first-revenue readiness again.',
    'Do not claim profit until Stripe cash contribution is positive and operating expenses have been separately reviewed.',
  ],
};

if (args.includes('--json')) {
  console.log(JSON.stringify(packet, null, 2));
} else {
  console.log('Capital Paid-Traffic Packet');
  console.log(`Generated: ${packet.generatedAt}`);
  console.log(`Status: ${packet.status}`);
  console.log(`Production funding URL: ${productionFundUrl}`);
  console.log(`Production deployment: ${productionDeploymentId}`);
  console.log(`Promoted preview: ${promotedPreviewDeploymentId}`);
  console.log(`Receipt: ${packet.noExternalActionReceipt}`);
  console.log('\nProduction promotion receipt');
  console.log(productionPromotionReceipt);
  console.log('\nPost-promotion verification');
  for (const command of packet.postPromotionVerification) {
    console.log(`- ${command}`);
  }
  console.log('\nMinimum live Checkout validation approval');
  console.log(minimumLiveCheckoutValidationApproval);
  console.log('Expected server-derived validation contract');
  console.log(`- tierId: ${packet.liveCheckoutValidation.requestBodyShape.tierId}`);
  console.log(`- amount: USD $${packet.liveCheckoutValidation.expectedServerDerivedTier.amount}.00`);
  console.log(`- metadata: ${JSON.stringify(packet.liveCheckoutValidation.expectedMetadata)}`);
  console.log('Live Checkout validation stop rules');
  for (const rule of packet.liveCheckoutValidation.stopRules) {
    console.log(`- ${rule}`);
  }
  console.log('\n92B tier contract');
  for (const tier of tierContract) {
    console.log(`- ${tier.id}: ${tier.label}, USD $${tier.amount}, ${tier.amountCents} cents`);
  }
  console.log('\nFirst conversion sequence');
  console.log(`- status: ${packet.firstConversionSequence.status}`);
  console.log(`- minimum measurable win: ${packet.firstConversionSequence.minimumMeasurableWin}`);
  console.log(`- Stripe contribution note: ${packet.firstConversionSequence.likelyStripeContributionInflection}`);
  console.log('Measurement commands');
  for (const command of packet.firstConversionSequence.measurementCommands) {
    console.log(`- ${command}`);
  }
  console.log('Approval-ready first actions');
  for (const action of packet.firstConversionSequence.approvalReadyActions) {
    console.log(`- ${action.id}: ${action.goal}`);
    console.log(`  Approval: ${action.approvalText}`);
    console.log(`  Link: ${action.reviewedLink}`);
    console.log(`  Expected: ${action.expectedResult}`);
    if (action.draftVersion) {
      console.log(`  Draft ${action.draftVersion}: ${action.draft}`);
    }
  }
  console.log('\nFirst paid-traffic options');
  for (const option of packet.firstPaidTrafficOptions) {
    console.log(`- ${option.id}: ${option.purpose}`);
    console.log(`  Approval: ${option.approvalText}`);
    console.log(`  Prep: ${option.localPrep}`);
    console.log(`  Stop: ${option.stopRule}`);
  }
  console.log('\nFirst 24-hour loop');
  for (const step of packet.first24HourLoop) {
    console.log(`- ${step}`);
  }
}
