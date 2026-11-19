#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const allowedArgs = new Set(['--vercel-read', '--stripe-read', '--json']);
const args = process.argv.slice(2);
const deploymentArg = args.find((arg) => arg.startsWith('--deployment='));
const unknownArgs = args.filter((arg) => !allowedArgs.has(arg) && !arg.startsWith('--deployment='));
const json = args.includes('--json');

if (unknownArgs.length > 0) {
  console.error(`Unknown post-promotion verification argument(s): ${unknownArgs.join(', ')}`);
  console.error('Usage: npm run capital:post-promotion:verify -- --vercel-read --stripe-read --deployment=<preview-url-or-id> [--json]');
  process.exit(1);
}

if (!args.includes('--vercel-read') || !args.includes('--stripe-read')) {
  console.error('Refusing post-promotion verification without both --vercel-read and --stripe-read.');
  console.error('This command performs read-only Vercel/Stripe status checks plus one intentionally invalid checkout POST through the production verifier.');
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

function decideStatus({ productionUpdated, livePaymentReady, firstRevenueStatus, stripeCashContributionPositive }) {
  if (!productionUpdated) {
    return 'production_not_updated';
  }

  if (!livePaymentReady) {
    return 'live_payment_not_ready';
  }

  if (stripeCashContributionPositive) {
    return 'stripe_cash_contribution_positive';
  }

  return firstRevenueStatus || 'post_promotion_review_needed';
}

let productionReport;
let livePaymentReadiness;
let revenueSnapshot;
let firstRevenueReadiness;

try {
  productionReport = runJsonCommand('production verifier', process.execPath, [
    'scripts/capital-production-postlaunch.mjs',
    '--soft',
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

  firstRevenueReadiness = runJsonCommand('first revenue readiness', 'npm', [
    'run',
    'capital:first-revenue:readiness',
    '--',
    '--vercel-read',
    '--stripe-read',
    `--deployment=${deployment}`,
    '--json',
  ]);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const productionUpdated = productionReport.failed === 0;
const livePaymentReady = livePaymentReadiness.ready === true;
const positiveCashContribution = positiveMinorMap(firstRevenueReadiness.revenue?.positiveCashContributionMinorByCurrency || {});
const stripeCashContributionPositive = Object.keys(positiveCashContribution).length > 0;
const status = decideStatus({
  productionUpdated,
  livePaymentReady,
  firstRevenueStatus: firstRevenueReadiness.status,
  stripeCashContributionPositive,
});
const nextActions = [];

if (!productionUpdated) {
  nextActions.push(firstRevenueReadiness.exactProductionApproval);
} else if (firstRevenueReadiness.nextActions?.length) {
  nextActions.push(...firstRevenueReadiness.nextActions);
}

const report = {
  generatedAt: new Date().toISOString(),
  status,
  deployment,
  noExternalActionReceipt:
    'Ran post-promotion verification only: production HTTP checks, live payment readiness, aggregate Stripe revenue snapshot, and first-revenue readiness. No deploy, promotion, rollback, checkout session, payment, webhook replay, outreach send, landlord contact, window placement, connected-tool mutation, public post, or file write occurred. The production verifier includes one intentionally invalid checkout POST that must fail before Stripe session creation.',
  production: {
    updated: productionUpdated,
    passed: productionReport.passed,
    failed: productionReport.failed,
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
  revenue: firstRevenueReadiness.revenue,
  revenueSnapshotGeneratedAt: revenueSnapshot.generatedAt,
  accountingBoundary: firstRevenueReadiness.accountingBoundary,
  firstRevenue: {
    status: firstRevenueReadiness.status,
    firstConversionStatus: firstRevenueReadiness.firstRevenueReadiness?.firstConversionStatus,
    minimumMeasurableWin: firstRevenueReadiness.firstRevenueReadiness?.minimumMeasurableWin,
    approvalReadyActions: firstRevenueReadiness.firstRevenueReadiness?.approvalReadyActions || [],
    measurementCommands: firstRevenueReadiness.firstRevenueReadiness?.measurementCommands || [],
    stopRules: firstRevenueReadiness.firstRevenueReadiness?.stopRules || [],
  },
  nextActions: nextActions.filter(Boolean),
};

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('Capital Post-Promotion Verification');
  console.log(`Generated: ${report.generatedAt}`);
  console.log(`Status: ${status}`);
  console.log(`Production updated: ${productionUpdated ? 'yes' : 'no'} (${report.production.passed} pass, ${report.production.failed} fail)`);
  console.log(
    `Live payment readiness: ${livePaymentReady ? 'yes' : 'no'} ` +
      `(mode ${report.livePayment.mode}, endpoint ${report.livePayment.endpointStatus || 'missing'}, ` +
      `secret ${report.livePayment.webhookSecretShape})`,
  );
  console.log(`Paid Checkout sessions, last 30 days: ${Number(report.revenue?.paidCheckoutSessionsLast30Days || 0)}`);
  console.log(`All-time Stripe cash contribution: ${moneyMap(report.revenue?.cashContributionMinorByCurrency)}`);
  console.log(`Estimated MRR: ${moneyMap(report.revenue?.estimatedMrrMinorByCurrency)}`);
  console.log(`First revenue readiness: ${report.firstRevenue.status || 'unknown'}`);
  console.log(`Accounting boundary: ${report.accountingBoundary}`);
  console.log(`Receipt: ${report.noExternalActionReceipt}`);

  if (report.nextActions.length > 0) {
    console.log('\nNext approval/action gate');
    for (const action of report.nextActions) {
      console.log(`- ${action}`);
    }
  }
}
