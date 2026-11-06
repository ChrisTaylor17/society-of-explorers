"""Rehearse Live Council room containment on restored synthetic PostgreSQL 17 data."""

import json
import os
from pathlib import Path
import runpy
import select
import shutil
import subprocess
from tempfile import mkdtemp
import time


SCRIPT = Path(__file__).resolve()
ROOT = SCRIPT.parents[3]
HELPER = SCRIPT.with_name('rehearse-native-core-restore.py')
BASELINE = ROOT / 'verification/web/tests/fixtures/live-room-synthetic.sql'
APPLY = ROOT / 'docs/sql/live-room-containment-apply.sql'
ROOM = '30000000-0000-4000-8000-000000000001'
MEMBER = '10000000-0000-4000-8000-000000000002'
LINK = 'https://soe-fixture.daily.co/live-fixture'
JOIN = f"SELECT public.soe_join_live_council('{ROOM}','{MEMBER}','{LINK}')"
TABLES = ('room_participants', 'room_transcripts', 'video_rooms')


def owner_rows(cluster, database):
    return [cluster.query(database, f'SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM public.{table} t')
            for table in TABLES]


def close_then_join(cluster, database, tools):
    command = [str(tools['BIN'] / 'psql'), *map(str, cluster.psql(database))]
    with subprocess.Popen(command, env={**tools['ENV'], 'PGAPPNAME': 'soe_room_closer'},
                          text=True, stdin=subprocess.PIPE, stdout=subprocess.PIPE) as closing:
        try:
            closing.stdin.write("BEGIN; SET LOCAL ROLE service_role; "
                                f"UPDATE public.video_rooms SET is_live=false,ended_at=now() WHERE id='{ROOM}'; "
                                "SELECT 'ready';\n")
            closing.stdin.flush()
            assert select.select([closing.stdout], [], [], 4)[0]
            assert closing.stdout.readline().strip() == 'ready'
            with subprocess.Popen([*command, '-c', 'SET ROLE service_role; ' + JOIN],
                                  env={**tools['ENV'], 'PGAPPNAME': 'soe_room_joiner'},
                                  text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE) as joining:
                try:
                    deadline = time.monotonic() + 3
                    while time.monotonic() < deadline and joining.poll() is None:
                        if cluster.query(database, """
                          SELECT EXISTS (
                            SELECT 1 FROM pg_stat_activity waiter JOIN pg_stat_activity holder
                            ON holder.pid=ANY(pg_blocking_pids(waiter.pid))
                            WHERE waiter.datname=current_database() AND holder.datname=current_database()
                            AND waiter.application_name='soe_room_joiner' AND holder.application_name='soe_room_closer'
                          )
                        """) == 't':
                            break
                        time.sleep(0.025)
                    else:
                        raise AssertionError('The independent join did not wait for the closing room')
                    closing.stdin.write('COMMIT;\n')
                    closing.stdin.close()
                    output, errors = joining.communicate(timeout=5)
                    assert joining.returncode == 0, errors
                    assert output.strip() == 'f', 'A closed session accepted a late join'
                finally:
                    if joining.poll() is None:
                        joining.kill()
                        joining.wait(timeout=5)
        finally:
            if not closing.stdin.closed:
                closing.stdin.close()
            if closing.poll() is None:
                closing.wait(timeout=5)
    assert cluster.query(database, f"SELECT count(*) FROM public.room_participants WHERE room_id='{ROOM}'") == '0'


