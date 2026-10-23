#!/usr/bin/env node

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

function selectBlocks(source) {
  const blocks = [];
  const regex = /\.select\(([\s\S]*?)\)/g;
  let match;
  while ((match = regex.exec(source))) blocks.push(match[1]);
  return blocks;
}

function includesAny(value, terms) {
  const normalized = value.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

const sources = {
  admin: read('app/api/admin/capital/route.ts'),
  pipelineRoute: read('app/api/admin/capital/pipeline/route.ts'),
  pipelineStore: read('lib/capital/pipelineStore.ts'),
  pipelineModel: read('lib/capital/pipeline.ts'),
  launchRoom: read('lib/capital/launchRoom.ts'),
  privacyModel: read('docs/soe-privacy-threat-model.md'),
};

const forbiddenSelectTerms = [
  'email',
  'phone',
  'wallet',
  'wallet_address',
  'stripe',
  'customer',
  'payment_intent',
  'checkout_session',
  'session_id',
  'full_name',
  'first_name',
  'last_name',
];

const sendCapableTerms = [
  'resend',
  'gmail',
  'slack',
  'sendgrid',
  'postmark',
  'twilio',
  'nodemailer',
  'sendEmail',
  'sendMessage',
];

const checks = [
  {
    label: 'Capital command center selects aggregate/non-contact fields only',
    ok: !selectBlocks(sources.admin).some((block) => includesAny(block, forbiddenSelectTerms)),
  },
  {
    label: 'Capital command center keeps aggregate read failures generic and private',
    ok:
      sources.admin.includes("import { privateJson } from '@/lib/http/routeError'") &&
      sources.admin.includes('function reportCapitalCommandFailure') &&
      sources.admin.includes("return commandCenterJson({ error: 'Capital command center unavailable' }") &&
      sources.admin.includes("const CAPITAL_COMMAND_RESPONSE_HEADERS =") &&
      !sources.admin.includes('throw error') &&
      !sources.admin.includes('console.error') &&
      !sources.admin.includes('error.message') &&
      !sources.admin.includes('NextResponse.json'),
  },
  {
    label: 'Capital pipeline store does not select contact/payment identifiers',
    ok: !selectBlocks(sources.pipelineStore).some((block) => includesAny(block, forbiddenSelectTerms)),
  },
  {
    label: 'Capital pipeline route remains draft-only and imports no send-capable provider',
    ok:
      sources.pipelineRoute.includes('CAPITAL_PIPELINE_NO_SEND_BOUNDARY') &&
      !includesAny(sources.pipelineRoute, sendCapableTerms),
  },
  {
    label: 'Capital pipeline route keeps database failures generic and private',
    ok:
      sources.pipelineRoute.includes("import { privateJson } from '@/lib/http/routeError'") &&
      sources.pipelineRoute.includes('function reportCapitalPipelineFailure') &&
      sources.pipelineRoute.includes("return pipelineJson({ error: 'Capital pipeline unavailable' }") &&
      sources.pipelineRoute.includes("const PIPELINE_RESPONSE_HEADERS =") &&
      !sources.pipelineRoute.includes('throw error') &&
      !sources.pipelineRoute.includes('console.error') &&
      !sources.pipelineRoute.includes('error.message') &&
      !sources.pipelineRoute.includes('NextResponse.json'),
  },
  {
    label: 'Capital pipeline model keeps no-send boundary explicit',
    ok:
      sources.pipelineModel.includes('CAPITAL_PIPELINE_NO_SEND_BOUNDARY') &&
      sources.pipelineModel.includes('does not send email') &&
      sources.pipelineModel.includes('contact the landlord'),
  },
  {
    label: 'Launch Room still states no outreach or landlord action without approval',
    ok:
      sources.launchRoom.includes('No landlord contact') &&
      sources.launchRoom.includes('No outreach until recipient batch, channel, and exact message text are approved.'),
  },
  {
    label: 'Privacy threat model documents admin response-shape checks',
    ok:
      sources.privacyModel.includes('Add a capital admin response-shape smoke test') &&
      sources.privacyModel.includes('Keep capital admin responses aggregate/redacted by default.'),
  },
];

const failed = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.label}`);
}

if (failed.length > 0) {
  process.exitCode = 1;
}
