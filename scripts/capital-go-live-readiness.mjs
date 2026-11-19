#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const allowedArgs = new Set(['--vercel-read', '--stripe-read', '--json']);
const args = process.argv.slice(2);
const unknownArgs = args.filter((arg) => !allowedArgs.has(arg));
const json = args.includes('--json');

const deploymentId = 'dpl_GAdFZyzEinPbfqXRrrkUPaqRryQC';
const previewUrl = 'https://society-of-explorers-jzd7yvty1-chris-projects-03dec906.vercel.app';
const productionUrl = 'https://www.societyofexplorers.com';
const productionDomains = ['www.societyofexplorers.com', 'societyofexplorers.com'];
const expectedCurrentProductionDeploymentId = 'dpl_A3UZ6YV9EE6vmdfFWvDDMnektEYC';
const exactProductionApproval =
  'Approve promoting Vercel preview deployment dpl_GAdFZyzEinPbfqXRrrkUPaqRryQC to production for www.societyofexplorers.com and societyofexplorers.com.';

if (unknownArgs.length > 0) {
  console.error(`Unknown go-live readiness argument(s): ${unknownArgs.join(', ')}`);
  console.error('Usage: npm run capital:go-live:readiness -- --vercel-read --stripe-read [--json]');
  process.exit(1);
}

if (!args.includes('--vercel-read') || !args.includes('--stripe-read')) {
  console.error('Refusing to inspect go-live readiness without both --vercel-read and --stripe-read.');
  console.error('This command performs read-only Vercel deployment inspection, HTTP verification, and live Stripe webhook readiness checks. It does not promote, roll back, deploy, create checkout sessions, replay webhooks, or mutate external systems.');
  process.exit(1);
}

const commandTimeoutMs = 120_000;
const maxBuffer = 10 * 1024 * 1024;

