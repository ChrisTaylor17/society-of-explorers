#!/usr/bin/env node

import Stripe from 'stripe';

const allowedArgs = new Set(['--stripe-read', '--json']);
const args = process.argv.slice(2);
const unknownArgs = args.filter((arg) => !allowedArgs.has(arg));

if (unknownArgs.length > 0) {
  console.error(`Unknown revenue snapshot argument(s): ${unknownArgs.join(', ')}`);
  console.error('Usage: npm run capital:revenue:snapshot -- --stripe-read [--json]');
  process.exit(1);
}

if (!args.includes('--stripe-read')) {
  console.error('Refusing to contact Stripe without explicit --stripe-read approval.');
  console.error('This command is read-only and returns aggregate totals without customer or payment identifiers.');
  process.exit(1);
}

const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
if (!stripeKey) {
  console.error('STRIPE_SECRET_KEY is missing.');
  process.exit(1);
}

const stripe = new Stripe(stripeKey, {
  apiVersion: '2026-03-25.dahlia',
  maxNetworkRetries: 1,
  timeout: 20_000,
});

const now = Math.floor(Date.now() / 1000);
const windows = {
  allTime: 0,
  last30Days: now - 30 * 86_400,
  last7Days: now - 7 * 86_400,
};

function emptyPaymentTotals() {
  return {
    grossMinor: 0,
    feesMinor: 0,
    refundsMinor: 0,
    negativeAdjustmentsMinor: 0,
    cashContributionMinor: 0,
    paymentCount: 0,
  };
}

function currencyBucket(collection, windowName, currency) {
  collection[windowName][currency] ||= emptyPaymentTotals();
  return collection[windowName][currency];
}

function toCurrencyMap(entries) {
  return Object.fromEntries(
    entries.map((entry) => [String(entry.currency || 'unknown').toUpperCase(), entry.amount]),
  );
}

function addCurrencyAmount(collection, key, currency, amount) {
  collection[key] ||= {};
  collection[key][currency] = (collection[key][currency] || 0) + amount;
}

function formatMinor(amount, currency) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount / 100);
}

function printWindow(label, values) {
  console.log(`\n${label}`);
  const entries = Object.entries(values);
  if (entries.length === 0) {
    console.log('- No payment balance activity.');
    return;
  }

  for (const [currency, totals] of entries) {
    console.log(
      `- ${currency}: gross ${formatMinor(totals.grossMinor, currency)}, ` +
        `refunds ${formatMinor(totals.refundsMinor, currency)}, ` +
        `fees ${formatMinor(totals.feesMinor, currency)}, ` +
        `cash contribution ${formatMinor(totals.cashContributionMinor, currency)}, ` +
        `${totals.paymentCount} payment(s)`,
    );
  }
}

const paymentTotals = Object.fromEntries(
  Object.keys(windows).map((windowName) => [windowName, {}]),
);
let balanceTransactionsScanned = 0;

for await (const transaction of stripe.balanceTransactions.list({ limit: 100 })) {
  balanceTransactionsScanned += 1;
  const currency = String(transaction.currency || 'unknown').toUpperCase();

  for (const [windowName, start] of Object.entries(windows)) {
    if (transaction.created < start) continue;
    const totals = currencyBucket(paymentTotals, windowName, currency);

    if (transaction.type === 'charge' || transaction.type === 'payment') {
      totals.grossMinor += transaction.amount;
      totals.feesMinor += transaction.fee;
      totals.paymentCount += 1;
    } else if (transaction.type === 'refund' || transaction.type === 'payment_refund') {
      totals.refundsMinor += Math.abs(transaction.amount);
      totals.feesMinor += transaction.fee;
    } else if (transaction.type === 'adjustment' && transaction.amount < 0) {
      totals.negativeAdjustmentsMinor += Math.abs(transaction.amount);
      totals.feesMinor += transaction.fee;
    }

    totals.cashContributionMinor =
      totals.grossMinor -
      totals.refundsMinor -
      totals.negativeAdjustmentsMinor -
      totals.feesMinor;
  }
}

const subscriptionStatusCounts = {};
const estimatedMrrMinor = {};
let subscriptionsScanned = 0;

for await (const subscription of stripe.subscriptions.list({ status: 'all', limit: 100 })) {
  subscriptionsScanned += 1;
  subscriptionStatusCounts[subscription.status] =
    (subscriptionStatusCounts[subscription.status] || 0) + 1;

  if (!['active', 'trialing', 'past_due'].includes(subscription.status)) continue;

  for (const item of subscription.items.data) {
    const price = item.price;
    if (!price?.recurring || typeof price.unit_amount !== 'number') continue;

    const currency = String(price.currency || 'unknown').toUpperCase();
    const quantity = item.quantity || 1;
    const intervalCount = price.recurring.interval_count || 1;
    let monthlyMinor = price.unit_amount * quantity;

    if (price.recurring.interval === 'year') {
      monthlyMinor /= 12 * intervalCount;
    } else if (price.recurring.interval === 'week') {
      monthlyMinor *= 52 / 12 / intervalCount;
    } else if (price.recurring.interval === 'day') {
      monthlyMinor *= 365 / 12 / intervalCount;
    } else {
      monthlyMinor /= intervalCount;
    }

    estimatedMrrMinor[currency] = Math.round(
      (estimatedMrrMinor[currency] || 0) + monthlyMinor,
    );
  }
}

