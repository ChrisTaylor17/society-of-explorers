#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const allowedArgs = new Set(['--vercel-read', '--stripe-read', '--json']);
const args = process.argv.slice(2);
const deploymentArg = args.find((arg) => arg.startsWith('--deployment='));
const unknownArgs = args.filter((arg) => !allowedArgs.has(arg) && !arg.startsWith('--deployment='));
const json = args.includes('--json');

if (unknownArgs.length > 0) {
  console.error(`Unknown first revenue readiness argument(s): ${unknownArgs.join(', ')}`);
  console.error('Usage: npm run capital:first-revenue:readiness -- --vercel-read --stripe-read --deployment=<preview-url-or-id> [--json]');
  process.exit(1);
}

if (!args.includes('--vercel-read') || !args.includes('--stripe-read')) {
  console.error('Refusing to inspect first revenue readiness without both --vercel-read and --stripe-read.');
  console.error('This command composes read-only Vercel, HTTP, Stripe aggregate, and local packet checks. It does not deploy, promote, create checkout sessions, send outreach, print material, or mutate external systems.');
  process.exit(1);
}

if (!deploymentArg || deploymentArg === '--deployment=') {
  console.error('Missing required --deployment=<preview-url-or-id>.');
  process.exit(1);
}

const deployment = deploymentArg.slice('--deployment='.length);
const commandTimeoutMs = 180_000;
const maxBuffer = 12 * 1024 * 1024;

function runJsonCommand(label, command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer,
    shell: false,
    timeout: commandTimeoutMs,
  });

  if (result.error) {
    throw new Error(`${label} failed to run: ${result.error.message}`);
  }

  if (result.signal) {
    throw new Error(`${label} was terminated by ${result.signal}.`);
  }

  if (result.status !== 0) {
    throw new Error(`${label} exited with ${result.status}: ${result.stderr || result.stdout}`);
  }

  return parseJsonFromOutput(label, [result.stdout, result.stderr].filter(Boolean).join('\n'));
}

function parseJsonFromOutput(label, output) {
  const jsonText = extractJsonObject(output);
  if (!jsonText) {
    throw new Error(`${label} did not return parseable JSON.`);
  }

  try {
    return JSON.parse(jsonText);
  } catch {
    throw new Error(`${label} did not return parseable JSON.`);
  }
}

function extractJsonObject(output) {
  for (let start = output.indexOf('{'); start !== -1; start = output.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    let escaping = false;

    for (let index = start; index < output.length; index += 1) {
      const char = output[index];

      if (escaping) {
        escaping = false;
        continue;
      }

      if (char === '\\' && inString) {
        escaping = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          return output.slice(start, index + 1);
        }
      }
    }
  }

  return null;
}

function positiveMinorMap(values) {
  return Object.fromEntries(Object.entries(values || {}).filter(([, amount]) => Number(amount) > 0));
}

function currency(amount, currencyCode) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
  }).format(amount / 100);
}

function moneyMap(values) {
  const entries = Object.entries(values || {});

  if (entries.length === 0) {
    return 'none';
  }

  return entries.map(([currencyCode, amount]) => `${currencyCode} ${currency(Number(amount || 0), currencyCode)}`).join(', ');
}

function decideStatus({
  productionUpdated,
  previewReady,
  livePaymentReady,
  recentPaidCheckoutSessions,
  stripeCashContributionPositive,
}) {
  if (!livePaymentReady) {
    return 'needs_live_payment_readiness';
  }

  if (productionUpdated && stripeCashContributionPositive) {
    return 'stripe_cash_contribution_positive';
  }

  if (!productionUpdated && previewReady) {
    return 'needs_production_promotion_approval';
  }

  if (productionUpdated && recentPaidCheckoutSessions === 0) {
    return 'ready_for_first_revenue_approval';
  }

  if (recentPaidCheckoutSessions > 0 && !stripeCashContributionPositive) {
    return 'paid_sessions_need_cash_contribution_review';
  }

  return 'needs_launch_work';
}

let profitGate;
let paidTrafficPacket;

