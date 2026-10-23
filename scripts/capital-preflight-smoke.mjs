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

const sources = {
  preflight: read('scripts/capital-preflight.mjs'),
  launchRoom: read('lib/capital/launchRoom.ts'),
  launchRoomPage: read('app/capital/launch-room/page.tsx'),
  prepReceipts: read('lib/capital/prepReceipts.ts'),
  authSession: read('lib/auth/getSession.ts'),
  metadataSmoke: read('scripts/capital-metadata-smoke.mjs'),
  privacySmoke: read('scripts/capital-privacy-smoke.mjs'),
  routeSmoke: read('scripts/capital-route-smoke.mjs'),
  approvalPacket: read('docs/92b-stripe-approval-packet.md'),
  handoff: read('docs/soe-current-thread-handoff.md'),
  runbook: read('docs/92b-capital-launch-runbook.md'),
};

const checks = [
  {
    label: 'preflight defaults to development env',
    ok:
      sources.preflight.includes("const envMode = args.has('--production-env') ? 'production' : 'development';") &&
      sources.preflight.includes("loadEnvConfig(root, envMode !== 'production');"),
  },
  {
    label: 'preflight exposes production env as explicit read-only mode',
    ok:
      sources.preflight.includes('--production-env') &&
      sources.preflight.includes('Production env files requested explicitly with --production-env.'),
  },
  {
    label: 'preflight network checks have timeouts',
    ok:
      sources.preflight.includes('const NETWORK_TIMEOUT_MS = 8_000;') &&
      sources.preflight.includes('AbortSignal.timeout(NETWORK_TIMEOUT_MS)') &&
      sources.preflight.includes('withTimeout('),
  },
  {
    label: 'preflight scans the full 92B public path for false location claims',
    ok:
      sources.preflight.includes("'app/92b/page.tsx'") &&
      sources.preflight.includes("'lease signed'") &&
      sources.preflight.includes("'space is ours'") &&
      sources.preflight.includes("'currently under construction'") &&
      sources.preflight.includes("'construction is underway'") &&
      sources.preflight.includes("'this is happening'"),
  },
  {
    label: 'Stripe read preflight requires the live membership webhook contract',
    ok:
      sources.preflight.includes("stripe.webhookEndpoints.list({ limit: 100 })") &&
      sources.preflight.includes("new URL('/api/stripe/webhook', siteUrl).toString()") &&
      sources.preflight.includes("'checkout.session.completed'") &&
      sources.preflight.includes("'customer.subscription.updated'") &&
      sources.preflight.includes("'customer.subscription.deleted'") &&
      sources.preflight.includes('Paid memberships and capital pledges cannot be fulfilled safely.'),
  },
  {
    label: 'Launch Room shows separate local and production preflight commands',
    ok:
      sources.launchRoom.includes('Local capital preflight audit') &&
      sources.launchRoom.includes('Production env readiness audit') &&
      sources.launchRoom.includes('npm run capital:preflight -- --production-env --supabase-read --stripe-read --soft'),
  },
  {
    label: 'approval packet documents local and production preflight modes',
    ok:
      sources.approvalPacket.includes('Current Production-Env Preflight Result') &&
      sources.approvalPacket.includes('Local/dev checks remain separate from the authenticated Vercel production audit.') &&
      sources.approvalPacket.includes('npx vercel env run --environment=production -- npm run capital:preflight -- --stripe-read --soft') &&
      sources.approvalPacket.includes('Use `--production-env` only for read-only configuration audits.'),
  },
  {
    label: 'runbook separates local/dev and production-env verification',
    ok:
      sources.runbook.includes('Run local/dev verification') &&
      sources.runbook.includes('Run read-only production-env verification') &&
      sources.runbook.includes('This must not create checkout sessions, replay webhooks, deploy, or send public traffic.'),
  },
  {
    label: 'Supabase auth lookup is bounded so private pages do not hang',
    ok:
      sources.authSession.includes('const AUTH_LOOKUP_TIMEOUT_MS = 5_000') &&
      sources.authSession.includes('withAuthLookupTimeout(') &&
      sources.authSession.includes('setTimeout(() => reject(new Error(`${label} timed out`))') &&
      sources.authSession.includes('Supabase session lookup'),
  },
  {
    label: 'Launch Room exits loading state on auth or API failure',
    ok:
      sources.launchRoomPage.includes('setLoading(false)') &&
      sources.launchRoomPage.includes('finally') &&
      sources.launchRoomPage.includes('Sign in as an approved admin account to view the Launch Room.'),
  },
  {
    label: 'Launch Room returns local-only prep readiness and no-action receipt',
    ok:
      sources.launchRoom.includes('buildCapitalPrepReadiness') &&
      sources.launchRoom.includes('prepReceipt: buildCapitalPrepReceipt') &&
      sources.launchRoom.includes("action: 'launch_room_prepared'") &&
      sources.launchRoom.includes('No deploy, public launch, payment collection, checkout session, webhook replay, migration, outreach, landlord contact, printing, physical placement, connected-tool mutation, or public claim occurred.') &&
      sources.prepReceipts.includes("'/capital/launch-room'"),
  },
  {
    label: 'Launch Room page displays prep readiness and receipt boundary',
    ok:
      sources.launchRoomPage.includes('CAPITAL PREP READINESS') &&
      sources.launchRoomPage.includes('LAUNCH ROOM RECEIPT') &&
      sources.launchRoomPage.includes('room.prepReceipt.detail') &&
      sources.launchRoomPage.includes('room.prepReadiness.externalActions') &&
      sources.launchRoomPage.includes('room.prepReadiness.exactApprovalRequiredFor.map'),
  },
  {
    label: 'operator docs record Launch Room no-action receipts',
    ok:
      sources.handoff.includes('`/capital/launch-room` now carries capital prep readiness') &&
      sources.handoff.includes('capital:preflight:smoke` also verifies Launch Room receipts') &&
      sources.runbook.includes('Use the Launch Room to prepare, not execute, external actions.') &&
      sources.handoff.includes('No deploy, public launch, payment collection, checkout session, webhook replay, migration, outreach, landlord contact, printing, physical placement, connected-tool mutation, or public claim occurred.'),
  },
  {
    label: 'capital route smoke guard is localhost-only and documented',
    ok:
      sources.routeSmoke.includes("new Set(['localhost', '127.0.0.1', '::1'])") &&
      sources.routeSmoke.includes('Refusing to smoke-test non-local host') &&
      sources.routeSmoke.includes('/api/admin/capital/launch-room') &&
      sources.launchRoom.includes('Capital route smoke guard') &&
      sources.runbook.includes('npm run capital:routes:smoke') &&
      sources.handoff.includes('npm run capital:routes:smoke'),
  },
  {
    label: 'capital privacy smoke guard is documented',
    ok:
      sources.privacySmoke.includes('forbiddenSelectTerms') &&
      sources.privacySmoke.includes('CAPITAL_PIPELINE_NO_SEND_BOUNDARY') &&
      sources.launchRoom.includes('Capital privacy smoke guard') &&
      sources.runbook.includes('npm run capital:privacy:smoke') &&
      sources.handoff.includes('npm run capital:privacy:smoke'),
  },
  {
    label: 'capital metadata smoke guard is documented',
    ok:
      sources.metadataSmoke.includes('forbiddenMetadataKeys') &&
      sources.metadataSmoke.includes("type: '92b_pledge'") &&
      sources.metadataSmoke.includes("type: 'project_pledge'") &&
      sources.launchRoom.includes('Capital metadata smoke guard') &&
      sources.runbook.includes('npm run capital:metadata:smoke') &&
      sources.handoff.includes('npm run capital:metadata:smoke'),
  },
];

const failed = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.label}`);
}

if (failed.length > 0) {
  process.exitCode = 1;
}