const paidCheckoutTypeCountsLast30Days = {};
const paidCheckoutGrossMinorByTypeLast30Days = {};
const paidNinetyTwoBTiersLast30Days = {};
let paidCheckoutSessionsLast30Days = 0;
const knownNinetyTwoBTierIds = new Set(['supporter', 'patron', 'founder', 'architect']);

for await (const session of stripe.checkout.sessions.list({
  limit: 100,
  created: { gte: windows.last30Days },
})) {
  if (session.status !== 'complete' || session.payment_status !== 'paid') continue;

  paidCheckoutSessionsLast30Days += 1;
  const checkoutType = session.metadata?.type || 'unclassified';
  paidCheckoutTypeCountsLast30Days[checkoutType] =
    (paidCheckoutTypeCountsLast30Days[checkoutType] || 0) + 1;

  const currency = String(session.currency || 'unknown').toUpperCase();
  addCurrencyAmount(
    paidCheckoutGrossMinorByTypeLast30Days,
    checkoutType,
    currency,
    session.amount_total || 0,
  );

  if (checkoutType === '92b_pledge') {
    const rawTierId = String(session.metadata?.tier_id || '').toLowerCase();
    const tierId = knownNinetyTwoBTierIds.has(rawTierId) ? rawTierId : 'unclassified';
    paidNinetyTwoBTiersLast30Days[tierId] ||= {
      paidSessionCount: 0,
      grossMinorByCurrency: {},
    };
    paidNinetyTwoBTiersLast30Days[tierId].paidSessionCount += 1;
    paidNinetyTwoBTiersLast30Days[tierId].grossMinorByCurrency[currency] =
      (paidNinetyTwoBTiersLast30Days[tierId].grossMinorByCurrency[currency] || 0) +
      (session.amount_total || 0);
  }
}

const balance = await stripe.balance.retrieve();
const snapshot = {
  generatedAt: new Date().toISOString(),
  mode: stripeKey.startsWith('sk_live_')
    ? 'live'
    : stripeKey.startsWith('sk_test_')
      ? 'test'
      : 'unknown',
  paymentTotals,
  subscriptionStatusCounts,
  estimatedMrrMinor,
  paidCheckoutSessionsLast30Days,
  paidCheckoutTypeCountsLast30Days,
  paidCheckoutGrossMinorByTypeLast30Days,
  paidNinetyTwoBTiersLast30Days,
  stripeBalanceMinor: {
    available: toCurrencyMap(balance.available || []),
    pending: toCurrencyMap(balance.pending || []),
  },
  evidence: {
    balanceTransactionsScanned,
    subscriptionsScanned,
  },
  accountingBoundary:
    'Stripe cash contribution is payment volume minus refunds, negative adjustments, and Stripe fees. It is not accounting profit because payroll, hosting, taxes, fulfillment, and other operating expenses are not included.',
};

if (args.includes('--json')) {
  console.log(JSON.stringify(snapshot, null, 2));
  process.exit(0);
}

console.log('Stripe Revenue Snapshot');
console.log(`Generated: ${snapshot.generatedAt}`);
console.log(`Mode: ${snapshot.mode}`);
console.log('Privacy: aggregate totals only; no customer or payment identifiers are returned.');

printWindow('Last 7 days', snapshot.paymentTotals.last7Days);
printWindow('Last 30 days', snapshot.paymentTotals.last30Days);
printWindow('All time', snapshot.paymentTotals.allTime);

console.log('\nRecurring revenue');
if (Object.keys(snapshot.estimatedMrrMinor).length === 0) {
  console.log('- Estimated MRR: none.');
} else {
  for (const [currency, amount] of Object.entries(snapshot.estimatedMrrMinor)) {
    console.log(`- ${currency}: ${formatMinor(amount, currency)} estimated MRR.`);
  }
}
console.log(`- Subscription statuses: ${JSON.stringify(snapshot.subscriptionStatusCounts)}`);

console.log('\nRecent paid checkout activity');
console.log(`- Paid Checkout sessions in the last 30 days: ${snapshot.paidCheckoutSessionsLast30Days}`);
console.log(`- Classification counts: ${JSON.stringify(snapshot.paidCheckoutTypeCountsLast30Days)}`);
console.log(`- Gross minor units by classification: ${JSON.stringify(snapshot.paidCheckoutGrossMinorByTypeLast30Days)}`);
console.log(`- 92B paid tiers: ${JSON.stringify(snapshot.paidNinetyTwoBTiersLast30Days)}`);
console.log('- Conversion rate is not reported because this snapshot does not read visitor or page-view data.');

console.log('\nStripe balance');
console.log(`- Available minor units: ${JSON.stringify(snapshot.stripeBalanceMinor.available)}`);
console.log(`- Pending minor units: ${JSON.stringify(snapshot.stripeBalanceMinor.pending)}`);

console.log('\nProfit boundary');
console.log(`- ${snapshot.accountingBoundary}`);
