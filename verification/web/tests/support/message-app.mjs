import { participationApp } from './participation-app.mjs';
import { rpc, IDS } from './message-db.mjs';
export { IDS };

// Actual route modules and candidate SQL. Only server identity and the transport
// to the disposable PostgreSQL backend are substituted; no authorization result
// or moderation decision is mocked. This is not live-provider acceptance.
export async function messageApp() {
  // Current routes intentionally require the public-profile RPC projections.
  // Reuse the real current migration fixture instead of aliasing new RPC names
  // to older functions or bypassing their publication checks.
  const { db, app } = await participationApp();
  let actor = IDS.reader;
  const calls = [], argumentNames = new Map();
  app.setMock('@/lib/getAuthenticatedMember', () => ({ getAuthenticatedMember: async () => actor
    ? { memberId: actor, member: { id: actor, display_name: 'Synthetic Explorer' } } : null }));
  function from(table) {
    if (!['book_cohorts', 'book_cohort_members'].includes(table)) throw Error('Unexpected fixture table: ' + table);
    const filters = [];
    const builder = {
      select() { return builder; },
      eq(column, value) {
        if (!['id', 'book_id', 'cohort_id', 'member_id'].includes(column)) throw Error('Unexpected fixture column');
        filters.push([column, value]); return builder;
      },
      single: execute, maybeSingle: execute,
    };
    async function execute() {
      calls.push({ table, filters: [...filters] });
      try {
        const where = filters.map(([column], i) => `${column}=$${i + 1}`).join(' AND ');
        const result = await db.query(`SELECT * FROM public.${table}${where ? ' WHERE ' + where : ''}`, filters.map(([, value]) => value));
        if (result.rows.length > 1) return { data: null, error: { code: 'FIXTURE_MULTIPLE' } };
        return { data: result.rows[0] || null, error: null };
      } catch (error) { return { data: null, error: { code: error.code || 'FIXTURE_ERROR' } }; }
    }
    return builder;
  }
  const admin = { from, rpc: async (name, args) => {
    calls.push({ rpc: name, args: { ...args } });
    try {
      if (!/^soe_circle_[a-z_]+$/.test(name)) throw Error('Unexpected fixture RPC');
      let names = argumentNames.get(name);
      if (!names) {
        const result = await db.query("SELECT proargnames FROM pg_proc WHERE proname=$1 AND pronamespace='public'::regnamespace", [name]);
        if (result.rows.length !== 1) throw Error('Missing or ambiguous fixture RPC');
        names = result.rows[0].proargnames; argumentNames.set(name, names);
      }
      return { data: await rpc(db, name, names.map(key => args[key] ?? null)), error: null };
    } catch (error) { return { data: null, error: { code: error.code || 'FIXTURE_ERROR', message: 'Synthetic database error' } }; }
  } };
  app.setMock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => admin }));
  const routes = {
    message: app.load('app/api/circles/[circleId]/messages/[messageId]/route.ts'),
    contributions: app.load('app/api/circles/contributions/route.ts'),
    queue: app.load('app/api/admin/circles/messages/route.ts'),
    review: app.load('app/api/admin/circles/[circleId]/messages/[messageId]/route.ts'),
    discussion: app.load('app/api/book-salons/[cohortId]/route.ts'),
  };
  const context = (messageId = IDS.message, circleId = IDS.circle) => ({ params: Promise.resolve({ circleId, messageId }) });
  const request = (body, path = `/api/circles/${IDS.circle}/messages/${IDS.message}`, headers = {}) => app.fakes.makeReq(body,
    { url: 'https://offline.invalid' + path, headers: { origin: 'https://offline.invalid', ...headers } });
  async function dispatch(path, method = 'GET', body, headers = {}) {
    const url = new URL(path, 'https://offline.invalid');
    const req = request(body, url.pathname + url.search, headers);
    let route, ctx;
    if (url.pathname === '/api/circles/contributions') route = routes.contributions;
    else if (url.pathname === '/api/admin/circles/messages') route = routes.queue;
    else {
      let match = /^\/api\/circles\/([^/]+)\/messages\/([^/]+)$/.exec(url.pathname);
      if (match) { route = routes.message; ctx = context(match[2], match[1]); }
      match = /^\/api\/admin\/circles\/([^/]+)\/messages\/([^/]+)$/.exec(url.pathname);
      if (match) { route = routes.review; ctx = context(match[2], match[1]); }
      match = /^\/api\/book-salons\/([^/]+)$/.exec(url.pathname);
      if (match) { route = routes.discussion; ctx = { params: Promise.resolve({ cohortId: match[1] }) }; }
    }
    if (!route?.[method]) throw Error('Unexpected fixture route: ' + method + ' ' + url.pathname);
    return route[method](req, ctx);
  }
  return { db, app, routes, context, request, dispatch, calls, admin, setActor: value => { actor = value; }, close: () => db.close() };
}
