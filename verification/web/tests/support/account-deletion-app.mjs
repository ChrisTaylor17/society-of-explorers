import { AsyncLocalStorage } from 'node:async_hooks';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { PGlite } from '../../tooling/node_modules/@electric-sql/pglite/dist/index.js';
import { offlineApp } from './offline-app.mjs';

const root = new URL('../../../../', import.meta.url);
const require = createRequire(new URL('package.json', root));
const { NextRequest } = require('next/server');
const sql = await readFile(new URL('docs/sql/account-deletion-requests-apply.sql', root), 'utf8');
const erasureSql = await readFile(new URL('docs/sql/account-erasure-access-apply.sql', root), 'utf8');
const challengeSql = await readFile(new URL('docs/sql/wallet-challenge-consumption-apply.sql', root), 'utf8');
const walletSql = await readFile(new URL('docs/sql/wallet-session-revocation-apply.sql', root), 'utf8');
export const intent = '99999999-9999-4999-8999-999999999999';
export const member = '11111111-1111-4111-8111-111111111111';
export const linked = '22222222-2222-4222-8222-222222222222';
export const providerOnly = '33333333-3333-4333-8333-333333333333';
export const other = '44444444-4444-4444-8444-444444444444';
export const walletAddress = '0x0000000000000000000000000000000000000001';
const safeSubjects = new Set([linked, providerOnly, other]);

export function browserCookies(subject, provider = 'supabase', browserIntent = intent) {
  return {
    soe_auth_provider: provider,
    soe_auth_intent: browserIntent,
    soe_auth_selection_v1: 'v1.' + browserIntent + '.' + provider + '.' + subject,
    ...(provider === 'supabase' ? { 'fixture-auth-subject': subject } : {}),
  };
}

export function cookieHeader(cookies) {
  return Object.entries(cookies).map(([name, value]) => name + '=' + value).join('; ');
}