def verify(cluster, database, checks):
    before = owner_rows(cluster, database)
    assert cluster.query(database, "SET ROLE anon; SELECT count(content) FROM public.room_transcripts") == '1'
    checks.append('A logical restore reproduced the vulnerable grants and synthetic rows.')

    cluster.query(database, 'REVOKE UPDATE ON public.video_rooms FROM service_role')
    cluster.file(database, APPLY, sqlstate='PT409')
    for table in TABLES:
        assert cluster.query(database, f"""
          SELECT NOT relrowsecurity AND has_table_privilege('anon',oid,'SELECT')
          FROM pg_class WHERE oid='public.{table}'::regclass
        """) == 't'
    cluster.query(database, 'GRANT UPDATE ON public.video_rooms TO service_role')
    checks.append('A late service-grant refusal rolled back earlier table changes.')

    cluster.query(database, """
      CREATE VIEW room_inner AS SELECT content FROM room_transcripts;
      CREATE VIEW room_outer AS SELECT content FROM room_inner;
      GRANT SELECT(content) ON room_outer TO anon;
    """)
    cluster.file(database, APPLY, sqlstate='PT409')
    cluster.query(database, 'DROP VIEW room_outer,room_inner')
    checks.append('The draft refused a two-hop browser-readable view.')

    cluster.query(database, 'GRANT SELECT(content) ON public.room_transcripts TO PUBLIC')
    cluster.file(database, APPLY)
    for table in TABLES:
        for role in ('anon', 'authenticated'):
            for operation in (f'SELECT * FROM public.{table}',
                              f'UPDATE public.{table} SET id=id',
                              f'DELETE FROM public.{table}',
                              f'TRUNCATE TABLE public.{table}'):
                cluster.query(database, f'SET ROLE {role}; {operation}', sqlstate='42501')
            assert cluster.query(database, f"""
              SELECT NOT has_table_privilege('{role}','public.{table}','INSERT,MAINTAIN')
                AND NOT has_any_column_privilege('{role}','public.{table}','SELECT,INSERT,UPDATE,REFERENCES')
            """) == 't'
            cluster.query(database, f'SET ROLE {role}; {JOIN}', sqlstate='42501')
        assert cluster.query(database, f"""
          SELECT relrowsecurity FROM pg_class WHERE oid='public.{table}'::regclass
        """) == 't'
    assert cluster.query(database, "SET ROLE anon; SELECT label FROM unrelated_room_catalog") == 'Synthetic public item'
    assert cluster.query(database, "SET ROLE service_role; SELECT count(content) FROM room_transcripts") == '1'
    cluster.query(database, "BEGIN; SET LOCAL ROLE service_role; UPDATE room_transcripts SET content='Updated fixture'; ROLLBACK")
    assert owner_rows(cluster, database) == before
    checks.append('Both browser roles lost table, column and function access; service access, rows and unrelated reads remained.')

    cluster.file(database, APPLY, sqlstate='42723')
    assert owner_rows(cluster, database) == before
    assert cluster.query(database, "SELECT NOT has_table_privilege('anon','public.room_transcripts','SELECT')") == 't'
    checks.append('A duplicate application refused and left the committed boundary intact.')

    assert cluster.query(database, 'SET ROLE service_role; ' + JOIN.replace(LINK, LINK + '-old')) == 'f'
    assert cluster.query(database, 'SET ROLE service_role; ' + JOIN) == 't'
    row = f"FROM public.room_participants WHERE room_id='{ROOM}' AND member_id='{MEMBER}'"
    first = cluster.query(database, 'SELECT joined_at::text ' + row)
    assert cluster.query(database, 'SET ROLE service_role; ' + JOIN) == 't'
    assert cluster.query(database, 'SELECT joined_at::text ' + row) == first
    cluster.query(database, f"UPDATE room_participants SET left_at=now() WHERE room_id='{ROOM}'")
    assert cluster.query(database, 'SET ROLE service_role; ' + JOIN) == 't'
    assert cluster.query(database, 'SELECT left_at IS NULL ' + row) == 't'
    cluster.query(database, f"DELETE FROM room_participants WHERE room_id='{ROOM}'")
    checks.append('The service join refused a stale URL, kept repeated attendance stable and reopened a prior leave.')


def main():
    os.umask(0o077)
    tools = runpy.run_path(str(HELPER))
    source_hashes = {str(file.relative_to(ROOT)): tools['digest'](file) for file in (SCRIPT, HELPER, BASELINE, APPLY)}
    temp = Path(mkdtemp(prefix='soe-live-room-pg-', dir='/private/tmp'))
    cluster = tools['Cluster'](temp / 'cluster', tools['OWNER'])
    checks = []
    postgres = tools['run']('postgres', '--version')
    assert postgres.startswith('postgres (PostgreSQL) 17.')
    try:
        cluster.start()
        cluster.query('postgres', 'CREATE DATABASE soe_room_source')
        cluster.file('soe_room_source', BASELINE)
        archive = temp / 'synthetic.pgcustom'
        cluster.dump('soe_room_source', archive)
        cluster.restore('soe_room_restored', archive)
        assert owner_rows(cluster, 'soe_room_source') == owner_rows(cluster, 'soe_room_restored')
        verify(cluster, 'soe_room_restored', checks)
        close_then_join(cluster, 'soe_room_restored', tools)
        checks.append('An independent join waited for the closing transaction and returned no attendance after it committed.')
    finally:
        cluster.stop()
        shutil.rmtree(temp)
    assert all(tools['digest'](ROOT / file) == digest for file, digest in source_hashes.items())
    print(json.dumps({'status': 'PASS', 'postgres': postgres, 'checks': checks, 'sourceSha256': source_hashes,
                      'cleanup': 'private cluster stopped and temporary data removed', 'hostedDatabaseAccess': False},
                     indent=2))


if __name__ == '__main__':
    main()
