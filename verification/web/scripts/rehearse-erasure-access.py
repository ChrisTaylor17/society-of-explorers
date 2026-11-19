"""Prove the account erasure access step and identity races on local PostgreSQL."""
from contextlib import contextmanager
import hashlib
import importlib.util
import json
import os
import runpy
from pathlib import Path
import select
import subprocess
import sys
from tempfile import TemporaryDirectory
import time

spec = importlib.util.spec_from_file_location(
    'local_restore', Path(__file__).with_name('rehearse-native-core-restore.py'))
local = importlib.util.module_from_spec(spec)
spec.loader.exec_module(local)
SQL = local.ROOT / 'docs/sql/account-erasure-access-apply.sql'
QUEUE = local.ROOT / 'docs/sql/account-deletion-requests-apply.sql'
SOURCE, RESTORE = 'soe_erasure_access', 'soe_erasure_restore'
A, B, C = [f'00000000-0000-4000-8000-{n:012d}' for n in (1, 2, 3)]
M, OTHER = [f'00000000-0000-4000-8000-{n:012d}' for n in (4, 5)]
REQUESTS = [f'11111111-1111-4111-8111-{n:012d}' for n in (1, 2, 3)]
DIGEST = hashlib.sha256(bytes([3]) * 32).hexdigest()
ADDRESS = '0x0000000000000000000000000000000000000009'


def start_request(request, auth, member=None):
    member = 'NULL' if member is None else f"'{member}'"
    return f"SELECT soe_account_deletion_private.start_erasure('{request}',{member},'{auth}');"


def role_query(cluster, sql, *, db=SOURCE, role='service_role', sqlstate=None):
    return cluster.query(db, f'SET ROLE {role}; {sql}', sqlstate=sqlstate)


def terminate(process):
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=3)


@contextmanager
def psql(cluster, command=None, application_name='soe_erasure_holder'):
    args = [str(local.BIN / 'psql'), *map(str, cluster.psql(SOURCE))]
    if command is not None:
        args.extend(['-c', command])
    process = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                               env={**local.ENV, 'PGAPPNAME': application_name})
    try:
        yield process
    finally:
        terminate(process)
        for stream in (process.stdin, process.stdout, process.stderr):
            stream.close()


def send(process, statement):
    process.stdin.write(statement + '\n')
    process.stdin.flush()


def read_ready(process):
    assert select.select([process.stdout], [], [], 5)[0], 'Fixture statement never reached its marker'
    output = process.stdout.readline().strip()
    assert output, 'Fixture statement stopped before its marker'
    return output


def confirm_lock_wait(cluster, contender):
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        waiting = cluster.query(SOURCE, """
          SELECT EXISTS (SELECT 1 FROM pg_stat_activity
          WHERE application_name='soe_erasure_contender' AND datname=current_database()
            AND wait_event_type='Lock')
        """)
        if waiting == 't':
            return
        assert contender.poll() is None, 'Contending write finished before the lock wait'
        time.sleep(0.03)
    raise AssertionError('The independent PostgreSQL session did not wait on the identity gate')


def race(cluster, held_sql, contender_sql, expected_code):
    with psql(cluster) as holder:
        send(holder, 'BEGIN; ' + held_sql)
        assert read_ready(holder)
        with psql(cluster, contender_sql, 'soe_erasure_contender') as contender:
            confirm_lock_wait(cluster, contender)
            send(holder, 'COMMIT;\n\\q')
            _, error = holder.communicate(timeout=5)
            assert holder.returncode == 0, error
            _, error = contender.communicate(timeout=5)
            assert contender.returncode != 0 and f'ERROR:  {expected_code}:' in error, error


