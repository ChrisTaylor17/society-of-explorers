#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function hasAll(source, terms) {
  return terms.every((term) => source.includes(term));
}

const files = {
  envExample: read('.env.example'),
  envTemplate: read('docs/soe-env-readiness-template.md'),
  handoff: read('docs/soe-current-thread-handoff.md'),
  stripePacket: read('docs/92b-stripe-approval-packet.md'),
  externalMatrix: read('docs/soe-external-action-approval-matrix.md'),
};

const capitalEnv = [
  'NEXT_PUBLIC_SITE_URL',
  'SITE_URL',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_WEBHOOK_SECRET_MERCH',
  'STRIPE_PRICE_SEEKER',
  'STRIPE_PRICE_SCHOLAR',
  'STRIPE_PRICE_PHILOSOPHER',
  'STRIPE_PRICE_ORACLE',
  'CAPITAL_WEBHOOK_EMAIL_NOTIFICATIONS_ENABLED',
  'CAPITAL_LEAD_EMAIL_NOTIFICATIONS_ENABLED',
  'PROJECT_LEAD_EMAIL_NOTIFICATIONS_ENABLED',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SOE_ADMIN_EMAILS',
  'SOE_ADMIN_WALLETS',
  'SOE_ADMIN_WALLET_ADDRESSES',
  'SOE_DISABLE_LOCAL_WALLET_ADMIN',
  'PUBLIC_LEAD_EMAIL_NOTIFICATIONS_ENABLED',
  'COUNCIL_WAITLIST_EMAIL_NOTIFICATIONS_ENABLED',
  'DAILY_PRACTICE_EMAIL_NOTIFICATIONS_ENABLED',
  'DAILY_PRACTICE_FOLLOWUP_EMAIL_NOTIFICATIONS_ENABLED',
  'PROACTIVE_EMAIL_NOTIFICATIONS_ENABLED',
  'PROVOCATION_TEST_EMAIL_NOTIFICATIONS_ENABLED',
  'PROVOCATION_WEEKLY_EMAIL_NOTIFICATIONS_ENABLED',
  'ONBOARDING_EMAIL_NOTIFICATIONS_ENABLED',
  'ONBOARDING_BATCH_TRIGGER_ENABLED',
  'DM_EMAIL_NOTIFICATIONS_ENABLED',
];

const aiEnv = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'OPENAI_REALTIME_MODEL',
  'OPENAI_SAFETY_SALT',
  'AI_GATEWAY_ENABLED',
  'AI_GATEWAY_API_KEY',
];

const externalProviderEnv = [
  'RESEND_API_KEY',
  'FAL_API_KEY',
  'DAILY_API_KEY',
  'ELEVENLABS_API_KEY',
  'PRINTFUL_API_KEY',
];

const externalActionSecretEnv = [
  'CRON_SECRET',
  'SOE_ADMIN_PRIVATE_KEY',
];

const blockchainMintEnv = [
  'NEXT_PUBLIC_SOE_MEMBERSHIP_ADDRESS',
  'NEXT_PUBLIC_SOE_ACHIEVEMENTS_ADDRESS',
  'MOVEMENT_ONCHAIN',
  'SOLANA_RPC_URL',
  'SOLANA_MINT_AUTHORITY_KEY',
  'SOLANA_EXP_MINT',
];

const mediaFulfillmentMintEnv = [
  'MEMBERSHIP_NFT_AUTO_MINT_ENABLED',
  'ARTIFACT_MERCH_ORDERING_ENABLED',
  'ARTIFACT_NFT_MINT_RECORDING_ENABLED',
];

