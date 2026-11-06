import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { PGlite } from '../../tooling/node_modules/@electric-sql/pglite/dist/index.js';
import { asRole } from './artifact-containment-fixture.mjs';
import { offlineApp } from './offline-app.mjs';

const root = new URL('../../../../', import.meta.url);
const { createClient } = createRequire(new URL('package.json', root))('@supabase/supabase-js');
export const A = '10000000-0000-4000-8000-000000000001';
export const B = '10000000-0000-4000-8000-000000000002';
export const LIVE = '30000000-0000-4000-8000-000000000001';
export const PAST = '30000000-0000-4000-8000-000000000002';
export const LEGACY = '30000000-0000-4000-8000-000000000003';
export const FOREIGN = '30000000-0000-4000-8000-000000000004';
export const UPCOMING = '30000000-0000-4000-8000-000000000005';
export const LINK = 'https://soe-fixture.daily.co/live-fixture';

function identifier(name) {
  assert.match(name, /^[a-z][a-z0-9_]*$/);
  return name;
}

function toSql(url, body) {
  const table = url.pathname.split('/').at(-1);
  assert(['communities', 'video_rooms'].includes(table));
  const args = [];
  const bind = value => '$' + args.push(value);
  const condition = (field, predicate) => {
    const separator = predicate.indexOf('.');
    const op = predicate.slice(0, separator);
    const value = predicate.slice(separator + 1);
    const column = identifier(field);
    if (op === 'is') { assert.equal(value, 'null'); return column + ' IS NULL'; }
    const comparison = { eq: '=', neq: '<>', gte: '>=', lt: '<' }[op];
    assert(comparison, predicate);
    return column + comparison + bind(column === 'is_live' ? value === 'true' : value);
  };
  const filters = [];
  const { searchParams: params } = url;
  for (const [name, value] of params) {
    if (['select', 'order', 'limit'].includes(name)) continue;
    if (name === 'or') {
      assert.equal(value, '(room_type.is.null,room_type.neq.live_session)');
      filters.push('(room_type IS NULL OR room_type <> ' + bind('live_session') + ')');
    } else filters.push(condition(name, value));
  }
  assert(filters.length > 0);
  const where = ' WHERE ' + filters.join(' AND ');
  const fields = params.get('select').split(',').map(identifier).join(',');
  if (body) {
    assert.equal(table, 'video_rooms');
    assert.deepEqual(Object.keys(body).sort(), body.is_live
      ? ['is_live', 'started_at'] : ['ended_at', 'is_live']);
    const set = Object.entries(body).map(([key, value]) => identifier(key) + '=' + bind(value));
    return { args, query: 'UPDATE public.video_rooms SET ' + set.join(',') + where + ' RETURNING ' + fields };
  }
  const order = params.get('order');
  const limit = params.get('limit');
  let query = 'SELECT ' + fields + ' FROM public.' + table + where;
  if (order) {
    const [field, direction] = order.split('.');
    assert(['asc', 'desc'].includes(direction));
    query += ' ORDER BY ' + identifier(field) + ' ' + direction;
  }
  if (limit) {
    assert.match(limit, /^(1|10)$/);
    query += ' LIMIT ' + bind(Number(limit));
  }
  return { args, query };
}

export async function liveRoomFixture() {
  const db = new PGlite();
  try {
    await db.waitReady;
    for (const file of [
      'verification/web/tests/fixtures/live-room-prerequisites-synthetic.sql',
      'verification/web/tests/fixtures/live-room-synthetic.sql',
      'docs/sql/live-room-containment-apply.sql',
    ]) {
      await db.exec(await readFile(new URL(file, root), 'utf8'));
    }

    let beforeJoin = null;
    const calls = [];
    const app = offlineApp();
    const actor = request => request.headers.get('x-fixture-actor');
    app.setMock('@/lib/getAuthenticatedMember', () => ({
      getAuthenticatedMember: async request => {
        const memberId = actor(request);
        return [A, B].includes(memberId) ? { memberId, member: { display_name: 'Fixture member' } } : null;
      },
    }));
    app.setMock('@/lib/movement/access', () => ({
      getMovementAccess: async request => [A, B].includes(actor(request)) ? { canManage: actor(request) === A } : null,
    }));
    app.setMock('@/lib/feed/activityFeed', () => ({
      emitActivity: () => { throw Error('Unexpected activity event'); },
    }));
    app.setMock('@/lib/ai/anthropic', () => { throw Error('Unexpected AI provider module'); });
    const client = createClient('https://live-room-db.invalid', 'SYNTHETIC_FIXTURE_KEY', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: async (input, init) => {
          const request = new Request(input, init);
          const url = new URL(request.url);
          assert.equal(url.origin, 'https://live-room-db.invalid');
          assert(url.pathname.startsWith('/rest/v1/'));
          calls.push({ method: request.method, path: url.pathname, select: url.searchParams.get('select') });
          if (url.pathname === '/rest/v1/rpc/soe_join_live_council') {
            assert.equal(request.method, 'POST');
            const body = await request.json();
            assert.deepEqual(Object.keys(body).sort(), ['p_expected_url', 'p_member', 'p_room']);
            if (beforeJoin) await beforeJoin();
            const { rows } = await asRole(db, 'service_role', tx => tx.query(
              'SELECT public.soe_join_live_council($1,$2,$3) AS joined', [body.p_room, body.p_member, body.p_expected_url],
            ));
            return Response.json(rows[0].joined);
          }
          try {
            assert(['GET', 'PATCH'].includes(request.method));
            const { args, query } = toSql(url, request.method === 'PATCH' ? await request.json() : null);
            const { rows } = await asRole(db, 'service_role', tx => tx.query(query, args));
            if (request.headers.get('accept')?.includes('vnd.pgrst.object')) {
              if (rows.length === 0) return Response.json({
                code: 'PGRST116', details: 'The result contains 0 rows',
                message: 'Cannot coerce the result to a single JSON object',
              }, { status: 406 });
              assert.equal(rows.length, 1);
              return Response.json(rows[0]);
            }
            return Response.json(rows);
          } catch (error) {
            console.error('Synthetic room transport:', error);
            throw error;
          }
        },
      },
    });
    app.setMock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => client }));
    const list = app.load('app/api/live/route.ts');
    const action = app.load('app/api/live/[sessionId]/route.ts');
    const rooms = app.load('app/api/rooms/route.ts');
    const room = app.load('app/api/rooms/[roomId]/route.ts');
    return { db, calls, list, action, rooms, room, onJoin: hook => { beforeJoin = hook; } };
  } catch (error) {
    await db.close();
    throw error;
  }
}
