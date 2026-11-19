#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const args = new Set(process.argv.slice(2));
const envMode = args.has('--production-env') ? 'production' : 'development';

loadEnvConfig(root, envMode !== 'production');

const checks = [];
const startedAt = new Date().toISOString();
const NETWORK_TIMEOUT_MS = 8_000;

const REQUIRED_ENV = [
  {
    id: 'site-url',
    label: 'NEXT_PUBLIC_SITE_URL or SITE_URL',
    present: () => Boolean(process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL),
    detail: 'Needed for environment-aware checkout return URLs.',
  },
  {
    id: 'stripe-secret',
    label: 'STRIPE_SECRET_KEY',
    present: () => Boolean(process.env.STRIPE_SECRET_KEY),
    detail: 'Needed before creating Stripe checkout sessions.',
  },
  {
    id: 'stripe-webhook-secret',
    label: 'STRIPE_WEBHOOK_SECRET',
    present: () => Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    detail: 'Needed before replaying or accepting Stripe webhooks.',
  },
  {
    id: 'stripe-price-seeker',
    label: 'STRIPE_PRICE_SEEKER',
    present: () => Boolean(process.env.STRIPE_PRICE_SEEKER),
    detail: 'Needed for membership checkout and webhook tier mapping.',
  },
  {
    id: 'stripe-price-scholar',
    label: 'STRIPE_PRICE_SCHOLAR',
    present: () => Boolean(process.env.STRIPE_PRICE_SCHOLAR),
    detail: 'Needed for membership checkout and webhook tier mapping.',
  },
  {
    id: 'stripe-price-philosopher',
    label: 'STRIPE_PRICE_PHILOSOPHER',
    present: () => Boolean(process.env.STRIPE_PRICE_PHILOSOPHER),
    detail: 'Needed for membership checkout and webhook tier mapping.',
  },
  {
    id: 'stripe-price-oracle',
    label: 'STRIPE_PRICE_ORACLE',
    present: () => Boolean(process.env.STRIPE_PRICE_ORACLE),
    detail: 'Needed so Oracle checkout never falls back to a hard-coded price.',
  },
  {
    id: 'supabase-url',
    label: 'NEXT_PUBLIC_SUPABASE_URL',
    present: () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    detail: 'Needed for admin metrics and pledge ledger reads.',
  },
  {
    id: 'supabase-service-role',
    label: 'SUPABASE_SERVICE_ROLE_KEY',
    present: () => Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    detail: 'Needed by private server routes only.',
  },
];

const OPTIONAL_ENV = [
  {
    id: 'admin-emails',
    label: 'SOE_ADMIN_EMAILS',
    present: () => Boolean(process.env.SOE_ADMIN_EMAILS),
    detail: 'Recommended before production admin use.',
  },
  {
    id: 'admin-wallets',
    label: 'SOE_ADMIN_WALLETS or SOE_ADMIN_WALLET_ADDRESSES',
    present: () => Boolean(process.env.SOE_ADMIN_WALLETS || process.env.SOE_ADMIN_WALLET_ADDRESSES),
    detail: 'Recommended for production wallet-only operators.',
  },
];

const REQUIRED_FILES = [
  'app/92b/fund/page.tsx',
  'app/api/92b/checkout/route.ts',
  'app/api/projects/[id]/pledge/route.ts',
  'app/api/checkout/route.ts',
  'app/api/stripe/webhook/route.ts',
  'app/api/admin/capital/route.ts',
  'app/api/admin/capital/launch-room/route.ts',
  'app/api/admin/capital/approvals/route.ts',
  'app/api/admin/capital/patron-brief/route.ts',
  'app/api/admin/capital/scenarios/route.ts',
  'app/api/admin/capital/outreach-lab/route.ts',
  'app/api/admin/capital/weekly-review/route.ts',
  'app/capital/page.tsx',
  'app/capital/launch-room/page.tsx',
  'app/capital/approvals/page.tsx',
  'app/capital/patron-brief/page.tsx',
  'app/capital/scenarios/page.tsx',
  'app/capital/outreach-lab/page.tsx',
  'app/capital/weekly-review/page.tsx',
  'app/capital/window-kit/page.tsx',
  'docs/92b-capital-launch-runbook.md',
  'docs/92b-window-activation.md',
  'docs/92b-stripe-approval-packet.md',
  'docs/soe-external-action-approval-matrix.md',
  'docs/soe-env-readiness-template.md',
  'docs/92b-window-sign.html',
  'public/images/92b-window-qr.svg',
  'supabase/migrations/20260526_capital_patronage.sql',
  'supabase/migrations/20260526_capital_pipeline.sql',
];

