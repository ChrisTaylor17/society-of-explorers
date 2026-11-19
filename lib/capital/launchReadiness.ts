import { existsSync, readFileSync } from 'fs';
import path from 'path';

export type ReadinessStatus = 'ready' | 'needs_approval' | 'blocked' | 'manual';

export type EnvReadinessCheck = {
  id: string;
  label: string;
  required: boolean;
  present: boolean;
  detail: string;
};

export type FileReadinessCheck = {
  id: string;
  label: string;
  path: string;
  present: boolean;
};

export type CopyRiskFinding = {
  file: string;
  line: number;
  term: string;
  text: string;
};

export type CapitalReadiness = {
  generatedAt: string;
  overallStatus: ReadinessStatus;
  blockers: string[];
  approvalsRequired: string[];
  env: EnvReadinessCheck[];
  files: FileReadinessCheck[];
  paymentSafety: PaymentSafety;
  copyRiskFindings: CopyRiskFinding[];
  summary: {
    requiredEnvMissing: number;
    filesMissing: number;
    paymentWarnings: number;
    copyWarnings: number;
  };
};

export type StripeSecretMode = 'missing' | 'test' | 'live' | 'unknown';

export type PaymentSafety = {
  stripeSecretMode: StripeSecretMode;
  webhookConfigured: boolean;
  configuredPriceIds: number;
  missingPriceIds: string[];
  canRunStripeTests: boolean;
  warnings: string[];
};

const REQUIRED_ENV: Array<Omit<EnvReadinessCheck, 'present'>> = [
  {
    id: 'site-url',
    label: 'Public site URL',
    required: true,
    detail: 'Needed for environment-safe Stripe success and cancel URLs.',
  },
  {
    id: 'stripe-secret',
    label: 'Stripe secret key',
    required: true,
    detail: 'Needed to create checkout sessions and verify webhook events.',
  },
  {
    id: 'stripe-webhook-secret',
    label: 'Stripe webhook secret',
    required: true,
    detail: 'Needed to verify webhook signatures before writing pledge events.',
  },
  {
    id: 'stripe-price-seeker',
    label: 'Seeker Stripe price',
    required: true,
    detail: 'Needed for membership tier consistency.',
  },
  {
    id: 'stripe-price-scholar',
    label: 'Scholar Stripe price',
    required: true,
    detail: 'Needed for membership tier consistency.',
  },
  {
    id: 'stripe-price-philosopher',
    label: 'Philosopher Stripe price',
    required: true,
    detail: 'Needed for membership tier consistency.',
  },
  {
    id: 'stripe-price-oracle',
    label: 'Oracle Stripe price',
    required: true,
    detail: 'Needed for the highest membership tier.',
  },
  {
    id: 'supabase-url',
    label: 'Supabase project URL',
    required: true,
    detail: 'Needed for pledge ledger, admin metrics, and member lookup.',
  },
  {
    id: 'supabase-service-role',
    label: 'Supabase service role key',
    required: true,
    detail: 'Needed by private server routes only.',
  },
  {
    id: 'admin-emails',
    label: 'Approved admin emails',
    required: false,
    detail: 'Recommended so the Capital Command Center is not relying only on defaults.',
  },
  {
    id: 'admin-wallets',
    label: 'Approved admin wallets',
    required: false,
    detail: 'Optional production wallet allowlist for wallet-only operators. Localhost has a development-only wallet fallback.',
  },
];

const FILES: Array<Omit<FileReadinessCheck, 'present'>> = [
  {
    id: 'migration',
    label: 'Capital patronage migration',
    path: 'supabase/migrations/20260526_capital_patronage.sql',
  },
  {
    id: 'pipeline-migration',
    label: 'Capital pipeline migration',
    path: 'supabase/migrations/20260526_capital_pipeline.sql',
  },
  {
    id: 'runbook',
    label: 'Capital launch runbook',
    path: 'docs/92b-capital-launch-runbook.md',
  },
  {
    id: 'window',
    label: 'Window activation draft',
    path: 'docs/92b-window-activation.md',
  },
  {
    id: 'stripe-approval-packet',
    label: 'Stripe approval packet',
    path: 'docs/92b-stripe-approval-packet.md',
  },
  {
    id: 'window-sign',
    label: 'Printable window sign draft',
    path: 'docs/92b-window-sign.html',
  },
  {
    id: 'window-qr',
    label: 'Window QR asset',
    path: 'public/images/92b-window-qr.svg',
  },
  {
    id: 'window-kit-page',
    label: 'Capital Window Kit',
    path: 'app/capital/window-kit/page.tsx',
  },
  {
    id: 'launch-room-page',
    label: 'Capital Launch Room',
    path: 'app/capital/launch-room/page.tsx',
  },
  {
    id: 'approvals-page',
    label: 'Capital Approvals',
    path: 'app/capital/approvals/page.tsx',
  },
  {
    id: 'patron-brief-page',
    label: 'Capital Patron Brief',
    path: 'app/capital/patron-brief/page.tsx',
  },
  {
    id: 'scenarios-page',
    label: 'Capital Scenario Planner',
    path: 'app/capital/scenarios/page.tsx',
  },
  {
    id: 'outreach-lab-page',
    label: 'Capital Outreach Lab',
    path: 'app/capital/outreach-lab/page.tsx',
  },
  {
    id: 'weekly-review-page',
    label: 'Capital Weekly Review',
    path: 'app/capital/weekly-review/page.tsx',
  },
  {
    id: 'capital-preflight',
    label: 'Capital preflight script',
    path: 'scripts/capital-preflight.mjs',
  },
  {
    id: 'patron-note',
    label: 'Patron note draft',
    path: 'docs/92b-patron-note.md',
  },
  {
    id: 'outreach',
    label: 'Founder outreach drafts',
    path: 'docs/92b-founder-outreach-drafts.md',
  },
  {
    id: 'outreach-queue',
    label: 'Outreach approval queue',
    path: 'docs/92b-outreach-approval-queue.md',
  },
  {
    id: 'campaign-page',
    label: '92B campaign page',
    path: 'app/92b/fund/page.tsx',
  },
  {
    id: 'capital-page',
    label: 'Capital Command Center',
    path: 'app/capital/page.tsx',
  },
  {
    id: 'pipeline-page',
    label: 'Capital Pipeline',
    path: 'app/capital/pipeline/page.tsx',
  },
];

