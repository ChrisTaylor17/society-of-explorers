import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { lstatSync, readFileSync } from 'node:fs';
import { PGlite } from '../../tooling/node_modules/@electric-sql/pglite/dist/index.js';
import { offlineApp } from './offline-app.mjs';

const require = createRequire(import.meta.url);
const { NextRequest } = require('next/server');
const { createClient } = require('@supabase/supabase-js');
export const origin = 'https://members.soe.test';
export const sibling = 'https://sibling.soe.test';
export const ids = {
  alice: '11111111-1111-4111-8111-111111111111',
  bob: '22222222-2222-4222-8222-222222222222',
  carol: '33333333-3333-4333-8333-333333333333',
  incoming: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  outgoing: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  other: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
  new: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
};
export const people = [
  { id: ids.alice, display_name: 'Alice Fixture' },
  { id: ids.bob, display_name: 'Bob Fixture' },
  { id: ids.carol, display_name: 'Carol Fixture' },
];
const gateway = 'https://dm-postgrest.fixture.test';
function residentSql(name) {
  const path = new URL('../../../../docs/sql/' + name, import.meta.url);
  const info = lstatSync(path);
  assert(info.isFile() && info.blocks, name);
  return readFileSync(path, 'utf8');
}
const routines = {
  soe_direct_message_read: ['p_actor', 'p_peer'],
  soe_direct_message_send: ['p_actor', 'p_peer', 'p_content'],
  soe_direct_message_ack: ['p_actor', 'p_peer', 'p_ids'],
  soe_direct_message_blocks: ['p_actor', 'p_after'],
  soe_direct_message_set_block: ['p_actor', 'p_peer', 'p_block_id', 'p_blocked', 'p_expected_revision', 'p_request_id'],
};

export async function directMessageApp() {
  const db = await PGlite.create();
  const app = offlineApp();
  app.context.AbortSignal = AbortSignal;
  const calls = [];
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE members (id uuid PRIMARY KEY, display_name text, profile_visibility text);
      CREATE TABLE direct_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sender_id uuid NOT NULL, recipient_id uuid NOT NULL,
        content text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), read boolean NOT NULL DEFAULT false,
        fixture_private text NOT NULL DEFAULT 'private fixture column'
      );
      ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;
      GRANT ALL ON direct_messages TO service_role;
    `);
    const moderation = residentSql('circle-message-moderation.sql');
    const nameStart = moderation.indexOf('CREATE FUNCTION public._soe_circle_message_name(');
    assert(nameStart >= 0);
    await db.exec(moderation.slice(nameStart, moderation.indexOf('$$;', nameStart) + 3));
    await db.exec(residentSql('direct-message-blocks-apply.sql'));
    for (const person of people) {
      await db.query("INSERT INTO members VALUES ($1,$2,'public')", [person.id, person.display_name]);
    }
    async function seed(id, sender, recipient, content, date = new Date().toISOString()) {
      await db.query('INSERT INTO direct_messages(id,sender_id,recipient_id,content,created_at) VALUES($1,$2,$3,$4,$5)',
        [id, sender, recipient, content, date]);
    }
    await seed(ids.incoming, ids.bob, ids.alice, 'Private Bob thread', '2026-01-01T00:00:00Z');
    await seed(ids.outgoing, ids.alice, ids.bob, 'Private Alice reply', '2026-01-01T00:01:00Z');
    await seed(ids.other, ids.carol, ids.alice, 'Private Carol thread', '2026-01-01T00:02:00Z');

    // The real pinned Supabase client serializes the route's query. This
    // bounded PostgREST fixture translates only the admitted shapes to SQL.
    const admin = createClient(gateway, 'synthetic-local-dm-service', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (input, init) => {
        const req = new Request(input, init), url = new URL(req.url), search = url.searchParams;
        assert.equal(url.origin, gateway);
        assert.equal(req.headers.get('authorization'), 'Bearer synthetic-local-dm-service');
        if (url.pathname === '/rest/v1/members') {
          assert.equal(req.method, 'GET');
          const member = people.find(person => search.get('id') === 'eq.' + person.id);
          calls.push({ method: req.method, path: url.pathname });
          return member ? Response.json(member) : Response.json({ message: 'Fixture member absent' }, { status: 404 });
        }
        assert.equal(req.method, 'POST');
        assert.equal(search.size, 0);
        const name = url.pathname.slice('/rest/v1/rpc/'.length);
        assert(url.pathname.startsWith('/rest/v1/rpc/') && Object.hasOwn(routines, name));
        const args = routines[name], body = await req.json();
        assert.deepEqual(Object.keys(body).sort(), [...args].sort());
        calls.push({ method: req.method, path: url.pathname, actor: body.p_actor });
        try {
          const result = await db.transaction(async tx => {
            await tx.exec('SET LOCAL ROLE service_role');
            return tx.query(`SELECT public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) AS value`, args.map(key => body[key]));
          });
          return Response.json(result.rows[0].value);
        } catch (error) {
          return Response.json({ code: error.code, message: 'Disposable SQL refused the request' },
            { status: /^PT4\d\d$/.test(error.code ?? '') ? Number(error.code.slice(2)) : 500 });
        }
      } },
    });
    app.setMock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => admin }));
    const signer = app.load('lib/auth/walletSession.ts');
    const cookies = {};
    for (const { id } of people) {
      const signed = await signer.createWalletSessionValue(id);
      assert(signed);
      cookies[id] = ['soe_auth_provider=wallet', 'soe_auth_intent=' + id,
        'soe_auth_selection_v1=v1.' + id + '.wallet.' + id, 'soe_wallet_id=' + signed].join('; ');
    }
    const handlers = app.load('app/api/message/route.ts');
    return {
      db, calls, cookies, seed,
      request(method, { peer, query, headers = {}, body } = {}) {
        const path = '/api/message' + (query ?? (peer ? '?peerId=' + encodeURIComponent(peer) : ''));
        return new NextRequest(origin + path, { method, headers, body });
      },
      dispatch(req) { return handlers[req.method](req); },
      async flags() {
        return (await db.query('SELECT id,read FROM direct_messages ORDER BY id')).rows.map(row => [row.id, row.read]);
      },
      close: () => db.close(),
    };
  } catch (error) {
    await db.close();
    throw error;
  }
}
