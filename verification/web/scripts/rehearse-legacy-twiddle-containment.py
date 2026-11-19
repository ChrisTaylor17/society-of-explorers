"""Test the legacy Twiddle table boundary on a disposable PostgreSQL restore."""
import json
import os
from pathlib import Path
import runpy
from tempfile import TemporaryDirectory

SCRIPT = Path(__file__).resolve()
ROOT = SCRIPT.parents[3]
DRAFT = ROOT / 'docs/sql/legacy-twiddle-data-containment-apply.sql'
FIXTURE = ROOT / 'verification/web/tests/fixtures/legacy-twiddle-synthetic.sql'
TABLES = ('twiddles', 'twiddle_collaborators', 'twiddle_reactions')
BROWSER_ROLES = ('anon', 'authenticated')
DATABASE = 'soe_twiddle'
RESTORED = 'soe_twiddle_restored'


def table_state(query):
    rows = [query(f'SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.{table} t') for table in TABLES]
    names = ','.join(f"'{table}'" for table in TABLES)
    catalog = query(f"""
      SELECT jsonb_agg(jsonb_build_object('table', relname, 'rls', relrowsecurity, 'forced', relforcerowsecurity,
        'policies', (SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p
                     WHERE p.schemaname = 'public' AND p.tablename = c.relname),
        'constraints', (SELECT jsonb_agg(pg_get_constraintdef(oid) ORDER BY conname)
                        FROM pg_constraint WHERE conrelid = c.oid),
        'triggers', (SELECT jsonb_agg(pg_get_triggerdef(oid) ORDER BY tgname)
                     FROM pg_trigger WHERE tgrelid = c.oid AND NOT tgisinternal)) ORDER BY relname)
      FROM pg_class c WHERE relnamespace = 'public'::regnamespace AND relname IN ({names});
    """)
    return rows, catalog


def prove_browser_denied(query):
    count = 0
    for role in BROWSER_ROLES:
        for table in TABLES:
            for sql in (f'SELECT id FROM public.{table}', f'UPDATE public.{table} SET id = id',
                        f'DELETE FROM public.{table}', f'INSERT INTO public.{table}(id) VALUES (gen_random_uuid())'):
                query(sql, role=role, sqlstate='42501')
                count += 1
    query('SELECT content FROM public.twiddles', role='fixture_audit', sqlstate='42501')
    assert query('SELECT count(id) FROM public.twiddles', role='fixture_audit') == '1'
    return count


def exercise(cluster, temp, kit, report):
    def query(sql, *, role='postgres', sqlstate=None, db=DATABASE):
        return cluster.query(db, f'SET ROLE {role}; {sql}', sqlstate=sqlstate)

    def apply(sqlstate=None, role='postgres'):
        kit['run']('psql', *cluster.psql(DATABASE), '-c', f'SET ROLE {role}', '-f', DRAFT, sqlstate=sqlstate)

    cluster.query('postgres', f'CREATE DATABASE {DATABASE}')
    cluster.file(DATABASE, FIXTURE)
    before = table_state(query)
    for role in BROWSER_ROLES:
        for table in TABLES:
            assert query(f'SELECT count(id) FROM public.{table}', role=role) == '1'
        assert query("BEGIN; UPDATE public.twiddles SET content = 'Browser update' RETURNING id; ROLLBACK", role=role)
    assert table_state(query) == before
    report['checks'].append('Both browser roles can read and update the legacy fixture before containment.')

    apply(sqlstate='PT409', role='service_role')
    query('CREATE VIEW public.fixture_twiddle_view AS SELECT content FROM public.twiddles')
    apply(sqlstate='PT409')
    query('DROP VIEW public.fixture_twiddle_view')
    query("CREATE FUNCTION public.fixture_twiddle_rpc() RETURNS SETOF text LANGUAGE sql SECURITY DEFINER "
          "AS 'SELECT content FROM public.twiddles'")
    apply(sqlstate='PT409')
    query('DROP FUNCTION public.fixture_twiddle_rpc()')
    assert table_state(query) == before
    report['checks'].append('A non-owner, dependent view or browser-callable definer routine prevents apply.')

    cluster.query(DATABASE, 'GRANT fixture_audit TO authenticated')
    apply(sqlstate='PT409')
    cluster.query(DATABASE, 'REVOKE fixture_audit FROM authenticated')
    query('REVOKE DELETE ON public.twiddle_reactions FROM service_role')
    apply(sqlstate='PT409')
    query('GRANT DELETE ON public.twiddle_reactions TO service_role')
    for role in BROWSER_ROLES:
        assert query('SELECT count(id) FROM public.twiddles', role=role) == '1'
        assert query('SELECT count(id) FROM public.twiddle_reactions', role=role) == '1'
    report['checks'].append('Role inheritance or a missing service permission refuses the full transaction.')

    apply()
    assert table_state(query) == before
    report['browserDenials'] = prove_browser_denied(query)
    report['checks'].append('Table and column browser grants are removed while rows, constraints and policies match.')
    for table in TABLES:
        assert query(f'SELECT count(id) FROM public.{table}', role='service_role') == '1'
        created = query(f'INSERT INTO public.{table}(id) VALUES (gen_random_uuid()) RETURNING id', role='service_role')
        assert query(f"UPDATE public.{table} SET id = id WHERE id = '{created}' RETURNING id", role='service_role') == created
        assert query(f"DELETE FROM public.{table} WHERE id = '{created}' RETURNING id", role='service_role') == created
    apply()
    assert table_state(query) == before
    report['checks'].append('Service-role create, read, update and delete work. Reapplying keeps the boundary.')

    contained = table_state(query)
    archive = temp / 'contained.dump'
    cluster.dump(DATABASE, archive)
    cluster.restore(RESTORED, archive)

    def restored_query(sql, **kwargs):
        return query(sql, db=RESTORED, **kwargs)

    assert table_state(restored_query) == contained
    assert prove_browser_denied(restored_query) == report['browserDenials']
    report['checks'].append('An isolated logical restore keeps the contained access rules and every remaining row.')


def main():
    os.umask(0o077)
    kit = runpy.run_path(str(SCRIPT.with_name('rehearse-native-core-restore.py')))
    report = {'checks': [], 'productionApplied': False, 'legacyHttpRoutesChanged': False}
    with TemporaryDirectory(prefix='soe-twiddle-containment-', dir='/private/tmp') as directory:
        temp = Path(directory)
        cluster = kit['Cluster'](temp / 'db', kit['OWNER'])
        try:
            cluster.start()
            exercise(cluster, temp, kit, report)
        finally:
            cluster.stop()
    report.update(status='PASS', clusterStopped=True, temporaryDirectoryRemoved=True,
                  draftSha256=kit['digest'](DRAFT), fixtureSha256=kit['digest'](FIXTURE))
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