def main():
    checks = []
    with TemporaryDirectory(prefix='soe-erasure-pg-', dir='/private/tmp') as directory:
        temp = Path(directory)
        cluster = local.Cluster(temp / 'cluster', local.OWNER)
        for tool in local.TOOLS:
            local.digest((local.BIN / tool).resolve())
        try:
            cluster.start()
            cluster.query('postgres', 'CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;')
            cluster.query('postgres', f'CREATE DATABASE {SOURCE}')
            cluster.query(SOURCE, """
              CREATE TABLE public.members(id uuid PRIMARY KEY, supabase_auth_id uuid UNIQUE, wallet_address text);
              GRANT SELECT, INSERT, UPDATE, DELETE ON public.members TO service_role;
            """)
            cluster.file(SOURCE, QUEUE)
            cluster.file(SOURCE, SQL)
            for subject, request in zip((A, B, C), REQUESTS):
                assert role_query(cluster, f"SELECT id FROM public.soe_account_deletion_request('supabase','{subject}','{request}','{DIGEST}',4)") == request

            race(cluster, start_request(REQUESTS[0], A),
                 f"SET ROLE service_role; INSERT INTO members VALUES ('{M}','{A}',NULL);", 'PT403')
            assert cluster.query(SOURCE, f"SELECT count(*) FROM members WHERE supabase_auth_id='{A}'") == '0'
            checks.append('A new member write waits for erasure to start, then refuses the frozen subject.')

            race(cluster, f"SET LOCAL ROLE service_role; INSERT INTO members VALUES ('{M}','{B}','{ADDRESS}') RETURNING id;",
                 start_request(REQUESTS[1], B), 'PT409')
            assert role_query(cluster, f"SELECT public.soe_account_erasure_access_allowed('supabase','{B}')") == 't'
            started = cluster.query(SOURCE, start_request(REQUESTS[1], B, M))
            assert cluster.query(SOURCE, start_request(REQUESTS[1], B, M)) == started
            assert role_query(cluster, f"SELECT public.soe_account_erasure_access_allowed('wallet','{M}')") == 'f'
            checks.append('Erasure waits for an ongoing member write and rejects the old review; fresh linked-account review starts one operation.')

            with psql(cluster) as stale:
                send(stale, 'BEGIN ISOLATION LEVEL REPEATABLE READ; SET LOCAL ROLE service_role; SELECT count(*) FROM members;')
                assert read_ready(stale) == '1'
                assert cluster.query(SOURCE, start_request(REQUESTS[2], C))
                send(stale, f"INSERT INTO members VALUES ('{OTHER}','{C}',NULL);")
                _, error = stale.communicate(timeout=5)
                assert stale.returncode != 0 and 'ERROR:  40001:' in error, error
            role_query(cluster, f"INSERT INTO members VALUES ('{OTHER}','{C}',NULL);", sqlstate='PT403')
            checks.append('A repeatable-read writer with an old snapshot must retry and then sees the active guard.')

            # Remove only the synthetic member row to prove the wallet digest survives it.
            cluster.query(SOURCE, f"DELETE FROM members WHERE id='{M}'")
            role_query(cluster, f"INSERT INTO members VALUES ('{OTHER}',NULL,'{ADDRESS}');", sqlstate='PT403')
            dump = temp / 'erasure-access.dump'
            cluster.dump(SOURCE, dump)
            cluster.restore(RESTORE, dump)
            assert cluster.query(RESTORE, 'SELECT revision FROM soe_account_deletion_private.identity_gate') == '3'
            for subject, request in zip((A, B, C), REQUESTS):
                assert role_query(cluster, f"SELECT public.soe_account_erasure_access_allowed('supabase','{subject}')", db=RESTORE) == 'f'
                assert role_query(cluster, f"SELECT id FROM public.soe_account_deletion_status('{request}','{DIGEST}')", db=RESTORE) == request
            role_query(cluster, f"INSERT INTO members VALUES ('{OTHER}',NULL,'{ADDRESS}');", db=RESTORE, sqlstate='PT403')
            role_query(cluster, f"INSERT INTO members VALUES ('{OTHER}',NULL,NULL);", db=RESTORE)
            role_query(cluster, start_request(REQUESTS[0], A), db=RESTORE, sqlstate='42501')
            role_query(cluster, 'SELECT * FROM soe_account_deletion_private.processing;', db=RESTORE, sqlstate='42501')
            checks.append('A separate database restored from the archive keeps the receipt and denies identity recreation while unrelated setup still works.')
        finally:
            cluster.stop()
    print(json.dumps({
        'status': 'PASS', 'checks': checks, 'cleanup': 'cluster stopped and fixture removed',
        'sqlSha256': local.digest(SQL), 'scope': 'Local PostgreSQL 17, independent sessions over a private Unix socket and synthetic accounts.',
    }, indent=2))


