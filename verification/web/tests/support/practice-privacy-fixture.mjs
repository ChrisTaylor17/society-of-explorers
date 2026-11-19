import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '../../tooling/node_modules/@electric-sql/pglite/dist/index.js';
import { vector } from '../../tooling/node_modules/@electric-sql/pglite/dist/vector/index.js';
import { offlineApp } from './offline-app.mjs';

const root = new URL('../../../../', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');
const { createClient } = createRequire(new URL('package.json', root))('@supabase/supabase-js');
export const applySql = await read('docs/sql/practice-data-containment-apply.sql');
const saveSql = await read('docs/sql/practice-response-save-apply.sql');
const base = await read('supabase/migrations/20260414_daily_practice.sql');
const reflections = await read('supabase/migrations/20260418_practice_reflections.sql');

export const A = '10000000-0000-4000-8000-000000000001';
export const B = '10000000-0000-4000-8000-000000000002';
export const C = '10000000-0000-4000-8000-000000000003';
export const D = '10000000-0000-4000-8000-000000000004';
export const Q = '20000000-0000-4000-8000-000000000001';
export const RA = '30000000-0000-4000-8000-000000000001';
export const RB = '30000000-0000-4000-8000-000000000002';
export const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
export const prompt = 'What habit makes it easier to listen well?';
export const tables = ['daily_questions', 'matched_conversations', 'practice_reflections', 'question_responses'];

export async function practiceDb(onClose, { withCoreBaseline = false } = {}) {
  const db = new PGlite({ extensions: { vector } });
  onClose(() => db.close());
  await db.waitReady;
  if (withCoreBaseline) await db.exec(await read('verification/web/tests/fixtures/core-containment-synthetic.sql'));
  else await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;"
    + " CREATE TABLE members(id uuid PRIMARY KEY, display_name text NOT NULL);");
  await db.exec("CREATE SCHEMA extensions; SET search_path = public, extensions;");
  await db.exec(base);
  await db.exec(reflections);
  await db.exec("CREATE TABLE unrelated_catalog(label text); INSERT INTO unrelated_catalog VALUES ('PUBLIC_SAMPLE');"
    + " GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;"
    + " GRANT SELECT ON unrelated_catalog TO anon;"
    + " GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON "
    + tables.join(', ') + " TO anon, authenticated, service_role;"
    + " GRANT SELECT,UPDATE ON members TO service_role;"
    + " GRANT SELECT (reflection_text) ON practice_reflections TO PUBLIC;"
    + " GRANT SELECT (response_text), UPDATE (response_text) ON question_responses TO authenticated;");
  await db.query("INSERT INTO members (id, display_name) VALUES ($1,'Synthetic A'), ($2,'Synthetic B'), ($3,'Synthetic C'), ($4,'Synthetic D')", [A, B, C, D]);
  await db.query("INSERT INTO daily_questions(id, thinker_id, question_text, date) VALUES ($1, 'socrates', $2, $3)", [Q, prompt, day]);
  await db.query("INSERT INTO question_responses(id,member_id,question_id,response_text) VALUES ($1,$2,$3,'OWNER_A_ANSWER'),($4,$5,$3,'OWNER_B_ANSWER')", [RA, A, Q, RB, B]);
  await db.query("INSERT INTO practice_reflections(response_id,question_id,thinker_id,member_id,reflection_text) VALUES ($1,$3,'socrates',$4,'OWNER_A_REFLECTION'),($2,$3,'socrates',NULL,'OWNER_B_REFLECTION')", [RA, RB, Q, A]);
  await db.query("INSERT INTO matched_conversations(member_a,member_b,thinker_id,match_reason) VALUES($1,$2,'socrates','MATCH_PRIVATE_FIXTURE')", [A, B]);
  return db;
}

function identifier(name) {
  assert.match(name, /^[a-z][a-z0-9_]*$/);
  return name;
}

// Only the PostgREST operations used in these routes are mapped to SQL.
function sqlRequest(request) {
  const url = new URL(request.url);
  const table = identifier(url.pathname.split('/').at(-1));
  assert(tables.includes(table) || table === 'members');
  const params = [];
  const bind = value => '$' + params.push(value);
  const condition = (name, predicate) => {
    const field = identifier(name);
    const separator = predicate.indexOf('.');
    const op = predicate.slice(0, separator), value = predicate.slice(separator + 1);
    if (op === 'is' && value === 'null') return field + ' IS NULL';
    if (op === 'in') {
      assert(value.startsWith('(') && value.endsWith(')'));
      return field + ' IN (' + value.slice(1, -1).split(',').map(bind).join(',') + ')';
    }
    const comparison = { eq: '=', neq: '<>', lte: '<=', gte: '>=' }[op];
    assert(comparison, predicate);
    return field + ' ' + comparison + ' ' + bind(value);
  };
  const query = url.searchParams;
  const skip = new Set(['select', 'order', 'limit', 'on_conflict', 'columns']);
  const filters = [];
  for (const [field, value] of query) {
    if (skip.has(field)) continue;
    if (field === 'or') {
      assert(value.startsWith('(') && value.endsWith(')'));
      const alternatives = value.slice(1, -1).split(',').map(branch => {
        const separator = branch.indexOf('.');
        return condition(branch.slice(0, separator), branch.slice(separator + 1));
      });
      filters.push('(' + alternatives.join(' OR ') + ')');
    } else filters.push(condition(field, value));
  }
  const where = filters.length ? ' WHERE ' + filters.join(' AND ') : '';
  const select = query.get('select') || '*';
  const fields = select === '*' ? '*' : select.split(',').map(identifier).join(',');
  const order = query.get('order');
  const limit = query.get('limit');
  const ordered = order ? (() => {
    const [column, direction] = order.split('.');
    assert(direction === 'asc' || direction === 'desc');
    return ' ORDER BY ' + identifier(column) + ' ' + direction;
  })() : '';
  const capped = limit ? ' LIMIT ' + bind(Number(limit)) : '';
  return { params, bind, table, query, select, fields, where, ordered, capped };
}