const approvalGatedFalseEnv = [
  'CAPITAL_WEBHOOK_EMAIL_NOTIFICATIONS_ENABLED',
  'CAPITAL_LEAD_EMAIL_NOTIFICATIONS_ENABLED',
  'PROJECT_LEAD_EMAIL_NOTIFICATIONS_ENABLED',
  'PUBLIC_LEAD_EMAIL_NOTIFICATIONS_ENABLED',
  'COUNCIL_WAITLIST_EMAIL_NOTIFICATIONS_ENABLED',
  'DAILY_PRACTICE_EMAIL_NOTIFICATIONS_ENABLED',
  'DAILY_PRACTICE_FOLLOWUP_EMAIL_NOTIFICATIONS_ENABLED',
  'PROACTIVE_EMAIL_NOTIFICATIONS_ENABLED',
  'PROVOCATION_TEST_EMAIL_NOTIFICATIONS_ENABLED',
  'PROVOCATION_WEEKLY_EMAIL_NOTIFICATIONS_ENABLED',
  'ONBOARDING_EMAIL_NOTIFICATIONS_ENABLED',
  'ONBOARDING_BATCH_TRIGGER_ENABLED',
  'DM_EMAIL_NOTIFICATIONS_ENABLED',
  'AI_GATEWAY_ENABLED',
  'MEMBERSHIP_NFT_AUTO_MINT_ENABLED',
  'MOVEMENT_ONCHAIN',
  'ARTIFACT_MERCH_ORDERING_ENABLED',
  'ARTIFACT_NFT_MINT_RECORDING_ENABLED',
];

const safePlaceholderLines = [
  'STRIPE_SECRET_KEY=sk_test_replace_me',
  'STRIPE_WEBHOOK_SECRET=whsec_test_replace_me',
  'STRIPE_WEBHOOK_SECRET_MERCH=whsec_test_merch_replace_me',
  'STRIPE_PRICE_ORACLE=price_test_oracle',
  'OPENAI_API_KEY=replace_with_openai_key',
  'OPENAI_SAFETY_SALT=replace_with_random_openai_safety_salt',
  'AI_GATEWAY_API_KEY=replace_with_ai_gateway_key',
  'RESEND_API_KEY=replace_with_resend_key',
  'PRINTFUL_API_KEY=replace_with_printful_key',
  'FAL_API_KEY=replace_with_fal_key',
  'ELEVENLABS_API_KEY=replace_with_elevenlabs_key',
  'DAILY_API_KEY=replace_with_daily_key',
  'NEXT_PUBLIC_SOE_MEMBERSHIP_ADDRESS=0x0000000000000000000000000000000000000000',
  'NEXT_PUBLIC_SOE_ACHIEVEMENTS_ADDRESS=0x0000000000000000000000000000000000000000',
  'SOLANA_RPC_URL=replace_with_solana_rpc_url',
  'SOLANA_MINT_AUTHORITY_KEY=replace_with_solana_mint_authority_key',
  'SOLANA_EXP_MINT=replace_with_solana_exp_mint_address',
  'WALLET_ENCRYPTION_KEY=replace_with_64_char_hex_wallet_encryption_key',
  'CRON_SECRET=replace_with_random_cron_secret',
];

const envExampleOnlyPlaceholderLines = [
  'SOE_ADMIN_PRIVATE_KEY=0xyour_admin_private_key_here',
];

const templateOnlyPlaceholderLines = [
  'SOE_ADMIN_PRIVATE_KEY=replace_with_0x_admin_private_key',
];

const localSecretEnv = [
  'NEXTAUTH_SECRET',
  'WALLET_SESSION_SECRET',
  'MOVEMENT_POD_SECRET',
  'WALLET_ENCRYPTION_KEY',
];

const disallowedExampleTerms = [
  'sk_live_',
  'rk_live_',
  'whsec_live',
  'price_1T',
  'price_1S',
];

