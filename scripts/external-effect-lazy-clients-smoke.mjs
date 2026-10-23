#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function lacksModuleScopeClients(source) {
  return (
    !source.includes("import Anthropic from '@anthropic-ai/sdk'") &&
    !source.includes("import { Resend } from 'resend'") &&
    !source.includes("import { createClient } from '@supabase/supabase-js'") &&
    !source.includes('new Anthropic({') &&
    !source.includes('new Resend(process.env.RESEND_API_KEY') &&
    !source.includes('createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!')
  );
}

function appendVaryPattern(token) {
  return new RegExp(
    String.raw`appendVary\(\s*(?:response(?:\.headers)?|headers)\s*,\s*['"]${token}['"]\s*\)`,
  );
}

const routes = {
  cronDailyEmail: read('app/api/cron/daily-email/route.ts'),
  cronCreateLiveSession: read('app/api/cron/create-live-session/route.ts'),
  practiceDailyEmail: read('app/api/practice/daily-email/route.ts'),
  dailyEmailToggle: read('app/api/daily-email/toggle/route.ts'),
  testProvocation: read('app/api/email/test-provocation/route.ts'),
  weeklyProvocation: read('app/api/email/weekly-provocation/route.ts'),
  feed: read('app/api/feed/route.ts'),
  feedPulse: read('app/api/feed/pulse/route.ts'),
  taste: read('app/api/taste/route.ts'),
  ritualDrops: read('app/api/ritual-drops/route.ts'),
  voiceNotes: read('app/api/voice-notes/generate/route.ts'),
  artifactGenerate: read('app/api/artifacts/generate/route.ts'),
  artifactMerch: read('app/api/artifacts/merch/route.ts'),
  artifactMint: read('app/api/artifacts/mint/route.ts'),
  expAward: read('app/api/exp/award/route.ts'),
  ensureMember: read('app/api/auth/ensure-member/route.ts'),
  dashboardBriefing: read('app/api/dashboard/briefing/route.ts'),
  practiceMyToday: read('app/api/practice/my-today/route.ts'),
  practiceRespond: read('app/api/practice/respond/route.ts'),
  practiceResponses: read('app/api/practice/responses/route.ts'),
  practiceStreak: read('app/api/practice/streak/route.ts'),
  practiceOthers: read('app/api/practice/others/route.ts'),
  practiceReflect: read('app/api/practice/reflect/route.ts'),
  insights: read('app/api/insights/route.ts'),
  match: read('app/api/match/route.ts'),
  matchGenerate: read('app/api/match/generate/route.ts'),
  matchHistory: read('app/api/match/history/route.ts'),
  matchRespond: read('app/api/match/respond/route.ts'),
  projects: read('app/api/projects/route.ts'),
  projectDetail: read('app/api/projects/[id]/route.ts'),
  projectPledge: read('app/api/projects/[id]/pledge/route.ts'),
  projectsCreate: read('app/api/projects/create/route.ts'),
  projectSubmit: read('app/api/projects/submit/route.ts'),
  projectInterest: read('app/api/projects/interest/route.ts'),
  pledge92b: read('app/api/92b/pledge/route.ts'),
  propose92b: read('app/api/92b/propose/route.ts'),
  councilWaitlistConfirm: read('app/api/council-waitlist/confirm/route.ts'),
  foundingInterest: read('app/api/founding-interest/route.ts'),
  musicTherapyInterest: read('app/api/music-therapy/interest/route.ts'),
  salonPropose: read('app/api/salons/propose/route.ts'),
  salonSupport: read('app/api/salons/support/route.ts'),
  salons: read('app/api/salons/route.ts'),
  salonDetail: read('app/api/salons/[salonId]/route.ts'),
  salonSessions: read('app/api/salons/[salonId]/sessions/route.ts'),
  salonMySalon: read('app/api/salons/my-salon/route.ts'),
  salonCities: read('app/api/salons/cities/route.ts'),
  salonMessage: read('app/api/salon-message/route.ts'),
  salonMessageLoad: read('app/api/salon-message/load/route.ts'),
  bookSalons: read('app/api/book-salons/route.ts'),
  bookSalonDetail: read('app/api/book-salons/[cohortId]/route.ts'),
  bookSalonJoin: read('app/api/book-salons/join/route.ts'),
  live: read('app/api/live/route.ts'),
  liveSession: read('app/api/live/[sessionId]/route.ts'),
  rooms: read('app/api/rooms/route.ts'),
  roomDetail: read('app/api/rooms/[roomId]/route.ts'),
  thinkerExtractFacts: read('app/api/thinker/extract-facts/route.ts'),
  thinkerMemory: read('app/api/thinker/memory/route.ts'),
  ritual: read('app/api/ritual/route.ts'),
  transcribe: read('app/api/transcribe/route.ts'),
  tts: read('app/api/tts/route.ts'),
  waddle: read('app/api/waddle/route.ts'),
  greatBooksAnnotate: read('app/api/great-books/annotate/route.ts'),
  greatBooksProgress: read('app/api/great-books/progress/route.ts'),
  greatBooksSeminar: read('app/api/great-books/seminar/route.ts'),
  greatBooksText: read('app/api/great-books/text/[bookId]/route.ts'),
  councilVerdict: read('app/api/council/verdict/route.ts'),
  councilVerdictDetail: read('app/api/council/verdict/[slug]/route.ts'),
  guide: read('app/api/guide/route.ts'),
  guideCreateSalon: read('app/api/guide/create-salon/route.ts'),
  salonHubTasks: read('app/api/salon-hub/tasks/route.ts'),
  salonHubTaskDetail: read('app/api/salon-hub/tasks/[id]/route.ts'),
  twiddles: read('app/api/twiddle/route.ts'),
  twiddleDetail: read('app/api/twiddle/[id]/route.ts'),
  twiddleReact: read('app/api/twiddle/[id]/react/route.ts'),
  twiddleCron: read('app/api/twiddle/cron/route.ts'),
  twiddleRespond: read('app/api/twiddle/[id]/respond/route.ts'),
  proactiveCron: read('app/api/cron/proactive/route.ts'),
  onboardingTrigger: read('app/api/onboarding/trigger/route.ts'),
  onboardingSendAll: read('app/api/onboarding/send-all/route.ts'),
  merchGenerateProducts: read('app/api/merch/generate-products/route.ts'),
  merchGenerateMockup: read('app/api/merch/generate-mockup/route.ts'),
  merchPublish: read('app/api/merch/publish/route.ts'),
  merchSuggestions: read('app/api/merch/suggestions/route.ts'),
  merchSuggestionDetail: read('app/api/merch/suggestions/[id]/route.ts'),
  thinker: read('app/api/thinker/route.ts'),
  message: read('app/api/message/route.ts'),
  notifyDm: read('app/api/notify/dm/route.ts'),
  tasks: read('app/api/tasks/route.ts'),
  taskDetail: read('app/api/tasks/[id]/route.ts'),
  memberWallet: read('app/api/member/wallet/route.ts'),
  communities: read('app/api/communities/route.ts'),
  communityDetail: read('app/api/communities/[slug]/route.ts'),
  communityGovernance: read('app/api/communities/[slug]/governance/route.ts'),
  communityThinkers: read('app/api/communities/[slug]/thinkers/route.ts'),
  communityJoin: read('app/api/communities/[slug]/join/route.ts'),
  communityMatches: read('app/api/communities/[slug]/matches/route.ts'),
  communityProducts: read('app/api/communities/[slug]/products/route.ts'),
  communityQuestionnaire: read('app/api/communities/[slug]/questionnaire/route.ts'),
  storeBalance: read('app/api/store/balance/route.ts'),
  storeBuy: read('app/api/store/buy/route.ts'),
  transactions: read('app/api/transactions/route.ts'),
  transactionApprove: read('app/api/transactions/approve/route.ts'),
  safe: read('app/api/safe/route.ts'),
  leaderboard: read('app/api/leaderboard/route.ts'),
  scanUpload: read('app/api/scan/upload/route.ts'),
  scanMyScans: read('app/api/scan/my-scans/route.ts'),
  scanScore: read('app/api/scan/score/route.ts'),
  worldSpaces: read('app/api/world/spaces/route.ts'),
  worldSpaceDetail: read('app/api/world/spaces/[id]/route.ts'),
  worldAnnotate: read('app/api/world/annotate/route.ts'),
  worldMatch: read('app/api/world/match/route.ts'),
  worldScanUpload: read('app/api/world/scan/upload/route.ts'),
  worldScanVerify: read('app/api/world/scan/verify/route.ts'),
  explorerDetail: read('app/api/explorer/[id]/route.ts'),
  memberProfile: read('app/api/members/profile/route.ts'),
  membersOnboarding: read('app/api/members/onboarding/route.ts'),
  membersDiscover: read('app/api/members/discover/route.ts'),
};

const helpers = {
  memoryExtractFacts: read('lib/memory/extractFacts.ts'),
  thinkerMemory: read('lib/thinkerMemory.ts'),
  thinkerActions: read('lib/thinkerActions.ts'),
  sharedMemory: read('lib/memory/sharedMemory.ts'),
  memoryEmbeddings: read('lib/memory/embeddings.ts'),
  memoryEpisodes: read('lib/memory/episodes.ts'),
  movementAccess: read('lib/movement/access.ts'),
  movementScriptgen: read('lib/movement/scriptgen.ts'),
  routeError: read('lib/http/routeError.ts'),
  actionExecution: read('lib/actions/executeActions.ts'),
  activityFeed: read('lib/feed/activityFeed.ts'),
  dailyPracticeEmail: read('lib/email/dailyPractice.ts'),
  publicLeadCapture: read('lib/leads/publicLeadCapture.ts'),
  todayQuestion: read('lib/practice/todayQuestion.ts'),
  practiceOthers: read('lib/practice/others.ts'),
  community: read('lib/community/getCommunity.ts'),
  governance: read('lib/governance/hats.ts'),
  liveScheduler: read('lib/live/scheduler.ts'),
  matching: read('lib/matching/index.ts'),
  salons: read('lib/salons/index.ts'),
  agentWallet: read('lib/wallets/agentWallet.ts'),
  disburse: read('lib/wallets/disburse.ts'),
  publicExplorerProfile: read('lib/explorer/publicProfile.ts'),
  voiceRecorder: read('lib/voiceRecorder.ts'),
  tts: read('lib/tts.ts'),
};

const resendHelper = read('lib/email/resend.ts');
const packageJson = read('package.json');
const operatorSmoke = read('scripts/operator-smoke.mjs');
const docs = {
  handoff: read('docs/soe-current-thread-handoff.md'),
  operator: read('docs/soe-operator-system.md'),
  threatModel: read('docs/soe-privacy-threat-model.md'),
  routeInventory: read('docs/soe-external-effect-route-inventory.md'),
};

const pages = {
  greatBooksLibrary: read('app/great-books/page.tsx'),
  greatBooksReader: read('app/great-books/[bookId]/page.tsx'),
  bookSalons: read('app/book-salons/page.tsx'),
  bookSalonDetail: read('app/book-salons/[cohortId]/page.tsx'),
  live: read('app/live/page.tsx'),
  practice: read('app/practice/page.tsx'),
  match: read('app/match/page.tsx'),
  members: read('app/members/page.tsx'),
  worldMatch: read('app/world/match/page.tsx'),
  communityDashboard: read('app/c/[slug]/page.tsx'),
  createCommunity: read('app/create-community/page.tsx'),
  access: read('app/access/page.tsx'),
  leaderboard: read('app/leaderboard/page.tsx'),
  waddle: read('app/waddle/page.tsx'),
  dashboard: read('app/dashboard/page.tsx'),
  council: read('app/council/page.tsx'),
  guide: read('app/guide/page.tsx'),
  salon: read('app/salon/page.tsx'),
  salons: read('app/salons/page.tsx'),
  salonHub: read('app/salon/HubOverlay.tsx'),
  merchOverlay: read('app/salon/MerchOverlay.tsx'),
  twiddle: read('app/twiddle/page.tsx'),
  twiddleThread: read('app/twiddle/[id]/page.tsx'),
  twiddleConstellation: read('app/twiddle/constellation/page.tsx'),
  explorerProfile: read('app/explorer/[id]/page.tsx'),
};

