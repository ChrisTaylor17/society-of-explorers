#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const REQUIRED_PRODUCTION_APPROVAL =
  'Approve promoting Vercel preview deployment dpl_GAdFZyzEinPbfqXRrrkUPaqRryQC to production for www.societyofexplorers.com and societyofexplorers.com.';
const LIVE_PAYMENT_READINESS_APPROVAL =
  'Approve configuring Stripe webhook endpoint https://www.societyofexplorers.com/api/stripe/webhook in live mode for checkout.session.completed, customer.subscription.updated, and customer.subscription.deleted and setting STRIPE_WEBHOOK_SECRET in production.';

const allowedArgs = new Set(['--vercel-read', '--stripe-read', '--json', '--strict']);
const args = process.argv.slice(2);
const deploymentArg = args.find((arg) => arg.startsWith('--deployment='));
const unknownArgs = args.filter((arg) => !allowedArgs.has(arg) && !arg.startsWith('--deployment='));
const json = args.includes('--json');
const strict = args.includes('--strict');

if (unknownArgs.length > 0) {
  console.error(`Unknown profit gate argument(s): ${unknownArgs.join(', ')}`);
  console.error('Usage: npm run capital:profit:gate -- --vercel-read --stripe-read --deployment=<preview-url-or-id> [--json] [--strict]');
  process.exit(1);
}

if (!args.includes('--vercel-read') || !args.includes('--stripe-read')) {
  console.error('Refusing to run external read checks without both --vercel-read and --stripe-read.');
  console.error('This command performs read-only Vercel checks, one intentionally invalid checkout POST, and aggregate Stripe reads.');
  process.exit(1);
}

if (!deploymentArg || deploymentArg === '--deployment=') {
  console.error('Missing required --deployment=<preview-url-or-id>.');
  process.exit(1);
}

const deployment = deploymentArg.slice('--deployment='.length);
const commandTimeoutMs = 120_000;
const maxBuffer = 10 * 1024 * 1024;

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

function cashContributionByCurrency(revenueSnapshot) {
  return Object.fromEntries(
    Object.entries(revenueSnapshot.paymentTotals?.allTime || {}).map(([currencyCode, totals]) => [
      currencyCode,
      Number(totals?.cashContributionMinor || 0),
    ]),
  );
}

function positiveMinorMap(values) {
  return Object.fromEntries(Object.entries(values).filter(([, amount]) => Number(amount) > 0));
}

function decideStatus({
  productionUpdated,
  previewReady,
  livePaymentReady,
  stripeCashContributionPositive,
  recentPaidCheckoutSessions,
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
    return 'production_live_needs_paid_traffic';
  }

  return 'needs_launch_work';
}

let productionReport;
let previewReport;
let revenueSnapshot;
let livePaymentReadiness;