const disallowedExamplePatterns = [
  {
    label: 'raw wallet or signer private key',
    pattern: /^(?:PRIVATE_KEY|SOE_ADMIN_PRIVATE_KEY)=0x[a-fA-F0-9]{64}$/m,
  },
  {
    label: 'raw wallet encryption key',
    pattern: /^WALLET_ENCRYPTION_KEY=[a-fA-F0-9]{64}$/m,
  },
  {
    label: 'real-looking Stripe webhook secret',
    pattern: /^STRIPE_WEBHOOK_SECRET(?:_MERCH)?=whsec_(?!test_(?:replace_me|merch_replace_me)$)[A-Za-z0-9_]{16,}$/m,
  },
  {
    label: 'real-looking Solana mint authority key',
    pattern: /^SOLANA_MINT_AUTHORITY_KEY=[1-9A-HJ-NP-Za-km-z]{64,}$/m,
  },
  {
    label: 'real-looking cron secret',
    pattern: /^CRON_SECRET=[A-Za-z0-9+/_=-]{32,}$/m,
  },
  {
    label: 'real-looking OpenAI key',
    pattern: /^OPENAI_API_KEY=sk-(?:proj-)?[A-Za-z0-9_-]{20,}$/m,
  },
  {
    label: 'real-looking Anthropic key',
    pattern: /^ANTHROPIC_API_KEY=sk-ant-api[0-9]{2}-[A-Za-z0-9_-]{20,}$/m,
  },
  {
    label: 'real-looking Resend key',
    pattern: /^RESEND_API_KEY=re_[A-Za-z0-9_-]{20,}$/m,
  },
];

function normalizeEnvAssignments(source) {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const assignment = line.match(/^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (!assignment) return line;

      let value = assignment[2].replace(/\s+#.*$/, '').trim();
      const quote = value[0];
      if ((quote === '"' || quote === "'") && value.at(-1) === quote) {
        value = value.slice(1, -1);
      }

      return `${assignment[1]}=${value}`;
    })
    .join('\n');
}

function hasDisallowedSecretPattern(source) {
  const assignments = normalizeEnvAssignments(source);
  return disallowedExamplePatterns.some(({ pattern }) => pattern.test(assignments));
}

function hasFalseDefaults(source) {
  const lines = new Set(normalizeEnvAssignments(source).split('\n'));
  return approvalGatedFalseEnv.every((envName) => lines.has(`${envName}=false`));
}

const disallowedSecretFixtures = new Map([
  ['raw wallet or signer private key', `SOE_ADMIN_PRIVATE_KEY=0x${'a'.repeat(64)}`],
  ['raw wallet encryption key', `WALLET_ENCRYPTION_KEY=${'b'.repeat(64)}`],
  ['real-looking Stripe webhook secret', `STRIPE_WEBHOOK_SECRET=whsec_${'c'.repeat(24)}`],
  ['real-looking Solana mint authority key', `SOLANA_MINT_AUTHORITY_KEY=${'3'.repeat(64)}`],
  ['real-looking cron secret', `CRON_SECRET=${'d'.repeat(40)}`],
  ['real-looking OpenAI key', `OPENAI_API_KEY=sk-${'e'.repeat(24)}`],
  ['real-looking Anthropic key', `ANTHROPIC_API_KEY=sk-ant-api03-${'f'.repeat(24)}`],
  ['real-looking Resend key', `RESEND_API_KEY=re_${'g'.repeat(24)}`],
]);

const safePlaceholderFixture = [
  ...safePlaceholderLines,
  ...envExampleOnlyPlaceholderLines,
  ...templateOnlyPlaceholderLines,
].join('\n');

const formattedSecretFixtures = [...disallowedSecretFixtures.values()].map((line) => {
  const separator = line.indexOf('=');
  return `  ${line.slice(0, separator)} = "${line.slice(separator + 1)}" # unsafe fixture`;
});
const commentedSecretFixture = [...disallowedSecretFixtures.values()]
  .map((line) => `# ${line}`)
  .join('\n');

const falseDefaultFixture = approvalGatedFalseEnv
  .map((envName) => `${envName}=false`)
  .join('\n');
const enabledDefaultFixture = falseDefaultFixture.replace(
  'MOVEMENT_ONCHAIN=false',
  'MOVEMENT_ONCHAIN=true',
);
const commentedDefaultFixture = falseDefaultFixture.replace(
  'MOVEMENT_ONCHAIN=false',
  '# MOVEMENT_ONCHAIN=false',
);

