import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
// Actual source/SDK with a bounded disposable SQL adapter; identity and activity are fixtures.
const require = createRequire(root + '/package.json');
const { createClient } = require('@supabase/supabase-js');
const { NextRequest } = require('next/server');
const { PGlite } = await import(pathToFileURL(root + '/verification/web/tooling/node_modules/@electric-sql/pglite/dist/index.js'));
const { sourceLoader } = await import(pathToFileURL(root + '/platforms/tests/load-source.mjs'));
const G = '20000000-0000-4000-8000-000000000001', M = '20000000-0000-4000-8000-000000000002';
const S = '10000000-0000-4000-8000-000000000001', X = '30000000-0000-4000-8000-000000000001';
const migration = readFileSync(root + '/supabase/migrations/20260413_salon_flywheel.sql', 'utf8');
const authSource = readFileSync(root + '/lib/getAuthenticatedMember.ts', 'utf8');
const projection = /const MEMBER_SELECT = '([^']+)'/.exec(authSource)?.[1]; assert(projection);
const ident = name => { assert.match(name, /^[a-z_][a-z_0-9]*$/); return '"' + name + '"'; };

export async function guideWriterFixture() {
  const db = new PGlite(); await db.waitReady;
  await db.exec('CREATE TABLE members(id uuid PRIMARY KEY, display_name text); CREATE TABLE communities(id uuid PRIMARY KEY); CREATE TABLE video_rooms(id uuid PRIMARY KEY);');
  await db.exec(migration);
  await db.exec('CREATE ROLE service_role BYPASSRLS; GRANT USAGE ON SCHEMA public TO service_role; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO service_role; SET ROLE service_role;');
  await db.query('INSERT INTO members(id,display_name,is_guide) VALUES($1,$2,true),($3,$4,false)', [G, 'Fictional guide', M, 'Fictional participant']);
  const f = { db, calls: [], activities: [], auth: null, unexpected: [], failures: [] };
  const client = createClient('https://guide-writer-audit.invalid', 'NONISSUED_AUDIT_VALUE', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const request = new Request(input, init), url = new URL(request.url);
      assert.equal(url.origin, 'https://guide-writer-audit.invalid');
      const table = url.pathname.split('/').at(-1), method = request.method, q = url.searchParams;
      assert(['salons', 'salon_members', 'salon_sessions', 'members'].includes(table));
      assert(['GET', 'HEAD', 'POST', 'PATCH'].includes(method));
      const payload = ['POST', 'PATCH'].includes(method) ? await request.json() : null;
      const call = { table, method, query: Object.fromEntries(q), payload }; f.calls.push(call);
      const params = [], bind = value => '$' + params.push(value), filters = [];
      const value = (key, v) => ['topic_rotation', 'attendance'].includes(key) ? JSON.stringify(v) : v;
      const selection = q.get('select');
      const columns = selection ? selection.split(',').map(v => ident(v.trim())).join(',') : '*';
      let sql;
      if (method === 'POST') {
        const rows = Array.isArray(payload) ? payload : [payload], keys = Object.keys(rows[0]);
        assert(rows.length && rows.every(row => keys.every(key => Object.hasOwn(row, key))));
        sql = `INSERT INTO ${ident(table)}(${keys.map(ident).join(',')}) VALUES ` + rows.map(row => '(' + keys.map(key => bind(value(key, row[key]))).join(',') + ')').join(',') + ' RETURNING ' + columns;
      } else {
        const assignments = method === 'PATCH' ? Object.entries(payload).map(([key, v]) => ident(key) + '=' + bind(value(key, v))).join(',') : '';
        for (const [key, v] of q) {
          if (['select', 'order', 'limit'].includes(key)) continue;
          assert(v.startsWith('eq.'), 'Bounded audit supports exact predicates only'); filters.push(ident(key) + '=' + bind(v.slice(3)));
        }
        const where = filters.length ? ' WHERE ' + filters.join(' AND ') : '';
        if (method === 'PATCH') { assert(filters.length); sql = `UPDATE ${ident(table)} SET ${assignments}${where} RETURNING ${columns}`; }
        else {
          sql = `SELECT ${method === 'HEAD' ? 'count(*)::int AS n' : columns} FROM ${ident(table)}${where}`;
          if (method !== 'HEAD' && q.has('order')) sql += ' ORDER BY ' + q.get('order').split(',').map(term => { const [key, direction] = term.split('.'); assert(['asc', 'desc'].includes(direction)); return ident(key) + ' ' + direction; }).join(',');
          if (method !== 'HEAD' && q.has('limit')) sql += ' LIMIT ' + bind(Number(q.get('limit')));
        }
      }
      let rows;
      try { rows = (await db.query(sql, params)).rows; }
      catch (error) {
        f.failures.push({ table, method, code: error.code });
        return Response.json({ code: error.code, message: 'Synthetic audit database rejection' }, { status: 400 });
      }
      if (method === 'HEAD') return new Response(null, { headers: { 'content-range': '*/' + rows[0].n } });
      if (method !== 'GET' && !selection) return new Response(null, { status: 204 });
      if (request.headers.get('accept')?.includes('vnd.pgrst.object')) {
        if (rows.length !== 1) return Response.json({ code: 'PGRST116', details: 'The result contains ' + rows.length + ' rows' }, { status: 406 });
        return Response.json(rows[0]);
      }
      return Response.json(rows);
    } },
  });
  const mocks = {
    'server-only': {}, '@/lib/supabase/admin': { getSupabaseAdmin: () => client },
    '@/lib/getAuthenticatedMember': { getAuthenticatedMember: async () => f.auth },
    '@/lib/feed/activityFeed': { emitActivity: async value => { f.activities.push(value); } },
  };
  const load = sourceLoader(mocks); mocks['@/lib/salons'] = load('lib/salons/index.ts');
  const routes = { create: load('app/api/salons/route.ts').POST, action: load('app/api/salons/[salonId]/route.ts').POST,
    guide: load('app/api/guide/route.ts').GET, guideCreate: load('app/api/guide/create-salon/route.ts').POST,
    sessionsRead: load('app/api/salons/[salonId]/sessions/route.ts').GET, sessionPatch: load('app/api/salons/[salonId]/sessions/route.ts').PATCH };
  f.signIn = async (id, includeGuideFields = false) => {
    const row = (await db.query('SELECT * FROM members WHERE id=$1', [id])).rows[0]; assert(row);
    // Deliberately explicit identity fixture. Default shape comes from the
    // actual auth helper's declared projection; no provider acceptance claimed.
    const member = includeGuideFields ? row : Object.fromEntries(projection.split(',').map(key => key.trim()).map(key => [key, row[key] ?? null]));
    f.auth = { memberId: id, member };
  };
  f.call = async (name, body) => {
    const method = name === 'guide' || name === 'sessionsRead' ? 'GET' : name === 'sessionPatch' ? 'PATCH' : 'POST';
    const path = name === 'guide' ? '/api/guide' : name === 'guideCreate' ? '/api/guide/create-salon' : name === 'create' ? '/api/salons' : '/api/salons/' + S + (name.startsWith('session') ? '/sessions' : '');
    const response = await routes[name](new NextRequest('https://app.invalid' + path, { method, headers: { origin: 'https://app.invalid', 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), { params: Promise.resolve({ salonId: S }) });
    return { status: response.status, body: await response.json() };
  };
  f.seed = async ({ member = true, sessions = 1, leader = M, maximum = 7 } = {}) => {
    await db.query('INSERT INTO salons(id,title,guide_member_id,max_members) VALUES($1,$2,$3,$4)', [S, 'Fictional guide program', G, maximum]);
    if (member) await db.query('INSERT INTO salon_members(salon_id,member_id) VALUES($1,$2)', [S, M]);
    for (let n = 1; n <= sessions; n++) await db.query('INSERT INTO salon_sessions(id,salon_id,led_by_member_id,session_date,session_number,track) VALUES($1,$2,$3,$4,$5,$6)',
      [n === 1 ? X : '30000000-0000-4000-8000-' + String(n).padStart(12, '0'), S, leader, '2026-11-09', n, 'singularity']);
  };
  f.deny = async (table, timing) => db.exec(`RESET ROLE; CREATE FUNCTION audit_reject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Synthetic failure'; END $$; CREATE TRIGGER audit_reject BEFORE ${timing} ON ${ident(table)} FOR EACH ROW EXECUTE FUNCTION audit_reject(); SET ROLE service_role;`);
  f.allow = async table => db.exec(`RESET ROLE; DROP TRIGGER audit_reject ON ${ident(table)}; SET ROLE service_role;`);
  f.close = async () => { await db.close(); };
  return f;
}

export { G, M, S, X };