function runCommand(label, command, commandArgs) {
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

  return [result.stdout, result.stderr].filter(Boolean).join('\n');
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

function parseInspectOutput(target, output) {
  const id = output.match(/^\s*id\s+(dpl_[^\s]+)/m)?.[1] ?? null;
  const deploymentTarget = output.match(/^\s*target\s+([^\s]+)/m)?.[1] ?? null;
  const status = output.match(/^\s*status\s+.*?\b(Ready|Error|Building|Queued|Canceled)\b/m)?.[1] ?? null;
  const url = output.match(/^\s*url\s+(https?:\/\/[^\s]+)/m)?.[1] ?? null;
  const aliases = [...output.matchAll(/╶\s+(https?:\/\/[^\s]+)/g)].map((match) => match[1]);

  return {
    target,
    id,
    deploymentTarget,
    status,
    url,
    aliases,
  };
}

function runVerifier(label, verifierArgs) {
  return parseJsonFromOutput(
    label,
    runCommand(label, process.execPath, ['scripts/capital-production-postlaunch.mjs', '--soft', '--json', ...verifierArgs]),
  );
}

function runJsonCommand(label, command, commandArgs) {
  return parseJsonFromOutput(label, runCommand(label, command, commandArgs));
}

let productionInspect;
let previewInspect;
let productionReport;
let previewReport;
let livePaymentReadiness;

try {
  productionInspect = parseInspectOutput(
    productionUrl,
    runCommand('production deployment inspect', 'npx', ['vercel', 'inspect', productionUrl]),
  );
  previewInspect = parseInspectOutput(
    deploymentId,
    runCommand('preview deployment inspect', 'npx', ['vercel', 'inspect', deploymentId]),
  );
  productionReport = runVerifier('production verifier', []);
  previewReport = runVerifier('preview verifier', [`--vercel-deployment=${previewUrl}`]);
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

const productionInspectReady =
  productionInspect.id === expectedCurrentProductionDeploymentId &&
  productionInspect.deploymentTarget === 'production' &&
  productionInspect.status === 'Ready' &&
  productionDomains.every((domain) => productionInspect.aliases.includes(`https://${domain}`));
const previewInspectReady =
  previewInspect.id === deploymentId &&
  previewInspect.deploymentTarget === 'preview' &&
  previewInspect.status === 'Ready' &&
  previewInspect.url === previewUrl;
const productionStillOld = productionReport.failed > 0;
const previewVerifierReady = previewReport.failed === 0;
const livePaymentReady = livePaymentReadiness.ready === true;
const readyForApproval =
  productionInspectReady &&
  previewInspectReady &&
  productionStillOld &&
  previewVerifierReady &&
  livePaymentReady;
const status = readyForApproval ? 'ready_for_exact_production_approval' : 'not_ready_for_promotion';
const postPromotionVerifyCommand = `npm run capital:post-promotion:verify -- --vercel-read --stripe-read --deployment=${previewUrl}`;

const report = {
  generatedAt: new Date().toISOString(),
  status,
  noExternalActionReceipt:
    'Performed read-only Vercel inspect, HTTP verification, and Stripe webhook readiness checks only. No deploy, promotion, rollback, checkout session, payment, webhook replay, outreach send, landlord contact, window placement, connected-tool mutation, or public post occurred.',
  exactProductionApproval,
  promotionCommandAfterApproval: `npx vercel promote ${deploymentId}`,
  rollbackCommandIfVerificationFails: `npx vercel rollback ${expectedCurrentProductionDeploymentId}`,
  releaseCandidate: {
    deploymentId,
    previewUrl,
    inspect: previewInspect,
    inspectReady: previewInspectReady,
    verifier: {
      passed: previewReport.passed,
      failed: previewReport.failed,
      ready: previewVerifierReady,
    },
  },
  currentProduction: {
    expectedRollbackDeploymentId: expectedCurrentProductionDeploymentId,
    productionUrl,
    productionDomains,
    inspect: productionInspect,
    inspectReady: productionInspectReady,
    verifier: {
      passed: productionReport.passed,
      failed: productionReport.failed,
      stillOld: productionStillOld,
    },
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
  nextVerificationCommands: [
    postPromotionVerifyCommand,
    'npm run capital:production:verify',
    'npx vercel env run --environment=production -- npm run capital:live-payment:readiness -- --stripe-read',
    'npx vercel env run --environment=production -- npm run capital:revenue:snapshot -- --stripe-read',
    `npm run capital:profit:gate -- --vercel-read --stripe-read --deployment=${previewUrl}`,
    `npm run capital:first-revenue:readiness -- --vercel-read --stripe-read --deployment=${previewUrl}`,
  ],
};

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('Capital Go-Live Readiness');
  console.log(`Generated: ${report.generatedAt}`);
  console.log(`Status: ${status}`);
  console.log(`Receipt: ${report.noExternalActionReceipt}`);
  console.log(`Current production deployment: ${productionInspect.id ?? 'unknown'} (${productionInspect.status ?? 'unknown'}, ${productionInspect.deploymentTarget ?? 'unknown'})`);
  console.log(`Expected rollback deployment: ${expectedCurrentProductionDeploymentId}`);
  console.log(`Release candidate deployment: ${previewInspect.id ?? 'unknown'} (${previewInspect.status ?? 'unknown'}, ${previewInspect.deploymentTarget ?? 'unknown'})`);
  console.log(`Production verifier: ${productionReport.passed} pass, ${productionReport.failed} fail`);
  console.log(`Preview verifier: ${previewReport.passed} pass, ${previewReport.failed} fail`);
  console.log(
    `Live payment readiness: ${livePaymentReady ? 'yes' : 'no'} ` +
      `(mode ${livePaymentReadiness.mode}, endpoint ${livePaymentReadiness.endpointStatus || 'missing'}, ` +
      `secret ${livePaymentReadiness.webhookSecretShape})`,
  );
  console.log('\nExact production approval required');
  console.log(exactProductionApproval);
  console.log('\nDo not run until after exact approval');
  console.log(`- ${report.promotionCommandAfterApproval}`);
  console.log('\nRollback command if post-promotion verification fails');
  console.log(`- ${report.rollbackCommandIfVerificationFails}`);
  console.log('\nPost-promotion verification');
  for (const command of report.nextVerificationCommands) {
    console.log(`- ${command}`);
  }
}

if (!readyForApproval) {
  process.exitCode = 1;
}
