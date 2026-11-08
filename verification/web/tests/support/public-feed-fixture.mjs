import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PGlite } from '../../tooling/node_modules/@electric-sql/pglite/dist/index.js';
import { sourceLoader } from '../../../../platforms/tests/load-source.mjs';

const require = createRequire(new URL('../../../../package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');
const { NextRequest } = require('next/server');
export const COMMUNITY = '10000000-0000-4000-8000-000000000001';
export const OTHER_COMMUNITY = '10000000-0000-4000-8000-000000000002';
export const OWNER = '20000000-0000-4000-8000-000000000001';
export const OTHER = '20000000-0000-4000-8000-000000000002';
export const EVENT = '30000000-0000-4000-8000-000000000001';
export const LEGACY = '30000000-0000-4000-8000-000000000002';
export const CREATED = '2026-11-08T06:00:00.000Z';
export const summary = { version: 1, reviewed_at: '2026-11-08T06:01:00.000Z', event_type: 'salon_created', title: 'A reviewed public gathering', description: 'A public description without member identity.' };
const identifier = name => { assert.match(name, /^[a-z][a-z0-9_]*$/); return '"' + name + '"'; };

/** Actual client/route/helper over synthetic SQL. This is a deliberately bounded
 * PostgREST transport adapter, not a hosted PostgREST or RLS acceptance test. */
export async function publicFeedFixture(t) {
  const db = new PGlite(); t.after(() => db.close()); await db.waitReady;
  await db.exec(`CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE communities(id uuid PRIMARY KEY, slug text UNIQUE);
    CREATE TABLE activity_feed(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), community_id uuid,
      member_id uuid, agent_key text, event_type text, title text, description text, metadata jsonb,
      is_public boolean DEFAULT true, created_at timestamptz DEFAULT now(), private_note text);
    CREATE TABLE social_posts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), member_id uuid, community_id uuid,
      source_event_id uuid, platform text, content text, status text);
    GRANT USAGE ON SCHEMA public TO service_role;
    GRANT SELECT,INSERT,UPDATE,DELETE ON communities,activity_feed,social_posts TO service_role;
    SET ROLE service_role;`);
  await db.query('INSERT INTO communities VALUES ($1,$2),($3,$4)', [COMMUNITY, 'society-of-explorers', OTHER_COMMUNITY, 'another-community']);
  const fixture = { db, calls: [], providerCalls: [], transportErrors: [], responseMutator: null, failure: null, beforeProviderReturn: null, clientCreations: 0 };
  const client = createClient('https://feed-fixture.invalid', 'synthetic-service-token', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      try {
      const request = new Request(input, init), url = new URL(request.url);
      assert.equal(url.origin, 'https://feed-fixture.invalid');
      const table = url.pathname.split('/').at(-1); assert(['communities', 'activity_feed', 'social_posts'].includes(table));
      const query = url.searchParams, method = request.method, call = { table, method, query: Object.fromEntries(query) };
      fixture.calls.push(call);
      if (fixture.failure === 'throw') throw Error('PRIVATE_PROVIDER_EXCEPTION');
      if (fixture.failure === table) return Response.json({ message: 'PRIVATE_DATABASE_ERROR', details: 'PRIVATE_DETAIL' }, { status: 500 });
      const params = [], bind = v => '$' + params.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
      const column = field => field === 'metadata->public_feed->>version' ? "metadata->'public_feed'->>'version'" : identifier(field);
      const fields = (query.get('select') ?? '*').split(',').map(field => field === '*' ? '*' : field === 'public_feed:metadata->public_feed'
        ? "metadata->'public_feed' AS public_feed" : identifier(field)).join(',');
      const where = [];
      for (const [field, value] of query) {
        if (['select', 'order', 'limit'].includes(field)) continue;
        const match = /^(eq|lt)\.(.*)$/s.exec(value); assert(match, value);
        const boundValue = field === 'is_public' ? (assert(['true', 'false'].includes(match[2])), match[2] === 'true') : match[2];
        where.push(column(field) + (match[1] === 'eq' ? ' = ' : ' < ') + bind(boundValue));
      }
      let sql;
      if (method === 'GET') {
        sql = 'SELECT ' + fields + ' FROM ' + identifier(table) + (where.length ? ' WHERE ' + where.join(' AND ') : '');
        if (query.has('order')) sql += ' ORDER BY ' + query.get('order').split(',').map(term => {
          const [field, direction] = term.split('.'); assert(['asc', 'desc'].includes(direction)); return identifier(field) + ' ' + direction;
        }).join(',');
        if (query.has('limit')) sql += ' LIMIT ' + bind(Number(query.get('limit')));
      } else {
        assert.equal(method, 'POST'); const body = await request.json(); call.body = body;
        const names = Object.keys(body); sql = 'INSERT INTO ' + identifier(table) + ' (' + names.map(identifier).join(',') + ') VALUES (' + names.map(n => bind(body[n])).join(',') + ')';
        if (query.has('select')) sql += ' RETURNING ' + fields;
      }
      const result = await db.query(sql, params); let rows = result.rows;
      if (fixture.responseMutator) rows = fixture.responseMutator(table, rows, query);
      call.response = structuredClone(rows);
      if (method === 'POST' && !query.has('select')) return new Response(null, { status: 201 });
      const single = request.headers.get('accept')?.includes('vnd.pgrst.object');
      if (single && rows.length !== 1) return Response.json({ code: 'PGRST116', message: 'Single row required' }, { status: 406 });
      return Response.json(single ? rows[0] : rows, { status: method === 'POST' ? 201 : 200 });
      } catch (error) { fixture.transportErrors.push(String(error.stack ?? error)); throw error; }
    } },
  });
  const load = sourceLoader({ 'server-only': {},
    '@/lib/supabase/admin': { getSupabaseAdmin() { fixture.clientCreations++; return client; } },
    '@/lib/ai/anthropic': { resolveClaudeModel: () => 'fixture-model', createAnthropicClient: () => ({ messages: { async create(body) {
      fixture.providerCalls.push(structuredClone(body));
      if (fixture.beforeProviderReturn) await fixture.beforeProviderReturn();
      return { content: [{ type: 'text', text: 'A synthetic provider draft.' }] };
    } } }) },
  });
  fixture.public = load('lib/feed/publicActivity.ts');
  fixture.activity = load('lib/feed/activityFeed.ts');
  fixture.GET = load('app/api/feed/route.ts').GET;
  fixture.request = path => new NextRequest('https://app.invalid/api/feed' + (path || ''));
  fixture.seed = async (id = EVENT, overrides = {}) => {
    const row = { id, community_id: COMMUNITY, member_id: OWNER, agent_key: 'PRIVATE_AGENT_KEY', event_type: 'task_created',
      title: 'PRIVATE_RAW_TITLE', description: 'PRIVATE_RAW_DESCRIPTION', metadata: { private_secret: 'PRIVATE_METADATA', public_feed: summary },
      is_public: true, created_at: CREATED, private_note: 'PRIVATE_ADDITIONAL_COLUMN', ...overrides };
    const names = Object.keys(row);
    await db.query('INSERT INTO activity_feed (' + names.map(identifier).join(',') + ') VALUES (' + names.map((_, i) => '$' + (i + 1)).join(',') + ')', names.map(n => n === 'metadata' ? JSON.stringify(row[n]) : row[n]));
  };
  return fixture;
}
