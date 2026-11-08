import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { PGlite } from '../../tooling/node_modules/@electric-sql/pglite/dist/index.js';
import { sourceLoader } from '../../../../platforms/tests/load-source.mjs';

const require = createRequire(new URL('../../../../package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');
const { NextRequest } = require('next/server');
export const SALON = '10000000-0000-4000-8000-000000000001';
export const OTHER_SALON = '10000000-0000-4000-8000-000000000002';
export const ABSENT_SALON = '10000000-0000-4000-8000-000000000003';
export const GUIDE = '20000000-0000-4000-8000-000000000001';
export const MEMBER = '20000000-0000-4000-8000-000000000002';
export const OUTSIDER = '20000000-0000-4000-8000-000000000003';
export const OTHER_GUIDE = '20000000-0000-4000-8000-000000000004';
const SESSION_ONE = '30000000-0000-4000-8000-000000000001';
const SESSION_TWO = '30000000-0000-4000-8000-000000000002';
const identifier = value => { assert.match(value, /^[a-z][a-z0-9_]*$/); return '"' + value + '"'; };
const topFields = value => {
  const fields = []; let depth = 0, start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++;
    if (value[i] === ')') depth--;
    if (value[i] === ',' && depth === 0) { fields.push(value.slice(start, i).trim()); start = i + 1; }
    assert(depth >= 0);
  }
  assert.equal(depth, 0); fields.push(value.slice(start).trim()); return fields;
};

/** Real route/helper source and locked Supabase client over disposable PostgreSQL
 * data. The bounded transport adapter is not hosted PostgREST, Auth or RLS proof. */
