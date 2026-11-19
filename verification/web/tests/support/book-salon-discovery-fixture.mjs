import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { participationApp } from './participation-app.mjs';
import { asRole } from './participation-db.mjs';
const require = createRequire(new URL('../../../../package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');
export const listingSelection = 'id,book_id,title,description,max_members,start_date,thinker_id,status,book_cohort_members(count)';

/** Real GET source and locked SDK over the existing disposable schema. This
 * bounded SQL transport models this one PostgREST query, not a hosted gateway. */
export async function bookSalonDiscoveryFixture(t) {
  const app = await participationApp();
  const f = { ...app, reads: [], transportErrors: [], unavailable: false, missingCount: false, corrupt: null, clientCreations: 0 };
  t?.after(() => f.close());
  const client = createClient('https://book-list-fixture.invalid', 'NONISSUED_SERVICE_FIXTURE', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      try {
      const req = new Request(input, init), url = new URL(req.url), q = url.searchParams;
      assert.equal(req.method, 'GET'); assert.equal(url.origin, 'https://book-list-fixture.invalid');
      assert.equal(url.pathname, '/rest/v1/book_cohorts'); assert.equal(q.get('select'), listingSelection);
      assert.equal(q.get('book_id'), 'neq.soe-circles-path'); assert.equal(q.get('order'), 'created_at.desc,id.desc');
      assert.equal(req.headers.get('prefer'), 'count=exact');
      assert.deepEqual([...q.keys()].sort(), ['book_id', 'limit', 'offset', 'order', 'select']);
      const offset = Number(q.get('offset')), limit = Number(q.get('limit'));
      assert(Number.isSafeInteger(offset) && offset >= 0); assert.equal(limit, 50);
      f.reads.push({ offset, limit, query: Object.fromEntries(q) });
      if (f.unavailable) return Response.json({ message: 'PRIVATE_DATABASE_CANARY' }, { status: 503 });
      const result = await asRole(f.db, 'service_role', async tx => {
        const total = (await tx.query("SELECT count(*)::int n FROM book_cohorts WHERE book_id <> 'soe-circles-path'")).rows[0].n;
        const rows = (await tx.query(`SELECT id,book_id,title,description,max_members,start_date,thinker_id,status,
          (SELECT json_build_array(json_build_object('count',count(*))) FROM book_cohort_members m WHERE m.cohort_id=book_cohorts.id) AS book_cohort_members
          FROM book_cohorts WHERE book_id <> 'soe-circles-path' ORDER BY created_at DESC,id DESC LIMIT $1 OFFSET $2`, [limit, offset])).rows;
        return { rows: JSON.parse(JSON.stringify(rows)), total };
      });
      const rows = f.corrupt ? f.corrupt(result.rows) : result.rows;
      return Response.json(rows, { headers: f.missingCount ? {} : { 'content-range': `${offset}-${offset + result.rows.length - 1}/${result.total}` } });
      } catch (error) { f.transportErrors.push(String(error.stack ?? error)); throw error; }
    } },
  });
  f.app.setMock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => { f.clientCreations++; return client; } }));
  f.setActor(null);
  return f;
}