const checks = [
  {
    name: 'Resend helper initializes lazily and validates env at request time',
    ok:
      resendHelper.includes('let resend: Resend | null = null') &&
      resendHelper.includes('export function getResend()') &&
      resendHelper.includes('process.env.RESEND_API_KEY') &&
      resendHelper.includes('throw new Error') &&
      resendHelper.includes('new Resend(apiKey)'),
  },
  {
    name: 'daily email routes are lazy, private, escaped, and flag-gated',
    ok:
      [routes.cronDailyEmail, routes.practiceDailyEmail].every(lacksModuleScopeClients) &&
      [routes.cronDailyEmail, routes.practiceDailyEmail].every(
        (source) =>
          source.includes('getSupabaseAdmin()') &&
          source.includes('getResend()') &&
          source.includes('privateJson') &&
          !source.includes('NextResponse') &&
          !source.includes('console.error') &&
          !source.includes('console.log') &&
          !source.includes('as any') &&
          !source.includes(': any'),
      ) &&
      routes.cronDailyEmail.includes("process.env.DAILY_PRACTICE_EMAIL_NOTIFICATIONS_ENABLED === 'true'") &&
      routes.cronDailyEmail.includes('renderDailyPracticeEmail') &&
      routes.cronDailyEmail.indexOf('DAILY_PRACTICE_EMAIL_NOTIFICATIONS_ENABLED') <
        routes.cronDailyEmail.indexOf('getSupabaseAdmin()') &&
      routes.cronDailyEmail.indexOf('DAILY_PRACTICE_EMAIL_NOTIFICATIONS_ENABLED') <
        routes.cronDailyEmail.indexOf('getOrCreateTodayQuestion()') &&
      routes.cronDailyEmail.indexOf('getResend()') > routes.cronDailyEmail.indexOf('no-matching-subs') &&
      routes.practiceDailyEmail.includes(
        "process.env.DAILY_PRACTICE_FOLLOWUP_EMAIL_NOTIFICATIONS_ENABLED === 'true'",
      ) &&
      routes.practiceDailyEmail.includes('function escapeHtml') &&
      routes.practiceDailyEmail.includes('safeQuestionText') &&
      routes.practiceDailyEmail.indexOf('DAILY_PRACTICE_FOLLOWUP_EMAIL_NOTIFICATIONS_ENABLED') <
        routes.practiceDailyEmail.indexOf('getSupabaseAdmin()') &&
      routes.practiceDailyEmail.indexOf('getResend()') > routes.practiceDailyEmail.indexOf('No members with emails') &&
      helpers.dailyPracticeEmail.includes('function escapeHtml') &&
      helpers.dailyPracticeEmail.includes('encodeURIComponent(unsubscribeToken)') &&
      helpers.dailyPracticeEmail.includes('safeQuestionText'),
  },
  {
    name: 'daily email preference toggle uses lazy Supabase admin clients and private no-store JSON',
    ok:
      lacksModuleScopeClients(routes.dailyEmailToggle) &&
      routes.dailyEmailToggle.includes('getAuthenticatedMember(req)') &&
      routes.dailyEmailToggle.includes('getSupabaseAdmin()') &&
      routes.dailyEmailToggle.includes('privateJson') &&
      routes.dailyEmailToggle.indexOf('getAuthenticatedMember(req)') <
        routes.dailyEmailToggle.indexOf('getSupabaseAdmin()') &&
      routes.dailyEmailToggle.indexOf('Invalid body') < routes.dailyEmailToggle.indexOf('getSupabaseAdmin()') &&
      routes.dailyEmailToggle.includes('databaseFailure()') &&
      !routes.dailyEmailToggle.includes('NextResponse') &&
      !routes.dailyEmailToggle.includes('error.message') &&
      !routes.dailyEmailToggle.includes('String(err)') &&
      !routes.dailyEmailToggle.includes('String(error)') &&
      !routes.dailyEmailToggle.includes('as any') &&
      !routes.dailyEmailToggle.includes(': any'),
  },
  {
    name: 'provocation email routes are lazy, private, escaped, and flag-gated',
    ok:
      [routes.testProvocation, routes.weeklyProvocation].every(lacksModuleScopeClients) &&
      [routes.testProvocation, routes.weeklyProvocation].every(
        (source) =>
          source.includes('createAnthropicClient()') &&
          source.includes("resolveClaudeModel('content'") &&
          source.includes('getResend()') &&
          source.includes('privateJson') &&
          source.includes('function escapeHtml') &&
          source.includes('renderProvocationHtml(provocation)') &&
          source.includes("reason: 'email_disabled'") &&
          !source.includes('NextResponse') &&
          !source.includes('console.error') &&
          !source.includes('console.log') &&
          !source.includes("fetch('https://api.resend.com/emails'") &&
          !source.includes('as any') &&
          !source.includes(': any'),
      ) &&
      routes.testProvocation.includes("process.env.PROVOCATION_TEST_EMAIL_NOTIFICATIONS_ENABLED === 'true'") &&
      routes.weeklyProvocation.includes("process.env.PROVOCATION_WEEKLY_EMAIL_NOTIFICATIONS_ENABLED === 'true'") &&
      routes.weeklyProvocation.includes('getSupabaseAdmin()') &&
      routes.testProvocation.indexOf('PROVOCATION_TEST_EMAIL_NOTIFICATIONS_ENABLED') <
        routes.testProvocation.indexOf('getResend()') &&
      routes.weeklyProvocation.indexOf('PROVOCATION_WEEKLY_EMAIL_NOTIFICATIONS_ENABLED') <
        routes.weeklyProvocation.indexOf('getResend()') &&
      routes.testProvocation.indexOf('provocationTestEmailEnabled())') <
        routes.testProvocation.lastIndexOf('generateProvocation(') &&
      routes.weeklyProvocation.indexOf('weeklyProvocationEmailEnabled())') <
        routes.weeklyProvocation.lastIndexOf('generateProvocation('),
  },
  {
    name: '92B interest routes are lazy, no-store, and email-gated',
    ok:
      [routes.pledge92b, routes.propose92b].every(lacksModuleScopeClients) &&
      [routes.pledge92b, routes.propose92b].every(
        (source) =>
          source.includes('getSupabaseAdmin()') &&
          source.includes('privateJson') &&
          source.includes('safeRequestJson(req)') &&
          source.includes('getResend()') &&
          source.includes("process.env.CAPITAL_LEAD_EMAIL_NOTIFICATIONS_ENABLED === 'true'") &&
          source.includes('escapeHtml') &&
          !source.includes("fetch('https://api.resend.com/emails'") &&
          !source.includes('NextResponse') &&
          !source.includes('console.error') &&
          !source.includes('as any') &&
          !source.includes(': any'),
      ) &&
      routes.pledge92b.indexOf('Name and email required') < routes.pledge92b.indexOf('getSupabaseAdmin()') &&
      routes.propose92b.indexOf('City, name, and email required') < routes.propose92b.indexOf('getSupabaseAdmin()') &&
      routes.pledge92b.indexOf('CAPITAL_LEAD_EMAIL_NOTIFICATIONS_ENABLED') <
        routes.pledge92b.indexOf('getResend()') &&
      routes.propose92b.indexOf('CAPITAL_LEAD_EMAIL_NOTIFICATIONS_ENABLED') <
        routes.propose92b.indexOf('getResend()'),
  },
  {
    name: 'Council waitlist confirmation is lazy, no-store, and email-gated',
    ok:
      lacksModuleScopeClients(routes.councilWaitlistConfirm) &&
      routes.councilWaitlistConfirm.includes('getSupabaseAdmin()') &&
      routes.councilWaitlistConfirm.includes('privateJson') &&
      routes.councilWaitlistConfirm.includes('safeRequestJson(req)') &&
      routes.councilWaitlistConfirm.includes('getResend()') &&
      routes.councilWaitlistConfirm.includes(
        "process.env.COUNCIL_WAITLIST_EMAIL_NOTIFICATIONS_ENABLED === 'true'",
      ) &&
      routes.councilWaitlistConfirm.includes('escapeHtml') &&
      routes.councilWaitlistConfirm.indexOf('Email required') <
        routes.councilWaitlistConfirm.indexOf('getSupabaseAdmin()') &&
      routes.councilWaitlistConfirm.indexOf('COUNCIL_WAITLIST_EMAIL_NOTIFICATIONS_ENABLED') <
        routes.councilWaitlistConfirm.indexOf('getResend()') &&
      !routes.councilWaitlistConfirm.includes("fetch('https://api.resend.com/emails'") &&
      !routes.councilWaitlistConfirm.includes('NextResponse') &&
      !routes.councilWaitlistConfirm.includes("import { createClient } from '@supabase/supabase-js'") &&
      !routes.councilWaitlistConfirm.includes('console.error') &&
      !routes.councilWaitlistConfirm.includes('as any') &&
      !routes.councilWaitlistConfirm.includes(': any'),
  },
  {
    name: 'public lead-capture routes are lazy, no-store, and email-gated',
    ok:
      [routes.foundingInterest, routes.musicTherapyInterest, routes.salonPropose, routes.salonSupport].every(
        lacksModuleScopeClients,
      ) &&
      [routes.foundingInterest, routes.musicTherapyInterest, routes.salonPropose, routes.salonSupport].every(
        (source) =>
          source.includes('getSupabaseAdmin()') &&
          source.includes('privateJson') &&
          source.includes('safeRequestJson(req)') &&
          !source.includes("fetch('https://api.resend.com/emails'") &&
          !source.includes('NextResponse') &&
          !source.includes('console.error') &&
          !source.includes('as any') &&
          !source.includes(': any'),
      ) &&
      [routes.foundingInterest, routes.musicTherapyInterest, routes.salonPropose].every((source) =>
        source.includes('sendPublicLeadNotification'),
      ) &&
      routes.foundingInterest.indexOf('Name and email required') <
        routes.foundingInterest.indexOf('getSupabaseAdmin()') &&
      routes.musicTherapyInterest.indexOf('Name and email required') <
        routes.musicTherapyInterest.indexOf('getSupabaseAdmin()') &&
      routes.salonPropose.indexOf('City, name, and email required') <
        routes.salonPropose.indexOf('getSupabaseAdmin()') &&
      routes.salonSupport.indexOf('City, name, and email required') <
        routes.salonSupport.indexOf('getSupabaseAdmin()') &&
      lacksModuleScopeClients(helpers.publicLeadCapture) &&
      helpers.publicLeadCapture.includes('getResend()') &&
      helpers.publicLeadCapture.includes("process.env.PUBLIC_LEAD_EMAIL_NOTIFICATIONS_ENABLED === 'true'") &&
      helpers.publicLeadCapture.includes('escapeHtml') &&
      !helpers.publicLeadCapture.includes("fetch('https://api.resend.com/emails'") &&
      !helpers.publicLeadCapture.includes('console.error') &&
      !helpers.publicLeadCapture.includes('as any') &&
      !helpers.publicLeadCapture.includes(': any'),
  },
  {
    name: 'project marketplace routes use explicit public fields and no-store pledge responses',
    ok:
      [routes.projects, routes.projectDetail, routes.projectPledge].every(lacksModuleScopeClients) &&
      [routes.projects, routes.projectDetail, routes.projectPledge].every((source) =>
        source.includes('getSupabaseAdmin()'),
      ) &&
      routes.projects.includes('PROJECT_LIST_SELECT') &&
      routes.projects.includes('sanitizeProjectListRow') &&
      routes.projects.includes('privateJson') &&
      routes.projectDetail.includes('PROJECT_DETAIL_SELECT') &&
      routes.projectDetail.includes('PROJECT_ID_PATTERN') &&
      routes.projectDetail.includes('sanitizeProjectDetailRow') &&
      routes.projectDetail.includes('privateJson') &&
      routes.projectPledge.includes('PROJECT_ID_PATTERN') &&
      routes.projectPledge.includes('normalizeEmail') &&
      routes.projectPledge.includes('sanitizeUtm') &&
      routes.projectPledge.includes('privateJson') &&
      routes.projectPledge.includes('blockLocalLiveStripeCheckout') &&
      routes.projectPledge.includes('recordPendingPledge') &&
      routes.projectPledge.indexOf('Invalid body') < routes.projectPledge.indexOf('getSupabaseAdmin()') &&
      routes.projectPledge.indexOf('blockLocalLiveStripeCheckout') <
        routes.projectPledge.indexOf('checkout.sessions.create') &&
      !routes.projects.includes(".select('*')") &&
      !routes.projectDetail.includes(".select('*')") &&
      !routes.projects.includes('console.error') &&
      !routes.projectDetail.includes('console.error') &&
      !routes.projectPledge.includes("console.warn('[projects/pledge] pledge ledger write skipped', error)") &&
      [routes.projects, routes.projectDetail, routes.projectPledge].every(
        (source) => !source.includes('NextResponse') && !source.includes('as any') && !source.includes(': any'),
      ),
  },
  {
    name: 'project collaboration scaffold is auth-derived, private, lazy, and redacted in audit logs',
    ok:
      lacksModuleScopeClients(routes.projectsCreate) &&
      routes.projectsCreate.includes('verifyWalletSessionValue') &&
      routes.projectsCreate.includes('privateJson') &&
      routes.projectsCreate.includes('createServiceSupabase(env)') &&
      routes.projectsCreate.includes("await import('@supabase/supabase-js')") &&
      routes.projectsCreate.includes('caller_authenticated: Boolean(audit.callerMemberId)') &&
      routes.projectsCreate.includes('project_scaffolded: Boolean(audit.projectId)') &&
      routes.projectsCreate.includes('participant_reference_count: 2') &&
      routes.projectsCreate.includes('multisig_configured: multisigConfig.multisig_address !== ZERO_ADDRESS') &&
      routes.projectsCreate.includes("throw new Error('Member lookup failed.')") &&
      routes.projectsCreate.includes("throw new Error('Project member lookup failed.')") &&
      routes.projectsCreate.indexOf('authenticateMember(req, env)') <
        routes.projectsCreate.indexOf('parseCreateProjectRequest(req)') &&
      routes.projectsCreate.indexOf('parseCreateProjectRequest(req)') < routes.projectsCreate.indexOf('lookupMembers(') &&
      !routes.projectsCreate.includes('NextResponse') &&
      !routes.projectsCreate.includes("import { createClient } from '@supabase/supabase-js'") &&
      !routes.projectsCreate.includes('createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!') &&
      !routes.projectsCreate.includes('error.message') &&
      !routes.projectsCreate.includes('String(error)') &&
      !routes.projectsCreate.includes('console.error') &&
      !routes.projectsCreate.includes('caller_member_id: audit.callerMemberId') &&
      !routes.projectsCreate.includes('project_id: audit.projectId') &&
      !routes.projectsCreate.includes('as any') &&
      !routes.projectsCreate.includes(': any'),
  },
  {
    name: 'project lead capture routes are lazy, no-store, and email-gated',
    ok:
      [routes.projectSubmit, routes.projectInterest].every(lacksModuleScopeClients) &&
      [routes.projectSubmit, routes.projectInterest].every(
        (source) =>
          source.includes('getSupabaseAdmin()') &&
          source.includes('privateJson') &&
          source.includes('safeRequestJson(req)') &&
          source.includes('getResend()') &&
          source.includes("process.env.PROJECT_LEAD_EMAIL_NOTIFICATIONS_ENABLED === 'true'") &&
          source.includes('escapeHtml') &&
          !source.includes("fetch('https://api.resend.com/emails'") &&
          !source.includes('NextResponse') &&
          !source.includes("import { createClient } from '@supabase/supabase-js'") &&
          !source.includes('console.error') &&
          !source.includes('as any') &&
          !source.includes(': any'),
      ) &&
      routes.projectSubmit.indexOf('Title, description, name, and email are required') <
        routes.projectSubmit.indexOf('getSupabaseAdmin()') &&
      routes.projectInterest.indexOf('Name and email required') < routes.projectInterest.indexOf('getSupabaseAdmin()') &&
      routes.projectSubmit.indexOf('PROJECT_LEAD_EMAIL_NOTIFICATIONS_ENABLED') <
        routes.projectSubmit.indexOf('getResend()') &&
      routes.projectInterest.indexOf('PROJECT_LEAD_EMAIL_NOTIFICATIONS_ENABLED') <
        routes.projectInterest.indexOf('getResend()'),
  },
  {
    name: 'salon and book-salon routes use lazy Supabase admin clients',
    ok:
      [
        routes.salons,
        routes.salonDetail,
        routes.salonSessions,
        routes.salonMySalon,
        routes.salonCities,
        routes.salonMessage,
        routes.salonMessageLoad,
        routes.bookSalons,
        routes.bookSalonDetail,
        routes.bookSalonJoin,
        helpers.salons,
      ].every(lacksModuleScopeClients) &&
      [
        routes.salons,
        routes.salonDetail,
        routes.salonSessions,
        routes.salonMySalon,
        routes.salonCities,
        routes.salonMessage,
        routes.salonMessageLoad,
        routes.bookSalons,
        routes.bookSalonDetail,
        routes.bookSalonJoin,
        helpers.salons,
      ].every((source) => source.includes('getSupabaseAdmin()')) &&
      routes.salons.includes('SALON_LIST_SELECT') &&
      routes.salons.includes('parseStatuses') &&
      routes.salons.includes('publicSalonListRow') &&
      routes.salons.includes('safeRequestJson(req)') &&
      routes.salons.includes('normalizeTopicRotation') &&
      routes.salons.includes('SALON_CREATE_RECEIPT_SELECT') &&
      routes.salons.includes('select(SALON_LIST_SELECT)') &&
      routes.salons.includes('select(SALON_CREATE_RECEIPT_SELECT)') &&
      routes.salons.includes("select('id', { count: 'exact', head: true })") &&
      routes.salons.includes("return privateJson({ salons: enriched })") &&
      routes.salons.includes('return privateJson({ salon: publicSalonCreateReceipt') &&
      routes.salons.includes('member_count: boundedInteger(memberCount, 20)') &&
      routes.salons.includes('memberInsertError') &&
      routes.salons.includes('sessionsError') &&
      !routes.salons.includes("select('*, members") &&
      !routes.salons.includes('.select().single()') &&
      !routes.salons.includes('NextResponse') &&
      !routes.salons.includes('error.message') &&
      !routes.salons.includes('return { ...s') &&
      !routes.salons.includes('return NextResponse.json({ salon') &&
      !routes.salons.includes('guide_since') &&
      !routes.salons.includes('exp_tokens') &&
      pages.salon.includes("fetch('/api/salons?status=recruiting,active', { cache: 'no-store' })") &&
      pages.salon.includes("fetch('/api/salons/my-salon', { headers: { 'Authorization': `Bearer ${authToken}` }, cache: 'no-store' })") &&
      routes.salons.indexOf('Title required') < routes.salons.lastIndexOf('getSupabaseAdmin()') &&
      routes.salonDetail.includes('SALON_DETAIL_SELECT') &&
      routes.salonDetail.includes('SALON_MEMBER_SELECT') &&
      routes.salonDetail.includes('SALON_SESSION_SELECT') &&
      routes.salonDetail.includes('GUIDE_SELECT') &&
      routes.salonDetail.includes('privateJson({') &&
      routes.salonDetail.includes('publicSalonMember') &&
      routes.salonDetail.includes('publicSalonSession') &&
      routes.salonDetail.includes('publicSalonStats') &&
      routes.salonDetail.includes('salon-member-${index + 1}') &&
      routes.salonDetail.includes('salon-session-${index + 1}') &&
      routes.salonDetail.includes('safeRequestJson') &&
      routes.salonDetail.includes('handleJoinSalon') &&
      routes.salonDetail.includes('handleAttendSalonSession') &&
      routes.salonDetail.includes('handleCompleteSalonSession') &&
      routes.salonDetail.includes('handleGraduateSalonMembers') &&
      routes.salonDetail.includes('canManageSalon') &&
      routes.salonDetail.includes('canManageSalonSession') &&
      routes.salonDetail.includes('publicGraduationResult') &&
      routes.salonDetail.includes('member_id: auth.memberId') &&
      routes.salonDetail.includes("select('id', { count: 'exact', head: true })") &&
      routes.salonDetail.includes("members(display_name)'") &&
      !routes.salonDetail.includes("members(display_name, tier, exp_tokens)") &&
      !routes.salonDetail.includes("select('*').eq('id', salonId)") &&
      !routes.salonDetail.includes("select('*'") &&
      !routes.salonDetail.includes('NextResponse') &&
      !routes.salonDetail.includes('error.message') &&
      !routes.salonDetail.includes('as any') &&
      !routes.salonDetail.includes(': any') &&
      !routes.salonDetail.includes('return NextResponse.json({ salon, members') &&
      !routes.salonDetail.includes('transcript_summary || null') &&
      !routes.salonDetail.includes('exp_awarded_total || 0') &&
      !routes.salonDetail.includes('total_exp_awarded') &&
      !routes.salonDetail.includes('exp_tokens') &&
      routes.salonSessions.includes('privateJson') &&
      routes.salonSessions.includes('SALON_SESSION_PUBLIC_SELECT') &&
      routes.salonSessions.includes('SALON_SESSION_MUTATION_SELECT') &&
      routes.salonSessions.includes('publicSalonSession') &&
      routes.salonSessions.includes('privateSalonSessionReceipt') &&
      routes.salonSessions.includes('getAuthenticatedMember(req)') &&
      routes.salonSessions.includes('led_by_member_id: auth.memberId') &&
      routes.salonSessions.includes('canManageSalon') &&
      routes.salonSessions.includes('canManageSalonSession') &&
      routes.salonSessions.indexOf('session_id required') < routes.salonSessions.lastIndexOf('getSupabaseAdmin()') &&
      !routes.salonSessions.includes('NextResponse') &&
      !routes.salonSessions.includes("select('*')") &&
      !routes.salonSessions.includes('.select().single()') &&
      !routes.salonSessions.includes('error.message') &&
      !routes.salonSessions.includes('as any') &&
      !routes.salonSessions.includes(': any') &&
      !routes.salonSessions.includes('led_by_member_id } = body') &&
      !routes.salonSessions.includes('transcript_summary || null') &&
      !routes.salonSessions.includes('exp_awarded_total || 0') &&
      routes.salonMySalon.includes('MY_SALON_SELECT') &&
      routes.salonMySalon.includes('getAuthenticatedMember(req)') &&
      routes.salonMySalon.includes(".eq('member_id', auth.memberId)") &&
      routes.salonMySalon.includes('publicMyMembership') &&
      routes.salonMySalon.includes('emptyMySalonResponse') &&
      routes.salonMySalon.includes('privateJson({') &&
      routes.salonMySalon.includes('salon-member-${index + 1}') &&
      routes.salonMySalon.includes('salon-session-${index + 1}') &&
      routes.salonMySalon.includes("members(display_name)'") &&
      !routes.salonMySalon.includes("salons(*)") &&
      !routes.salonMySalon.includes("select('*") &&
      !routes.salonMySalon.includes('NextResponse') &&
      !routes.salonMySalon.includes('exp_tokens') &&
      !routes.salonMySalon.includes('guide_since') &&
      !routes.salonMySalon.includes('total_exp_awarded') &&
      !routes.salonMySalon.includes('return { ...') &&
      routes.salonCities.includes('CITY_LEAD_SELECT') &&
      routes.salonCities.includes('parseSalonCityLead') &&
      routes.salonCities.includes('publicCityName') &&
      routes.salonCities.includes('limit(MAX_LEAD_ROWS)') &&
      routes.salonCities.includes('slice(0, MAX_CITY_RESULTS)') &&
      routes.salonCities.includes('privateJson({ cities') &&
      !routes.salonCities.includes('NextResponse') &&
      !routes.salonCities.includes('console.error') &&
      !routes.salonCities.includes('console.warn') &&
      pages.salons.includes("fetch('/api/salons/cities', { cache: 'no-store' })") &&
      pages.salons.includes("fetch('/api/92b/progress', { cache: 'no-store' })") &&
      routes.salonMessage.indexOf('Content required') < routes.salonMessage.indexOf('getSupabaseAdmin()') &&
      routes.salonMessage.includes('safeRequestJson(req)') &&
      routes.salonMessage.includes('const content = boundedText(body.content, MAX_CONTENT_LENGTH)') &&
      routes.salonMessage.includes('const salonId = normalizeSalonId(body.salon_id)') &&
      // Security fix S9: author/sender type come from the session, never the body.
      !routes.salonMessage.includes('body.sender_type') &&
      !routes.salonMessage.includes('body.sender_name') &&
      routes.salonMessage.includes("sender_type: 'member'") &&
      [routes.salonMessage, routes.salonMessageLoad].every(
        (source) => source.includes('getAuthenticatedMember(req)') && source.includes('memberCanUseSharedSalon('),
      ) &&
      routes.salonMessage.includes('MAX_CONTENT_LENGTH') &&
      routes.salonMessage.includes('Failed to save salon message') &&
      routes.salonMessageLoad.includes('SALON_MESSAGE_SELECT') &&
      routes.salonMessageLoad.includes('publicSalonMessage') &&
      routes.salonMessageLoad.includes("normalizeSalonId(req.nextUrl.searchParams.get('salonId'))") &&
      routes.salonMessageLoad.includes('select(SALON_MESSAGE_SELECT)') &&
      routes.salonMessageLoad.includes('Failed to load salon messages') &&
      helpers.salons.includes('MEMBER_SALON_SELECT') &&
      helpers.salons.includes('UPCOMING_SESSION_SELECT') &&
      !helpers.salons.includes('salons(*)') &&
      !helpers.salons.includes("select('*')") &&
      !helpers.salons.includes('guide_member_id, status') &&
      !helpers.salons.includes('total_exp_awarded') &&
      [routes.salonMessage, routes.salonMessageLoad].every(
        (source) =>
          !source.includes('NextResponse') &&
          !source.includes("select('*')") &&
          !source.includes('console.error') &&
          !source.includes('error.message') &&
          !source.includes('String(err)') &&
          !source.includes('as any') &&
          !source.includes(': any') &&
          !source.includes('return privateJson({ messages: (data || [])') &&
          !source.includes('[key: string]'),
      ) &&
      routes.bookSalons.indexOf('Missing fields') < routes.bookSalons.lastIndexOf('getSupabaseAdmin()') &&
      routes.bookSalonDetail.indexOf('Empty message') < routes.bookSalonDetail.lastIndexOf('getSupabaseAdmin()') &&
      routes.bookSalonJoin.indexOf('Missing fields') < routes.bookSalonJoin.indexOf('getSupabaseAdmin()'),
  },
  {
    name: 'book salon create, join, and chat are auth-derived and token-bearing',
    ok:
      [routes.bookSalons, routes.bookSalonDetail, routes.bookSalonJoin].every(lacksModuleScopeClients) &&
      [routes.bookSalons, routes.bookSalonDetail, routes.bookSalonJoin].every(
        (source) =>
          source.includes('getAuthenticatedMember(req)') &&
          source.includes('privateJson') &&
          source.includes('getSupabaseAdmin()'),
      ) &&
      routes.bookSalons.includes('created_by: auth.memberId') &&
      routes.bookSalons.includes('member_id: auth.memberId') &&
      routes.bookSalons.indexOf('Missing fields') < routes.bookSalons.indexOf('getAuthenticatedMember(req)') &&
      routes.bookSalons.indexOf('getAuthenticatedMember(req)') < routes.bookSalons.lastIndexOf('getSupabaseAdmin()') &&
      routes.bookSalonJoin.includes(".eq('member_id', auth.memberId)") &&
      routes.bookSalonJoin.includes('member_id: auth.memberId') &&
      routes.bookSalonJoin.indexOf('getAuthenticatedMember(req)') < routes.bookSalonJoin.indexOf('getSupabaseAdmin()') &&
      routes.bookSalonDetail.includes(".eq('member_id', auth.memberId)") &&
      routes.bookSalonDetail.includes('member_id: auth.memberId') &&
      routes.bookSalonDetail.includes("member_name: auth.member.display_name || 'Explorer'") &&
      routes.bookSalonDetail.includes('is_mine: Boolean') &&
      routes.bookSalonDetail.indexOf('Empty message') < routes.bookSalonDetail.lastIndexOf('getAuthenticatedMember(req)') &&
      routes.bookSalonDetail.indexOf('getAuthenticatedMember(req)') < routes.bookSalonDetail.lastIndexOf('getSupabaseAdmin()') &&
      [pages.bookSalons, pages.bookSalonDetail].every(
        (source) =>
          source.includes('getSupabaseAccessToken') &&
          source.includes('Authorization: `Bearer ${accessToken}`') &&
          source.includes("cache: 'no-store'"),
      ) &&
      pages.bookSalons.includes("fetch('/api/book-salons'") &&
      pages.bookSalons.includes("fetch('/api/book-salons/join'") &&
      pages.bookSalonDetail.includes('fetch(`/api/book-salons/${cohortId}`') &&
      pages.bookSalonDetail.includes('is_mine: true') &&
      pages.bookSalonDetail.includes('const isMe = Boolean(msg.is_mine)') &&
      !pages.bookSalons.includes('body: JSON.stringify({ cohortId, memberId })') &&
      !pages.bookSalons.includes('memberId,\\n        thinkerId') &&
      !pages.bookSalonDetail.includes('body: JSON.stringify({ memberId') &&
      !pages.bookSalonDetail.includes('member_id: memberId') &&
      !routes.bookSalons.includes('body.memberId') &&
      !routes.bookSalonJoin.includes('body.memberId') &&
      !routes.bookSalonDetail.includes('body.memberId') &&
      [routes.bookSalons, routes.bookSalonDetail, routes.bookSalonJoin].every(
        (source) =>
          !source.includes('NextResponse') &&
          !source.includes('as any') &&
          !source.includes(': any') &&
          !source.includes('error.message') &&
          !source.includes('String(err)'),
      ),
  },
  {
    name: 'live session and room routes use lazy Supabase admin clients',
    ok:
      [routes.live, routes.liveSession, routes.rooms, routes.roomDetail, routes.cronCreateLiveSession].every(lacksModuleScopeClients) &&
      [routes.live, routes.liveSession, routes.rooms, routes.roomDetail].every((source) =>
        source.includes('getSupabaseAdmin()'),
      ) &&
      routes.live.includes('privateJson') &&
      routes.live.includes('getMovementAccess(req)') &&
      routes.live.includes('access.canManage') &&
      routes.live.includes('safeRequestJson(req)') &&
      routes.live.includes('select(LIVE_SESSION_SELECT)') &&
      routes.live.indexOf('Unknown action') < routes.live.indexOf('getMovementAccess(req)') &&
      routes.live.indexOf('getMovementAccess(req)') < routes.live.indexOf('createLiveSession()') &&
      routes.live.indexOf("action === 'create_next'") < routes.live.indexOf("action === 'go_live'") &&
      routes.liveSession.includes('privateJson') &&
      routes.liveSession.includes('UUID_RE') &&
      routes.liveSession.includes('getAuthenticatedMember(req)') &&
      routes.liveSession.includes('getMovementAccess(req)') &&
      routes.liveSession.includes('access.canManage') &&
      routes.liveSession.includes('member_id: auth.memberId') &&
      routes.liveSession.includes("body: JSON.stringify({ action: 'join'") === false &&
      routes.liveSession.includes('body.memberId') === false &&
      routes.liveSession.indexOf('Unknown action') < routes.liveSession.indexOf("action === 'join'") &&
      routes.liveSession.indexOf('getAuthenticatedMember(req)') < routes.liveSession.indexOf('getSupabaseAdmin()') &&
      routes.liveSession.indexOf("action === 'summarize'") < routes.liveSession.lastIndexOf('generateSessionSummary(sessionId)') &&
      pages.live.includes('getSupabaseAccessToken') &&
      pages.live.includes('Authorization: `Bearer ${accessToken}`') &&
      pages.live.includes("cache: 'no-store'") &&
      pages.live.includes("fetch('/api/live'") &&
      pages.live.includes('fetch(`/api/live/${upcoming.id}`') &&
      pages.live.includes("body: JSON.stringify({ action: 'join' })") &&
      !pages.live.includes("body: JSON.stringify({ action: 'join', memberId })") &&
      !routes.live.includes('NextResponse') &&
      !routes.liveSession.includes('NextResponse') &&
      !routes.live.includes(': any') &&
      !routes.liveSession.includes(': any') &&
      routes.cronCreateLiveSession.includes('privateJson') &&
      routes.cronCreateLiveSession.includes('cronAuthorized(req)') &&
      routes.cronCreateLiveSession.includes('Boolean(cronSecret)') &&
      routes.cronCreateLiveSession.indexOf('cronAuthorized(req)') < routes.cronCreateLiveSession.indexOf('createLiveSession()') &&
      routes.cronCreateLiveSession.includes('liveSessionReceipt') &&
      routes.cronCreateLiveSession.includes('roomName') &&
      routes.cronCreateLiveSession.includes('scheduledFor') &&
      routes.cronCreateLiveSession.includes("error: 'Failed to create live session'") &&
      !routes.cronCreateLiveSession.includes('NextResponse') &&
      !routes.cronCreateLiveSession.includes('daily_room_url') &&
      !routes.cronCreateLiveSession.includes('process.env.CRON_SECRET &&') &&
      !routes.cronCreateLiveSession.includes(': any') &&
      !routes.cronCreateLiveSession.includes('error.message') &&
      !routes.cronCreateLiveSession.includes('String(err)') &&
      routes.rooms.includes('getAuthenticatedMember(req)') &&
      routes.rooms.includes('createDailyRoomUrl') &&
      routes.rooms.includes('process.env.DAILY_API_KEY') &&
      routes.rooms.includes('created_by: auth.memberId') &&
      routes.rooms.includes('Cannot create a room for another member') &&
      routes.rooms.includes('Failed to create room') &&
      routes.rooms.indexOf('safeRequestJson(req)') < routes.rooms.lastIndexOf('getAuthenticatedMember(req)') &&
      routes.rooms.lastIndexOf('getAuthenticatedMember(req)') < routes.rooms.lastIndexOf('getSupabaseAdmin()') &&
      routes.roomDetail.includes('getAuthenticatedMember(req)') &&
      routes.roomDetail.includes('Cannot update another member room state') &&
      routes.roomDetail.includes('requireRoomOwner') &&
      routes.roomDetail.includes('member_id: auth.memberId') &&
      routes.roomDetail.includes('Failed to save transcript') &&
      routes.roomDetail.indexOf('safeRequestJson(req)') < routes.roomDetail.indexOf('getAuthenticatedMember(req)') &&
      routes.roomDetail.indexOf('getAuthenticatedMember(req)') < routes.roomDetail.indexOf('getSupabaseAdmin()') &&
      [routes.rooms, routes.roomDetail].every(
        (source) =>
          source.includes('privateJson') &&
          !source.includes('NextResponse') &&
          !source.includes('createClient(') &&
          !source.includes('SUPABASE_SERVICE_ROLE_KEY') &&
          !source.includes('as any') &&
          !source.includes(': any') &&
          !source.includes('error.message') &&
          !source.includes('String(err)'),
      ),
  },
  {
    name: 'daily practice state routes use lazy Supabase admin clients',
    ok:
      [
        routes.practiceMyToday,
        routes.practiceRespond,
        routes.practiceResponses,
        routes.practiceStreak,
        routes.practiceOthers,
        helpers.practiceOthers,
      ].every(lacksModuleScopeClients) &&
      [
        routes.practiceMyToday,
        routes.practiceRespond,
        routes.practiceResponses,
        routes.practiceStreak,
        helpers.practiceOthers,
      ].every((source) => source.includes('getSupabaseAdmin()')) &&
      routes.practiceMyToday.includes('privateJson') &&
      !routes.practiceMyToday.includes('NextResponse') &&
      routes.practiceResponses.includes('privateJson') &&
      !routes.practiceResponses.includes('NextResponse') &&
      routes.practiceResponses.indexOf('!daysParam && !questionId') <
        routes.practiceResponses.indexOf('getSupabaseAdmin()') &&
      !routes.practiceResponses.includes('map(async') &&
      routes.practiceOthers.includes('privateJson') &&
      routes.practiceOthers.includes('getAuthenticatedMember(req)') &&
      !routes.practiceOthers.includes('NextResponse') &&
      routes.practiceOthers.indexOf('!questionId') < routes.practiceOthers.indexOf('getAuthenticatedMember(req)') &&
      routes.practiceRespond.includes('privateJson') &&
      routes.practiceRespond.includes('member_id: auth.memberId') &&
      routes.practiceRespond.includes(".eq('member_id', auth.memberId)") &&
      routes.practiceRespond.indexOf('questionId and responseText required') <
        routes.practiceRespond.indexOf('getAuthenticatedMember(req)') &&
      routes.practiceRespond.indexOf('getAuthenticatedMember(req)') <
        routes.practiceRespond.indexOf('getSupabaseAdmin()') &&
      pages.practice.includes('/api/practice/respond') &&
      pages.practice.includes('getSupabaseAccessToken') &&
      pages.practice.includes('Authorization: `Bearer ${authToken}`') &&
      !pages.practice.includes('responseText: draft.trim(),\n          memberId') &&
      !routes.practiceRespond.includes('NextResponse') &&
      !routes.practiceRespond.includes('as any') &&
      !routes.practiceRespond.includes(': any') &&
      !routes.practiceRespond.includes('memberId?: unknown') &&
      !routes.practiceRespond.includes('body.memberId') &&
      !routes.practiceRespond.includes('Cannot respond for another member') &&
      !routes.practiceRespond.includes('error.message') &&
      !routes.practiceRespond.includes('String(err)') &&
      !routes.practiceRespond.includes('console.error') &&
      routes.practiceStreak.includes('privateJson') &&
      !routes.practiceStreak.includes('NextResponse') &&
      routes.practiceStreak.indexOf('getAuthenticatedMember(req)') < routes.practiceStreak.indexOf('getSupabaseAdmin()'),
  },
  {
    name: 'private dashboard briefing route uses lazy Supabase admin clients',
    ok:
      lacksModuleScopeClients(routes.dashboardBriefing) &&
      routes.dashboardBriefing.includes('getSupabaseAdmin()') &&
      routes.dashboardBriefing.includes('privateJson') &&
      routes.dashboardBriefing.indexOf('getAuthenticatedMember(req)') <
        routes.dashboardBriefing.indexOf('getSupabaseAdmin()') &&
      routes.dashboardBriefing.includes('const scannerId = auth.member.supabase_auth_id || memberId') &&
      routes.dashboardBriefing.includes("from('exp_events')") &&
      routes.dashboardBriefing.includes("from('scan_uploads')") &&
      routes.dashboardBriefing.includes("from('salon_messages')") &&
      routes.dashboardBriefing.includes("from('spaces')") &&
      routes.dashboardBriefing.includes('showWelcome') &&
      pages.dashboard.includes("fetch('/api/dashboard/briefing'") &&
      pages.dashboard.includes('getSupabaseAccessToken') &&
      pages.dashboard.includes("cache: 'no-store'") &&
      !pages.dashboard.includes("from('exp_events')") &&
      !pages.dashboard.includes("from('scan_uploads')") &&
      !pages.dashboard.includes("from('salon_messages')") &&
      !pages.dashboard.includes("from('spaces')") &&
      !pages.dashboard.includes('session.supabase'),
  },
  {
    name: 'task routes use lazy Supabase admin clients, private JSON, and signed-in self-scope',
    ok:
      [routes.tasks, routes.taskDetail].every(lacksModuleScopeClients) &&
      [routes.tasks, routes.taskDetail].every(
        (source) => source.includes('getSupabaseAdmin()') && source.includes('privateJson'),
      ) &&
      routes.tasks.includes('safeRequestJson(req)') &&
      routes.tasks.includes('member_id: auth.memberId') &&
      routes.tasks.indexOf('getAuthenticatedMember(req)') < routes.tasks.indexOf('getSupabaseAdmin()') &&
      routes.tasks.indexOf('Title required') < routes.tasks.lastIndexOf('getSupabaseAdmin()') &&
      !routes.tasks.includes('body.memberId') &&
      !routes.tasks.includes('let memberId') &&
      !routes.tasks.includes('console.error') &&
      !routes.tasks.includes('error.message') &&
      !routes.tasks.includes('String(err)') &&
      routes.taskDetail.indexOf('getAuthenticatedMember(req)') < routes.taskDetail.indexOf('getSupabaseAdmin()') &&
      !routes.taskDetail.includes('Record<string, any>') &&
      pages.council.includes("fetch('/api/tasks'") &&
      pages.council.includes('Authorization: `Bearer ${authToken}`') &&
      !pages.council.includes("memberId, title: taskTitle.trim()"),
  },
  {
    name: 'wallet, community ownership, and store routes use lazy Supabase admin clients, private JSON, and self-scoped access',
    ok:
      [routes.memberWallet, routes.communities, routes.communityProducts, routes.storeBalance, routes.storeBuy].every(
        lacksModuleScopeClients,
      ) &&
      [routes.memberWallet, routes.communities, routes.communityProducts, routes.storeBalance, routes.storeBuy].every(
        (source) => source.includes('getSupabaseAdmin()') && source.includes('privateJson'),
      ) &&
      routes.memberWallet.indexOf('Invalid Ethereum address') < routes.memberWallet.indexOf('getSupabaseAdmin()') &&
      routes.memberWallet.includes('getAuthenticatedMember(req)') &&
      routes.memberWallet.includes('Cannot attach wallet to another member') &&
      routes.memberWallet.includes('Wallet is already attached to another member') &&
      routes.memberWallet.includes('MEMBERSHIP_NFT_AUTO_MINT_ENABLED') &&
      routes.memberWallet.includes("await import('@/lib/blockchain/membership')") &&
      routes.memberWallet.includes('walletAddress: normalizedWalletAddress') &&
      routes.memberWallet.includes(".eq('member_id', auth.memberId)") &&
      routes.memberWallet.includes(".eq('id', auth.memberId)") &&
      routes.memberWallet.indexOf('Invalid Ethereum address') <
        routes.memberWallet.indexOf('getAuthenticatedMember(req)') &&
      routes.memberWallet.indexOf('getAuthenticatedMember(req)') < routes.memberWallet.indexOf('getSupabaseAdmin()') &&
      routes.memberWallet.indexOf('MEMBERSHIP_NFT_AUTO_MINT_ENABLED') <
        routes.memberWallet.indexOf("await import('@/lib/blockchain/membership')") &&
      !routes.memberWallet.includes("import { mintMembershipNFT }") &&
      routes.communities.includes('getAuthenticatedMember(req)') &&
      routes.communities.includes('CreateCommunityBody') &&
      routes.communities.includes('owner_member_id: auth.memberId') &&
      routes.communities.includes('member_id: auth.memberId') &&
      routes.communities.includes('applyCommunityLaunchConfig') &&
      routes.communities.includes('boundedText(body.mission') &&
      routes.communities.includes("from('agent_spending_limits')") &&
      routes.communities.includes('max_per_tx') &&
      routes.communities.includes('require_human_above') &&
      routes.communities.includes("from('community_contracts')") &&
      routes.communities.includes("deployment_status: 'deployed'") &&
      routes.communities.indexOf('Name and slug required') <
        routes.communities.lastIndexOf('getAuthenticatedMember(req)') &&
      routes.communities.lastIndexOf('getAuthenticatedMember(req)') < routes.communities.lastIndexOf('getSupabaseAdmin()') &&
      !routes.communities.includes('memberId?: string') &&
      !routes.communities.includes('body.memberId') &&
      !routes.communities.includes('Cannot create community for another member') &&
      routes.communityProducts.includes('getAuthenticatedMember(req)') &&
      routes.communityProducts.includes('CreateProductBody') &&
      routes.communityProducts.includes('PRODUCT_SELECT') &&
      routes.communityProducts.includes('safeRequestJson(req)') &&
      routes.communityProducts.includes('community.owner_member_id !== auth.memberId') &&
      routes.communityProducts.includes('created_by: auth.memberId') &&
      routes.communityProducts.indexOf('Product name required') <
        routes.communityProducts.indexOf('getAuthenticatedMember(req)') &&
      routes.communityProducts.indexOf('getAuthenticatedMember(req)') <
        routes.communityProducts.lastIndexOf('getSupabaseAdmin()') &&
      !routes.communityProducts.includes('memberId?: string') &&
      !routes.communityProducts.includes('memberId && memberId !== auth.memberId') &&
      !routes.communityProducts.includes('Cannot create product for another member') &&
      routes.storeBalance.includes('getAuthenticatedMember(req)') &&
      routes.storeBalance.includes(".eq('member_id', auth.memberId)") &&
      routes.storeBalance.indexOf('getAuthenticatedMember(req)') < routes.storeBalance.indexOf('getSupabaseAdmin()') &&
      routes.storeBuy.includes('getAuthenticatedMember(req)') &&
      routes.storeBuy.includes('StorePurchaseBody') &&
      routes.storeBuy.includes('normalizeProductId(body?.productId)') &&
      routes.storeBuy.includes('normalizeCommunitySlug(body?.communitySlug)') &&
      routes.storeBuy.includes('PRODUCT_SELECT') &&
      routes.storeBuy.includes('ORDER_RECEIPT_SELECT') &&
      routes.storeBuy.includes('const buyerId = auth.memberId') &&
      routes.storeBuy.includes('member_id: buyerId') &&
      routes.storeBuy.includes('buyer_id: buyerId') &&
      routes.storeBuy.indexOf('productId and communitySlug are required') <
        routes.storeBuy.indexOf('getAuthenticatedMember(req)') &&
      routes.storeBuy.indexOf('getAuthenticatedMember(req)') < routes.storeBuy.indexOf('getSupabaseAdmin()') &&
      pages.communityDashboard.includes('getSupabaseAccessToken') &&
      pages.communityDashboard.includes('/api/store/balance') &&
      pages.communityDashboard.includes('/api/store/buy') &&
      pages.communityDashboard.includes('/api/communities/${slug}/products') &&
      pages.communityDashboard.includes('Authorization: `Bearer ${accessToken}`') &&
      !pages.communityDashboard.includes('/api/store/balance?memberId=') &&
      !pages.communityDashboard.includes('productId, memberId, communitySlug') &&
      !pages.communityDashboard.includes('is_token_gated: pTokenGated,\n          memberId') &&
      pages.createCommunity.includes("fetch('/api/communities'") &&
      pages.createCommunity.includes('getSupabaseAccessToken') &&
      pages.createCommunity.includes('Authorization: `Bearer ${accessToken}`') &&
      pages.createCommunity.includes('launchConfig') &&
      !pages.createCommunity.includes("theme: 'dark', memberId") &&
      !pages.createCommunity.includes("from('communities')") &&
      !pages.createCommunity.includes("from('agent_wallets')") &&
      !pages.createCommunity.includes("from('agent_spending_limits')") &&
      !pages.createCommunity.includes("from('community_contracts')") &&
      !pages.createCommunity.includes('createClient()') &&
      [routes.memberWallet, routes.communities, routes.communityProducts, routes.storeBalance, routes.storeBuy].every(
        (source) =>
          !source.includes('row: any') &&
          !source.includes('r: any') &&
          !source.includes('NextResponse') &&
          !source.includes('as any') &&
          !source.includes(': any') &&
          !source.includes('error.message') &&
          !source.includes('String(err)') &&
          !source.includes('console.error'),
      ) &&
      !routes.storeBalance.includes("searchParams.get('memberId')") &&
      !routes.storeBalance.includes('Cannot read another member balance') &&
      !routes.storeBuy.includes('memberId?: string') &&
      !routes.communityProducts.includes(".select('*')") &&
      !routes.storeBuy.includes(".select('*')") &&
      !routes.storeBuy.includes('.select()') &&
      !routes.storeBuy.includes('wallet_address') &&
      !routes.storeBuy.includes('buyer_id: order') &&
      !routes.storeBuy.includes('memberId && memberId !== auth.memberId') &&
      !routes.storeBuy.includes('Cannot purchase for another member'),
  },
  {
    name: 'transaction routes are authenticated, scoped, lazy, and private',
    ok:
      [routes.transactions, routes.transactionApprove].every(lacksModuleScopeClients) &&
      [routes.transactions, routes.transactionApprove].every(
        (source) =>
          source.includes('getAuthenticatedMember(req)') &&
          source.includes('getSupabaseAdmin()') &&
          source.includes('privateJson'),
      ) &&
      routes.transactions.includes('ALLOWED_STATUSES') &&
      routes.transactions.indexOf('Invalid transaction status') <
        routes.transactions.indexOf('getAuthenticatedMember(req)') &&
      routes.transactions.indexOf('getAuthenticatedMember(req)') < routes.transactions.indexOf('getSupabaseAdmin()') &&
      routes.transactions.includes('Cannot view another member transactions') &&
      routes.transactions.includes("query = query.eq('to_member_id', auth.memberId)") &&
      routes.transactions.includes('if (requestedMemberId) query = query.eq') &&
      routes.transactionApprove.includes('ApproveTransactionBody') &&
      routes.transactionApprove.includes('Approver must match authenticated member') &&
      routes.transactionApprove.includes("checkPermission(auth.memberId, communitySlug, 'manage_governance')") &&
      routes.transactionApprove.includes("select('id, community_id')") &&
      routes.transactionApprove.includes('Transaction does not belong to this community') &&
      routes.transactionApprove.includes('approveTx(txId, auth.memberId)') &&
      [routes.transactions, routes.transactionApprove].every(
        (source) =>
          !source.includes('NextResponse') &&
          !source.includes("import { createClient } from '@supabase/supabase-js'") &&
          !source.includes('SUPABASE_SERVICE_ROLE_KEY') &&
          !source.includes('as any') &&
          !source.includes(': any') &&
          !source.includes('error.message') &&
          !source.includes('String(err)'),
      ),
  },
  {
    name: 'community detail route uses explicit public fields and lazy Supabase admin clients',
    ok:
      lacksModuleScopeClients(routes.communityDetail) &&
      routes.communityDetail.includes('COMMUNITY_DETAIL_SELECT') &&
      routes.communityDetail.includes('CONTRACT_SELECT') &&
      routes.communityDetail.includes('COMMUNITY_MEMBER_SELECT') &&
      routes.communityDetail.includes('MEMBER_PROFILE_SELECT') &&
      routes.communityDetail.includes('PRODUCT_SELECT') &&
      routes.communityDetail.includes('CommunityContractRow') &&
      routes.communityDetail.includes('CommunityMemberRow') &&
      routes.communityDetail.includes('MemberProfileRow') &&
      routes.communityDetail.includes('getSupabaseAdmin()') &&
      routes.communityDetail.includes('privateJson') &&
      routes.communityDetail.includes("select('member_id', { count: 'exact', head: true })") &&
      routes.communityDetail.includes('displayNameByMemberId') &&
      pages.communityDashboard.includes("fetch(`/api/communities/${slug}`)") &&
      !routes.communityDetail.includes(".select('*')") &&
      !routes.communityDetail.includes('NextResponse') &&
      !routes.communityDetail.includes("import { createClient } from '@supabase/supabase-js'") &&
      !routes.communityDetail.includes('SUPABASE_SERVICE_ROLE_KEY') &&
      !routes.communityDetail.includes('as any') &&
      !routes.communityDetail.includes(': any') &&
      !routes.communityDetail.includes('error.message') &&
      !routes.communityDetail.includes('String(err)') &&
      !routes.communityDetail.includes('console.error'),
  },
  {
    name: 'community governance route is authenticated, actor-scoped, lazy, and private',
    ok:
      lacksModuleScopeClients(routes.communityGovernance) &&
      routes.communityGovernance.includes('getAuthenticatedMember(req)') &&
      routes.communityGovernance.includes('getSupabaseAdmin()') &&
      routes.communityGovernance.includes('privateJson') &&
      routes.communityGovernance.includes('AssignRoleBody') &&
      routes.communityGovernance.includes('Cannot assign roles for another actor') &&
      routes.communityGovernance.includes("checkPermission(auth.memberId, slug, 'manage_roles')") &&
      routes.communityGovernance.includes('assignRole(community.id, targetMemberId, roleKey, auth.memberId)') &&
      routes.communityGovernance.indexOf('targetMemberId and roleKey required') <
        routes.communityGovernance.indexOf('getAuthenticatedMember(req)') &&
      !routes.communityGovernance.includes('NextResponse') &&
      !routes.communityGovernance.includes("import { createClient } from '@supabase/supabase-js'") &&
      !routes.communityGovernance.includes('SUPABASE_SERVICE_ROLE_KEY') &&
      !routes.communityGovernance.includes('as any') &&
      !routes.communityGovernance.includes(': any') &&
      !routes.communityGovernance.includes('error.message') &&
      !routes.communityGovernance.includes('String(err)') &&
      !routes.communityGovernance.includes('console.error'),
  },
  {
    name: 'community thinker route has explicit public fields and manager-gated writes',
    ok:
      lacksModuleScopeClients(routes.communityThinkers) &&
      routes.communityThinkers.includes('COMMUNITY_THINKER_SELECT') &&
      routes.communityThinkers.includes('type CommunityThinkerBody') &&
      routes.communityThinkers.includes('buildThinkerUpdate') &&
      routes.communityThinkers.includes('getAuthenticatedMember(req)') &&
      routes.communityThinkers.includes('getSupabaseAdmin()') &&
      routes.communityThinkers.includes('privateJson') &&
      routes.communityThinkers.includes("checkPermission(auth.memberId, slug, 'manage_thinkers')") &&
      routes.communityThinkers.includes('safeRequestJson(req)') &&
      routes.communityThinkers.includes('cleanThinkerKey') &&
      routes.communityThinkers.includes('safeColor') &&
      routes.communityThinkers.includes('safeSortOrder') &&
      routes.communityThinkers.indexOf('thinker_key, name, mandate, and persona_lens required') <
        routes.communityThinkers.indexOf('requireManageThinkers(req, slug)') &&
      routes.communityThinkers.indexOf('Thinker id required') <
        routes.communityThinkers.lastIndexOf('requireManageThinkers(req, slug)') &&
      routes.communityThinkers.lastIndexOf('getAuthenticatedMember(req)') <
        routes.communityThinkers.lastIndexOf('getSupabaseAdmin()') &&
      !routes.communityThinkers.includes(".select('*')") &&
      !routes.communityThinkers.includes('NextResponse') &&
      !routes.communityThinkers.includes("import { createClient } from '@supabase/supabase-js'") &&
      !routes.communityThinkers.includes('SUPABASE_SERVICE_ROLE_KEY') &&
      !routes.communityThinkers.includes('const { id, ...updates }') &&
      !routes.communityThinkers.includes('as any') &&
      !routes.communityThinkers.includes(': any') &&
      !routes.communityThinkers.includes('error.message') &&
      !routes.communityThinkers.includes('String(err)') &&
      !routes.communityThinkers.includes('console.error'),
  },
  {
    name: 'community join route is authenticated, self-scoped, lazy, and private',
    ok:
      lacksModuleScopeClients(routes.communityJoin) &&
      routes.communityJoin.includes('getAuthenticatedMember(req)') &&
      routes.communityJoin.includes('getSupabaseAdmin()') &&
      routes.communityJoin.includes('privateJson') &&
      routes.communityJoin.includes('member_id: auth.memberId') &&
      routes.communityJoin.includes(".eq('member_id', auth.memberId)") &&
      routes.communityJoin.indexOf('getAuthenticatedMember(req)') < routes.communityJoin.indexOf('getSupabaseAdmin()') &&
      !routes.communityJoin.includes('JoinCommunityBody') &&
      !routes.communityJoin.includes('req.json()') &&
      !routes.communityJoin.includes('body.memberId') &&
      !routes.communityJoin.includes('Cannot join community for another member') &&
      !routes.communityJoin.includes('NextResponse') &&
      !routes.communityJoin.includes("import { createClient } from '@supabase/supabase-js'") &&
      !routes.communityJoin.includes('SUPABASE_SERVICE_ROLE_KEY') &&
      !routes.communityJoin.includes('as any') &&
      !routes.communityJoin.includes(': any') &&
      !routes.communityJoin.includes('error.message') &&
      !routes.communityJoin.includes('String(err)') &&
      !routes.communityJoin.includes('console.error'),
  },
  {
    name: 'community matches route is authenticated, self-scoped, lazy, and private',
    ok:
      lacksModuleScopeClients(routes.communityMatches) &&
      routes.communityMatches.includes('getAuthenticatedMember(req)') &&
      routes.communityMatches.includes('getSupabaseAdmin()') &&
      routes.communityMatches.includes('privateJson') &&
      routes.communityMatches.includes('CommunityMatchBody') &&
      routes.communityMatches.includes('Cannot respond to another member match') &&
      routes.communityMatches.includes(".eq('member_a', auth.memberId)") &&
      routes.communityMatches.includes(".eq('member_b', auth.memberId)") &&
      routes.communityMatches.includes('match.member_a !== auth.memberId && match.member_b !== auth.memberId') &&
      routes.communityMatches.indexOf('matchId and valid action required') <
        routes.communityMatches.lastIndexOf('getAuthenticatedMember(req)') &&
      routes.communityMatches.lastIndexOf('getAuthenticatedMember(req)') <
        routes.communityMatches.lastIndexOf('getSupabaseAdmin()') &&
      !routes.communityMatches.includes('NextResponse') &&
      !routes.communityMatches.includes("import { createClient } from '@supabase/supabase-js'") &&
      !routes.communityMatches.includes('SUPABASE_SERVICE_ROLE_KEY') &&
      !routes.communityMatches.includes('memberId?: string') &&
      !routes.communityMatches.includes("searchParams.get('memberId')") &&
      !routes.communityMatches.includes('body.memberId') &&
      !routes.communityMatches.includes('Cannot read another member matches') &&
      !routes.communityMatches.includes('Cannot respond for another member') &&
      !routes.communityMatches.includes('as any') &&
      !routes.communityMatches.includes(': any') &&
      !routes.communityMatches.includes('error.message') &&
      !routes.communityMatches.includes('String(err)') &&
      !routes.communityMatches.includes('console.error'),
  },
  {
    name: 'community questionnaire route is authenticated, self-scoped, lazy, and private',
    ok:
      lacksModuleScopeClients(routes.communityQuestionnaire) &&
      routes.communityQuestionnaire.includes('getAuthenticatedMember(req)') &&
      routes.communityQuestionnaire.includes('getSupabaseAdmin()') &&
      routes.communityQuestionnaire.includes('privateJson') &&
      routes.communityQuestionnaire.includes('QuestionnaireBody') &&
      routes.communityQuestionnaire.includes('member_id: auth.memberId') &&
      routes.communityQuestionnaire.includes('runMatching(communityId, auth.memberId)') &&
      routes.communityQuestionnaire.includes('answers object required') &&
      routes.communityQuestionnaire.indexOf('answers object required') <
        routes.communityQuestionnaire.indexOf('getAuthenticatedMember(req)') &&
      routes.communityQuestionnaire.indexOf('getAuthenticatedMember(req)') <
        routes.communityQuestionnaire.lastIndexOf('getSupabaseAdmin()') &&
      !routes.communityQuestionnaire.includes('NextResponse') &&
      !routes.communityQuestionnaire.includes("import { createClient } from '@supabase/supabase-js'") &&
      !routes.communityQuestionnaire.includes('SUPABASE_SERVICE_ROLE_KEY') &&
      !routes.communityQuestionnaire.includes('memberId?: string') &&
      !routes.communityQuestionnaire.includes('body.memberId') &&
      !routes.communityQuestionnaire.includes('Cannot submit questionnaire for another member') &&
      !routes.communityQuestionnaire.includes('as any') &&
      !routes.communityQuestionnaire.includes(': any') &&
      !routes.communityQuestionnaire.includes('error.message') &&
      !routes.communityQuestionnaire.includes('String(err)') &&
      !routes.communityQuestionnaire.includes('console.error'),
  },
  {
    name: 'safe stats and leaderboard routes use lazy Supabase admin clients',
    ok:
      [routes.safe, routes.leaderboard].every(lacksModuleScopeClients) &&
      [routes.safe, routes.leaderboard].every((source) => source.includes('getSupabaseAdmin()')) &&
      routes.safe.includes('privateJson') &&
      routes.safe.includes('getAuthenticatedMember(req)') &&
      routes.safe.indexOf('getAuthenticatedMember(req)') < routes.safe.lastIndexOf('getSupabaseAdmin()') &&
      routes.safe.includes('const memberId = auth.memberId') &&
      !routes.safe.includes("searchParams.get('memberId')") &&
      !routes.safe.includes('memberId required') &&
      pages.access.includes('getSupabaseAccessToken') &&
      pages.access.includes("fetch('/api/safe'") &&
      pages.access.includes('Authorization: `Bearer ${accessToken}`') &&
      pages.access.includes("cache: 'no-store'") &&
      !pages.access.includes('/api/safe?memberId=') &&
      !routes.safe.includes(': any') &&
      routes.leaderboard.indexOf('export async function GET()') < routes.leaderboard.indexOf('getSupabaseAdmin()') &&
      routes.leaderboard.includes('privateJson') &&
      routes.leaderboard.includes('GUIDE_LEADERBOARD_SELECT') &&
      routes.leaderboard.includes('PublicGuideLeaderboardEntry') &&
      routes.leaderboard.includes('publicGuideLeaderboardEntry') &&
      routes.leaderboard.includes('rankKey: `guide-rank-${index + 1}`') &&
      routes.leaderboard.includes("return privateJson({ guides: [], error: 'Failed to load leaderboard' }") &&
      routes.leaderboard.includes('MAX_DISPLAY_NAME_LENGTH') &&
      pages.leaderboard.includes('GuideLeaderboardEntry') &&
      pages.leaderboard.includes("fetch('/api/leaderboard', { cache: 'no-store' })") &&
      pages.leaderboard.includes('rankKey: string') &&
      pages.leaderboard.includes('displayName: string') &&
      !routes.leaderboard.includes('NextResponse') &&
      !routes.leaderboard.includes('id, display_name') &&
      !routes.leaderboard.includes('guide_since') &&
      !routes.leaderboard.includes('error.message') &&
      !routes.leaderboard.includes('String(err)') &&
      !routes.leaderboard.includes('console.error') &&
      !routes.leaderboard.includes('as any') &&
      !routes.leaderboard.includes(': any') &&
      !pages.leaderboard.includes('useState<any') &&
      !pages.leaderboard.includes('g.id') &&
      !pages.leaderboard.includes('g.display_name') &&
      !pages.leaderboard.includes('g.guide_earnings_total') &&
      !pages.leaderboard.includes('g.salons_led') &&
      !pages.leaderboard.includes('g.members_graduated'),
  },
  {
    name: 'ensure-member route uses lazy Supabase admin clients and private no-store JSON',
    ok:
      lacksModuleScopeClients(routes.ensureMember) &&
      routes.ensureMember.includes('getSupabaseAdmin()') &&
      routes.ensureMember.includes('privateJson') &&
      routes.ensureMember.indexOf('Missing auth ID') < routes.ensureMember.indexOf('getSupabaseAdmin()') &&
      routes.ensureMember.includes('ensureDailySubscription(supabaseAdmin,'),
  },
  {
    name: 'scan history route uses lazy Supabase admin clients and private no-store JSON',
    ok:
      lacksModuleScopeClients(routes.scanMyScans) &&
      routes.scanMyScans.includes('getSupabaseAdmin()') &&
      routes.scanMyScans.includes('privateJson') &&
      routes.scanMyScans.includes('SCAN_HISTORY_SELECT') &&
      routes.scanMyScans.includes('publicScanRow') &&
      routes.scanMyScans.includes('scanHistoryFailure()') &&
      routes.scanMyScans.includes('parseBoundedInteger') &&
      routes.scanMyScans.indexOf('getAuthenticatedMember(req)') < routes.scanMyScans.indexOf('getSupabaseAdmin()') &&
      !routes.scanMyScans.includes(': any') &&
      !routes.scanMyScans.includes('error.message') &&
      !routes.scanMyScans.includes('String(err)') &&
      !routes.scanMyScans.includes('proof_hash') &&
      !routes.scanMyScans.includes('supabase_path') &&
      !routes.scanMyScans.includes('...scan') &&
      !routes.scanMyScans.includes('NextResponse'),
  },
  {
    name: 'scan scoring route uses lazy Supabase admin clients and private no-store JSON',
    ok:
      lacksModuleScopeClients(routes.scanScore) &&
      routes.scanScore.includes('getSupabaseAdmin()') &&
      routes.scanScore.includes('privateJson') &&
      routes.scanScore.includes('safeRequestJson(req)') &&
      routes.scanScore.includes('normalizeScanId(body?.scanId)') &&
      routes.scanScore.includes('normalizeQualityScore') &&
      routes.scanScore.includes('SCAN_WITH_SPACE_SELECT') &&
      routes.scanScore.includes('scanScoreFailure()') &&
      routes.scanScore.indexOf('Missing required field: scanId') < routes.scanScore.indexOf('getSupabaseAdmin()') &&
      routes.scanScore.indexOf('Quality score must be 0-100') < routes.scanScore.indexOf('getSupabaseAdmin()') &&
      !routes.scanScore.includes('NextResponse') &&
      !routes.scanScore.includes("select('*, spaces!inner(host_id)')") &&
      !routes.scanScore.includes(': any') &&
      !routes.scanScore.includes('as any') &&
      !routes.scanScore.includes('error.message') &&
      !routes.scanScore.includes('String(err)') &&
      !routes.scanScore.includes('console.error'),
  },
  {
    name: 'world spaces and scan routes use lazy Supabase admin clients and no-store JSON',
    ok:
      [
        routes.scanUpload,
        routes.worldSpaces,
        routes.worldSpaceDetail,
        routes.worldAnnotate,
        routes.worldMatch,
        routes.worldScanUpload,
        routes.worldScanVerify,
      ].every(lacksModuleScopeClients) &&
      [
        routes.scanUpload,
        routes.worldSpaces,
        routes.worldSpaceDetail,
        routes.worldAnnotate,
        routes.worldMatch,
        routes.worldScanUpload,
        routes.worldScanVerify,
      ].every((source) => source.includes('getSupabaseAdmin()') && source.includes('privateJson')) &&
      routes.scanUpload.includes('getAuthenticatedMember(req)') &&
      routes.scanUpload.indexOf('getAuthenticatedMember(req)') < routes.scanUpload.indexOf('getSupabaseAdmin()') &&
      routes.scanUpload.includes('normalizeScanUploadForm(formData)') &&
      routes.scanUpload.includes('MAX_SCAN_UPLOAD_BYTES') &&
      routes.scanUpload.includes('SCAN_UPLOAD_INSERT_SELECT') &&
      routes.scanUpload.includes('publicUploadReceipt(scanRow.id, isFirstScan)') &&
      routes.scanUpload.includes('scanUploadFailure()') &&
      routes.scanUpload.includes("new URL('/api/scan/score', req.nextUrl.origin)") &&
      !routes.scanUpload.includes('.select()') &&
      !routes.scanUpload.includes('scan: scanRow') &&
      !routes.scanUpload.includes('\n      proofHash,') &&
      !routes.scanUpload.includes('memberId: auth.memberId') &&
      routes.worldSpaces.includes('getAuthenticatedMember(req)') &&
      routes.worldSpaces.indexOf('Missing required fields: name, slug') <
        routes.worldSpaces.indexOf('getAuthenticatedMember(req)') &&
      routes.worldSpaces.indexOf('getAuthenticatedMember(req)') < routes.worldSpaces.lastIndexOf('getSupabaseAdmin()') &&
      routes.worldSpaces.includes('host_id: hostId') &&
      routes.worldSpaces.includes('member_id: auth.memberId') &&
      routes.worldSpaces.includes('safeRequestJson(req)') &&
      routes.worldSpaces.includes('normalizeCreateSpaceBody(body)') &&
      routes.worldSpaces.includes('SPACE_LIST_SELECT') &&
      routes.worldSpaces.includes('SPACE_INSERT_SELECT') &&
      routes.worldSpaces.includes('publicSpaceSummary') &&
      routes.worldSpaces.includes('publicSpaceCreateReceipt(spaceRow, newTotal)') &&
      routes.worldSpaces.includes('worldSpacesLoadFailure()') &&
      routes.worldSpaces.includes('worldSpacesCreateFailure()') &&
      routes.worldSpaces.includes("return privateJson({ error: 'Invalid slug' }") &&
      routes.worldSpaces.includes("return privateJson({ error: 'Invalid space type' }") &&
      !routes.worldSpaces.includes("select('*')") &&
      !routes.worldSpaces.includes('.select()') &&
      !routes.worldSpaces.includes('req.json()') &&
      !routes.worldSpaces.includes('return privateJson({ space, expAwarded') &&
      routes.worldSpaceDetail.includes('function isSpaceHost') &&
      routes.worldSpaceDetail.includes('getAuthenticatedMember(req)') &&
      routes.worldSpaceDetail.includes('!isSpaceHost(space.host_id, auth)') &&
      routes.worldSpaceDetail.includes('safeRequestJson(req)') &&
      routes.worldSpaceDetail.includes('normalizeSpaceUpdateBody(body)') &&
      routes.worldSpaceDetail.includes('SPACE_DETAIL_SELECT') &&
      routes.worldSpaceDetail.includes('SCAN_DETAIL_SELECT') &&
      routes.worldSpaceDetail.includes('ANNOTATION_DETAIL_SELECT') &&
      routes.worldSpaceDetail.includes('HOST_SPACE_SELECT') &&
      routes.worldSpaceDetail.includes('publicSpaceDetail') &&
      routes.worldSpaceDetail.includes('publicScanDetail') &&
      routes.worldSpaceDetail.includes('publicAnnotationDetail') &&
      routes.worldSpaceDetail.includes('worldSpaceDetailFailure()') &&
      routes.worldSpaceDetail.includes('worldSpaceUpdateFailure()') &&
      routes.worldSpaceDetail.includes('worldSpaceDeleteFailure()') &&
      routes.worldSpaceDetail.includes("return privateJson({ error: 'Invalid space update' }") &&
      routes.worldSpaceDetail.includes('qualityDeleteError') &&
      routes.worldSpaceDetail.includes('annotationsDeleteError') &&
      routes.worldSpaceDetail.includes('scansDeleteError') &&
      !routes.worldSpaceDetail.includes("select('*')") &&
      !routes.worldSpaceDetail.includes('.select()') &&
      !routes.worldSpaceDetail.includes('req.json()') &&
      !routes.worldSpaceDetail.includes('return privateJson({ space, scans') &&
      !routes.worldSpaceDetail.includes('return privateJson({ space: updated') &&
      !routes.worldSpaceDetail.includes('proof_hash') &&
      !routes.worldSpaceDetail.includes('file_url') &&
      !routes.worldSpaceDetail.includes('author_id') &&
      !routes.worldSpaceDetail.includes('metadata') &&
      !routes.worldSpaceDetail.includes('searchParams.get') &&
      !routes.worldSpaceDetail.includes('Missing hostId') &&
      routes.worldAnnotate.includes('getAuthenticatedMember(req)') &&
      routes.worldAnnotate.indexOf('Missing required fields: spaceId, content') <
        routes.worldAnnotate.indexOf('getSupabaseAdmin()') &&
      routes.worldAnnotate.includes('safeRequestJson(req)') &&
      routes.worldAnnotate.includes('normalizeAnnotationBody(body)') &&
      routes.worldAnnotate.includes('MAX_ANNOTATION_BODY_LENGTH') &&
      routes.worldAnnotate.includes('MAX_ANNOTATION_CONTENT_LENGTH') &&
      routes.worldAnnotate.includes('ALLOWED_ANNOTATION_TYPES') &&
      routes.worldAnnotate.includes("return privateJson({ error: 'Invalid annotation type' }") &&
      routes.worldAnnotate.includes('SCAN_SPACE_SELECT') &&
      routes.worldAnnotate.includes('ANNOTATION_INSERT_SELECT') &&
      routes.worldAnnotate.includes('publicAnnotationReceipt(annotationRow, newTotal)') &&
      routes.worldAnnotate.includes('worldAnnotationFailure()') &&
      routes.worldAnnotate.includes('author_id: authorId') &&
      routes.worldAnnotate.includes('member_id: auth.memberId') &&
      !routes.worldAnnotate.includes('.select()') &&
      !routes.worldAnnotate.includes('return privateJson({ annotation, expAwarded') &&
      routes.worldMatch.includes('getAuthenticatedMember(req)') &&
      routes.worldMatch.includes('const memberId = auth.memberId') &&
      routes.worldMatch.includes('normalizeLimit(searchParams.get') &&
      routes.worldMatch.includes('FREQUENCY_MEMBER_SELECT') &&
      routes.worldMatch.includes('normalizeCoherenceInput') &&
      routes.worldMatch.includes('publicMatchResult') &&
      routes.worldMatch.includes('matchKey: `match-${index + 1}`') &&
      routes.worldMatch.includes('worldMatchFailure()') &&
      routes.worldMatch.includes("return privateJson({ error: 'Invalid limit' }") &&
      !routes.worldMatch.includes('exp_tokens') &&
      !routes.worldMatch.includes('memberId: member.id') &&
      !routes.worldMatch.includes('memberId: m.id') &&
      !routes.worldMatch.includes('matches: matches.slice') &&
      !routes.worldMatch.includes("searchParams.get('memberId')") &&
      !routes.worldMatch.includes('Cannot read another member matches') &&
      pages.worldMatch.includes('getSupabaseAccessToken') &&
      pages.worldMatch.includes('Authorization: `Bearer ${accessToken}`') &&
      pages.worldMatch.includes("fetch('/api/world/match'") &&
      pages.worldMatch.includes('matchKey: string') &&
      pages.worldMatch.includes("cache: 'no-store'") &&
      !pages.worldMatch.includes('memberId: string') &&
      !pages.worldMatch.includes('memberId=${session.member.id}') &&
      routes.worldScanUpload.includes('getAuthenticatedMember(req)') &&
      routes.worldScanUpload.indexOf('Missing required fields: file, spaceId') <
        routes.worldScanUpload.indexOf('getSupabaseAdmin()') &&
      routes.worldScanUpload.includes('normalizeWorldScanUploadForm(formData)') &&
      routes.worldScanUpload.includes('MAX_WORLD_SCAN_UPLOAD_BYTES') &&
      routes.worldScanUpload.includes('WORLD_SCAN_UPLOAD_INSERT_SELECT') &&
      routes.worldScanUpload.includes('publicWorldScanUploadReceipt(scan.id, isFirstScan)') &&
      routes.worldScanUpload.includes('worldScanUploadFailure()') &&
      routes.worldScanUpload.includes('scanner_id: scannerId') &&
      !routes.worldScanUpload.includes('.select()') &&
      !routes.worldScanUpload.includes('return privateJson({ scan, proofHash') &&
      routes.worldScanVerify.includes('getAuthenticatedMember(req)') &&
      routes.worldScanVerify.includes('safeRequestJson(req)') &&
      routes.worldScanVerify.includes('normalizeUuid(body?.scanId)') &&
      routes.worldScanVerify.includes('normalizeQualityScore') &&
      routes.worldScanVerify.includes('SCAN_WITH_SPACE_SELECT') &&
      routes.worldScanVerify.includes('worldScanVerifyFailure()') &&
      routes.worldScanVerify.includes('const reviewerId = auth.member.supabase_auth_id || auth.memberId') &&
      routes.worldScanVerify.includes("supabase_auth_id.eq.${typedScan.scanner_id},id.eq.${typedScan.scanner_id}") &&
      routes.worldScanVerify.indexOf('Quality score must be 0-100') < routes.worldScanVerify.indexOf('getSupabaseAdmin()') &&
      routes.worldSpaceDetail.includes('Failed to update space') &&
      routes.worldSpaceDetail.includes('Failed to delete space') &&
      routes.worldScanVerify.includes('type ScanWithSpace') &&
      [
        routes.scanUpload,
        routes.worldSpaces,
        routes.worldSpaceDetail,
        routes.worldAnnotate,
        routes.worldMatch,
        routes.worldScanUpload,
        routes.worldScanVerify,
      ].every(
        (source) =>
          !source.includes('NextResponse') &&
          !source.includes("select('*, spaces!inner(host_id)')") &&
          !source.includes('as any') &&
          !source.includes(': any') &&
          !source.includes('error.message') &&
          !source.includes('String(err)'),
      ),
  },
  {
    name: 'member profile route is self-scoped and uses lazy Supabase admin clients',
    ok:
      lacksModuleScopeClients(routes.memberProfile) &&
      routes.memberProfile.includes('getAuthenticatedMember(req)') &&
      routes.memberProfile.includes('getSupabaseAdmin()') &&
      routes.memberProfile.includes('privateJson') &&
      routes.memberProfile.indexOf('getAuthenticatedMember(req)') < routes.memberProfile.indexOf('safeRequestJson(req)') &&
      routes.memberProfile.indexOf('getAuthenticatedMember(req)') < routes.memberProfile.indexOf('getSupabaseAdmin()') &&
      routes.memberProfile.includes(".eq('id', auth.memberId)") &&
      routes.memberProfile.includes("select('id, display_name, discipline, skills, project_description, seeking, bio, exp_tokens, tier, philosophy')") &&
      routes.memberProfile.includes('return privateJson({ ok: true, member })') &&
      routes.memberProfile.includes('normalizeOptionalText') &&
      routes.memberProfile.includes('MAX_PROFILE_TEXT_LENGTH') &&
      routes.memberProfile.includes('MAX_SKILLS') &&
      routes.memberProfile.includes('Failed to update profile') &&
      pages.members.includes("fetch('/api/members/profile'") &&
      pages.members.includes('getSupabaseAccessToken') &&
      pages.members.includes('getAuthHeaders(true)') &&
      !pages.members.includes('memberId: currentMember.id') &&
      !routes.memberProfile.includes('memberId?:') &&
      !routes.memberProfile.includes('memberId required') &&
      !routes.memberProfile.includes('auth.memberId !== memberId') &&
      !routes.memberProfile.includes('NextResponse') &&
      !routes.memberProfile.includes('as any') &&
      !routes.memberProfile.includes('error.message') &&
      !routes.memberProfile.includes('String(err)'),
  },
  {
    name: 'member onboarding route is self-scoped and uses lazy Supabase admin clients',
    ok:
      lacksModuleScopeClients(routes.membersOnboarding) &&
      routes.membersOnboarding.includes('getAuthenticatedMember(req)') &&
      routes.membersOnboarding.includes('getSupabaseAdmin()') &&
      routes.membersOnboarding.includes('privateJson') &&
      routes.membersOnboarding.indexOf('Missing fields') <
        routes.membersOnboarding.indexOf('getAuthenticatedMember(req)') &&
      routes.membersOnboarding.indexOf('getAuthenticatedMember(req)') <
        routes.membersOnboarding.indexOf('getSupabaseAdmin()') &&
      routes.membersOnboarding.includes(".eq('id', auth.memberId)") &&
      routes.membersOnboarding.includes(".eq('member_id', auth.memberId)") &&
      routes.membersOnboarding.includes('member_id: auth.memberId') &&
      routes.membersOnboarding.includes('normalizeAnswers') &&
      routes.membersOnboarding.includes('MAX_ONBOARDING_ANSWER_LENGTH') &&
      routes.membersOnboarding.includes('maybeSingle()') &&
      routes.membersOnboarding.includes('Failed to save onboarding answers') &&
      routes.membersOnboarding.includes('Failed to save onboarding memory') &&
      pages.council.includes("fetch('/api/members/onboarding'") &&
      pages.council.includes('Authorization: `Bearer ${authToken}`') &&
      !pages.council.includes('body: JSON.stringify({ memberId, answers') &&
      !routes.membersOnboarding.includes('memberId?:') &&
      !routes.membersOnboarding.includes('body.memberId') &&
      !routes.membersOnboarding.includes('auth.memberId !== memberId') &&
      !routes.membersOnboarding.includes('Cannot update another member onboarding') &&
      !routes.membersOnboarding.includes(".eq('id', memberId)") &&
      !routes.membersOnboarding.includes(".eq('member_id', memberId)") &&
      !routes.membersOnboarding.includes('member_id: memberId') &&
      !routes.membersOnboarding.includes('NextResponse') &&
      !routes.membersOnboarding.includes('as any') &&
      !routes.membersOnboarding.includes('error.message') &&
      !routes.membersOnboarding.includes('String(err)'),
  },
  {
    name: 'member discovery route requires auth and uses lazy Supabase admin clients',
    ok:
      lacksModuleScopeClients(routes.membersDiscover) &&
      routes.membersDiscover.includes('getAuthenticatedMember(req)') &&
      routes.membersDiscover.includes('getSupabaseAdmin()') &&
      routes.membersDiscover.includes('privateJson') &&
      routes.membersDiscover.indexOf('getAuthenticatedMember(req)') <
        routes.membersDiscover.indexOf('getSupabaseAdmin()') &&
      routes.membersDiscover.includes("error: 'Unauthorized'") &&
      routes.membersDiscover.includes('discipline') &&
      routes.membersDiscover.includes('project_description') &&
      routes.membersDiscover.includes('seeking') &&
      !routes.membersDiscover.includes('wallet_address') &&
      !routes.membersDiscover.includes('email') &&
      routes.membersDiscover.includes('parseCommunitySlug') &&
      routes.membersDiscover.includes('Failed to load members') &&
      routes.membersDiscover.includes('Failed to load member profiles') &&
      pages.members.includes("fetch('/api/members/discover'") &&
      pages.members.includes("cache: 'no-store'") &&
      !pages.members.includes("from('members').select('*')") &&
      !routes.membersDiscover.includes('NextResponse') &&
      !routes.membersDiscover.includes('as any') &&
      !routes.membersDiscover.includes(': any') &&
      !routes.membersDiscover.includes('error.message') &&
      !routes.membersDiscover.includes('String(err)'),
  },
  {
    name: 'public explorer profile uses a shared sanitized loader and lazy Supabase admin clients',
    ok:
      lacksModuleScopeClients(routes.explorerDetail) &&
      lacksModuleScopeClients(pages.explorerProfile) &&
      lacksModuleScopeClients(helpers.publicExplorerProfile) &&
      routes.explorerDetail.includes("import { isPublicExplorerId, loadPublicExplorerProfile } from '@/lib/explorer/publicProfile'") &&
      routes.explorerDetail.includes("export const dynamic = 'force-dynamic'") &&
      routes.explorerDetail.includes("error: 'Invalid explorer id'") &&
      routes.explorerDetail.includes('loadPublicExplorerProfile(id)') &&
      pages.explorerProfile.includes("import { loadPublicExplorerProfile } from '@/lib/explorer/publicProfile'") &&
      pages.explorerProfile.includes("export const dynamic = 'force-dynamic'") &&
      pages.explorerProfile.includes('loadPublicExplorerProfile(id)') &&
      helpers.publicExplorerProfile.includes('getSupabaseAdmin()') &&
      helpers.publicExplorerProfile.includes('isPublicExplorerId') &&
      helpers.publicExplorerProfile.includes('PUBLIC_EXPLORER_MEMBER_SELECT') &&
      helpers.publicExplorerProfile.includes('RESPONSE_SELECT') &&
      helpers.publicExplorerProfile.includes('QUESTION_SELECT') &&
      helpers.publicExplorerProfile.includes("select('amount')") &&
      !routes.explorerDetail.includes("createClient(") &&
      !routes.explorerDetail.includes("from('members')") &&
      !pages.explorerProfile.includes("createClient(") &&
      !pages.explorerProfile.includes("from('members')") &&
      !helpers.publicExplorerProfile.includes('wallet_address') &&
      !helpers.publicExplorerProfile.includes('supabase_auth_id') &&
      !helpers.publicExplorerProfile.includes('email') &&
      !routes.explorerDetail.includes('as any') &&
      !routes.explorerDetail.includes(': any') &&
      !pages.explorerProfile.includes('as any') &&
      !pages.explorerProfile.includes(': any') &&
      !helpers.publicExplorerProfile.includes('as any') &&
      !helpers.publicExplorerProfile.includes(': any'),
  },
  {
    name: 'public feed routes use lazy Supabase admin clients and no-store JSON',
    ok:
      [routes.feed, routes.feedPulse].every(lacksModuleScopeClients) &&
      [routes.feed, routes.feedPulse].every(
        (source) => source.includes('getSupabaseAdmin()') && source.includes('privateJson'),
      ) &&
      routes.feed.indexOf('parseLimit') < routes.feed.indexOf('getSupabaseAdmin()') &&
      routes.feed.includes('Failed to load community feed') &&
      routes.feedPulse.includes('Failed to load community pulse') &&
      [routes.feed, routes.feedPulse].every(
        (source) => !source.includes('NextResponse') && !source.includes('as any') && !source.includes(': any'),
      ),
  },
  {
    name: 'guide routes use lazy Supabase admin clients and private no-store JSON',
    ok:
      [routes.guide, routes.guideCreateSalon].every(lacksModuleScopeClients) &&
      [routes.guide, routes.guideCreateSalon].every(
        (source) =>
          source.includes('getAuthenticatedMember(req)') &&
          source.includes('getSupabaseAdmin()') &&
          source.includes('privateJson'),
      ) &&
      routes.guide.indexOf('getAuthenticatedMember(req)') < routes.guide.indexOf('getSupabaseAdmin()') &&
      routes.guide.includes('GUIDE_SALON_SELECT') &&
      routes.guide.includes('publicGuideSalon') &&
      routes.guide.includes('getGuideSalonStats') &&
      routes.guide.includes('publicSpawningTree') &&
      routes.guide.includes("select('id', { count: 'exact', head: true })") &&
      routes.guide.includes("select(GUIDE_SALON_SELECT)") &&
      pages.guide.includes("fetch('/api/guide'") &&
      pages.guide.includes("cache: 'no-store'") &&
      !routes.guide.includes(".select('*')") &&
      !routes.guide.includes('return { ...s') &&
      !routes.guide.includes('spawning_tree: spawningTree') &&
      !routes.guide.includes('guide_since') &&
      !routes.guide.includes('total_exp_awarded') &&
      !pages.guide.includes('s.stats.total_exp_awarded') &&
      routes.guideCreateSalon.indexOf('Title required') < routes.guideCreateSalon.indexOf('getSupabaseAdmin()') &&
      routes.guideCreateSalon.includes('safeRequestJson(req)') &&
      routes.guideCreateSalon.includes('boundedText(body.title') &&
      routes.guideCreateSalon.includes('normalizeUuid(body.parent_salon_id)') &&
      routes.guideCreateSalon.includes('PARENT_SALON_SELECT') &&
      routes.guideCreateSalon.includes('SALON_CREATE_RECEIPT_SELECT') &&
      routes.guideCreateSalon.includes("select(SALON_CREATE_RECEIPT_SELECT)") &&
      routes.guideCreateSalon.includes(".eq('guide_member_id', auth.memberId)") &&
      routes.guideCreateSalon.includes("parentSalonRow.status !== 'completed'") &&
      routes.guideCreateSalon.includes('salonReceipt') &&
      routes.guideCreateSalon.includes('Failed to create salon') &&
      routes.guideCreateSalon.includes('memberInsertError') &&
      routes.guideCreateSalon.includes('sessionsError') &&
      routes.guideCreateSalon.includes('memberUpdateError') &&
      !routes.guideCreateSalon.includes('.select().single()') &&
      !routes.guideCreateSalon.includes("select('*')") &&
      !routes.guideCreateSalon.includes('error?.message') &&
      !routes.guideCreateSalon.includes('memberInsertError.message') &&
      !routes.guideCreateSalon.includes('sessionsError.message') &&
      !routes.guideCreateSalon.includes('memberUpdateError.message') &&
      !routes.guideCreateSalon.includes('return privateJson({ salon: salonRow') &&
      [routes.guide, routes.guideCreateSalon].every(
        (source) => !source.includes('NextResponse') && !source.includes('as any') && !source.includes(': any'),
      ),
  },
  {
    name: 'Salon Hub task routes are signed-in, auth-derived, lazy, and private',
    ok:
      [routes.salonHubTasks, routes.salonHubTaskDetail].every(lacksModuleScopeClients) &&
      [routes.salonHubTasks, routes.salonHubTaskDetail].every(
        (source) =>
          source.includes('getAuthenticatedMember(req)') &&
          source.includes('getSupabaseAdmin()') &&
          source.includes('privateJson'),
      ) &&
      routes.salonHubTasks.indexOf('getAuthenticatedMember(req)') <
        routes.salonHubTasks.indexOf('getSupabaseAdmin()') &&
      routes.salonHubTaskDetail.includes('UUID_RE') &&
      routes.salonHubTaskDetail.indexOf('UUID_RE.test(id)') <
        routes.salonHubTaskDetail.indexOf('getAuthenticatedMember(req)') &&
      routes.salonHubTasks.includes(".from('hub_tasks')") &&
      routes.salonHubTaskDetail.includes(".from('hub_tasks')") &&
      routes.salonHubTasks.includes('member_id: auth.memberId') &&
      routes.salonHubTasks.includes(".eq('member_id', auth.memberId)") &&
      routes.salonHubTaskDetail.includes(".eq('member_id', auth.memberId)") &&
      routes.salonHubTaskDetail.includes('ALLOWED_STATUSES') &&
      pages.salonHub.includes("fetch('/api/salon-hub/tasks'") &&
      pages.salonHub.includes("cache: 'no-store'") &&
      pages.salonHub.includes('getSupabaseAccessToken') &&
      pages.salonHub.includes('encodeURIComponent(id)') &&
      !pages.salonHub.includes("from('hub_tasks')") &&
      !pages.salonHub.includes('member_id: memberId') &&
      [routes.salonHubTasks, routes.salonHubTaskDetail].every(
        (source) =>
          !source.includes('NextResponse') &&
          !source.includes('as any') &&
          !source.includes(': any') &&
          !source.includes('error.message') &&
          !source.includes('String(err)'),
      ),
  },
  {
    name: 'merch suggestion and publish routes are manager-gated, private, and free of browser table writes',
    ok:
      [
        routes.merchSuggestions,
        routes.merchSuggestionDetail,
        routes.merchGenerateProducts,
        routes.merchGenerateMockup,
        routes.merchPublish,
      ].every(lacksModuleScopeClients) &&
      [
        routes.merchSuggestions,
        routes.merchSuggestionDetail,
        routes.merchGenerateProducts,
        routes.merchGenerateMockup,
        routes.merchPublish,
      ].every((source) => source.includes('getMovementAccess(') && source.includes('access.canManage')) &&
      [
        routes.merchSuggestions,
        routes.merchSuggestionDetail,
        routes.merchGenerateProducts,
        routes.merchGenerateMockup,
        routes.merchPublish,
      ].every((source) => source.includes('privateJson')) &&
      routes.merchSuggestions.indexOf('getMovementAccess(req)') <
        routes.merchSuggestions.indexOf('getSupabaseAdmin()') &&
      routes.merchSuggestionDetail.includes('UUID_RE') &&
      routes.merchSuggestionDetail.indexOf('UUID_RE.test(id)') <
        routes.merchSuggestionDetail.indexOf('getMovementAccess(req)') &&
      routes.merchGenerateProducts.indexOf('getMovementAccess(req)') <
        routes.merchGenerateProducts.indexOf('createAnthropicClient()') &&
      routes.merchGenerateMockup.indexOf('getMovementAccess(req)') <
        routes.merchGenerateMockup.indexOf('process.env.FAL_API_KEY') &&
      routes.merchPublish.indexOf('getMovementAccess(request)') <
        routes.merchPublish.indexOf('process.env.PRINTFUL_API_KEY') &&
      pages.merchOverlay.includes('getSupabaseAccessToken') &&
      pages.merchOverlay.includes("fetch('/api/merch/suggestions'") &&
      pages.merchOverlay.includes("fetch('/api/merch/publish'") &&
      pages.merchOverlay.includes("fetch('/api/merch/generate-products'") &&
      pages.merchOverlay.includes("fetch('/api/merch/generate-mockup'") &&
      pages.merchOverlay.includes("cache: 'no-store'") &&
      !pages.merchOverlay.includes('createClient()') &&
      !pages.merchOverlay.includes("from('merch_suggestions')"),
  },
  {
    name: 'match matrix, history, and response routes are private, lazy, and no-store',
    ok:
      [routes.match, routes.matchHistory, routes.matchRespond].every(lacksModuleScopeClients) &&
      [routes.match, routes.matchHistory, routes.matchRespond].every(
        (source) =>
          source.includes('getSupabaseAdmin()') &&
          source.includes('privateJson'),
      ) &&
      routes.match.includes('getSupabasePublicEnv()') &&
      routes.match.includes('authenticateMember(req, env)') &&
      routes.match.includes('source_member_authenticated: Boolean(audit.sourceMemberId)') &&
      routes.match.includes('candidate_query_failed') &&
      routes.match.indexOf('authenticateMember(req, env)') < routes.match.indexOf('parseProjectionBody(body)') &&
      routes.match.indexOf('parseProjectionBody(body)') < routes.match.lastIndexOf('getSupabaseAdmin()') &&
      routes.match.indexOf('sourceProjection.value.member_id !== auth.id') <
        routes.match.lastIndexOf('getSupabaseAdmin()') &&
      !routes.match.includes('NextResponse') &&
      !routes.match.includes('SUPABASE_SERVICE_ROLE_KEY') &&
      !routes.match.includes('authenticated_member_id') &&
      !routes.match.includes('submitted_member_id') &&
      !routes.match.includes('source_member_id: audit.sourceMemberId') &&
      routes.matchHistory.includes('MATCH_HISTORY_SELECT') &&
      routes.matchHistory.includes('publicMatchHistoryRow') &&
      routes.matchHistory.includes('matchHistoryFailure()') &&
      !routes.matchHistory.includes(".select('*')") &&
      !routes.matchHistory.includes('...match') &&
      routes.matchHistory.indexOf('getAuthenticatedMember(req)') < routes.matchHistory.indexOf('getSupabaseAdmin()') &&
      routes.matchRespond.includes('safeRequestJson(req)') &&
      routes.matchRespond.includes('normalizeMatchId') &&
      routes.matchRespond.includes('normalizeRating') &&
      routes.matchRespond.includes('matchResponseFailure()') &&
      routes.matchRespond.indexOf('matchId and valid action required') <
        routes.matchRespond.indexOf('getAuthenticatedMember(req)') &&
      routes.matchRespond.indexOf('getAuthenticatedMember(req)') < routes.matchRespond.indexOf('getSupabaseAdmin()') &&
      routes.matchRespond.includes(".neq('status', 'completed')") &&
      routes.matchRespond.includes("select('id')") &&
      routes.matchRespond.includes('hasRating(updatedRow.rating_a)') &&
      [routes.matchHistory, routes.matchRespond].every(
        (source) => !source.includes('error.message') && !source.includes('String(err)') && !source.includes('console.error'),
      ) &&
      [routes.match, routes.matchHistory, routes.matchRespond].every(
        (source) => !source.includes('NextResponse') && !source.includes('as any') && !source.includes(': any'),
      ),
  },
  {
    name: 'email/provider routes still require cron authorization before client initialization',
    ok:
      routes.cronDailyEmail.indexOf('authorization') < routes.cronDailyEmail.indexOf('getResend()') &&
      routes.practiceDailyEmail.indexOf('authorization') < routes.practiceDailyEmail.indexOf('getResend()') &&
      routes.testProvocation.indexOf('authorization') < routes.testProvocation.indexOf('getResend()') &&
      routes.weeklyProvocation.indexOf('authorization') < routes.weeklyProvocation.indexOf('getResend()') &&
      routes.proactiveCron.indexOf('authorization') < routes.proactiveCron.indexOf('getResend()') &&
      routes.onboardingTrigger.indexOf('authorization') < routes.onboardingTrigger.indexOf('getResend()'),
  },
  {
    name: 'proactive and onboarding emails are lazy, no-store, escaped, and flag-gated',
    ok:
      [routes.proactiveCron, routes.onboardingTrigger].every(lacksModuleScopeClients) &&
      [routes.proactiveCron, routes.onboardingTrigger].every(
        (source) =>
          source.includes('getSupabaseAdmin()') &&
          source.includes('getResend()') &&
          source.includes('privateJson') &&
          source.includes('function escapeHtml') &&
          source.includes('createAnthropicClient()') &&
          source.includes('resolveClaudeModel(') &&
          !source.includes("fetch('https://api.resend.com/emails'") &&
          !source.includes('NextResponse') &&
          !source.includes('console.error') &&
          !source.includes('as any') &&
          !source.includes(': any'),
      ) &&
      routes.proactiveCron.includes("process.env.PROACTIVE_EMAIL_NOTIFICATIONS_ENABLED === 'true'") &&
      routes.proactiveCron.includes('safeMessage') &&
      routes.proactiveCron.indexOf('PROACTIVE_EMAIL_NOTIFICATIONS_ENABLED') < routes.proactiveCron.indexOf('getResend()') &&
      routes.onboardingTrigger.includes("process.env.ONBOARDING_EMAIL_NOTIFICATIONS_ENABLED === 'true'") &&
      routes.onboardingTrigger.includes('safeRequestJson(req)') &&
      routes.onboardingTrigger.includes('renderMessageHtml') &&
      routes.onboardingTrigger.indexOf('memberId and step required') <
        routes.onboardingTrigger.indexOf('getSupabaseAdmin()') &&
      routes.onboardingTrigger.indexOf('ONBOARDING_EMAIL_NOTIFICATIONS_ENABLED') <
        routes.onboardingTrigger.indexOf('getResend()'),
  },
  {
    name: 'onboarding batch trigger proxy is cron-authorized, no-store, bounded, and disabled by default',
    ok:
      lacksModuleScopeClients(routes.onboardingSendAll) &&
      routes.onboardingSendAll.includes('privateJson') &&
      routes.onboardingSendAll.includes('safeRequestJson(req)') &&
      routes.onboardingSendAll.includes('boundedString(body.memberId, 128)') &&
      routes.onboardingSendAll.includes('parseStep(body.step)') &&
      routes.onboardingSendAll.includes("process.env.ONBOARDING_BATCH_TRIGGER_ENABLED === 'true'") &&
      routes.onboardingSendAll.includes("reason: 'batch_disabled'") &&
      routes.onboardingSendAll.includes("new URL('/api/onboarding/trigger', req.url)") &&
      routes.onboardingSendAll.includes("cache: 'no-store'") &&
      routes.onboardingSendAll.includes('authorization,') &&
      routes.onboardingSendAll.indexOf('authorization') < routes.onboardingSendAll.indexOf('safeRequestJson(req)') &&
      routes.onboardingSendAll.indexOf('memberId and step required') <
        routes.onboardingSendAll.indexOf("new URL('/api/onboarding/trigger', req.url)") &&
      routes.onboardingSendAll.indexOf('ONBOARDING_BATCH_TRIGGER_ENABLED') <
        routes.onboardingSendAll.indexOf("new URL('/api/onboarding/trigger', req.url)") &&
      !routes.onboardingSendAll.includes('NextResponse') &&
      !routes.onboardingSendAll.includes('console.error') &&
      !routes.onboardingSendAll.includes('as any') &&
      !routes.onboardingSendAll.includes(': any'),
  },
  {
    name: 'DM notification route uses lazy clients, private no-store JSON, and escapes email HTML',
    ok:
      lacksModuleScopeClients(routes.notifyDm) &&
      routes.notifyDm.includes('getSupabaseAdmin()') &&
      routes.notifyDm.includes('getResend()') &&
      routes.notifyDm.includes('privateJson') &&
      routes.notifyDm.includes("process.env.DM_EMAIL_NOTIFICATIONS_ENABLED === 'true'") &&
      routes.notifyDm.includes('safeRequestJson(req)') &&
      routes.notifyDm.includes('boundedText(body.recipientId') &&
      routes.notifyDm.includes('boundedText(body.senderName') &&
      routes.notifyDm.includes('boundedText(body.preview') &&
      routes.notifyDm.includes('function escapeHtml') &&
      routes.notifyDm.includes('subjectText(senderName)') &&
      routes.notifyDm.includes('escapeHtml(recipientName)') &&
      routes.notifyDm.includes('escapeHtml(senderName)') &&
      routes.notifyDm.includes('escapeHtml(messagePreview)') &&
      routes.notifyDm.includes("reason: 'email_disabled'") &&
      routes.notifyDm.indexOf('authorization') < routes.notifyDm.indexOf('getResend()') &&
      routes.notifyDm.indexOf('Missing fields') < routes.notifyDm.indexOf('getSupabaseAdmin()') &&
      routes.notifyDm.indexOf('DM_EMAIL_NOTIFICATIONS_ENABLED') < routes.notifyDm.indexOf('getResend()') &&
      !routes.notifyDm.includes('console.error') &&
      !routes.notifyDm.includes('as any') &&
      !routes.notifyDm.includes(': any'),
  },
  {
    name: 'DM route is signed-in, sender/read-scoped, lazy, and private',
    ok:
      lacksModuleScopeClients(routes.message) &&
      routes.message.includes('export async function GET') &&
      routes.message.includes('getAuthenticatedMember(req)') &&
      routes.message.includes('getSupabaseAdmin()') &&
      routes.message.includes('privateJson') &&
      routes.message.includes('safeRequestJson(req)') &&
      routes.message.includes('sender_id: auth.memberId') &&
      routes.message.includes("select('id')") &&
      routes.message.includes("select('id', { count: 'exact', head: true })") &&
      routes.message.includes("req.nextUrl.searchParams.get('peerId')") &&
      routes.message.includes('.update({ read: true })') &&
      routes.message.includes(".eq('recipient_id', auth.memberId)") &&
      routes.message.includes(".eq('sender_id', peerId)") &&
      routes.message.indexOf('getAuthenticatedMember(req)') < routes.message.indexOf('safeRequestJson(req)') &&
      routes.message.indexOf("select('id')") < routes.message.indexOf("from('direct_messages').insert") &&
      !routes.message.includes('createServiceClient') &&
      !routes.message.includes('NextResponse') &&
      !routes.message.includes('senderId') &&
      pages.members.includes("fetch('/api/message'") &&
      pages.members.includes('getAuthHeaders(true)') &&
      pages.members.includes('getSupabaseAccessToken()') &&
      pages.members.includes("fetch('/api/message', { headers, cache: 'no-store' })") &&
      pages.members.includes('fetch(`/api/message?peerId=${encodeURIComponent(selectedMemberId)}`') &&
      pages.members.includes("cache: 'no-store'") &&
      !pages.members.includes('senderId: currentMember.id') &&
      !pages.members.includes("fetch('/api/notify/dm'") &&
      !pages.members.includes(".from('direct_messages')") &&
      !pages.members.includes('.update({ read: true })'),
  },
  {
    name: 'AI/media generation routes use lazy Anthropic clients',
    ok:
      [routes.taste, routes.ritualDrops, routes.voiceNotes, routes.artifactGenerate].every(lacksModuleScopeClients) &&
      [routes.taste, routes.ritualDrops, routes.voiceNotes, routes.artifactGenerate].every(
        (source) => source.includes('createAnthropicClient()') && source.includes("resolveClaudeModel('content'"),
      ),
  },
  {
    name: 'AI/media generation routes use lazy Supabase admin clients when they write private state',
    ok:
      !routes.taste.includes('getSupabaseAdmin()') &&
      routes.ritualDrops.includes('getSupabaseAdmin()') &&
      routes.voiceNotes.includes('getSupabaseAdmin()') &&
      routes.artifactGenerate.includes('getSupabaseAdmin()'),
  },
  {
    name: 'voice-note generation is signed-in, self-scoped, consent-gated for audio, and private',
    ok:
      lacksModuleScopeClients(routes.voiceNotes) &&
      routes.voiceNotes.includes('getAuthenticatedMember(req)') &&
      routes.voiceNotes.includes('privateJson') &&
      routes.voiceNotes.includes('safeRequestJson(req)') &&
      routes.voiceNotes.includes('Cannot generate a voice note for another member') &&
      routes.voiceNotes.includes(".eq('member_id', auth.memberId)") &&
      routes.voiceNotes.includes('member_id: auth.memberId') &&
      routes.voiceNotes.includes('shouldGenerateAudio') &&
      routes.voiceNotes.includes('consentToAudioGeneration === true') &&
      routes.voiceNotes.includes('generateAudioUrl({ memberId: auth.memberId') &&
      routes.voiceNotes.includes('process.env.ELEVENLABS_API_KEY') &&
      routes.voiceNotes.indexOf('safeRequestJson(req)') < routes.voiceNotes.indexOf('getAuthenticatedMember(req)') &&
      routes.voiceNotes.indexOf('getAuthenticatedMember(req)') <
        routes.voiceNotes.indexOf('const supabaseAdmin = getSupabaseAdmin();\n  const { data: memory }') &&
      routes.voiceNotes.indexOf('getAuthenticatedMember(req)') <
        routes.voiceNotes.indexOf('createAnthropicClient()') &&
      routes.voiceNotes.indexOf('shouldGenerateAudio(body)') <
        routes.voiceNotes.indexOf('generateAudioUrl({ memberId: auth.memberId') &&
      !routes.voiceNotes.includes('NextResponse') &&
      !routes.voiceNotes.includes('as any') &&
      !routes.voiceNotes.includes(': any') &&
      !routes.voiceNotes.includes('error.message') &&
      !routes.voiceNotes.includes('String(error)') &&
      !routes.voiceNotes.includes('console.error'),
  },
  {
    name: 'transcription route is signed-in, consent-gated, bounded, and private',
    ok:
      lacksModuleScopeClients(routes.transcribe) &&
      routes.transcribe.includes('getAuthenticatedMember(req)') &&
      routes.transcribe.includes('privateJson') &&
      routes.transcribe.includes('MAX_AUDIO_BYTES') &&
      routes.transcribe.includes('MAX_TRANSCRIPT_CHARS') &&
      routes.transcribe.includes('hasTranscriptionConsent(formData)') &&
      routes.transcribe.includes("formData.get('consentToTranscription') === 'true'") &&
      routes.transcribe.includes('process.env.OPENAI_API_KEY') &&
      routes.transcribe.includes('fetch(OPENAI_TRANSCRIPTION_URL') &&
      routes.transcribe.includes('transcribeFailure()') &&
      routes.transcribe.indexOf('getAuthenticatedMember(req)') < routes.transcribe.indexOf('req.formData()') &&
      routes.transcribe.indexOf('hasTranscriptionConsent(formData)') <
        routes.transcribe.indexOf('fetch(OPENAI_TRANSCRIPTION_URL') &&
      pages.waddle.includes("fd.append('consentToTranscription', 'true')") &&
      pages.waddle.includes('Authorization: `Bearer ${accessToken}`') &&
      pages.waddle.includes("fetch('/api/transcribe'") &&
      pages.waddle.includes("cache: 'no-store'") &&
      helpers.voiceRecorder.includes("formData.append('consentToTranscription', 'true')") &&
      helpers.voiceRecorder.includes('getSupabaseAccessToken()') &&
      helpers.voiceRecorder.includes('Authorization: `Bearer ${accessToken}`') &&
      helpers.voiceRecorder.includes("fetch('/api/transcribe'") &&
      helpers.voiceRecorder.includes("cache: 'no-store'") &&
      docs.operator.includes('Transcription') &&
      docs.routeInventory.includes('signed-in, consent-gated, size-bounded') &&
      !routes.transcribe.includes('NextResponse') &&
      !routes.transcribe.includes('console.error') &&
      !routes.transcribe.includes('error.message') &&
      !routes.transcribe.includes('String(error)') &&
      !routes.transcribe.includes('await response.text()') &&
      !routes.transcribe.includes('as any') &&
      !routes.transcribe.includes(': any'),
  },
  {
    name: 'TTS route is signed-in, consent-gated, bounded, and private',
    ok:
      lacksModuleScopeClients(routes.tts) &&
      routes.tts.includes('getAuthenticatedMember(req)') &&
      routes.tts.includes('privateJson') &&
      routes.tts.includes('safeRequestJson(req)') &&
      routes.tts.includes('MAX_TTS_TEXT_CHARS') &&
      routes.tts.includes('MAX_VOICE_ID_CHARS') &&
      routes.tts.includes('VOICE_ID_PATTERN') &&
      routes.tts.includes('body.consentToVoiceGeneration !== true') &&
      routes.tts.includes('normalizeText(body.text)') &&
      routes.tts.includes('process.env.ELEVENLABS_API_KEY') &&
      routes.tts.includes('ELEVENLABS_TTS_BASE_URL') &&
      routes.tts.includes('resolveVoiceId(body)') &&
      routes.tts.includes('privateAudioResponse(audioBuffer)') &&
      routes.tts.includes("vary: 'Authorization, Cookie'") &&
      routes.tts.includes('ttsFailure()') &&
      routes.tts.indexOf('getAuthenticatedMember(req)') < routes.tts.indexOf('safeRequestJson(req)') &&
      routes.tts.indexOf('body.consentToVoiceGeneration !== true') <
        routes.tts.indexOf('const response = await fetch') &&
      helpers.tts.includes('getSupabaseAccessToken()') &&
      helpers.tts.includes('Authorization: `Bearer ${accessToken}`') &&
      helpers.tts.includes("fetch('/api/tts'") &&
      helpers.tts.includes("cache: 'no-store'") &&
      helpers.tts.includes('consentToVoiceGeneration: true') &&
      helpers.tts.includes('WebkitAudioWindow') &&
      docs.operator.includes('TTS') &&
      docs.routeInventory.includes('signed-in auth plus explicit voice-generation consent') &&
      !routes.tts.includes('NextResponse') &&
      !routes.tts.includes('console.error') &&
      !routes.tts.includes('error.message') &&
      !routes.tts.includes('String(error)') &&
      !routes.tts.includes('await response.text()') &&
      !routes.tts.includes('as any') &&
      !routes.tts.includes(': any') &&
      !helpers.tts.includes('as any'),
  },
  {
    name: 'Waddle creation is signed-in, self-scoped, lazy, and private',
    ok:
      lacksModuleScopeClients(routes.waddle) &&
      routes.waddle.includes('getAuthenticatedMember(req)') &&
      routes.waddle.includes('privateJson') &&
      routes.waddle.includes('getSupabaseAdmin()') &&
      routes.waddle.includes('member_id: auth.memberId') &&
      routes.waddle.includes('`${auth.memberId}/${Date.now()}-${randomUUID()}.webm`') &&
      routes.waddle.includes('MAX_AUDIO_BYTES') &&
      routes.waddle.includes('MAX_TRANSCRIPTION_CHARS') &&
      routes.waddle.indexOf('getAuthenticatedMember(req)') < routes.waddle.indexOf('req.formData()') &&
      routes.waddle.indexOf('getAuthenticatedMember(req)') < routes.waddle.lastIndexOf('getSupabaseAdmin()') &&
      pages.waddle.includes('getSupabaseAccessToken') &&
      pages.waddle.includes("fetch('/api/waddle', {") &&
      pages.waddle.includes('Authorization: `Bearer ${accessToken}`') &&
      pages.waddle.includes("cache: 'no-store'") &&
      !routes.waddle.includes("formData.get('memberId')") &&
      !pages.waddle.includes("fd.append('memberId'") &&
      !routes.waddle.includes('NextResponse') &&
      !routes.waddle.includes("import { createClient } from '@supabase/supabase-js'") &&
      !routes.waddle.includes('SUPABASE_SERVICE_ROLE_KEY') &&
      !routes.waddle.includes('error.message') &&
      !routes.waddle.includes('String(err)') &&
      !routes.waddle.includes('String(error)') &&
      !routes.waddle.includes('console.error') &&
      !routes.waddle.includes('as any') &&
      !routes.waddle.includes(': any'),
  },
  {
    name: 'artifact generation is signed-in, self-scoped, consent-gated for media/publicity, and private',
    ok:
      lacksModuleScopeClients(routes.artifactGenerate) &&
      routes.artifactGenerate.includes('getAuthenticatedMember(req)') &&
      routes.artifactGenerate.includes('privateJson') &&
      routes.artifactGenerate.includes('safeRequestJson(req)') &&
      routes.artifactGenerate.includes('Cannot generate an artifact for another member') &&
      routes.artifactGenerate.includes('member_id: auth.memberId') &&
      routes.artifactGenerate.includes('shouldGenerateImage') &&
      routes.artifactGenerate.includes('consentToImageGeneration === true') &&
      routes.artifactGenerate.includes('generateImageUrl(fullImagePrompt)') &&
      routes.artifactGenerate.includes('process.env.FAL_API_KEY') &&
      routes.artifactGenerate.includes('shouldPublishArtifact') &&
      routes.artifactGenerate.includes('consentToPublishArtifact === true') &&
      routes.artifactGenerate.includes('shouldStoreConversationContext') &&
      routes.artifactGenerate.includes('consentToStoreContext === true') &&
      routes.artifactGenerate.includes('PROMPT_WITHHELD') &&
      routes.artifactGenerate.includes('prompt_used: shouldStoreConversationContext(body) ? fullImagePrompt : PROMPT_WITHHELD') &&
      routes.artifactGenerate.includes('conversation_context: shouldStoreConversationContext(body)') &&
      routes.artifactGenerate.includes('is_public: shouldPublishArtifact(body)') &&
      routes.artifactGenerate.indexOf('safeRequestJson(req)') <
        routes.artifactGenerate.indexOf('getAuthenticatedMember(req)') &&
      routes.artifactGenerate.indexOf('getAuthenticatedMember(req)') <
        routes.artifactGenerate.indexOf('createAnthropicClient()') &&
      routes.artifactGenerate.indexOf('getAuthenticatedMember(req)') <
        routes.artifactGenerate.indexOf('const supabaseAdmin = getSupabaseAdmin();') &&
      routes.artifactGenerate.indexOf('shouldGenerateImage(body)') <
        routes.artifactGenerate.indexOf('generateImageUrl(fullImagePrompt)') &&
      !routes.artifactGenerate.includes('NextResponse') &&
      !routes.artifactGenerate.includes('as any') &&
      !routes.artifactGenerate.includes(': any') &&
      !routes.artifactGenerate.includes('error.message') &&
      !routes.artifactGenerate.includes('String(error)') &&
      !routes.artifactGenerate.includes('console.error') &&
      !routes.artifactGenerate.includes('is_public: true'),
  },
  {
    name: 'artifact merch ordering is signed-in, owner-scoped, lazy, and fulfillment-gated',
    ok:
      lacksModuleScopeClients(routes.artifactMerch) &&
      routes.artifactMerch.includes('getAuthenticatedMember(req)') &&
      routes.artifactMerch.includes('privateJson') &&
      routes.artifactMerch.includes('safeRequestJson(req)') &&
      routes.artifactMerch.includes('ARTIFACT_MERCH_SELECT') &&
      routes.artifactMerch.includes("process.env.ARTIFACT_MERCH_ORDERING_ENABLED === 'true'") &&
      routes.artifactMerch.includes('process.env.PRINTFUL_API_KEY') &&
      routes.artifactMerch.includes("fetch('https://api.printful.com/orders'") &&
      routes.artifactMerch.includes('artifact.member_id !== auth.memberId') &&
      routes.artifactMerch.includes('member_id: auth.memberId') &&
      routes.artifactMerch.includes('extractShippingAddress') &&
      routes.artifactMerch.includes('normalizeEmail') &&
      routes.artifactMerch.includes('Failed to record merch order') &&
      routes.artifactMerch.indexOf('safeRequestJson(req)') <
        routes.artifactMerch.indexOf('getAuthenticatedMember(req)') &&
      routes.artifactMerch.indexOf('getAuthenticatedMember(req)') <
        routes.artifactMerch.indexOf('getSupabaseAdmin()') &&
      routes.artifactMerch.indexOf('artifact.member_id !== auth.memberId') <
        routes.artifactMerch.indexOf("fetch('https://api.printful.com/orders'") &&
      routes.artifactMerch.indexOf('ARTIFACT_MERCH_ORDERING_ENABLED') <
        routes.artifactMerch.indexOf("fetch('https://api.printful.com/orders'") &&
      !routes.artifactMerch.includes('NextResponse') &&
      !routes.artifactMerch.includes("import { createClient } from '@supabase/supabase-js'") &&
      !routes.artifactMerch.includes('SUPABASE_SERVICE_ROLE_KEY') &&
      !routes.artifactMerch.includes(".select('*')") &&
      !routes.artifactMerch.includes('as any') &&
      !routes.artifactMerch.includes(': any') &&
      !routes.artifactMerch.includes('error.message') &&
      !routes.artifactMerch.includes('String(error)') &&
      !routes.artifactMerch.includes('console.error'),
  },
  {
    name: 'artifact mint recording is signed-in, owner-scoped, lazy, and chain-state gated',
    ok:
      lacksModuleScopeClients(routes.artifactMint) &&
      routes.artifactMint.includes('getAuthenticatedMember(req)') &&
      routes.artifactMint.includes('privateJson') &&
      routes.artifactMint.includes('safeRequestJson(req)') &&
      routes.artifactMint.includes('ARTIFACT_MINT_SELECT') &&
      routes.artifactMint.includes("process.env.ARTIFACT_NFT_MINT_RECORDING_ENABLED === 'true'") &&
      routes.artifactMint.includes('resolveContractAddress()') &&
      routes.artifactMint.includes('normalizeWalletAddress') &&
      routes.artifactMint.includes('normalizeTransactionHash') &&
      routes.artifactMint.includes('normalizeTokenId') &&
      routes.artifactMint.includes('artifact.member_id !== auth.memberId') &&
      routes.artifactMint.includes('member_id: auth.memberId') &&
      routes.artifactMint.includes(".eq('member_id', auth.memberId)") &&
      routes.artifactMint.includes('Failed to record mint preparation') &&
      routes.artifactMint.indexOf('safeRequestJson(req)') < routes.artifactMint.indexOf('getAuthenticatedMember(req)') &&
      routes.artifactMint.indexOf('getAuthenticatedMember(req)') <
        routes.artifactMint.indexOf('artifactNftMintRecordingEnabled())') &&
      routes.artifactMint.indexOf('artifactNftMintRecordingEnabled())') <
        routes.artifactMint.indexOf('const supabaseAdmin = getSupabaseAdmin();') &&
      routes.artifactMint.indexOf('artifact.member_id !== auth.memberId') <
        routes.artifactMint.indexOf(".from('nft_mints')") &&
      !routes.artifactMint.includes('NextResponse') &&
      !routes.artifactMint.includes("import { createClient } from '@supabase/supabase-js'") &&
      !routes.artifactMint.includes('SUPABASE_SERVICE_ROLE_KEY') &&
      !routes.artifactMint.includes(".select('*')") &&
      !routes.artifactMint.includes('as any') &&
      !routes.artifactMint.includes(': any') &&
      !routes.artifactMint.includes('error.message') &&
      !routes.artifactMint.includes('String(error)') &&
      !routes.artifactMint.includes('console.error'),
  },
  {
    name: 'private AI context routes use lazy Anthropic and Supabase admin clients',
    ok:
      [routes.practiceReflect, routes.insights, routes.matchGenerate].every(lacksModuleScopeClients) &&
      [routes.practiceReflect, routes.insights, routes.matchGenerate].every(
        (source) => source.includes('createAnthropicClient()') && source.includes('resolveClaudeModel('),
      ) &&
      [routes.practiceReflect, routes.insights, routes.matchGenerate].every((source) =>
        source.includes('getSupabaseAdmin()'),
      ) &&
      routes.practiceReflect.includes('getAuthenticatedMember(req)') &&
      routes.practiceReflect.includes('Authentication required') &&
      routes.practiceReflect.includes('Cannot generate reflection for another member') &&
      routes.practiceReflect.includes('response.member_id !== auth.memberId') &&
      routes.practiceReflect.includes('privateEventStreamHeaders') &&
      helpers.routeError.includes('export function privateEventStreamHeaders') &&
      appendVaryPattern('Cookie').test(helpers.routeError) &&
      appendVaryPattern('Authorization').test(helpers.routeError) &&
      routes.practiceReflect.indexOf('Invalid responseId') < routes.practiceReflect.indexOf('getAuthenticatedMember(req)') &&
      routes.practiceReflect.indexOf('getAuthenticatedMember(req)') < routes.practiceReflect.indexOf('getSupabaseAdmin()') &&
      routes.practiceReflect.indexOf('response.member_id !== auth.memberId') <
        routes.practiceReflect.indexOf('createAnthropicClient()') &&
      !routes.practiceReflect.includes('JSON.stringify({ error: message })') &&
      routes.insights.includes('privateJson') &&
      !routes.insights.includes('NextResponse') &&
      routes.insights.indexOf('getAuthenticatedMember(req)') < routes.insights.indexOf('getSupabaseAdmin()') &&
      routes.insights.indexOf('getAuthenticatedMember(req)') <
        routes.insights.indexOf('const openingHeadline = await generateOpeningHeadline') &&
      !routes.insights.includes('factsError.message') &&
      !routes.insights.includes('episodesError.message') &&
      routes.matchGenerate.includes('privateJson') &&
      !routes.matchGenerate.includes('NextResponse') &&
      routes.matchGenerate.includes('parseMatchPrompts') &&
      routes.matchGenerate.includes('Failed to create match') &&
      routes.matchGenerate.includes('member_a: memberId') &&
      routes.matchGenerate.includes('member_b: bestMemberId') &&
      routes.matchGenerate.indexOf('getAuthenticatedMember(req)') <
        routes.matchGenerate.indexOf('getSupabaseAdmin()') &&
      routes.matchGenerate.indexOf('getAuthenticatedMember(req)') <
        routes.matchGenerate.indexOf('createAnthropicClient()') &&
      routes.matchGenerate.indexOf("if ((member?.total_responses || 0) < 7)") <
        routes.matchGenerate.indexOf('createAnthropicClient()') &&
      !routes.matchGenerate.includes('console.error') &&
      pages.practice.includes('fetchReflection(responseId, authToken)') &&
      pages.practice.includes('Authorization: `Bearer ${token}`') &&
      pages.match.includes("fetch('/api/match/generate'") &&
      pages.match.includes("'Authorization': `Bearer ${authToken}`"),
  },
  {
    name: 'memory extraction routes and helpers use lazy Anthropic and Supabase admin clients',
    ok:
      [routes.thinkerExtractFacts, helpers.memoryExtractFacts, helpers.thinkerMemory].every(lacksModuleScopeClients) &&
      [routes.thinkerExtractFacts, helpers.memoryExtractFacts, helpers.thinkerMemory].every(
        (source) => source.includes('createAnthropicClient()') && source.includes("resolveClaudeModel('memory'"),
      ) &&
      [routes.thinkerExtractFacts, helpers.memoryExtractFacts, helpers.thinkerMemory].every((source) =>
        source.includes('getSupabaseAdmin()'),
      ),
  },
  {
    name: 'thinker fact extraction route is auth-or-cron scoped, self-scoped, and private',
    ok:
      lacksModuleScopeClients(routes.thinkerExtractFacts) &&
      routes.thinkerExtractFacts.includes('privateJson') &&
      routes.thinkerExtractFacts.includes('getAuthenticatedMember(req)') &&
      routes.thinkerExtractFacts.includes('const cronAuthorized = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);') &&
      routes.thinkerExtractFacts.includes('memberId required for cron extraction') &&
      routes.thinkerExtractFacts.includes('Cannot extract facts for another member') &&
      routes.thinkerExtractFacts.includes('const targetMemberId = auth?.memberId || requestedMemberId') &&
      routes.thinkerExtractFacts.includes(".eq('member_id', targetMemberId)") &&
      routes.thinkerExtractFacts.includes('member_id: targetMemberId') &&
      routes.thinkerExtractFacts.indexOf('thinkerId and messages required') <
        routes.thinkerExtractFacts.indexOf('getAuthenticatedMember(req)') &&
      routes.thinkerExtractFacts.indexOf('getAuthenticatedMember(req)') <
        routes.thinkerExtractFacts.indexOf('createAnthropicClient()') &&
      !routes.thinkerExtractFacts.includes('NextResponse') &&
      !routes.thinkerExtractFacts.includes('as any') &&
      !routes.thinkerExtractFacts.includes(': any') &&
      !routes.thinkerExtractFacts.includes('error.message') &&
      !routes.thinkerExtractFacts.includes('String(err)') &&
      !routes.thinkerExtractFacts.includes('console.error'),
  },
  {
    name: 'thinker memory embedding route is authenticated, self-scoped, and private',
    ok:
      lacksModuleScopeClients(routes.thinkerMemory) &&
      routes.thinkerMemory.includes('privateJson') &&
      routes.thinkerMemory.includes('getAuthenticatedMember(req)') &&
      routes.thinkerMemory.includes('Cannot store memory for another member') &&
      routes.thinkerMemory.includes('memberId: auth.memberId') &&
      routes.thinkerMemory.includes("metadata: { source: 'conversation' }") &&
      routes.thinkerMemory.indexOf('thinkerKey and messages required') <
        routes.thinkerMemory.indexOf('getAuthenticatedMember(req)') &&
      routes.thinkerMemory.indexOf('getAuthenticatedMember(req)') <
        routes.thinkerMemory.lastIndexOf('storeConversationEmbedding') &&
      !routes.thinkerMemory.includes('NextResponse') &&
      !routes.thinkerMemory.includes('as any') &&
      !routes.thinkerMemory.includes(': any') &&
      !routes.thinkerMemory.includes('error.message') &&
      !routes.thinkerMemory.includes('String(err)') &&
      !routes.thinkerMemory.includes('console.error'),
  },
  {
    name: 'memory episode writes use lazy Supabase admin clients',
    ok:
      lacksModuleScopeClients(helpers.memoryEpisodes) &&
      helpers.memoryEpisodes.includes('getSupabaseAdmin()') &&
      helpers.memoryEpisodes.indexOf('writeEpisodes') < helpers.memoryEpisodes.indexOf('getSupabaseAdmin()'),
  },
  {
    name: 'community ritual routes use lazy Anthropic and Supabase admin clients',
    ok:
      [routes.ritual, routes.greatBooksAnnotate, routes.greatBooksSeminar].every(lacksModuleScopeClients) &&
      [routes.ritual, routes.greatBooksAnnotate, routes.greatBooksSeminar].every(
        (source) => source.includes('createAnthropicClient()') && source.includes("resolveClaudeModel('content'"),
      ) &&
      routes.ritual.includes('getSupabaseAdmin()') &&
      routes.greatBooksAnnotate.includes('getSupabaseAdmin()') &&
      !routes.greatBooksSeminar.includes('getSupabaseAdmin()'),
  },
  {
    name: 'ritual generation is signed-in, self-scoped, and private',
    ok:
      lacksModuleScopeClients(routes.ritual) &&
      routes.ritual.includes('safeRequestJson(req)') &&
      routes.ritual.includes('getAuthenticatedMember(req)') &&
      routes.ritual.includes('privateJson') &&
      routes.ritual.includes('privateSseHeaders') &&
      routes.ritual.includes("'Vary': 'Cookie, Authorization'") &&
      routes.ritual.includes(".eq('id', auth.memberId)") &&
      routes.ritual.includes(".eq('member_id', auth.memberId)") &&
      routes.ritual.includes('member_id: auth.memberId') &&
      routes.ritual.indexOf('ritualId required') < routes.ritual.indexOf('getAuthenticatedMember(req)') &&
      routes.ritual.indexOf('getAuthenticatedMember(req)') < routes.ritual.indexOf('getSupabaseAdmin()') &&
      routes.ritual.indexOf('getAuthenticatedMember(req)') < routes.ritual.indexOf('createAnthropicClient()') &&
      !routes.ritual.includes('const { ritualId, memberId }') &&
      !routes.ritual.includes('body.memberId') &&
      !routes.ritual.includes('memberId required') &&
      !routes.ritual.includes('NextResponse') &&
      !routes.ritual.includes('as any') &&
      !routes.ritual.includes(': any') &&
      !routes.ritual.includes('error.message') &&
      !routes.ritual.includes('String(err)') &&
      !routes.ritual.includes('console.error'),
  },
  {
    name: 'Great Books text and progress routes are lazy, self-scoped, and private',
    ok:
      [routes.greatBooksText, routes.greatBooksProgress].every(lacksModuleScopeClients) &&
      [routes.greatBooksText, routes.greatBooksProgress].every(
        (source) => source.includes('getSupabaseAdmin()') && source.includes('privateJson'),
      ) &&
      routes.greatBooksProgress.includes('getAuthenticatedMember(req)') &&
      routes.greatBooksProgress.indexOf('Missing fields') < routes.greatBooksProgress.lastIndexOf('getSupabaseAdmin()') &&
      !routes.greatBooksProgress.includes('memberId?: string') &&
      !routes.greatBooksProgress.includes("searchParams.get('memberId')") &&
      !routes.greatBooksProgress.includes('Cannot read another member progress') &&
      !routes.greatBooksProgress.includes('Cannot update another member progress') &&
      routes.greatBooksText.includes('Book not found') &&
      routes.greatBooksText.includes('Failed to fetch text') &&
      [routes.greatBooksText, routes.greatBooksProgress].every(
        (source) => !source.includes('NextResponse') && !source.includes('as any') && !source.includes(': any'),
      ) &&
      [pages.greatBooksLibrary, pages.greatBooksReader].every(
        (source) =>
          source.includes('getSupabaseAccessToken') &&
          source.includes('Authorization: `Bearer ${accessToken}`') &&
          source.includes("cache: 'no-store'"),
      ) &&
      pages.greatBooksLibrary.includes("fetch('/api/great-books/progress'") &&
      pages.greatBooksReader.includes('fetch(`/api/great-books/progress?bookId=${bookId}`') &&
      !pages.greatBooksLibrary.includes('progress?memberId=') &&
      !pages.greatBooksReader.includes('progress?memberId=') &&
      !pages.greatBooksReader.includes('{ memberId, bookId, sectionId'),
  },
  {
    name: 'EXP award route is lazy, self-scoped, private, and Great Books callers send auth',
    ok:
      lacksModuleScopeClients(routes.expAward) &&
      routes.expAward.includes('getAuthenticatedMember(req)') &&
      routes.expAward.includes('getSupabaseAdmin()') &&
      routes.expAward.includes('privateJson') &&
      routes.expAward.includes('ALLOWED_REASONS') &&
      routes.expAward.includes('Cannot award EXP to another member') &&
      routes.expAward.includes('rateLimits.get(auth.memberId)') &&
      routes.expAward.includes('rateLimits.set(auth.memberId') &&
      routes.expAward.includes('member_id: auth.memberId') &&
      routes.expAward.indexOf('Missing fields') < routes.expAward.indexOf('getAuthenticatedMember(req)') &&
      routes.expAward.indexOf('getAuthenticatedMember(req)') < routes.expAward.indexOf('getSupabaseAdmin()') &&
      pages.greatBooksReader.includes('/api/exp/award') &&
      pages.greatBooksReader.includes('getSupabaseAccessToken') &&
      pages.greatBooksReader.includes('Authorization: `Bearer ${accessToken}`') &&
      !routes.expAward.includes('NextResponse') &&
      !routes.expAward.includes('as any') &&
      !routes.expAward.includes(': any') &&
      !routes.expAward.includes('error.message') &&
      !routes.expAward.includes('String(err)'),
  },
  {
    name: 'community response routes use lazy Anthropic and Supabase admin clients',
    ok:
      [routes.councilVerdict, routes.councilVerdictDetail, routes.twiddleCron, routes.twiddleRespond, helpers.thinkerActions].every(
        lacksModuleScopeClients,
      ) &&
      [routes.councilVerdict, routes.twiddleCron, routes.twiddleRespond].every(
        (source) => source.includes('createAnthropicClient()') && source.includes("resolveClaudeModel('content'"),
      ) &&
      [routes.councilVerdict, routes.councilVerdictDetail, routes.twiddleCron, routes.twiddleRespond, helpers.thinkerActions].every((source) =>
        source.includes('getSupabaseAdmin()'),
      ) &&
      routes.councilVerdict.includes('getAuthenticatedMember(req)') &&
      routes.councilVerdict.includes('privateJson') &&
      routes.councilVerdict.includes('safeRequestJson(req)') &&
      routes.councilVerdict.includes('member_id: auth.memberId') &&
      routes.councilVerdict.indexOf('Missing fields') < routes.councilVerdict.indexOf('getAuthenticatedMember(req)') &&
      routes.councilVerdict.indexOf('getAuthenticatedMember(req)') < routes.councilVerdict.indexOf('createAnthropicClient()') &&
      // Security fix S6d: the session-ownership check reads Supabase after auth but before any model call.
      routes.councilVerdict.indexOf('getAuthenticatedMember(req)') < routes.councilVerdict.indexOf('getSupabaseAdmin()') &&
      routes.councilVerdict.indexOf('Forbidden') < routes.councilVerdict.indexOf('createAnthropicClient()') &&
      routes.councilVerdict.includes('is_public: makePublic') &&
      routes.councilVerdictDetail.includes('publicNoStoreJson') &&
      routes.councilVerdictDetail.includes('getSupabaseAdmin()') &&
      !routes.councilVerdict.includes('NextResponse') &&
      !routes.councilVerdict.includes('(await req.json())') &&
      !routes.councilVerdict.includes('= await req.json()') &&
      !routes.councilVerdict.includes('memberId?:') &&
      !routes.councilVerdict.includes('parsed.memberId') &&
      !routes.councilVerdict.includes('member_id: memberId') &&
      !routes.councilVerdict.includes('error.message') &&
      !routes.councilVerdict.includes('String(err)') &&
      !routes.councilVerdict.includes('console.error') &&
      !routes.councilVerdictDetail.includes("import { createClient } from '@supabase/supabase-js'") &&
      !routes.councilVerdictDetail.includes('SUPABASE_SERVICE_ROLE_KEY') &&
      pages.council.includes("fetch('/api/council/verdict'") &&
      pages.council.includes('Authorization: `Bearer ${authToken}`') &&
      !pages.council.includes('responses: realResponses,\n          memberId') &&
      !pages.council.includes('memberId: memberId || null'),
  },
  {
    name: 'Twiddle response route is signed-in, self-scoped, consent-gated for voice/actions, and private',
    ok:
      lacksModuleScopeClients(routes.twiddleRespond) &&
      routes.twiddleRespond.includes('getAuthenticatedMember(req)') &&
      routes.twiddleRespond.includes('privateJson') &&
      routes.twiddleRespond.includes('safeRequestJson(req)') &&
      routes.twiddleRespond.includes('getMemory(auth.memberId, thinkerKey)') &&
      routes.twiddleRespond.includes('executeThinkerAction(action, auth.memberId, thinkerKey)') &&
      routes.twiddleRespond.includes('shouldExecuteActions') &&
      routes.twiddleRespond.includes('consentToExecuteActions === true') &&
      routes.twiddleRespond.includes('shouldGenerateVoice') &&
      routes.twiddleRespond.includes('consentToVoiceGeneration === true') &&
      routes.twiddleRespond.includes('process.env.ELEVENLABS_API_KEY') &&
      routes.twiddleRespond.includes('loadRelationshipContext(') &&
      routes.twiddleRespond.includes("auth.member.supabase_auth_id") &&
      routes.twiddleRespond.includes(".eq('author_id', authUserId)") &&
      routes.twiddleRespond.indexOf('safeRequestJson(req)') <
        routes.twiddleRespond.indexOf('getAuthenticatedMember(req)') &&
      routes.twiddleRespond.indexOf('getAuthenticatedMember(req)') <
        routes.twiddleRespond.indexOf('const supabaseAdmin = getSupabaseAdmin();') &&
      routes.twiddleRespond.indexOf('getAuthenticatedMember(req)') <
        routes.twiddleRespond.indexOf('createAnthropicClient()') &&
      routes.twiddleRespond.indexOf('shouldExecuteActions(body)') <
        routes.twiddleRespond.indexOf('executeThinkerAction(action, auth.memberId, thinkerKey)') &&
      routes.twiddleRespond.indexOf('shouldGenerateVoice(body)') <
        routes.twiddleRespond.indexOf('generateVoiceUrl({ supabaseAdmin, id, thinkerKey, responseText })') &&
      !routes.twiddleRespond.includes('memberId?: unknown') &&
      !routes.twiddleRespond.includes('body.memberId') &&
      !routes.twiddleRespond.includes('Cannot generate a Twiddle response for another member') &&
      !routes.twiddleRespond.includes('NextResponse') &&
      !routes.twiddleRespond.includes('as any') &&
      !routes.twiddleRespond.includes(': any') &&
      !routes.twiddleRespond.includes('error.message') &&
      !routes.twiddleRespond.includes('String(err)') &&
      !routes.twiddleRespond.includes('console.error') &&
      !routes.twiddleRespond.includes('console.warn'),
  },
  {
    name: 'Twiddle core routes use request-time admin, auth-derived writes, and private JSON',
    ok:
      [routes.twiddles, routes.twiddleDetail, routes.twiddleReact].every(lacksModuleScopeClients) &&
      [routes.twiddles, routes.twiddleDetail, routes.twiddleReact].every(
        (source) => source.includes('getSupabaseAdmin()') && source.includes('privateJson'),
      ) &&
      routes.twiddles.includes('getAuthenticatedMember(req)') &&
      routes.twiddles.includes('Supabase auth session required to create Twiddles') &&
      routes.twiddles.includes('author_id: auth.member.supabase_auth_id') &&
      routes.twiddles.indexOf('safeRequestJson(req)') < routes.twiddles.indexOf('getAuthenticatedMember(req)') &&
      routes.twiddles.indexOf('getAuthenticatedMember(req)') < routes.twiddles.indexOf('getSupabaseAdmin()') &&
      routes.twiddleDetail.includes('getAuthenticatedMember(req)') &&
      routes.twiddleDetail.includes('twiddleOwner.author_id !== auth.member.supabase_auth_id') &&
      routes.twiddleDetail.includes('No valid updates') &&
      routes.twiddleDetail.includes('Supabase auth session required to update Twiddles') &&
      routes.twiddleDetail.indexOf('const auth = await getAuthenticatedMember(req)') <
        routes.twiddleDetail.lastIndexOf('const supabaseAdmin = getSupabaseAdmin();') &&
      routes.twiddleReact.includes('getAuthenticatedMember(req)') &&
      routes.twiddleReact.includes('Supabase auth session required to react') &&
      routes.twiddleReact.includes(".eq('user_id', auth.member.supabase_auth_id)") &&
      routes.twiddleReact.includes('user_id: auth.member.supabase_auth_id') &&
      routes.twiddleReact.indexOf('safeRequestJson(req)') < routes.twiddleReact.indexOf('getAuthenticatedMember(req)') &&
      routes.twiddleReact.indexOf('getAuthenticatedMember(req)') < routes.twiddleReact.indexOf('getSupabaseAdmin()') &&
      [pages.twiddle, pages.twiddleThread, pages.twiddleConstellation].every(
        (source) =>
          source.includes('getSupabaseAccessToken') &&
          source.includes("cache: 'no-store'") &&
          source.includes('Authorization: `Bearer ${accessToken}`'),
      ) &&
      pages.twiddle.includes('/api/twiddle?filter=') &&
      pages.twiddle.includes('/api/twiddle/${twiddleId}/react') &&
      pages.twiddle.includes('/api/twiddle/${twiddleId}/respond') &&
      pages.twiddleThread.includes('/api/twiddle/${id}') &&
      pages.twiddleThread.includes('/api/twiddle/${twiddleId}/react') &&
      pages.twiddleThread.includes('/api/twiddle/${twiddleId}/respond') &&
      pages.twiddleConstellation.includes('/api/twiddle?filter=my') &&
      !pages.twiddle.includes('memberId=${memberId}') &&
      !pages.twiddleConstellation.includes('memberId=${memberId}') &&
      !pages.twiddle.includes('thinker_tags: selectedThinkers, memberId') &&
      !pages.twiddle.includes('reaction_type: reactionType, memberId') &&
      !pages.twiddle.includes('thinker_key: respondThinker, memberId') &&
      !pages.twiddleThread.includes('thinker_tags: selectedThinkers, memberId') &&
      !pages.twiddleThread.includes('thinker_tags: root?.thinker_tags || [], memberId') &&
      !pages.twiddleThread.includes('reaction_type: reactionType, memberId') &&
      !pages.twiddleThread.includes('thinker_key: respondThinker, memberId') &&
      [routes.twiddles, routes.twiddleDetail, routes.twiddleReact].every(
        (source) =>
          !source.includes('memberId?: unknown') &&
          !source.includes('body.memberId') &&
          !source.includes('NextResponse') &&
          !source.includes("import { createClient } from '@supabase/supabase-js'") &&
          !source.includes('SUPABASE_SERVICE_ROLE_KEY') &&
          !source.includes('as any') &&
          !source.includes(': any') &&
          !source.includes('error.message') &&
          !source.includes('String(err)') &&
          !source.includes('console.error') &&
          !source.includes('console.warn'),
      ) &&
      !routes.twiddles.includes("searchParams.get('memberId')") &&
      !routes.twiddles.includes('Cannot create a Twiddle for another member') &&
      !routes.twiddles.includes('Cannot read another member Twiddles') &&
      !routes.twiddleDetail.includes('Cannot update another member Twiddle') &&
      !routes.twiddleReact.includes('Cannot react for another member'),
  },
  {
    name: 'automation, onboarding, and merch AI routes use lazy Anthropic and Supabase admin clients',
    ok:
      [
        routes.proactiveCron,
        routes.onboardingTrigger,
        routes.merchGenerateProducts,
        helpers.sharedMemory,
        helpers.memoryEmbeddings,
      ].every(lacksModuleScopeClients) &&
      [routes.proactiveCron, routes.onboardingTrigger, routes.merchGenerateProducts, helpers.sharedMemory].every(
        (source) => source.includes('createAnthropicClient()') && source.includes('resolveClaudeModel('),
      ) &&
      [routes.proactiveCron, routes.onboardingTrigger, helpers.sharedMemory, helpers.memoryEmbeddings].every(
        (source) => source.includes('getSupabaseAdmin()'),
      ) &&
      !routes.merchGenerateProducts.includes('getSupabaseAdmin()'),
  },
  {
    name: 'core thinker and Movement creator helpers use lazy Supabase admin clients',
    ok:
      [routes.thinker, helpers.movementAccess, helpers.movementScriptgen].every(lacksModuleScopeClients) &&
      [routes.thinker, helpers.movementAccess, helpers.movementScriptgen].every((source) =>
        source.includes('getSupabaseAdmin()'),
      ) &&
      routes.thinker.includes('const supabaseAdmin = () =>') &&
      routes.thinker.includes('safeRequestJson(req)') &&
      routes.thinker.includes('privateSseHeaders()') &&
      routes.thinker.includes('memberId = auth.memberId') &&
      routes.thinker.includes('reportThinkerRouteFailure') &&
      routes.thinker.indexOf('getAuthenticatedMember(req)') < routes.thinker.indexOf('supabaseAdmin().from') &&
      routes.thinker.indexOf('getAuthenticatedMember(req)') < routes.thinker.indexOf('createAnthropicClient()') &&
      !routes.thinker.includes('memberId?: string') &&
      !routes.thinker.includes('walletMemberId?: string') &&
      !routes.thinker.includes('body.memberId') &&
      !routes.thinker.includes('body.walletMemberId') &&
      !routes.thinker.includes('fallbackId') &&
      !routes.thinker.includes("select(MEMBER_SELECT).eq('id'") &&
      !routes.thinker.includes('console.error') &&
      !routes.thinker.includes('console.log') &&
      !routes.thinker.includes('String(err)') &&
      !routes.thinker.includes('String(error)') &&
      !routes.thinker.includes('error.message') &&
      !routes.thinker.includes('details:') &&
      !routes.thinker.includes('first 200 chars') &&
      !routes.thinker.includes('fullSystemPrompt.slice') &&
      pages.council.includes("fetch('/api/thinker'") &&
      pages.council.includes('Authorization') &&
      !pages.council.includes('walletMemberId: memberId') &&
      !pages.council.includes('memberId,\n          walletMemberId') &&
      pages.members.includes("fetch('/api/thinker'") &&
      pages.members.includes('Authorization: `Bearer ${accessToken}`') &&
      !pages.members.includes('walletMemberId: currentMember.id') &&
      pages.waddle.includes("fetch('/api/thinker'") &&
      pages.waddle.includes('Authorization: `Bearer ${accessToken}`') &&
      !pages.waddle.includes('walletMemberId: memberId') &&
      pages.salonHub.includes("fetch('/api/thinker'") &&
      pages.salonHub.includes('Authorization: `Bearer ${accessToken}`') &&
      !pages.salonHub.includes('walletMemberId: member.id') &&
      helpers.movementAccess.indexOf('getAuthenticatedMember(req)') <
        helpers.movementAccess.indexOf('getSupabaseAdmin()') &&
      helpers.movementScriptgen.includes('const supabaseAdmin = getSupabaseAdmin();'),
  },
  {
    name: 'action, feed, and practice generation helpers use lazy provider clients',
    ok:
      [helpers.actionExecution, helpers.activityFeed, helpers.todayQuestion].every(lacksModuleScopeClients) &&
      [helpers.actionExecution, helpers.activityFeed, helpers.todayQuestion].every((source) =>
        source.includes('getSupabaseAdmin()'),
      ) &&
      [helpers.activityFeed, helpers.todayQuestion].every(
        (source) => source.includes('createAnthropicClient()') && source.includes("resolveClaudeModel('content'"),
      ),
  },
  {
    name: 'community, governance, live, and matching helpers use lazy provider clients',
    ok:
      [helpers.community, helpers.governance, helpers.liveScheduler, helpers.matching].every(lacksModuleScopeClients) &&
      [helpers.community, helpers.governance, helpers.liveScheduler, helpers.matching].every((source) =>
        source.includes('getSupabaseAdmin()'),
      ) &&
      helpers.liveScheduler.includes('createAnthropicClient()') &&
      helpers.liveScheduler.includes("resolveClaudeModel('content'"),
  },
  {
    name: 'wallet and token disbursement helpers use lazy Supabase admin clients',
    ok:
      [helpers.agentWallet, helpers.disburse].every(lacksModuleScopeClients) &&
      [helpers.agentWallet, helpers.disburse].every((source) => source.includes('getSupabaseAdmin()')) &&
      helpers.agentWallet.includes('process.env.WALLET_ENCRYPTION_KEY') &&
      !helpers.agentWallet.includes('const WALLET_ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY'),
  },
  {
    name: 'package and operator smoke run lazy client guard',
    ok:
      packageJson.includes('"external:lazy-clients:smoke"') &&
      operatorSmoke.includes("npm', 'run', 'external:lazy-clients:smoke'"),
  },
  {
    name: 'local docs record lazy client guard and external-effect inventory follow-up',
    ok:
      Object.values(docs).every((doc) => doc.includes('external:lazy-clients:smoke')) &&
      docs.routeInventory.includes('world spaces/scan routes') &&
      docs.routeInventory.includes('Move remaining provider SDK clients away from module scope'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nExternal effect lazy clients smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nExternal effect lazy clients smoke passed.');