export async function createAccountDeletionApp(origin = 'https://members.soe.test', { erasure = false, address = walletAddress } = {}) {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE TABLE public.members(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), supabase_auth_id uuid UNIQUE, wallet_address text,
        display_name text, created_at timestamptz DEFAULT now(), exp_tokens integer DEFAULT 0, tier text DEFAULT 'free'
      );
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.members TO service_role;
    `);
    await db.query('INSERT INTO members(id,supabase_auth_id,wallet_address) VALUES ($1,$2,$3)', [member, linked, address]);
    await db.exec(sql);
    await db.exec(challengeSql);
    await db.exec(walletSql);
    if (erasure) await db.exec(erasureSql);

    const app = offlineApp({ root: fileURLToPath(root).replace(/\/$/, '') });
    const requestContext = new AsyncLocalStorage();
    const calls = { verify: 0, rpc: [], member: 0 };
    let guardUnavailable = false;
    const routines = {
      soe_account_deletion_owner_state: ['p_provider', 'p_subject'],
      soe_account_deletion_request: ['p_provider', 'p_subject', 'p_request_id', 'p_receipt_hash', 'p_review_days'],
      soe_account_deletion_status: ['p_request_id', 'p_receipt_hash'],
      soe_account_erasure_access_allowed: ['p_provider', 'p_subject'],
      soe_wallet_challenge_consume: ['p_digest', 'p_expires_at'],
      soe_wallet_session_access: ['p_digest', 'p_expires_at', 'p_revoke'],
    };
    const admin = {
      rpc(name, args) {
        calls.rpc.push(name);
        if (!Object.hasOwn(routines, name)) throw Error('Unexpected service function');
        const fields = routines[name];
        async function invoke() {
          try {
            if (name === 'soe_account_erasure_access_allowed' && guardUnavailable) return { data: null, error: { code: 'FIXTURE' } };
            const rows = await db.transaction(async tx => {
              await tx.exec('SET LOCAL ROLE service_role');
              const result = await tx.query('SELECT * FROM public.' + name + '(' +
                fields.map((_, index) => '$' + (index + 1)).join(',') + ')', fields.map(key => args[key]));
              return JSON.parse(JSON.stringify(result.rows));
            });
            if (rows.length > 1) return { data: null, error: { code: 'PGRST116' } };
            const scalar = name === 'soe_wallet_session_access' || name === 'soe_wallet_challenge_consume' || name === 'soe_account_erasure_access_allowed';
            return { data: scalar ? rows[0]?.[name] : rows[0] ?? null, error: null };
          } catch (error) {
            return { data: null, error: { code: error.code } };
          }
        }
        return { maybeSingle: invoke, abortSignal: invoke };
      },
      from(name) {
        if (name !== 'members') throw Error('Unexpected service table');
        calls.member++;
        function select(column, value, insensitive = false) {
          if (!['id', 'supabase_auth_id', 'wallet_address'].includes(column)) throw Error('Unexpected member lookup');
          async function read(list) {
            const where = insensitive ? 'lower(' + column + ') = lower($1)' : column + ' = $1';
            const result = await db.query('SELECT * FROM public.members WHERE ' + where + ' ORDER BY created_at,id LIMIT 25', [value]);
            return { data: list ? result.rows : result.rows[0] ?? null, error: null };
          }
          const chain = { single: () => read(false), maybeSingle: () => read(false), order: () => chain, limit: () => read(true) };
          return chain;
        }
        return {
          select: () => ({ eq: select, ilike: (column, value) => select(column, value, true) }),
          insert: ({ supabase_auth_id, wallet_address, display_name, exp_tokens, tier }) => {
            async function insert() {
              try {
                return await db.transaction(async tx => {
                  await tx.exec('SET LOCAL ROLE service_role');
                  const result = await tx.query(
                    'INSERT INTO public.members(supabase_auth_id,wallet_address,display_name,exp_tokens,tier) VALUES($1,$2,$3,$4,$5) RETURNING *',
                    [supabase_auth_id ?? null, wallet_address ?? null, display_name ?? null, exp_tokens ?? 0, tier ?? 'free']);
                  return { data: result.rows[0], error: null };
                });
              } catch (error) {
                return { data: null, error: { code: error.code } };
              }
            }
            return { select: () => ({ single: insert, maybeSingle: insert }) };
          },
        };
      },
    };
    app.setMock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => admin }));
    const fixtureUser = subject => safeSubjects.has(subject) ? { id: subject, email: 'fictional.reader@example.test' } : null;
    const browserSubject = () => requestContext.getStore().cookies.get('fixture-auth-subject')?.value;
    app.setMock('@/lib/supabase/server', () => ({
      createClient: async () => ({ auth: { async getUser() {
        calls.verify++;
        return { data: { user: fixtureUser(browserSubject()) }, error: null };
      }}}),
      createServiceClient: () => admin,
    }));
    if (erasure) {
      app.context.performance = performance;
      app.setMock('next/server', () => require('next/server'));
      app.setMock('@supabase/supabase-js', () => ({ createClient: () => ({
        auth: { async getUser(token) {
          calls.verify++;
          const subject = token?.startsWith('SYNTHETIC_BEARER_') ? token.slice('SYNTHETIC_BEARER_'.length) : null;
          return { data: { user: fixtureUser(subject) }, error: null };
        }},
      }) }));
      app.setMock('@supabase/ssr', () => ({ createServerClient: (_url, _key, options) => {
        const user = fixtureUser(browserSubject());
        const now = Math.floor(Date.now() / 1000), expires = now + 3600;
        const claims = Buffer.from(JSON.stringify({ sub: user?.id, exp: expires, amr: [{ method: 'oauth', timestamp: now }] })).toString('base64url');
        const token = 'eyJhbGciOiJIUzI1NiJ9.' + claims + '.synthetic';
        return { auth: {
          async exchangeCodeForSession(code) {
            if (!user || code !== 'SYNTHETIC_OAUTH') return { data: null, error: true };
            options.cookies.setAll([{ name: 'sb-fixture-auth-token', value: 'SYNTHETIC_COOKIE', options: { path: '/' } }]);
            return { data: { user, session: { user, access_token: token, token_type: 'bearer', expires_at: expires } }, error: null };
          },
          async getUser(candidate) {
            calls.verify++;
            return { data: { user: candidate === token ? user : null }, error: null };
          },
        }};
      }}));
      app.context.process.env.SOE_ACCOUNT_ERASURE_ACCESS_ENABLED = 'true';
    }
    app.setMock('@/lib/auth/walletSessionStore', () => app.load('lib/auth/walletSessionStore.ts'));
    const handlers = {
      '/api/account/deletion': 'app/api/account/deletion/route.ts',
      '/api/auth/member': 'app/api/auth/member/route.ts',
      '/api/auth/provider': 'app/api/auth/provider/route.ts',
      '/api/auth/ensure-member': 'app/api/auth/ensure-member/route.ts',
      '/api/auth/siwe': 'app/api/auth/siwe/route.ts',
      '/api/auth/nonce': 'app/api/auth/nonce/route.ts',
      '/auth/callback': 'app/auth/callback/route.ts',
      '/api/great-books/progress': 'app/api/great-books/progress/route.ts',
      '/api/projects/create': 'app/api/projects/create/route.ts',
    };
    function dispatchAt(path, method, { headers, body, query = '' } = {}) {
      if (!Object.hasOwn(handlers, path)) throw Error('Unexpected fixture route');
      const request = new NextRequest(origin + path + query, {
        method, headers, ...(body === undefined ? {} : { body }),
      });
      return requestContext.run(request, () => app.load(handlers[path])[method](request));
    }
    function intake(days) {
      app.context.process.env.SOE_ACCOUNT_DELETION_REQUESTS_ENABLED = days === null ? 'false' : 'true';
      app.context.process.env.SOE_ACCOUNT_DELETION_REVIEW_DAYS = days === null ? '' : String(days);
    }
    intake(4);
    const wallet = app.load('lib/auth/walletSession.ts');
    const walletSession = await wallet.createWalletSessionValue(member);
    return {
      db, calls, intake,
      walletCookies: { ...browserCookies(member, 'wallet'), soe_wallet_id: walletSession },
      async revokeWallet() {
        const verified = await wallet.readWalletSession(walletSession);
        return app.load('lib/auth/walletSessionStore.ts').walletSessionAccess(verified, 'revoke');
      },
      dispatch: (method, options) => dispatchAt('/api/account/deletion', method, options),
      dispatchAt,
      makeGuardUnavailable: () => { guardUnavailable = true; },
      close: () => db.close(),
    };
  } catch (error) {
    await db.close();
    throw error;
  }
}