const COPY_SCAN_FILES = [
  'app/92b/page.tsx',
  'app/92b/fund/page.tsx',
  'app/projects/page.tsx',
  'app/projects/[id]/page.tsx',
  'docs/92b-window-activation.md',
  'docs/92b-patron-note.md',
  'docs/92b-founder-outreach-drafts.md',
  'docs/92b-outreach-approval-queue.md',
];

const RISK_TERMS = [
  'profit',
  'dividend',
  'equity',
  'security',
  'securities',
  'secured lease',
  'guaranteed',
  'investment return',
  'investor',
  'lease signed',
  'space is ours',
  'currently under construction',
  'construction is underway',
  'this is happening',
  'will be open',
];

const SAFE_NEGATIONS = [
  'not ',
  'no ',
  'without ',
  'do not',
  'never ',
  'avoid ',
  'is not',
  'are not',
  'not buying',
  'not receiving',
  'not equity',
];

const STRIPE_PRICE_ID_PATTERN = /price_[A-Za-z0-9]{8,}/;
const REQUIRED_STRIPE_WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
];

function addCheck(status, id, label, detail) {
  checks.push({ status, id, label, detail });
}

function modeForStripeKey() {
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (!key) return 'missing';
  if (key.startsWith('sk_test_')) return 'test';
  if (key.startsWith('sk_live_')) return 'live';
  return 'unknown';
}

function checkEnv() {
  addCheck(
    'pass',
    'env:mode',
    'Preflight env mode',
    envMode === 'production'
      ? 'Production env files requested explicitly with --production-env.'
      : 'Development env files loaded by default. Use --production-env for a read-only production configuration audit.',
  );

  for (const item of REQUIRED_ENV) {
    addCheck(
      item.present() ? 'pass' : 'fail',
      `env:${item.id}`,
      item.label,
      item.present() ? 'Configured.' : item.detail,
    );
  }

  for (const item of OPTIONAL_ENV) {
    addCheck(
      item.present() ? 'pass' : 'warn',
      `env:${item.id}`,
      item.label,
      item.present() ? 'Configured.' : item.detail,
    );
  }

  const mode = modeForStripeKey();
  if (mode === 'test') {
    addCheck('pass', 'stripe:key-mode', 'Stripe key mode', 'Test-mode secret key detected.');
  } else if (mode === 'live') {
    addCheck(
      args.has('--require-test-stripe') ? 'fail' : 'warn',
      'stripe:key-mode',
      'Stripe key mode',
      'Live-mode key detected. Do not run local checkout tests with this key.',
    );
  } else {
    addCheck('fail', 'stripe:key-mode', 'Stripe key mode', `Stripe key mode is ${mode}.`);
  }
}

function checkFiles() {
  for (const relativePath of REQUIRED_FILES) {
    const absolutePath = path.join(root, relativePath);
    addCheck(
      existsSync(absolutePath) ? 'pass' : 'fail',
      `file:${relativePath}`,
      relativePath,
      existsSync(absolutePath) ? 'Present.' : 'Required launch asset is missing.',
    );
  }
}

function lineIsSafeDisclaimer(line) {
  const normalized = line.toLowerCase();
  return SAFE_NEGATIONS.some((phrase) => normalized.includes(phrase));
}