export async function guideProgramFixture(t) {
  const db = new PGlite(); await db.waitReady;
  const f = { db, auth: null, calls: [], authCalls: 0, clientCreations: 0,
    failure: null, missingCount: false, clientThrows: false, authThrows: false, transportErrors: [] };
  t.after(async () => { await db.close(); assert.deepEqual(f.transportErrors, []); });
  await db.exec(`CREATE TABLE members(id uuid PRIMARY KEY, display_name text, email text);
    CREATE TABLE communities(id uuid PRIMARY KEY);
    CREATE TABLE video_rooms(id uuid PRIMARY KEY);`);
  await db.exec(readFileSync(new URL('../../../../supabase/migrations/20260413_salon_flywheel.sql', import.meta.url), 'utf8'));
  await db.exec(`CREATE ROLE service_role BYPASSRLS;
    ALTER TABLE salons ADD COLUMN private_note text;
    GRANT USAGE ON SCHEMA public TO service_role;
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO service_role;
    SET ROLE service_role;`);
  await db.query('INSERT INTO members(id,display_name,email) VALUES ($1,$2,$3),($4,$5,$6),($7,$8,$9),($10,$11,$12)',
    [GUIDE, 'Fictional Guide', 'PRIVATE_GUIDE_EMAIL', MEMBER, 'Fictional Member', 'PRIVATE_MEMBER_EMAIL',
      OUTSIDER, 'Other Member', 'PRIVATE_OTHER_EMAIL', OTHER_GUIDE, 'Other Guide', 'PRIVATE_OTHER_GUIDE_EMAIL']);
  await db.query('INSERT INTO salons(id,guide_member_id,title,private_note) VALUES ($1,$2,$3,$4),($5,$6,$7,$8)',
    [SALON, GUIDE, 'Fictional Program', 'PRIVATE_SALON_NOTE', OTHER_SALON, OTHER_GUIDE, 'Other Program', 'PRIVATE_OTHER_NOTE']);
  await db.query('INSERT INTO salon_members(salon_id,member_id,sessions_attended,sessions_led) VALUES ($1,$2,3,1),($3,$4,1,0)',
    [SALON, MEMBER, OTHER_SALON, OUTSIDER]);
  // Deliberately insert the later session first; the returned next date must be ordered.
  await db.query('INSERT INTO salon_sessions(id,salon_id,session_date,session_number,topic,transcript_summary,attendance) VALUES ($1,$2,$3,2,$4,$5,$6),($7,$2,$8,1,$9,$5,$6)',
    [SESSION_TWO, SALON, '2026-11-16', 'Second fictional topic', 'PRIVATE_TRANSCRIPT', JSON.stringify([MEMBER]),
      SESSION_ONE, '2026-11-09', 'First fictional topic']);
  const client = createClient('https://guide-read-fixture.invalid', 'nonissued-synthetic-service-token', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      try {
        const request = new Request(input, init), url = new URL(request.url);
        assert.equal(url.origin, 'https://guide-read-fixture.invalid');
        const table = url.pathname.split('/').at(-1), query = url.searchParams, method = request.method;
        assert(['salons', 'salon_members', 'salon_sessions', 'members'].includes(table));
        assert(['GET', 'HEAD'].includes(method), 'Read verification must never perform a write');
        const call = { table, method, query: Object.fromEntries(query) }; f.calls.push(call);
        if (f.failure?.(call)) return Response.json({ message: 'PRIVATE_DATABASE_ERROR', details: 'PRIVATE_SCHEMA_DETAIL' }, { status: 500 });
        const params = [], bind = value => '$' + params.push(value);
        const filters = (column, value) => {
          if (value.startsWith('eq.')) return column + ' = ' + bind(value.slice(3));
          const list = /^in\.\(([^()]*)\)$/.exec(value); assert(list, 'Unsupported fixture predicate ' + value);
          return column + ' IN (' + list[1].split(',').map(bind).join(',') + ')';
        };
        const innerPredicates = [];
        const project = (selection, alias, baseTable) => topFields(selection).map(field => {
          const relation = /^(members|salons)(?:!([a-z_]+))?\((.*)\)$/.exec(field);
          // PostgreSQL DATE is a YYYY-MM-DD string in PostgREST. PGlite's JS
          // decoder otherwise produces a Date object and a timestamp on JSON encoding.
          if (!relation) return alias + '.' + identifier(field) + (field === 'session_date' ? '::text AS session_date' : '');
          const [, relationName, constraint, childFields] = relation;
          if (constraint) assert(['inner', 'salons_guide_member_id_fkey'].includes(constraint));
          const foreignKey = relationName === 'salons' ? 'salon_id' : baseTable === 'salons' ? 'guide_member_id' : 'member_id';
          const columns = topFields(childFields); assert(columns.every(value => /^[a-z][a-z0-9_]*$/.test(value)));
          const embeddedWhere = ['r.id = ' + alias + '.' + identifier(foreignKey)];
          for (const [key, value] of query) if (key.startsWith(relationName + '.')) {
            embeddedWhere.push(filters('r.' + identifier(key.slice(relationName.length + 1)), value));
          }
          // Embedded filters constrain only the child unless !inner also
          // requires a matching parent. Both use the actual database predicate.
          if (constraint === 'inner') innerPredicates.push('EXISTS (SELECT 1 FROM ' + identifier(relationName) + ' r WHERE ' + embeddedWhere.join(' AND ') + ')');
          return '(SELECT json_build_object(' + columns.map(value => "'" + value + "',r." + identifier(value)).join(',') +
            ') FROM ' + identifier(relationName) + ' r WHERE ' + embeddedWhere.join(' AND ') + ') AS ' + identifier(relationName);
        }).join(',');
        const selection = query.get('select'); assert(selection && !selection.includes('*'));
        const projected = project(selection, 'b', table), where = [...innerPredicates];
        for (const [key, value] of query) {
          if (['select', 'limit', 'order'].includes(key) || key.includes('.')) continue;
          where.push(filters('b.' + identifier(key), value));
        }
        const from = ' FROM ' + identifier(table) + ' b' + (where.length ? ' WHERE ' + where.join(' AND ') : '');
        let sql = 'SELECT ' + (method === 'HEAD' ? 'count(*)::int AS count' : projected) + from;
        if (method !== 'HEAD' && query.has('order')) sql += ' ORDER BY ' + query.get('order').split(',').map(term => {
          const [column, direction] = term.split('.'); assert(['asc', 'desc'].includes(direction)); return 'b.' + identifier(column) + ' ' + direction;
        }).join(',');
        if (method !== 'HEAD' && query.has('limit')) sql += ' LIMIT ' + bind(Number(query.get('limit')));
        const rows = (await db.query(sql, params)).rows; call.rowCount = rows.length;
        if (method === 'HEAD') return new Response(null, { status: 200, headers: f.missingCount ? {} : { 'content-range': '*/' + rows[0].count } });
        const single = request.headers.get('accept')?.includes('vnd.pgrst.object');
        if (single && rows.length !== 1) return Response.json({ code: 'PGRST116', details: 'The result contains ' + rows.length + ' rows', message: 'Single row required' }, { status: 406 });
        return Response.json(single ? rows[0] : rows);
      } catch (error) { f.transportErrors.push(String(error.stack || error)); throw error; }
    } },
  });
  const mocks = {
    'server-only': {},
    '@/lib/supabase/admin': { getSupabaseAdmin() { f.clientCreations++; if (f.clientThrows) throw Error('PRIVATE_CLIENT_ERROR'); return client; } },
    '@/lib/getAuthenticatedMember': { async getAuthenticatedMember() { f.authCalls++; if (f.authThrows) throw Error('PRIVATE_IDENTITY_ERROR'); return f.auth; } },
    '@/lib/feed/activityFeed': { emitActivity() { throw Error('Unexpected activity write in read verification'); } },
  };
  const load = sourceLoader(mocks); mocks['@/lib/salons'] = load('lib/salons/index.ts');
  f.stats = mocks['@/lib/salons'].getSalonStats;
  f.memberSalon = mocks['@/lib/salons'].getSalonForMember;
  f.access = load('lib/salons/read-access.ts').authorizeGuideProgramRead;
  f.client = client;
  f.routes = {
    detail: load('app/api/salons/[salonId]/route.ts').GET,
    sessions: load('app/api/salons/[salonId]/sessions/route.ts').GET,
    list: load('app/api/salons/route.ts').GET,
    mine: load('app/api/salons/my-salon/route.ts').GET,
  };
  f.signIn = id => { f.auth = id ? { memberId: id, member: { id, display_name: 'Synthetic requester' } } : null; };
  f.read = (name, id = SALON, search = '') => {
    const path = name === 'list' ? '/api/salons' : name === 'mine' ? '/api/salons/my-salon' : '/api/salons/' + id + (name === 'sessions' ? '/sessions' : '');
    return f.routes[name](new NextRequest('https://app.invalid' + path + search), { params: Promise.resolve({ salonId: id }) });
  };
  return f;
}