try {
  productionReport = runJsonCommand('production verifier', process.execPath, [
    'scripts/capital-production-postlaunch.mjs',
    '--soft',
    '--json',
  ]);

  previewReport = runJsonCommand('preview verifier', process.execPath, [
    'scripts/capital-production-postlaunch.mjs',
    '--soft',
    '--json',
    `--vercel-deployment=${deployment}`,
  ]);

  revenueSnapshot = runJsonCommand('Stripe revenue snapshot', 'npx', [
    'vercel',
    'env',
    'run',
    '--environment=production',
    '--',
    'npm',
    'run',
    'capital:revenue:snapshot',
    '--',
    '--stripe-read',
    '--json',
  ]);

  livePaymentReadiness = runJsonCommand('live payment readiness', 'npx', [
    'vercel',
    'env',
    'run',
    '--environment=production',
    '--',
    'npm',
    'run',
    'capital:live-payment:readiness',
    '--',
    '--stripe-read',
    '--json',
  ]);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const cashContribution = cashContributionByCurrency(revenueSnapshot);
const positiveCashContribution = positiveMinorMap(cashContribution);
const positiveMrr = positiveMinorMap(revenueSnapshot.estimatedMrrMinor || {});
const productionUpdated = productionReport.failed === 0;
const previewReady = previewReport.failed === 0;
const livePaymentReady = livePaymentReadiness.ready === true;
const recentPaidCheckoutSessions = Number(revenueSnapshot.paidCheckoutSessionsLast30Days || 0);
const stripeCashContributionPositive = Object.keys(positiveCashContribution).length > 0;
const status = decideStatus({
  productionUpdated,
  previewReady,
  livePaymentReady,
  stripeCashContributionPositive,
  recentPaidCheckoutSessions,
});
const nextActions = [];

if (!livePaymentReady) {
  nextActions.push(LIVE_PAYMENT_READINESS_APPROVAL);
} else if (!productionUpdated && previewReady) {
  nextActions.push(REQUIRED_PRODUCTION_APPROVAL);
}

if (livePaymentReady && productionUpdated && recentPaidCheckoutSessions === 0) {
  nextActions.push(
    'Run npm run capital:paid-traffic:packet to choose an exact approved live checkout validation, warm outreach, or window activation request; do not send, charge, publish, or place anything without the matrix approval.',
  );
}

if (recentPaidCheckoutSessions > 0 && !stripeCashContributionPositive) {
  nextActions.push('Review refunds, fees, and failed fulfillment before claiming contribution-positive revenue.');
}

const report = {
  generatedAt: new Date().toISOString(),
  status,
  productionUpdated,
  previewReady,
  livePaymentReady,
  deployment,
  production: {
    passed: productionReport.passed,
    failed: productionReport.failed,
  },
  preview: {
    passed: previewReport.passed,
    failed: previewReport.failed,
  },
  livePayment: {
    ready: livePaymentReady,
    mode: livePaymentReadiness.mode,
    webhookSecretPresent: livePaymentReadiness.webhookSecretPresent,
    webhookSecretShape: livePaymentReadiness.webhookSecretShape,
    targetEndpointUrl: livePaymentReadiness.targetEndpointUrl,
    endpointFound: livePaymentReadiness.endpointFound,
    endpointId: livePaymentReadiness.endpointId,
    endpointStatus: livePaymentReadiness.endpointStatus,
    endpointLivemode: livePaymentReadiness.endpointLivemode,
    enabledEvents: livePaymentReadiness.enabledEvents || [],
    missingEvents: livePaymentReadiness.missingEvents || [],
    extraEvents: livePaymentReadiness.extraEvents || [],
  },
  revenue: {
    mode: revenueSnapshot.mode,
    paidCheckoutSessionsLast30Days: recentPaidCheckoutSessions,
    paidCheckoutTypeCountsLast30Days: revenueSnapshot.paidCheckoutTypeCountsLast30Days || {},
    paidNinetyTwoBTiersLast30Days: revenueSnapshot.paidNinetyTwoBTiersLast30Days || {},
    cashContributionMinorByCurrency: cashContribution,
    positiveCashContributionMinorByCurrency: positiveCashContribution,
    estimatedMrrMinorByCurrency: revenueSnapshot.estimatedMrrMinor || {},
    positiveEstimatedMrrMinorByCurrency: positiveMrr,
    stripeBalanceMinor: revenueSnapshot.stripeBalanceMinor || {},
  },
  accountingBoundary: revenueSnapshot.accountingBoundary,
  nextActions,
  exactProductionApproval: productionUpdated ? null : REQUIRED_PRODUCTION_APPROVAL,
  exactLivePaymentReadinessApproval: livePaymentReady ? null : LIVE_PAYMENT_READINESS_APPROVAL,
};

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('Capital Profit Gate');
  console.log(`Generated: ${report.generatedAt}`);
  console.log(`Status: ${status}`);
  console.log(`Production updated: ${productionUpdated ? 'yes' : 'no'} (${productionReport.passed} pass, ${productionReport.failed} fail)`);
  console.log(`Preview ready: ${previewReady ? 'yes' : 'no'} (${previewReport.passed} pass, ${previewReport.failed} fail)`);
  console.log(
    `Live payment readiness: ${livePaymentReady ? 'yes' : 'no'} ` +
      `(mode ${livePaymentReadiness.mode}, endpoint ${livePaymentReadiness.endpointStatus || 'missing'}, ` +
      `secret ${livePaymentReadiness.webhookSecretShape})`,
  );
  console.log(`Paid Checkout sessions, last 30 days: ${recentPaidCheckoutSessions}`);
  console.log(`All-time Stripe cash contribution: ${moneyMap(cashContribution)}`);
  console.log(`Estimated MRR: ${moneyMap(revenueSnapshot.estimatedMrrMinor || {})}`);
  console.log(`92B paid tiers, last 30 days: ${JSON.stringify(revenueSnapshot.paidNinetyTwoBTiersLast30Days || {})}`);
  console.log(`Accounting boundary: ${revenueSnapshot.accountingBoundary}`);

  if (nextActions.length > 0) {
    console.log('\nNext approval/action gate');
    for (const action of nextActions) {
      console.log(`- ${action}`);
    }
  }
}

if (strict && (!productionUpdated || !livePaymentReady || !stripeCashContributionPositive)) {
  process.exitCode = 1;
}