def full_release():
    release = runpy.run_path(str(Path(__file__).with_name('test-circle-release-restore.py')))
    harness = runpy.run_path(str(release['RESTORE_TEST']))
    kit, checker = (runpy.run_path(str(harness[name])) for name in ('CORE_REHEARSAL', 'CHECKER'))
    owner, database = kit['OWNER'], kit['SOURCE_DB']
    result = {'checks': [], 'productionRestoreVerified': False}
    with TemporaryDirectory(prefix='soe-erasure-chain-', dir='/private/tmp') as directory:
        temp = Path(directory)
        original, staged = [kit['Cluster'](temp / name, owner) for name in ('original', 'staged')]
        try:
            subprocess.run(['/opt/homebrew/bin/node', '--require', str(release['NETWORK_GUARD']),
                            str(release['EXPORT_FIXTURE']), str(temp)],
                           env=kit['ENV'], cwd=local.ROOT, check=True, timeout=20, stdout=subprocess.DEVNULL)
            result['fixture'] = json.loads((temp / 'inputs.json').read_bytes())
            original.start()
            staged.start()
            release['stage_restored_release'](original, staged, database, temp, harness, kit, checker, result)
            assert len(result['orderedMigrationFiles']) == 48
            release['seed_circle'](lambda statement: staged.query(database, statement),
                                   lambda action, *args, **kwargs: release['invoke'](staged, database, owner, action, *args, **kwargs))
            snapshots = (
                "SELECT md5(jsonb_agg(to_jsonb(m) ORDER BY m.id)::text) FROM public.members m",
                "SELECT md5(jsonb_agg(to_jsonb(m) ORDER BY m.id)::text) FROM public.seminar_messages m",
                "SELECT md5(jsonb_agg(to_jsonb(m) ORDER BY m.id)::text) FROM auth.users m",
            )
            before = [staged.query(database, statement) for statement in snapshots]
            assert all(len(value) == 32 for value in before)
            for path in (QUEUE, SQL):
                kit['run']('psql', *staged.psql(database), '-c', 'SET ROLE postgres', '-f', path)
                result['orderedMigrationFiles'].append(str(path.relative_to(local.ROOT)))
            assert [staged.query(database, statement) for statement in snapshots] == before

            def service(statement):
                return staged.query(database, 'SET ROLE service_role; ' + statement)

            host, reader = release['HOST'], release['READER']
            subject, reader_subject = harness['AUTH_SUBJECT'], harness['SECOND_AUTH_SUBJECT']
            request = REQUESTS[0]
            assert service(f"SELECT id FROM public.soe_account_deletion_request('supabase','{subject}','{request}','{DIGEST}',4)") == request
            assert staged.query(database, 'SET ROLE postgres; ' + start_request(request, subject, host))
            assert service(f"SELECT public.soe_account_erasure_access_allowed('supabase','{subject}')") == 'f'
            assert service(f"SELECT public.soe_account_erasure_access_allowed('supabase','{reader_subject}')") == 't'
            assert service(f"SELECT public.soe_account_erasure_access_allowed('wallet','{host}')") == 'f'
            assert service(f"SELECT public.soe_account_erasure_access_allowed('wallet','{reader}')") == 't'
            assert service(f"SELECT id FROM public.soe_account_deletion_status('{request}','{DIGEST}')") == request
            assert [staged.query(database, statement) for statement in snapshots] == before
            result['checks'].append('The two deletion drafts install after the 48-file release. A reviewed request denies its linked identity, preserves the other member and leaves Auth, member and shared messages untouched.')
        finally:
            try:
                staged.stop()
            finally:
                original.stop()
    result.update(status='PASS', clustersStopped=True, temporaryDirectoryRemoved=True, sqlSha256=local.digest(SQL))
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    os.umask(0o077)
    if sys.argv[1:] == ['--full-release']:
        full_release()
    else:
        assert not sys.argv[1:]
        main()
