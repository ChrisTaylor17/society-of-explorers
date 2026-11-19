#!/usr/bin/env node

import Stripe from 'stripe';

const TARGET_WEBHOOK_URL = 'https://www.societyofexplorers.com/api/stripe/webhook';
const REQUIRED_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
];

const allowedArgs = new Set(['--stripe-read', '--json']);
const args = process.argv.slice(2);
const unknownArgs = args.filter((arg) => !allowedArgs.has(arg));
const json = args.includes('--json');

if (unknownArgs.length > 0) {
  console.error(`Unknown live payment readiness argument(s): ${unknownArgs.join(', ')}`);
  console.error('Usage: npm run capital:live-payment:readiness -- --stripe-read [--json]');
  process.exit(1);
}

if (!args.includes('--stripe-read')) {
  console.error('Refusing to contact Stripe without explicit --stripe-read approval.');
  console.error('This command lists webhook endpoints read-only and redacts all secret values.');
  process.exit(1);
}

const stripeKey = process.env.STRIPE_SECRET_KEY?.trim() || '';
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || '';
const mode = stripeKey.startsWith('sk_live_')
  ? 'live'
  : stripeKey.startsWith('sk_test_')
    ? 'test'
    : 'unknown';
const webhookSecretShape = !webhookSecret
  ? 'missing'
  : webhookSecret.startsWith('whsec_')
    ? 'whsec_*'
    : 'unexpected';
const webhookSecretPresent = webhookSecret.length > 0;

function sortedUnique(values) {
  return [...new Set(values.map((value) => String(value)))].sort();
}

let endpointReadError = null;
let endpoint = null;

if (stripeKey) {
  try {
    const stripe = new Stripe(stripeKey, {
      apiVersion: '2026-03-25.dahlia',
      maxNetworkRetries: 1,
      timeout: 20_000,
    });
    const endpointList = await stripe.webhookEndpoints.list({ limit: 100 });
    const matchingEndpoints = endpointList.data.filter(
      (candidate) => candidate.url === TARGET_WEBHOOK_URL,
    );
    endpoint =
      matchingEndpoints.find((candidate) => candidate.livemode && candidate.status === 'enabled') ||
      matchingEndpoints[0] ||
      null;
  } catch {
    endpointReadError = 'Stripe webhook endpoint read failed.';
  }
}

const enabledEvents = sortedUnique(endpoint?.enabled_events || []);
const missingEvents = REQUIRED_EVENTS.filter((eventName) => !enabledEvents.includes(eventName));
const extraEvents = enabledEvents.filter((eventName) => !REQUIRED_EVENTS.includes(eventName));
const endpointFound = Boolean(endpoint);
const endpointStatus = endpoint?.status || null;
const endpointLivemode = endpoint?.livemode ?? null;
const endpointReady =
  endpointFound &&
  endpointStatus === 'enabled' &&
  endpointLivemode === true &&
  missingEvents.length === 0 &&
  extraEvents.length === 0;
const ready = mode === 'live' && webhookSecretShape === 'whsec_*' && endpointReady;

const report = {
  generatedAt: new Date().toISOString(),
  ready,
  mode,
  webhookSecretPresent,
  webhookSecretShape,
  targetEndpointUrl: TARGET_WEBHOOK_URL,
  endpointFound,
  endpointId: endpoint?.id || null,
  endpointStatus,
  endpointLivemode,
  enabledEvents,
  missingEvents,
  extraEvents,
  endpointReadError,
  noExternalActionReceipt:
    'Listed Stripe webhook endpoints read-only and inspected production environment variable presence only. No endpoint create/update/delete, checkout session, payment, webhook replay, deploy, send, or file write occurred. Secret values were not printed.',
};

if (json) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log('Capital Live Payment Readiness');
console.log(`Generated: ${report.generatedAt}`);
console.log(`Ready: ${ready ? 'yes' : 'no'}`);
console.log(`Stripe mode: ${mode}`);
console.log(
  `STRIPE_WEBHOOK_SECRET: ${webhookSecretPresent ? `${webhookSecretShape} shape` : 'missing'} (value not printed)`,
);
console.log(`Target endpoint: ${TARGET_WEBHOOK_URL}`);
console.log(`Endpoint found: ${endpointFound ? 'yes' : 'no'}`);
console.log(`Endpoint id: ${endpoint?.id || 'none'}`);
console.log(`Endpoint status: ${endpointStatus || 'none'}`);
console.log(
  `Endpoint live mode: ${
    endpointLivemode === null ? 'unknown' : endpointLivemode ? 'yes' : 'no'
  }`,
);
console.log(`Enabled events: ${enabledEvents.length > 0 ? enabledEvents.join(', ') : 'none'}`);
console.log(`Missing events: ${missingEvents.length > 0 ? missingEvents.join(', ') : 'none'}`);
console.log(`Extra events: ${extraEvents.length > 0 ? extraEvents.join(', ') : 'none'}`);

if (endpointReadError) {
  console.log(`Endpoint read: ${endpointReadError}`);
}

console.log(`Receipt: ${report.noExternalActionReceipt}`);