function checkCopyRisk() {
  const findings = [];
  for (const relativePath of COPY_SCAN_FILES) {
    const absolutePath = path.join(root, relativePath);
    if (!existsSync(absolutePath)) continue;
    const lines = readFileSync(absolutePath, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (lineIsSafeDisclaimer(line)) return;
      const normalized = line.toLowerCase();
      for (const term of RISK_TERMS) {
        if (normalized.includes(term)) {
          findings.push(`${relativePath}:${index + 1} contains "${term}"`);
        }
      }
    });
  }

  addCheck(
    findings.length ? 'fail' : 'pass',
    'copy:risk-terms',
    'Conditional non-financial copy scan',
    findings.length ? findings.slice(0, 8).join('; ') : 'No risky positive claims found in launch copy surfaces.',
  );
}

function collectCodeFiles(relativeDir) {
  const absoluteDir = path.join(root, relativeDir);
  if (!existsSync(absoluteDir)) return [];
  const files = [];
  for (const entry of readdirSync(absoluteDir)) {
    const absoluteEntry = path.join(absoluteDir, entry);
    const relativeEntry = path.relative(root, absoluteEntry);
    if (statSync(absoluteEntry).isDirectory()) files.push(...collectCodeFiles(relativeEntry));
    else if (/\.(ts|tsx|js|jsx)$/.test(entry)) files.push(relativeEntry);
  }
  return files;
}

function checkHardcodedStripePrices() {
  const files = [
    ...collectCodeFiles('app'),
    ...collectCodeFiles('lib'),
  ];
  const findings = [];
  for (const relativePath of files) {
    const source = readFileSync(path.join(root, relativePath), 'utf8');
    if (STRIPE_PRICE_ID_PATTERN.test(source)) findings.push(relativePath);
  }

  addCheck(
    findings.length ? 'fail' : 'pass',
    'stripe:no-hardcoded-price-ids',
    'No hard-coded Stripe price ids',
    findings.length ? findings.slice(0, 10).join(', ') : 'Stripe price ids are read from environment variables.',
  );
}

async function withTimeout(promise, label, timeoutMs = NETWORK_TIMEOUT_MS) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function checkPublicTierCopy() {
  const joinSource = readFileSync(path.join(root, 'app/join/page.tsx'), 'utf8');
  const accessSource = readFileSync(path.join(root, 'app/access/page.tsx'), 'utf8');
  const joinExpected = {
    seeker: '$19',
    scholar: '$49',
    philosopher: '$99',
    oracle: '$499',
  };
  const accessExpected = {
    SEEKER: '$19/mo',
    SCHOLAR: '$49/mo',
    PHILOSOPHER: '$99/mo',
  };
  const findings = [];

  for (const [tier, price] of Object.entries(joinExpected)) {
    const pattern = new RegExp(`id: '${tier}'[\\s\\S]*?price: '${escapeRegExp(price)}'`);
    if (!pattern.test(joinSource)) findings.push(`/join ${tier} should display ${price}`);
  }

  for (const [tier, subtitle] of Object.entries(accessExpected)) {
    const pattern = new RegExp(`name: '${tier}'[\\s\\S]*?subtitle: '${escapeRegExp(subtitle)}'`);
    if (!pattern.test(accessSource)) findings.push(`/access ${tier} should display ${subtitle}`);
  }

  addCheck(
    findings.length ? 'fail' : 'pass',
    'membership:tier-copy',
    'Membership tier copy',
    findings.length ? findings.join('; ') : 'Join and Access tier prices match the Stripe tier ladder.',
  );
}