try {
  profitGate = runJsonCommand('profit gate', 'npm', [
    'run',
    'capital:profit:gate',
    '--',
    '--vercel-read',
    '--stripe-read',
    `--deployment=${deployment}`,
    '--json',
  ]);

  paidTrafficPacket = runJsonCommand('paid-traffic packet', 'npm', [
    'run',
    'capital:paid-traffic:packet',
    '--',
    '--json',
  ]);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const productionUpdated = profitGate.productionUpdated === true;
const previewReady = profitGate.previewReady === true;
const livePaymentReady = profitGate.livePaymentReady === true;
const recentPaidCheckoutSessions = Number(profitGate.revenue?.paidCheckoutSessionsLast30Days || 0);
const positiveCashContribution = positiveMinorMap(profitGate.revenue?.positiveCashContributionMinorByCurrency || {});
const stripeCashContributionPositive = Object.keys(positiveCashContribution).length > 0;
const status = decideStatus({
  productionUpdated,
  previewReady,
  livePaymentReady,
  recentPaidCheckoutSessions,
  stripeCashContributionPositive,
});
const firstConversionActions = paidTrafficPacket.firstConversionSequence?.approvalReadyActions || [];
const measurementCommands = paidTrafficPacket.firstConversionSequence?.measurementCommands || [];
const postPromotionVerification = paidTrafficPacket.postPromotionVerification || [];
const deploymentId = paidTrafficPacket.prerequisiteGate?.deploymentId;
const nextActions = [];

if (status === 'needs_live_payment_readiness' && profitGate.exactLivePaymentReadinessApproval) {
  nextActions.push(profitGate.exactLivePaymentReadinessApproval);
}

if (status === 'needs_production_promotion_approval' && profitGate.exactProductionApproval) {
  nextActions.push(profitGate.exactProductionApproval);
}

if (status === 'ready_for_first_revenue_approval') {
  nextActions.push(
    'Choose exactly one first-conversion action and get the exact approval text below before any checkout session, outreach send, public post, print, placement, or connected-tool mutation.',
  );
  for (const action of firstConversionActions) {
    nextActions.push(action.approvalText);
  }
}

if (status === 'paid_sessions_need_cash_contribution_review') {
  nextActions.push('Run the aggregate revenue snapshot and profit gate again, then review refunds, fees, and operating expenses before claiming contribution-positive revenue.');
}

const report = {
  generatedAt: new Date().toISOString(),
  status,
  deployment,
  noExternalActionReceipt:
    'Composed read-only profit gate output with the local paid-traffic packet only. No deploy, promotion, rollback, checkout session, payment, webhook replay, outreach send, landlord contact, window placement, connected-tool mutation, public post, or file write occurred.',
  production: {
    updated: productionUpdated,
    passed: profitGate.production?.passed,
    failed: profitGate.production?.failed,
  },
  preview: {
    ready: previewReady,
    passed: profitGate.preview?.passed,
    failed: profitGate.preview?.failed,
  },
  livePayment: profitGate.livePayment,
  revenue: profitGate.revenue,
  accountingBoundary: profitGate.accountingBoundary,
  exactProductionApproval: profitGate.exactProductionApproval,
  exactLivePaymentReadinessApproval: profitGate.exactLivePaymentReadinessApproval,
  firstRevenueReadiness: {
    productionFundUrl: paidTrafficPacket.prerequisiteGate?.productionFundUrl,
    productionPromotionCommandAfterExactApproval: deploymentId ? `npx vercel promote ${deploymentId}` : null,
    postPromotionVerification,
    minimumLiveCheckoutValidationApproval: paidTrafficPacket.liveCheckoutValidation?.minimumApprovalText,
    firstConversionStatus: paidTrafficPacket.firstConversionSequence?.status,
    minimumMeasurableWin: paidTrafficPacket.firstConversionSequence?.minimumMeasurableWin,
    likelyStripeContributionInflection: paidTrafficPacket.firstConversionSequence?.likelyStripeContributionInflection,
    approvalReadyActions: firstConversionActions.map((action) => ({
      id: action.id,
      approvalText: action.approvalText,
      goal: action.goal,
      reviewedLink: action.reviewedLink,
      expectedResult: action.expectedResult,
      draftVersion: action.draftVersion,
      draft: action.draft,
    })),
    measurementCommands,
    stopRules: paidTrafficPacket.liveCheckoutValidation?.stopRules || [],
  },
  nextActions,
};

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('Capital First Revenue Readiness');
  console.log(`Generated: ${report.generatedAt}`);
  console.log(`Status: ${status}`);
  console.log(`Production updated: ${productionUpdated ? 'yes' : 'no'} (${report.production.passed} pass, ${report.production.failed} fail)`);
  console.log(`Preview ready: ${previewReady ? 'yes' : 'no'} (${report.preview.passed} pass, ${report.preview.failed} fail)`);
  console.log(
    `Live payment readiness: ${livePaymentReady ? 'yes' : 'no'} ` +
      `(mode ${report.livePayment?.mode}, endpoint ${report.livePayment?.endpointStatus || 'missing'}, ` +
      `secret ${report.livePayment?.webhookSecretShape})`,
  );
  console.log(`Paid Checkout sessions, last 30 days: ${recentPaidCheckoutSessions}`);
  console.log(`All-time Stripe cash contribution: ${moneyMap(report.revenue?.cashContributionMinorByCurrency)}`);
  console.log(`Estimated MRR: ${moneyMap(report.revenue?.estimatedMrrMinorByCurrency)}`);
  console.log(`92B paid tiers, last 30 days: ${JSON.stringify(report.revenue?.paidNinetyTwoBTiersLast30Days || {})}`);
  console.log(`Accounting boundary: ${report.accountingBoundary}`);
  console.log(`First revenue action readiness: ${report.firstRevenueReadiness.firstConversionStatus || 'unknown'}`);
  console.log(`Production funding URL: ${report.firstRevenueReadiness.productionFundUrl || 'unknown'}`);
  console.log(`Receipt: ${report.noExternalActionReceipt}`);

  if (nextActions.length > 0) {
    console.log('\nNext approval/action gate');
    for (const action of nextActions) {
      console.log(`- ${action}`);
    }
  }

  if (status === 'needs_production_promotion_approval' && report.firstRevenueReadiness.productionPromotionCommandAfterExactApproval) {
    console.log('\nDo not run until after exact production approval');
    console.log(`- ${report.firstRevenueReadiness.productionPromotionCommandAfterExactApproval}`);
    console.log('Post-promotion verification');
    for (const command of postPromotionVerification) {
      console.log(`- ${command}`);
    }
  }

  if (status === 'ready_for_first_revenue_approval') {
    console.log('\nMeasurement commands after an exactly approved first action');
    for (const command of measurementCommands) {
      console.log(`- ${command}`);
    }
    console.log('Stop rules');
    for (const rule of report.firstRevenueReadiness.stopRules) {
      console.log(`- ${rule}`);
    }
  }
}
