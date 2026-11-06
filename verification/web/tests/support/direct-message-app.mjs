import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
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
const projection = 'id,sender_id,recipient_id,content,created_at,read';
const jsonify = data => Response.json(data);

export async function directMessageApp() {
  const db = await PGlite.create();
  const app = offlineApp();
  app.context.AbortSignal = AbortSignal;
  const calls = [];
  try {
    await db.exec(`
      CREATE TABLE direct_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sender_id uuid NOT NULL, recipient_id uuid NOT NULL,
        content text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), read boolean NOT NULL DEFAULT false,
        fixture_private text NOT NULL DEFAULT 'private fixture column'
      );
    `);
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
        const { method } = req, select = search.get('select');
        calls.push({ method, path: url.pathname, query: search.toString() });
        if (url.pathname === '/rest/v1/members') {
          assert.equal(method, 'GET');
          const member = people.find(person => search.get('id') === 'eq.' + person.id);
          return member ? jsonify(member) : Response.json({ message: 'Fixture member absent' }, { status: 404 });
        }
        assert.equal(url.pathname, '/rest/v1/direct_messages');
        if (method === 'HEAD') {
          assert.equal(select, 'id');
          assert.equal(search.get('read'), 'eq.false');
          const { rows } = await db.query('SELECT count(*)::int AS count FROM direct_messages WHERE recipient_id=$1 AND NOT read',
            [search.get('recipient_id').slice(3)]);
          return new Response(null, { headers: { 'content-range': '*/' + rows[0].count } });
        }
        if (method === 'GET') {
          assert.equal(search.get('order'), 'created_at.asc');
          const both = search.get('or').match(/^\(and\(sender_id\.eq\.([0-9a-f-]{36}),recipient_id\.eq\.([0-9a-f-]{36})\),and\(sender_id\.eq\.([0-9a-f-]{36}),recipient_id\.eq\.([0-9a-f-]{36})\)\)$/i);
          assert(both, 'Expected two participant pairs');
          const legacy = select === '*,sender:sender_id(id,display_name,wallet_address)';
          if (!legacy) assert.equal(select, projection);
          const { rows } = await db.query(`SELECT ${legacy ? '*' : projection} FROM direct_messages
            WHERE (sender_id=$1 AND recipient_id=$2) OR (sender_id=$3 AND recipient_id=$4)
            ORDER BY created_at ASC`, both.slice(1));
          return jsonify(rows);
        }
        const body = await req.json();
        if (method === 'POST') {
          assert.deepEqual(Object.keys(body).sort(), ['content', 'recipient_id', 'sender_id']);
          await db.query('INSERT INTO direct_messages(sender_id,recipient_id,content) VALUES($1,$2,$3)',
            [body.sender_id, body.recipient_id, body.content]);
        } else {
          assert.equal(method, 'PATCH');
          assert.deepEqual(body, { read: true });
          assert.equal(search.get('read'), 'eq.false');
          const params = [search.get('recipient_id').slice(3), search.get('sender_id').slice(3)];
          const inFilter = search.get('id');
          if (inFilter) {
            assert.match(inFilter, /^in\.\([0-9a-f-,]+\)$/);
            params.push(inFilter.slice(4, -1).split(','));
          }
          await db.query(`UPDATE direct_messages SET read=true WHERE recipient_id=$1 AND sender_id=$2 AND NOT read
            ${inFilter ? 'AND id=ANY($3::uuid[])' : ''}`, params);
        }
        return new Response(null, { status: 204 });
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
      request(method, { peer, headers = {}, body } = {}) {
        const path = '/api/message' + (peer ? '?peerId=' + encodeURIComponent(peer) : '');
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