async function checkRoutes() {
  const baseUrl = process.env.CAPITAL_PREFLIGHT_BASE_URL || 'http://localhost:3000';
  const routeChecks = [
    { path: '/92b/fund', expected: 200, label: '92B campaign page' },
    { path: '/capital/launch-room', expected: 200, label: 'Launch Room shell' },
    { path: '/api/admin/capital', expected: 401, label: 'Admin command API unauthenticated boundary' },
    { path: '/api/admin/capital/window-kit', expected: 401, label: 'Window Kit API unauthenticated boundary' },
    { path: '/api/admin/capital/launch-room', expected: 401, label: 'Launch Room API unauthenticated boundary' },
  ];

  for (const item of routeChecks) {
    try {
      const response = await fetch(`${baseUrl}${item.path}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
      });
      addCheck(
        response.status === item.expected ? 'pass' : 'fail',
        `route:${item.path}`,
        item.label,
        `Expected ${item.expected}, received ${response.status}.`,
      );
    } catch (error) {
      addCheck('fail', `route:${item.path}`, item.label, `Route check failed: ${errorMessage(error)}`);
    }
  }
}

async function checkSupabaseRead() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    addCheck('fail', 'supabase:read', 'Supabase read check', 'Supabase URL or service role key is missing.');
    return;
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const tables = ['pledge_events', 'capital_pipeline_leads'];

  for (const table of tables) {
    const { error } = await withTimeout(
      supabase.from(table).select('id', { count: 'exact', head: true }),
      `Supabase ${table} read`,
    );
    addCheck(
      error ? 'fail' : 'pass',
      `supabase:${table}`,
      `Supabase table: ${table}`,
      error ? `${error.code || 'error'} ${error.message || 'table check failed'}` : 'Reachable with service-role read.',
    );
  }
}

async function checkStripeCatalog() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    addCheck('fail', 'stripe:catalog', 'Stripe catalog read', 'STRIPE_SECRET_KEY is missing.');
    return;
  }

  const { default: Stripe } = await import('stripe');
  const stripe = new Stripe(key, { apiVersion: '2026-03-25.dahlia', maxNetworkRetries: 1, timeout: NETWORK_TIMEOUT_MS });
  const configuredPrices = {
    seeker: process.env.STRIPE_PRICE_SEEKER,
    scholar: process.env.STRIPE_PRICE_SCHOLAR,
    philosopher: process.env.STRIPE_PRICE_PHILOSOPHER,
    oracle: process.env.STRIPE_PRICE_ORACLE,
  };

  try {
    const endpoints = await withTimeout(
      stripe.webhookEndpoints.list({ limit: 100 }),
      'Stripe webhook endpoint read',
    );
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
    const expectedUrl = siteUrl
      ? new URL('/api/stripe/webhook', siteUrl).toString()
      : null;
    const endpoint = expectedUrl
      ? endpoints.data.find((candidate) => candidate.status === 'enabled' && candidate.url === expectedUrl)
      : null;

    addCheck(
      endpoint ? 'pass' : 'fail',
      'stripe:webhook:membership-endpoint',
      'Stripe membership and capital webhook endpoint',
      endpoint
        ? `Enabled at ${expectedUrl}.`
        : expectedUrl
          ? `No enabled Stripe webhook endpoint targets ${expectedUrl}. Paid memberships and capital pledges cannot be fulfilled safely.`
          : 'Cannot derive the membership webhook URL because NEXT_PUBLIC_SITE_URL or SITE_URL is missing.',
    );

    if (endpoint) {
      const enabledEvents = new Set(endpoint.enabled_events);
      const missingEvents = enabledEvents.has('*')
        ? []
        : REQUIRED_STRIPE_WEBHOOK_EVENTS.filter((event) => !enabledEvents.has(event));
      addCheck(
        missingEvents.length ? 'fail' : 'pass',
        'stripe:webhook:membership-events',
        'Stripe membership webhook events',
        missingEvents.length
          ? `Endpoint is missing required events: ${missingEvents.join(', ')}.`
          : `Endpoint includes ${REQUIRED_STRIPE_WEBHOOK_EVENTS.join(', ')}.`,
      );
    }
  } catch (error) {
    addCheck(
      'fail',
      'stripe:webhook:membership-endpoint',
      'Stripe membership and capital webhook endpoint',
      errorMessage(error),
    );
  }

  for (const [tier, priceId] of Object.entries(configuredPrices)) {
    if (!priceId) continue;
    try {
      const price = await withTimeout(stripe.prices.retrieve(priceId), `Stripe price ${tier} read`);
      addCheck(
        price.active ? 'pass' : 'fail',
        `stripe:price:${tier}`,
        `Stripe price: ${tier}`,
        price.active
          ? `Price is active, ${price.currency.toUpperCase()} ${((price.unit_amount || 0) / 100).toLocaleString()}.`
          : 'Configured price exists but is inactive.',
      );
    } catch (error) {
      addCheck('fail', `stripe:price:${tier}`, `Stripe price: ${tier}`, errorMessage(error));
    }
  }

  if (!configuredPrices.oracle) {
    try {
      const prices = await withTimeout(
        stripe.prices.list({
          active: true,
          currency: 'usd',
          limit: 100,
          expand: ['data.product'],
        }),
        'Stripe Oracle price candidate read',
      );
      const candidates = prices.data
        .filter((price) => !price.recurring && price.unit_amount === 49_900)
        .map((price) => {
          const productName = typeof price.product === 'string' ? price.product : price.product?.name || 'Unnamed product';
          return `${price.id} (${productName})`;
        });

      addCheck(
        candidates.length ? 'warn' : 'fail',
        'stripe:oracle-candidates',
        'Oracle price candidates',
        candidates.length
          ? `Found active one-time $499 candidates: ${candidates.join(', ')}. Set STRIPE_PRICE_ORACLE explicitly before checkout tests.`
          : 'No active one-time USD $499 price candidates found.',
      );
    } catch (error) {
      addCheck('fail', 'stripe:oracle-candidates', 'Oracle price candidates', errorMessage(error));
    }
  }
}

function runCommand(label, command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim().split(/\r?\n/).slice(-8).join(' | ');
  addCheck(
    result.status === 0 ? 'pass' : 'fail',
    `cmd:${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    label,
    result.status === 0 ? 'Command passed.' : output || `Command exited with ${result.status}.`,
  );
}

function checkLocalCommands() {
  runCommand('Capital lint pass', 'npx', [
    'eslint',
    'app/92b/fund/page.tsx',
    'app/api/92b/checkout/route.ts',
    'app/api/projects/[id]/pledge/route.ts',
    'app/api/checkout/route.ts',
    'app/api/merch/checkout/route.ts',
    'app/api/stripe/webhook/route.ts',
    'app/api/admin/capital/route.ts',
    'app/api/admin/capital/launch-room/route.ts',
    'app/capital/page.tsx',
    'app/capital/launch-room/page.tsx',
    'lib/capital/launchReadiness.ts',
    'lib/capital/launchRoom.ts',
    'lib/capital/pledgeLedger.ts',
  ]);
  runCommand('Production build', 'npm', ['run', 'build']);
}

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return String(error || 'unknown error');
}

function printText() {
  const byStatus = checks.reduce((acc, check) => {
    acc[check.status] = (acc[check.status] || 0) + 1;
    return acc;
  }, {});

  console.log('Capital Preflight');
  console.log(`Generated: ${startedAt}`);
  console.log(`Summary: ${byStatus.pass || 0} pass, ${byStatus.warn || 0} warn, ${byStatus.fail || 0} fail`);
  console.log('');
  for (const status of ['fail', 'warn', 'pass']) {
    const group = checks.filter((check) => check.status === status);
    if (!group.length) continue;
    console.log(status.toUpperCase());
    for (const check of group) {
      console.log(`- ${check.label}: ${check.detail}`);
    }
    console.log('');
  }
}

async function main() {
  checkEnv();
  checkFiles();
  checkCopyRisk();
  checkPublicTierCopy();
  checkHardcodedStripePrices();
  if (args.has('--routes')) await checkRoutes();
  if (args.has('--supabase-read')) await checkSupabaseRead();
  if (args.has('--stripe-read')) await checkStripeCatalog();
  if (args.has('--full')) checkLocalCommands();

  const payload = {
    generatedAt: startedAt,
    summary: checks.reduce((acc, check) => {
      acc[check.status] = (acc[check.status] || 0) + 1;
      return acc;
    }, {}),
    checks,
  };

  if (args.has('--json')) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    printText();
  }

  const failed = checks.some((check) => check.status === 'fail');
  process.exitCode = failed && !args.has('--soft') ? 1 : 0;
}

main().catch((error) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
