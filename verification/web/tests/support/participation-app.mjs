import { readFile } from 'node:fs/promises';
import { offlineApp } from './offline-app.mjs';
import { createDb, rpc, asRole, IDS } from './participation-db.mjs';
export { IDS };

// Real TypeScript route handlers and real candidate SQL. Only canonical server
// identity and the PostgREST transport are fixtures. Every database read/write
// runs as the disposable service role, not as the database owner.
export async function participationApp() {
  const db = await createDb(), app = offlineApp();
  try {
    // Add the contained legacy profile fields required by the real publication
    // migrations. The Circle detail route reads their actual RPC projection.
    await db.exec(`ALTER TABLE public.members ADD COLUMN bio text, ADD COLUMN discipline text,
      ADD COLUMN skills text[], ADD COLUMN project_description text, ADD COLUMN seeking text, ADD COLUMN philosophy text;
      ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
      GRANT SELECT,INSERT,UPDATE,DELETE ON public.members TO service_role;`);
    for (const name of [
      'member-profile-preflight.sql', 'member-profile-apply.sql',
      'circle-passage-posts.sql', 'circle-discussion-threads.sql',
      'circle-discovery-unicode.sql', 'circle-discovery-search.sql',
      'circle-attendance-preflight.sql', 'circle-attendance-apply.sql',
      'circle-membership-intent-preflight.sql', 'circle-membership-intent-apply.sql',
      'circle-public-profiles-preflight.sql', 'circle-public-profiles-apply.sql',
      // Discovery validates the complete current source catalog; the canonical
      // app also ships this reviewed tenth edition, rather than the older nine.
      'circle-luke-good-samaritan-edition-apply.sql',
      'circle-legacy-salon-membership.sql',
    ]) {
      await db.exec(await readFile(new URL('../../../../docs/sql/' + name, import.meta.url), 'utf8'));
    }
  } catch (error) {
    await db.close();
    throw error;
  }
  let actor = IDS.host;
  const calls = [], argumentsByName = new Map();
  app.setMock('@/lib/getAuthenticatedMember', () => ({ getAuthenticatedMember: async () => actor
    ? { memberId: actor, member: { id: actor, display_name: 'Synthetic Explorer' } } : null }));
  const tables = ['book_cohorts', 'book_cohort_members', 'circle_rsvps', 'circle_reports', 'circle_private', 'members', 'seminar_messages'];
  const identifier = value => { if (!/^[a-z_][a-z_0-9]*$/.test(value)) throw Error('Unexpected fixture identifier'); return value; };
  function from(table) {
    if (!tables.includes(table)) throw Error('Unexpected fixture table: ' + table);
    let columns = '*', options = {}, offset = 0, limit = null, one = false, strictOne = false, payload, mode = 'select', signal;
    const filters = [], orders = [];
    const builder = {
      select(value = '*', config = {}) { columns = value; options = config; return builder; },
      eq(column, value) { filters.push([identifier(column), '=', value]); return builder; },
      neq(column, value) { filters.push([identifier(column), '<>', value]); return builder; },
      in(column, values) { filters.push([identifier(column), 'IN', values]); return builder; },
      is(column, value) { if (value !== null) throw Error('Only null fixture predicate supported'); filters.push([identifier(column), 'IS NULL', null]); return builder; },
      order(column, config = {}) { orders.push(identifier(column) + (config.ascending === false ? ' DESC' : ' ASC')); return builder; },
      limit(value) { if (!Number.isSafeInteger(value) || value < 0) throw Error('Invalid fixture limit'); limit = value; return builder; },
      range(start, end) { offset = start; limit = end - start + 1; return builder; },
      abortSignal(value) { signal = value; return builder; },
      insert(value) { payload = value; mode = 'insert'; return builder; },
      single() { one = true; strictOne = true; return execute(); },
      maybeSingle() { one = true; return execute(); },
      then(resolve, reject) { return execute().then(resolve, reject); },
    };
    async function execute() {
      calls.push({ table, mode, columns, filters: [...filters] });
      try {
        if (signal?.aborted) throw Error('Fixture request aborted');
        return await asRole(db, 'service_role', async tx => {
          const values = [];
          const predicate = filters.map(([column, op, value]) => {
            if (op === 'IS NULL') return column + ' IS NULL';
            if (op === 'IN') return value.length ? `${column} IN (${value.map(item => { values.push(item); return '$' + values.length; }).join(',')})` : 'false';
            values.push(value); return `${column}${op}$${values.length}`;
          }).join(' AND ');
          const where = predicate ? ' WHERE ' + predicate : '';
          let projection;
          if (columns === '*') projection = '*';
          else if (columns === 'id, members(display_name)') projection = "id,(SELECT jsonb_build_object('display_name',m.display_name) FROM members m WHERE m.id=member_id) AS members";
          else projection = columns.split(',').map(value => identifier(value.trim())).join(',');
          if (mode === 'insert') {
            if (!payload || Array.isArray(payload)) throw Error('Unsupported fixture insert');
            const keys = Object.keys(payload).map(identifier);
            const result = await tx.query(`INSERT INTO public.${table}(${keys.join(',')}) VALUES(${keys.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING ${projection}`, keys.map(key => payload[key]));
            const rows = JSON.parse(JSON.stringify(result.rows));
            return { data: one ? rows[0] : rows, error: null, count: rows.length };
          }
          const total = options.count ? (await tx.query(`SELECT count(*)::int n FROM public.${table}${where}`, values)).rows[0].n : null;
          const result = options.head ? { rows: [] } : await tx.query(`SELECT ${projection} FROM public.${table}${where}${orders.length ? ' ORDER BY ' + orders.join(',') : ''}${limit === null ? '' : ' LIMIT ' + limit}${offset ? ' OFFSET ' + offset : ''}`, values);
          if (one && (result.rows.length > 1 || (strictOne && result.rows.length !== 1))) return { data: null, count: total, error: { code: 'PGRST116' } };
          // PostgREST is a JSON transport; PG driver Date objects must cross
          // that same serialization boundary before the actual route sees them.
          const rows = JSON.parse(JSON.stringify(result.rows));
          return { data: options.head ? null : one ? rows[0] || null : rows, count: total, error: null };
        });
      } catch (error) { calls.push({ fixtureError: { code: error.code, message: error.message } }); return { data: null, count: null, error: { code: error.code || 'FIXTURE_ERROR', message: 'Synthetic database error' } }; }
    }
    return builder;
  }
  const admin = { from, rpc: async (name, args) => {
    calls.push({ rpc: name, args: { ...args } });
    try {
      if (!/^soe_circle_[a-z_]+$/.test(name)) throw Error('Unexpected fixture RPC');
      let names = argumentsByName.get(name);
      if (!names) {
        const result = await db.query("SELECT proargnames FROM pg_proc WHERE proname=$1 AND pronamespace='public'::regnamespace", [name]);
        if (result.rows.length !== 1) throw Error('Missing or ambiguous fixture RPC');
        names = result.rows[0].proargnames; argumentsByName.set(name, names);
      }
      return { data: await rpc(db, name, names.map(key => args[key] ?? null)), error: null };
    } catch (error) { return { data: null, error: { code: error.code || 'FIXTURE_ERROR', message: 'Synthetic database error' } }; }
  } };
  app.setMock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => admin }));
  const routeCache = new Map();
  function route(filename) { if (!routeCache.has(filename)) routeCache.set(filename, app.load(filename)); return routeCache.get(filename); }
  const request = (body, path, headers = {}) => app.fakes.makeReq(body,
    { url: 'https://offline.invalid' + path, headers: { origin: 'https://offline.invalid', ...headers } });
  async function dispatch(path, method = 'GET', body, headers = {}) {
    const url = new URL(path, 'https://offline.invalid');
    let filename, params;
    if (url.pathname === '/api/circles') filename = 'app/api/circles/route.ts';
    else if (['/api/circles/start', '/api/circles/mine', '/api/circles/contributions'].includes(url.pathname)) filename = 'app' + url.pathname + '/route.ts';
    else if (url.pathname === '/api/book-salons/join') filename = 'app/api/book-salons/join/route.ts';
    else {
      let match = /^\/api\/circles\/([^/]+)(?:\/(join|leave|rsvp|complete|membership))?$/.exec(url.pathname);
      if (match) { filename = 'app/api/circles/[circleId]/' + (match[2] ? match[2] + '/' : '') + 'route.ts'; params = { circleId: match[1] }; }
      match = /^\/api\/book-salons\/([^/]+)$/.exec(url.pathname);
      if (match) { filename = 'app/api/book-salons/[cohortId]/route.ts'; params = { cohortId: match[1] }; }
      match = /^\/api\/circles\/([^/]+)\/messages\/([^/]+)$/.exec(url.pathname);
      if (match) { filename = 'app/api/circles/[circleId]/messages/[messageId]/route.ts'; params = { circleId: match[1], messageId: match[2] }; }
    }
    const handler = filename && route(filename)[method];
    if (!handler) throw Error('Unexpected fixture route: ' + method + ' ' + url.pathname);
    return handler(request(body, url.pathname + url.search, headers), params ? { params: Promise.resolve(params) } : undefined);
  }
  return { db, app, admin, calls, request, dispatch, get memberId() { return actor; }, setActor: value => { actor = value; }, close: () => db.close() };
}