const COPY_SCAN_FILES = [
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

function envPresent(id: string): boolean {
  switch (id) {
    case 'site-url':
      return Boolean(process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL);
    case 'stripe-secret':
      return Boolean(process.env.STRIPE_SECRET_KEY);
    case 'stripe-webhook-secret':
      return Boolean(process.env.STRIPE_WEBHOOK_SECRET);
    case 'stripe-price-seeker':
      return Boolean(process.env.STRIPE_PRICE_SEEKER);
    case 'stripe-price-scholar':
      return Boolean(process.env.STRIPE_PRICE_SCHOLAR);
    case 'stripe-price-philosopher':
      return Boolean(process.env.STRIPE_PRICE_PHILOSOPHER);
    case 'stripe-price-oracle':
      return Boolean(process.env.STRIPE_PRICE_ORACLE);
    case 'supabase-url':
      return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
    case 'supabase-service-role':
      return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
    case 'admin-emails':
      return Boolean(process.env.SOE_ADMIN_EMAILS);
    case 'admin-wallets':
      return Boolean(process.env.SOE_ADMIN_WALLETS || process.env.SOE_ADMIN_WALLET_ADDRESSES);
    default:
      return false;
  }
}

function stripeSecretMode(): StripeSecretMode {
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (!key) return 'missing';
  if (key.startsWith('sk_test_')) return 'test';
  if (key.startsWith('sk_live_')) return 'live';
  return 'unknown';
}

function buildPaymentSafety(): PaymentSafety {
  const missingPriceIds = [
    ['Seeker', process.env.STRIPE_PRICE_SEEKER],
    ['Scholar', process.env.STRIPE_PRICE_SCHOLAR],
    ['Philosopher', process.env.STRIPE_PRICE_PHILOSOPHER],
    ['Oracle', process.env.STRIPE_PRICE_ORACLE],
  ]
    .filter(([, value]) => !value)
    .map(([label]) => String(label));

  const mode = stripeSecretMode();
  const webhookConfigured = Boolean(process.env.STRIPE_WEBHOOK_SECRET);
  const warnings: string[] = [];

  if (mode === 'missing') warnings.push('Stripe secret key is missing.');
  if (mode === 'live') warnings.push('Stripe secret key is live-mode, so local/test checkout sessions should not be created.');
  if (mode === 'unknown') warnings.push('Stripe secret key mode is unknown.');
  if (!webhookConfigured) warnings.push('Stripe webhook secret is missing.');
  if (missingPriceIds.length > 0) warnings.push(`Missing Stripe price ids: ${missingPriceIds.join(', ')}.`);

  return {
    stripeSecretMode: mode,
    webhookConfigured,
    configuredPriceIds: 4 - missingPriceIds.length,
    missingPriceIds,
    canRunStripeTests: mode === 'test' && webhookConfigured && missingPriceIds.length === 0,
    warnings,
  };
}

function isSafeDisclaimerLine(line: string): boolean {
  const normalized = line.toLowerCase();
  return SAFE_NEGATIONS.some((phrase) => normalized.includes(phrase));
}

function absoluteKnownPath(relativePath: string): string | null {
  switch (relativePath) {
    case 'supabase/migrations/20260526_capital_patronage.sql':
      return path.join(process.cwd(), 'supabase', 'migrations', '20260526_capital_patronage.sql');
    case 'supabase/migrations/20260526_capital_pipeline.sql':
      return path.join(process.cwd(), 'supabase', 'migrations', '20260526_capital_pipeline.sql');
    case 'docs/92b-capital-launch-runbook.md':
      return path.join(process.cwd(), 'docs', '92b-capital-launch-runbook.md');
    case 'docs/92b-window-activation.md':
      return path.join(process.cwd(), 'docs', '92b-window-activation.md');
    case 'docs/92b-stripe-approval-packet.md':
      return path.join(process.cwd(), 'docs', '92b-stripe-approval-packet.md');
    case 'docs/92b-window-sign.html':
      return path.join(process.cwd(), 'docs', '92b-window-sign.html');
    case 'public/images/92b-window-qr.svg':
      return path.join(process.cwd(), 'public', 'images', '92b-window-qr.svg');
    case 'docs/92b-patron-note.md':
      return path.join(process.cwd(), 'docs', '92b-patron-note.md');
    case 'docs/92b-founder-outreach-drafts.md':
      return path.join(process.cwd(), 'docs', '92b-founder-outreach-drafts.md');
    case 'docs/92b-outreach-approval-queue.md':
      return path.join(process.cwd(), 'docs', '92b-outreach-approval-queue.md');
    case 'app/92b/fund/page.tsx':
      return path.join(process.cwd(), 'app', '92b', 'fund', 'page.tsx');
    case 'app/capital/page.tsx':
      return path.join(process.cwd(), 'app', 'capital', 'page.tsx');
    case 'app/capital/window-kit/page.tsx':
      return path.join(process.cwd(), 'app', 'capital', 'window-kit', 'page.tsx');
    case 'app/capital/launch-room/page.tsx':
      return path.join(process.cwd(), 'app', 'capital', 'launch-room', 'page.tsx');
    case 'app/capital/approvals/page.tsx':
      return path.join(process.cwd(), 'app', 'capital', 'approvals', 'page.tsx');
    case 'app/capital/patron-brief/page.tsx':
      return path.join(process.cwd(), 'app', 'capital', 'patron-brief', 'page.tsx');
    case 'app/capital/scenarios/page.tsx':
      return path.join(process.cwd(), 'app', 'capital', 'scenarios', 'page.tsx');
    case 'app/capital/outreach-lab/page.tsx':
      return path.join(process.cwd(), 'app', 'capital', 'outreach-lab', 'page.tsx');
    case 'scripts/capital-preflight.mjs':
      return path.join(process.cwd(), 'scripts', 'capital-preflight.mjs');
    case 'app/capital/pipeline/page.tsx':
      return path.join(process.cwd(), 'app', 'capital', 'pipeline', 'page.tsx');
    case 'app/projects/page.tsx':
      return path.join(process.cwd(), 'app', 'projects', 'page.tsx');
    case 'app/projects/[id]/page.tsx':
      return path.join(process.cwd(), 'app', 'projects', '[id]', 'page.tsx');
    default:
      return null;
  }
}

function scanCopyFile(relativePath: string): CopyRiskFinding[] {
  const absolutePath = absoluteKnownPath(relativePath);
  if (!absolutePath) return [];
  if (!existsSync(absolutePath)) return [];

  const lines = readFileSync(absolutePath, 'utf8').split(/\r?\n/);
  const findings: CopyRiskFinding[] = [];

  lines.forEach((line, index) => {
    const normalized = line.toLowerCase();
    if (isSafeDisclaimerLine(line)) return;

    for (const term of RISK_TERMS) {
      if (normalized.includes(term)) {
        findings.push({
          file: relativePath,
          line: index + 1,
          term,
          text: line.trim().slice(0, 180),
        });
      }
    }
  });

  return findings;
}

export function buildCapitalReadiness(options: { pledgeLedgerAvailable: boolean }): CapitalReadiness {
  const env = REQUIRED_ENV.map((check) => ({ ...check, present: envPresent(check.id) }));
  const files = FILES.map((check) => {
    const absolutePath = absoluteKnownPath(check.path);
    return { ...check, present: Boolean(absolutePath && existsSync(absolutePath)) };
  });
  const paymentSafety = buildPaymentSafety();
  const copyRiskFindings = COPY_SCAN_FILES.flatMap((file) => scanCopyFile(file));

  const requiredEnvMissing = env.filter((check) => check.required && !check.present).length;
  const filesMissing = files.filter((check) => !check.present).length;
  const blockers: string[] = [];
  const approvalsRequired = [
    'Production migration approval',
    'Deployment approval',
    'Stripe test checkout approval',
    'Window placement approval',
    'Outreach recipient and message approval',
    'Landlord-contact approval',
  ];

  if (requiredEnvMissing > 0) blockers.push('Required environment variables are missing.');
  if (filesMissing > 0) blockers.push('Required local launch files are missing.');
  if (!paymentSafety.canRunStripeTests) blockers.push('Stripe test checkout is not safe or fully configured yet.');
  if (copyRiskFindings.length > 0) blockers.push('Public or draft copy has potentially risky financial/location language.');
  if (!options.pledgeLedgerAvailable) blockers.push('The pledge ledger table is not reachable in this environment.');

  return {
    generatedAt: new Date().toISOString(),
    overallStatus: blockers.length > 0 ? 'blocked' : 'needs_approval',
    blockers,
    approvalsRequired,
    env,
    files,
    paymentSafety,
    copyRiskFindings,
    summary: {
      requiredEnvMissing,
      filesMissing,
      paymentWarnings: paymentSafety.warnings.length,
      copyWarnings: copyRiskFindings.length,
    },
  };
}
