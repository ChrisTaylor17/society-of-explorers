import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { participationApp, IDS } from './support/participation-app.mjs';
import { rpc, asRole, requestId, creationInput } from './support/participation-db.mjs';

const sql = name => readFile(new URL('../../../docs/sql/' + name, import.meta.url), 'utf8');
const denied = code => error => error.code === code;
const input = { bookId: 'apology', title: 'Fictional book salon', description: null, maxMembers: 8, startDate: null, thinkerId: 'socrates' };

test('ordinary salon creation is atomic and retry-safe under admission restrictions', async t => {
  const f = await participationApp(), { db } = f;
  try {
    await db.exec('ALTER TABLE members ADD COLUMN supabase_auth_id uuid, ADD COLUMN wallet_address text;');
    for (const name of ['account-deletion-requests-apply.sql', 'account-erasure-access-apply.sql', 'circle-admission-apply.sql']) await db.exec(await sql(name));
    await db.exec(await sql('book-salon-creation-preflight.sql'));
    // Existing default grants to a custom role must not escape the service boundary.
    await db.exec(`CREATE ROLE salon_fixture_reader;
      ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO salon_fixture_reader;
      ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO salon_fixture_reader;`);
    await db.exec(await sql('book-salon-creation-apply.sql'));
    const counts = async () => (await db.query(`SELECT
      (SELECT count(*)::int FROM book_cohorts) AS salons,
      (SELECT count(*)::int FROM book_cohort_members) AS memberships,
      (SELECT count(*)::int FROM soe_book_salons_private.creation_receipts) AS receipts`)).rows[0];
    const create = (actor = IDS.host, key = requestId(), body = input, role = 'service_role') => rpc(db, 'soe_circle_legacy_salon_create', [actor, key, body], role);
    const request = (overrides = {}) => ({ ...input, requestId: requestId(), expectedMemberId: IDS.host, ...overrides });
    let made, key, originalStart;

    await t.test('real route creates the salon and exactly one verified creator membership', async () => {
      const before = await counts(); key = requestId();
      const res = await f.dispatch('/api/book-salons', 'POST', request({ requestId: key, memberId: IDS.reader }));
      assert.equal(res.status, 200); made = await res.json();
      assert.equal(made.cohort.created_by, IDS.host); assert.equal(made.creatorJoined, true); assert.equal(made.replayed, false);
      assert.equal(made.requestId, key); assert.match(res.headers.get('cache-control'), /private.*no-store/);
      assert.deepEqual(await counts(), { salons: before.salons + 1, memberships: before.memberships + 1, receipts: before.receipts + 1 });
      assert.deepEqual((await db.query('SELECT member_id FROM book_cohort_members WHERE cohort_id=$1', [made.cohort.id])).rows, [{ member_id: IDS.host }]);
      originalStart = (await db.query('SELECT start_date FROM book_cohorts WHERE id=$1', [made.cohort.id])).rows[0].start_date;
      assert.equal(f.calls.some(x => x.mode === 'insert'), false);
    });
    await t.test('lost-reply retries use one receipt and preserve the first generated date', async () => {
      const before = await counts();
      const attempts = await Promise.all([create(IDS.host, key), create(IDS.host, key)]);
      for (const result of attempts) { assert.equal(result.cohort.id, made.cohort.id); assert.equal(result.replayed, true); }
      assert.deepEqual(await counts(), before);
      assert.deepEqual((await db.query('SELECT start_date FROM book_cohorts WHERE id=$1', [made.cohort.id])).rows[0].start_date, originalStart);
      const hash = (await db.query('SELECT octet_length(input_hash) n FROM soe_book_salons_private.creation_receipts WHERE request_id=$1', [key])).rows[0].n;
      assert.equal(hash, 32);
    });
    await t.test('a retry key cannot change details or borrow another actor receipt', async () => {
      const before = await counts();
      await assert.rejects(create(IDS.host, key, { ...input, title: 'A changed request' }), denied('PT409'));
      assert.deepEqual(await counts(), before);
      const other = await create(IDS.reader, key); assert.notEqual(other.cohort.id, made.cohort.id);
      assert.equal(other.cohort.created_by, IDS.reader); assert.equal(other.replayed, false);
    });
    await t.test('membership insertion failure rolls back the salon and receipt', async () => {
      const before = await counts(); const attempt = request();
      await db.exec(`CREATE FUNCTION public.salon_fixture_deny() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Synthetic failure'; END $$;
        CREATE TRIGGER salon_fixture_deny BEFORE INSERT ON book_cohort_members FOR EACH ROW EXECUTE FUNCTION public.salon_fixture_deny();`);
      try { const res = await f.dispatch('/api/book-salons', 'POST', attempt); assert.equal(res.status, 503); assert.deepEqual(await counts(), before); }
      finally { await db.exec('DROP TRIGGER salon_fixture_deny ON book_cohort_members;'); }
      const retry = await f.dispatch('/api/book-salons', 'POST', attempt); assert.equal(retry.status, 200); assert.equal((await retry.json()).replayed, false);
    });
    await t.test('receipt insertion failure rolls back both salon and membership', async () => {
      const before = await counts();
      await db.exec('CREATE TRIGGER salon_fixture_deny BEFORE INSERT ON soe_book_salons_private.creation_receipts FOR EACH ROW EXECUTE FUNCTION public.salon_fixture_deny();');
      try { await assert.rejects(create(), denied('42501')); assert.deepEqual(await counts(), before); }
      finally { await db.exec('DROP TRIGGER salon_fixture_deny ON soe_book_salons_private.creation_receipts;'); }
    });
    await t.test('silently skipped inserts cannot produce a success or half-created salon', async () => {
      await db.exec('CREATE FUNCTION public.salon_fixture_skip() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;');
      for (const table of ['public.book_cohorts', 'public.book_cohort_members', 'soe_book_salons_private.creation_receipts']) {
        const before = await counts();
        await db.exec(`CREATE TRIGGER salon_fixture_skip BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION public.salon_fixture_skip();`);
        try { await assert.rejects(create(), denied('PT503')); assert.deepEqual(await counts(), before); }
        finally { await db.exec(`DROP TRIGGER salon_fixture_skip ON ${table};`); }
      }
    });
    await t.test('browser roles and inherited default-grant recipients cannot execute or read receipts', async () => {
      for (const role of ['anon', 'authenticated']) {
        await assert.rejects(create(IDS.host, requestId(), input, role), denied('42501'));
        await assert.rejects(asRole(db, role, tx => tx.query('SELECT * FROM soe_book_salons_private.creation_receipts')), denied('42501'));
      }
      for (const query of ['SELECT public.soe_circle_legacy_salon_create($1,$2,$3)', 'SELECT * FROM soe_book_salons_private.creation_receipts']) {
        await assert.rejects(db.transaction(async tx => {
          await tx.exec('SET LOCAL ROLE salon_fixture_reader');
          return tx.query(query, query.includes('$1') ? [IDS.host, requestId(), input] : []);
        }), denied('42501'));
      }
      await assert.rejects(asRole(db, 'service_role', tx => tx.query('SELECT * FROM soe_book_salons_private.creation_receipts')), denied('42501'));
      await assert.rejects(asRole(db, 'service_role', tx => tx.query('INSERT INTO book_cohort_members(cohort_id,member_id) VALUES($1,$2)', [made.cohort.id, IDS.newcomer])), denied('42501'));
      const boundary = (await db.query(`SELECT n.nspname,p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE p.proname IN('soe_circle_legacy_salon_create','create_salon') ORDER BY n.nspname`)).rows;
      assert.deepEqual(boundary.map(x => [x.nspname, x.prosecdef, x.proconfig]), [['public', false, ['search_path=pg_catalog']], ['soe_book_salons_private', true, ['search_path=pg_catalog']]]);
    });
    await t.test('ordinary creation rejects Circle identifiers and malformed direct SQL inputs', async () => {
      const before = await counts();
      for (const body of [null, {}, { ...input, bookId: 'soe-circles-path' }, { ...input, memberId: IDS.reader }, { ...input, maxMembers: 50 }, { ...input, startDate: '2026-02-31T00:00:00.000Z' }, { ...input, title: '' }]) {
        await assert.rejects(create(IDS.host, requestId(), body), denied('PT400'));
      }
      await assert.rejects(create(IDS.host, null), denied('PT400'));
      await assert.rejects(create(null), denied('PT403'));
      assert.deepEqual(await counts(), before);
    });
    await t.test('route refuses changed accounts, invalid dates and absent identity before an RPC', async () => {
      for (const [body, status] of [[request({ expectedMemberId: IDS.reader }), 409], [request({ startDate: '2026-02-31' }), 400], [request({ requestId: null }), 400], [request({ bookId: 'soe-circles-path' }), 400]]) {
        const before = f.calls.length, response = await f.dispatch('/api/book-salons', 'POST', body);
        assert.equal(response.status, status); assert.equal(f.calls.length, before);
      }
      f.setActor(null);
      assert.equal((await f.dispatch('/api/book-salons', 'POST', request())).status, 401);
      f.setActor(IDS.host);
    });
    await t.test('missing or malformed database confirmation never returns success', async () => {
      const real = f.admin.rpc;
      try {
        for (const data of [null, { ...made, creatorJoined: false }, { ...made, cohort: { ...made.cohort, created_by: IDS.reader } }, { ...made, requestId: requestId() }]) {
          f.admin.rpc = async () => ({ data, error: null });
          assert.equal((await f.dispatch('/api/book-salons', 'POST', request({ requestId: key }))).status, 503);
        }
        f.admin.rpc = async () => ({ data: null, error: { code: 'PGRST202', message: 'Synthetic missing function' } });
        assert.equal((await f.dispatch('/api/book-salons', 'POST', request())).status, 503);
      } finally { f.admin.rpc = real; }
    });
    await t.test('a replay does not restore a removed creator membership or deleted salon', async () => {
      await db.query('DELETE FROM book_cohort_members WHERE cohort_id=$1 AND member_id=$2', [made.cohort.id, IDS.host]);
      let before = await counts(); await assert.rejects(create(IDS.host, key), denied('PT409')); assert.deepEqual(await counts(), before);
      await db.query('DELETE FROM book_cohorts WHERE id=$1', [made.cohort.id]);
      before = await counts(); await assert.rejects(create(IDS.host, key), denied('PT410')); assert.deepEqual(await counts(), before);
    });
    await t.test('account-removal guard blocks creation and receipt replay', async () => {
      const actor = IDS.reader, before = await counts(), removal = requestId();
      await db.query(`INSERT INTO soe_account_deletion_private.requests(request_id,member_id,receipt_hash,requested_at,review_by)
        VALUES($1,$2,decode($3,'hex'),clock_timestamp(),clock_timestamp()+interval '7 days')`, [removal, actor, 'a'.repeat(64)]);
      await db.query('INSERT INTO soe_account_deletion_private.processing(request_id,member_id) VALUES($1,$2)', [removal, actor]);
      for (const id of [key, requestId()]) await assert.rejects(create(actor, id), denied('PT403'));
      assert.deepEqual(await counts(), before);
    });
    await t.test('existing Circle creation still uses its separate controlled flow', async () => {
      const result = await rpc(db, 'soe_circle_create', [IDS.newcomer, requestId(), await creationInput(db)]);
      assert.equal(result.receipt.action, 'create'); assert.equal(result.state.isMember, true);
    });
    await t.test('synthetic member deletion removes its private receipt and prevents reuse', async () => {
      const actor = IDS.newcomer2, id = requestId(); await create(actor, id);
      assert.equal((await db.query('SELECT count(*)::int n FROM soe_book_salons_private.creation_receipts WHERE actor_member_id=$1', [actor])).rows[0].n, 1);
      await db.query('DELETE FROM public.members WHERE id=$1', [actor]);
      assert.equal((await db.query('SELECT count(*)::int n FROM soe_book_salons_private.creation_receipts WHERE actor_member_id=$1', [actor])).rows[0].n, 0);
      await assert.rejects(create(actor, id), denied('PT403'));
    });
    await t.test('disable candidate preserves data and refuses further service creation', async () => {
      const before = await counts(); await db.exec(await sql('book-salon-creation-disable.sql'));
      await assert.rejects(create(), denied('42501')); assert.deepEqual(await counts(), before);
    });
  } finally { await f.close(); }
});
