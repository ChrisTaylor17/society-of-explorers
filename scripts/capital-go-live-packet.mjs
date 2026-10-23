#!/usr/bin/env node

const allowedArgs = new Set(['--json']);
const args = process.argv.slice(2);
const unknownArgs = args.filter((arg) => !allowedArgs.has(arg));

if (unknownArgs.length > 0) {
  console.error(`Unknown go-live packet argument(s): ${unknownArgs.join(', ')}`);
  console.error('Usage: npm run capital:go-live:packet -- [--json]');
  process.exit(1);
}

const deploymentId = 'dpl_GAdFZyzEinPbfqXRrrkUPaqRryQC';
const previewUrl = 'https://society-of-explorers-jzd7yvty1-chris-projects-03dec906.vercel.app';
const productionDomains = ['www.societyofexplorers.com', 'societyofexplorers.com'];
const rollbackTarget = 'dpl_A3UZ6YV9EE6vmdfFWvDDMnektEYC';
const exactProductionApproval =
  'Approve promoting Vercel preview deployment dpl_GAdFZyzEinPbfqXRrrkUPaqRryQC to production for www.societyofexplorers.com and societyofexplorers.com.';
const postPromotionVerifyCommand = `npm run capital:post-promotion:verify -- --vercel-read --stripe-read --deployment=${previewUrl}`;

const packet = {
  generatedAt: new Date().toISOString(),
  status: 'approval_required_before_external_action',
  noExternalActionReceipt:
    'Prepared a local go-live packet only. No deploy, promotion, rollback, checkout session, payment, webhook replay, outreach send, landlord contact, connected-tool mutation, or public post occurred.',
  releaseCandidate: {
    deploymentId,
    previewUrl,
    productionDomains,
    rollbackTarget,
  },
  exactProductionApproval,
  prePromotionReadiness: [
    'npm run capital:go-live:readiness -- --vercel-read --stripe-read',
  ],
  doNotRunWithoutApproval: [
    `npx vercel promote ${deploymentId}`,
    `npx vercel rollback ${rollbackTarget}`,
  ],
  postPromotionVerification: [
    postPromotionVerifyCommand,
    'npm run capital:production:verify',
    'npx vercel env run --environment=production -- npm run capital:live-payment:readiness -- --stripe-read',
    'npx vercel env run --environment=production -- npm run capital:revenue:snapshot -- --stripe-read',
    `npm run capital:profit:gate -- --vercel-read --stripe-read --deployment=${previewUrl}`,
    `npm run capital:first-revenue:readiness -- --vercel-read --stripe-read --deployment=${previewUrl}`,
  ],
  postPromotionStopRules: [
    'If /92b/fund is old, rollback to the previous production deployment.',
    'If /api/92b/checkout creates a session for an invalid body, rollback and investigate.',
    'If robots.txt or sitemap.xml are missing, rollback or repair before public traffic.',
    'If webhook/preflight checks lose the live endpoint or approved event set, stop payment traffic.',
  ],
  nextPaidTrafficApprovalTemplates: [
    'Approve creating checkout sessions or payments for [flow] using [test/live] mode.',
    'Approve sending this outreach batch: [recipients], [channels], [final draft/version], [send window].',
    'Approve printing or placing the 92B window sign at [location] using [copy/version] and QR destination [url].',
  ],
};

if (args.includes('--json')) {
  console.log(JSON.stringify(packet, null, 2));
} else {
  console.log('Capital Go-Live Packet');
  console.log(`Generated: ${packet.generatedAt}`);
  console.log(`Status: ${packet.status}`);
  console.log(`Preview: ${previewUrl}`);
  console.log(`Deployment: ${deploymentId}`);
  console.log(`Domains: ${productionDomains.join(', ')}`);
  console.log(`Rollback target: ${rollbackTarget}`);
  console.log(`Receipt: ${packet.noExternalActionReceipt}`);
  console.log('\nExact production approval required');
  console.log(exactProductionApproval);
  console.log('\nPre-promotion readiness');
  for (const command of packet.prePromotionReadiness) {
    console.log(`- ${command}`);
  }
  console.log('\nDo not run without approval');
  for (const command of packet.doNotRunWithoutApproval) {
    console.log(`- ${command}`);
  }
  console.log('\nPost-promotion verification');
  for (const command of packet.postPromotionVerification) {
    console.log(`- ${command}`);
  }
  console.log('\nPost-promotion stop rules');
  for (const rule of packet.postPromotionStopRules) {
    console.log(`- ${rule}`);
  }
  console.log('\nNext paid-traffic approval templates');
  for (const template of packet.nextPaidTrafficApprovalTemplates) {
    console.log(`- ${template}`);
  }
}