export async function practiceHttp(onClose, preparedDb) {
  const db = preparedDb ?? await practiceDb(onClose);
  await db.exec(applySql);
  await db.exec(saveSql);
  await db.exec('SET ROLE service_role');
  const calls = [], failures = [];
  const api = createClient('https://practice.invalid', 'synthetic-service-token', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      assert.equal(url.origin, 'https://practice.invalid');
      if (url.pathname === '/rest/v1/rpc/soe_practice_response_save') {
        assert.equal(request.method, 'POST');
        const payload = await request.json();
        assert.deepEqual(Object.keys(payload).sort(), ['p_actor', 'p_question_id', 'p_response_text']);
        calls.push({ rpc: 'soe_practice_response_save', method: 'POST' });
        try {
          const { rows } = await db.query('SELECT public.soe_practice_response_save($1,$2,$3) AS saved',
            [payload.p_actor, payload.p_question_id, payload.p_response_text]);
          return Response.json(rows[0].saved);
        } catch (error) {
          failures.push({ rpc: 'soe_practice_response_save', code: error.code });
          return Response.json({ code: error.code, message: 'PRIVATE_FIXTURE_ERROR' }, { status: 400 });
        }
      }
      const { table, params, bind, query, select, fields, where, ordered, capped } = sqlRequest(request);
      const method = request.method;
      calls.push({ table, method, select, query: Object.fromEntries(query) });
      let sql = 'SELECT ' + fields + ' FROM ' + table + where + ordered + capped;
      if (method === 'HEAD') {
        const { rows } = await db.query('SELECT count(*)::int AS total FROM ' + table + where, params);
        return new Response(null, { headers: { 'Content-Range': '*/' + rows[0].total } });
      }
      if (method === 'POST' || method === 'PATCH') {
        const payload = await request.json();
        const columns = Object.keys(payload).map(identifier);
        const assignments = columns.map(column => column + ' = ' + bind(payload[column]));
        if (method === 'PATCH') sql = 'UPDATE ' + table + ' SET ' + assignments.join(',') + where;
        else {
          const conflict = query.get('on_conflict')?.split(',').map(identifier);
          sql = 'INSERT INTO ' + table + ' (' + columns.join(',') + ') VALUES ('
            + assignments.map(assignment => assignment.split(' = ')[1]).join(',') + ')';
          if (conflict) sql += ' ON CONFLICT (' + conflict.join(',') + ') DO UPDATE SET '
            + columns.filter(column => !conflict.includes(column)).map(column => column + ' = excluded.' + column).join(',');
        }
        sql += ' RETURNING ' + fields;
      } else assert.equal(method, 'GET');
      try {
        const result = await db.query('WITH result AS (' + sql + ') SELECT to_jsonb(result) AS data FROM result', params);
        const rows = result.rows.map(row => row.data);
        const object = request.headers.get('accept') === 'application/vnd.pgrst.object+json';
        if (object && rows.length !== 1) {
          return Response.json({ code: 'PGRST116', message: 'Synthetic cardinality error' }, { status: 406 });
        }
        return Response.json(object ? rows[0] : rows);
      } catch (error) {
        failures.push({ table, method, code: error.code ?? null });
        return Response.json({ code: error.code, message: 'PRIVATE_FIXTURE_ERROR' }, { status: 400 });
      }
    } },
  });
  const app = offlineApp({ root: resolve(fileURLToPath(root)) });
  let actor = null;
  let providers = 0;
  app.setMock('@/lib/getAuthenticatedMember', () => ({
    getAuthenticatedMember: async () => actor ? { memberId: actor, member: { id: actor } } : null,
  }));
  app.setMock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => api }));
  app.setMock('@/lib/ai/anthropic', () => ({
    createAnthropicClient() { providers++; throw Error('Unexpected provider'); },
    resolveClaudeModel() { providers++; throw Error('Unexpected model resolution'); },
  }));
  return { db, app, calls, failures, setActor(value) { actor = value; }, providers: () => providers };
}
