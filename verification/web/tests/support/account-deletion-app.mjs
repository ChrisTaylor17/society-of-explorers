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

export async function createAccountDeletionApp(origin = 'https://members.soe.test') {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE TABLE public.members(id uuid PRIMARY KEY, supabase_auth_id uuid UNIQUE, wallet_address text);
      INSERT INTO members VALUES ('${member}', '${linked}', '${walletAddress}');
    `);
    await db.exec(sql);
    await db.exec(challengeSql);
    await db.exec(walletSql);

    const app = offlineApp({ root: fileURLToPath(root).replace(/\/$/, '') });
    const requestContext = new AsyncLocalStorage();
    const calls = { verify: 0, rpc: [], member: 0 };
    const routines = {
      soe_account_deletion_owner_state: ['p_provider', 'p_subject'],
      soe_account_deletion_request: ['p_provider', 'p_subject', 'p_request_id', 'p_receipt_hash', 'p_review_days'],
      soe_account_deletion_status: ['p_request_id', 'p_receipt_hash'],
      soe_wallet_session_access: ['p_digest', 'p_expires_at', 'p_revoke'],
    };
    const admin = {
      rpc(name, args) {
        calls.rpc.push(name);
        if (!Object.hasOwn(routines, name)) throw Error('Unexpected service function');
        const fields = routines[name];
        async function invoke() {
          try {
            const rows = await db.transaction(async tx => {
              await tx.exec('SET LOCAL ROLE service_role');
              const result = await tx.query('SELECT * FROM public.' + name + '(' +
                fields.map((_, index) => '$' + (index + 1)).join(',') + ')', fields.map(key => args[key]));
              return JSON.parse(JSON.stringify(result.rows));
            });
            if (rows.length > 1) return { data: null, error: { code: 'PGRST116' } };
            return { data: name === 'soe_wallet_session_access' ? rows[0]?.[name] : rows[0] ?? null, error: null };
          } catch (error) {
            return { data: null, error: { code: error.code } };
          }
        }
        return { maybeSingle: invoke, abortSignal: invoke };
      },
      from(name) {
        if (name !== 'members') throw Error('Unexpected service table');
        calls.member++;
        return { select: () => ({ eq(column, id) {
          if (column !== 'id') throw Error('Unexpected member lookup');
          return { async single() {
            const result = await db.query('SELECT * FROM public.members WHERE id = $1', [id]);
            return { data: result.rows[0] ?? null, error: null };
          }};
        }}) };
      },
    };
    app.setMock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => admin }));
    app.setMock('@/lib/supabase/server', () => ({
      createClient: async () => ({ auth: { async getUser() {
        calls.verify++;
        const subject = requestContext.getStore().cookies.get('fixture-auth-subject')?.value;
        return { data: { user: safeSubjects.has(subject) ? { id: subject, email: 'fictional.reader@example.test' } : null }, error: null };
      }}}),
    }));
    app.setMock('@/lib/auth/walletSessionStore', () => app.load('lib/auth/walletSessionStore.ts'));
    const api = app.load('app/api/account/deletion/route.ts');
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
      dispatch(method, { headers, body, query = '' } = {}) {
        const request = new NextRequest(origin + '/api/account/deletion' + query, {
          method, headers, ...(body === undefined ? {} : { body }),
        });
        return requestContext.run(request, () => api[method](request));
      },
      close: () => db.close(),
    };
  } catch (error) {
    await db.close();
    throw error;
  }
}