const checks = [
  {
    name: 'secret-shape detectors reject representative high-risk fixtures',
    ok: disallowedExamplePatterns.every(({ label, pattern }) =>
      pattern.test(disallowedSecretFixtures.get(label) ?? ''),
    ),
  },
  {
    name: 'secret-shape detectors accept documented safe placeholders',
    ok: !hasDisallowedSecretPattern(safePlaceholderFixture),
  },
  {
    name: 'secret-shape detectors normalize dotenv formatting and ignore comments',
    ok:
      formattedSecretFixtures.every((fixture) => hasDisallowedSecretPattern(fixture)) &&
      !hasDisallowedSecretPattern(commentedSecretFixture),
  },
  {
    name: 'approval-gate detector accepts only disabled defaults',
    ok:
      hasFalseDefaults(falseDefaultFixture) &&
      !hasFalseDefaults(enabledDefaultFixture) &&
      !hasFalseDefaults(commentedDefaultFixture),
  },
  {
    name: '.env.example documents capital launch required variables',
    ok: hasAll(files.envExample, capitalEnv),
  },
  {
    name: '.env.example documents AI and realtime readiness variables',
    ok: hasAll(files.envExample, aiEnv),
  },
  {
    name: '.env.example documents outbound provider, cron, blockchain, fulfillment, and mint gates',
    ok:
      hasAll(files.envExample, externalProviderEnv) &&
      hasAll(files.envExample, externalActionSecretEnv) &&
      hasAll(files.envExample, blockchainMintEnv) &&
      hasFalseDefaults(files.envExample) &&
      mediaFulfillmentMintEnv.every((envName) => files.envExample.includes(`${envName}=false`)),
  },
  {
    name: '.env.example documents local auth and pod secret variables',
    ok: hasAll(files.envExample, localSecretEnv),
  },
  {
    name: '.env.example uses placeholders and no real-looking secret examples',
    ok:
      hasAll(files.envExample, safePlaceholderLines) &&
      hasAll(files.envExample, envExampleOnlyPlaceholderLines) &&
      !disallowedExampleTerms.some((term) => files.envExample.includes(term)) &&
      !hasDisallowedSecretPattern(files.envExample),
  },
  {
    name: 'environment readiness template uses placeholders and no real-looking secret examples',
    ok:
      hasAll(files.envTemplate, safePlaceholderLines) &&
      hasAll(files.envTemplate, templateOnlyPlaceholderLines) &&
      !hasDisallowedSecretPattern(files.envTemplate),
  },
  {
    name: 'environment readiness template documents local/test baseline',
    ok:
      hasAll(files.envTemplate, capitalEnv) &&
      hasAll(files.envTemplate, aiEnv) &&
      files.envTemplate.includes('Local / Test Baseline'),
  },
  {
    name: 'environment readiness template documents outbound provider, cron, blockchain, fulfillment, and mint gates',
    ok:
      hasAll(files.envTemplate, externalProviderEnv) &&
      hasAll(files.envTemplate, externalActionSecretEnv) &&
      hasAll(files.envTemplate, blockchainMintEnv) &&
      hasAll(files.envTemplate, mediaFulfillmentMintEnv) &&
      hasFalseDefaults(files.envTemplate) &&
      files.envTemplate.includes('Outbound Provider / Fulfillment / Mint Baseline') &&
      files.envTemplate.includes('Provider or signer secret presence is readiness only') &&
      files.envTemplate.includes('key presence alone does not authorize a provider call'),
  },
  {
    name: 'environment readiness template states no external action authority',
    ok:
      files.envTemplate.includes('does not authorize editing production secrets') &&
      files.envTemplate.includes('Do not use the live Stripe key for local checkout creation or webhook replay'),
  },
  {
    name: 'handoff links environment readiness smoke and template',
    ok:
      files.handoff.includes('docs/soe-env-readiness-template.md') &&
      files.handoff.includes('npm run env:readiness:smoke'),
  },
  {
    name: 'Stripe approval packet points to environment readiness template',
    ok:
      files.stripePacket.includes('docs/soe-env-readiness-template.md') &&
      files.stripePacket.includes('npm run env:readiness:smoke'),
  },
  {
    name: 'external action matrix covers production env var mutation approval',
    ok:
      files.externalMatrix.includes('Approve setting STRIPE_PRICE_ORACLE') &&
      files.externalMatrix.includes('Approve setting STRIPE_WEBHOOK_SECRET_MERCH') &&
      files.externalMatrix.includes('Approve setting CAPITAL_WEBHOOK_EMAIL_NOTIFICATIONS_ENABLED=true') &&
      files.externalMatrix.includes('Approve setting CAPITAL_LEAD_EMAIL_NOTIFICATIONS_ENABLED=true') &&
      files.externalMatrix.includes('Approve setting PROJECT_LEAD_EMAIL_NOTIFICATIONS_ENABLED=true') &&
      files.externalMatrix.includes('Approve setting PUBLIC_LEAD_EMAIL_NOTIFICATIONS_ENABLED=true') &&
      files.externalMatrix.includes('Approve setting COUNCIL_WAITLIST_EMAIL_NOTIFICATIONS_ENABLED=true') &&
      files.externalMatrix.includes('Approve setting DAILY_PRACTICE_EMAIL_NOTIFICATIONS_ENABLED=true') &&
      files.externalMatrix.includes('Approve setting DAILY_PRACTICE_FOLLOWUP_EMAIL_NOTIFICATIONS_ENABLED=true') &&
      files.externalMatrix.includes('Approve setting PROACTIVE_EMAIL_NOTIFICATIONS_ENABLED=true') &&
      files.externalMatrix.includes('Approve setting PROVOCATION_TEST_EMAIL_NOTIFICATIONS_ENABLED=true') &&
      files.externalMatrix.includes('Approve setting PROVOCATION_WEEKLY_EMAIL_NOTIFICATIONS_ENABLED=true') &&
      files.externalMatrix.includes('Approve setting ONBOARDING_EMAIL_NOTIFICATIONS_ENABLED=true') &&
      files.externalMatrix.includes('Approve setting ONBOARDING_BATCH_TRIGGER_ENABLED=true') &&
      files.externalMatrix.includes('Approve setting DM_EMAIL_NOTIFICATIONS_ENABLED=true') &&
      files.externalMatrix.includes('Approve setting [RESEND_API_KEY/FAL_API_KEY/DAILY_API_KEY/ELEVENLABS_API_KEY/PRINTFUL_API_KEY]') &&
      files.externalMatrix.includes('Approve setting [CRON_SECRET/SOE_ADMIN_PRIVATE_KEY]') &&
      files.externalMatrix.includes('Approve setting [NEXT_PUBLIC_SOE_MEMBERSHIP_ADDRESS/NEXT_PUBLIC_SOE_ACHIEVEMENTS_ADDRESS]') &&
      files.externalMatrix.includes('Approve setting MOVEMENT_ONCHAIN=true') &&
      files.externalMatrix.includes('Approve setting [SOLANA_RPC_URL/SOLANA_MINT_AUTHORITY_KEY/SOLANA_EXP_MINT]') &&
      files.externalMatrix.includes('Approve setting MEMBERSHIP_NFT_AUTO_MINT_ENABLED=true') &&
      files.externalMatrix.includes('Approve setting ARTIFACT_MERCH_ORDERING_ENABLED=true') &&
      files.externalMatrix.includes('Approve setting ARTIFACT_NFT_MINT_RECORDING_ENABLED=true') &&
      files.externalMatrix.includes('target variable and environment'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nEnvironment readiness smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nEnvironment readiness smoke passed.');
