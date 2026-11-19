"""Exercise deletion intake concurrency and restore in an owned PostgreSQL 17 cluster."""
from hashlib import sha256
import importlib.util
import json
from pathlib import Path
import select
import subprocess
from tempfile import TemporaryDirectory
import time

spec = importlib.util.spec_from_file_location(
    'local_restore', Path(__file__).with_name('rehearse-native-core-restore.py'))
local = importlib.util.module_from_spec(spec)
spec.loader.exec_module(local)
SQL = local.ROOT / 'docs/sql/account-deletion-requests-apply.sql'
SOURCE, RESTORED = 'soe_account_deletion', 'soe_account_deletion_restore'
A, B, C = [f'00000000-0000-4000-8000-{n:012d}' for n in (1, 2, 3)]
MEMBER = '00000000-0000-4000-8000-000000000004'
R1, R2, R3, R4, R5 = [f'11111111-1111-4111-8111-{n:012d}' for n in range(1, 6)]
FIRST, SECOND = [sha256(bytes([n]) * 32).hexdigest() for n in (1, 2)]


def submit(provider, actor, request, digest, days=4):
    return f"SELECT id FROM public.soe_account_deletion_request('{provider}','{actor}','{request}','{digest}',{days});"


def as_role(cluster, database, statement, role='service_role', sqlstate=None):
    return cluster.query(database, f'SET ROLE {role}; {statement}', sqlstate=sqlstate)


def overlap(cluster, first, second, expected, replay=False):
    argv = [str(local.BIN / 'psql'), *map(str, cluster.psql(SOURCE))]
    holder = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, text=True, env=local.ENV)
    contender = None
    try:
        holder.stdin.write('BEGIN; SET LOCAL ROLE service_role; ' + first + '\n')
        holder.stdin.flush()
        assert select.select([holder.stdout], [], [], 5)[0], 'The first request never returned'
        assert holder.stdout.readline().strip() == expected
        contender = subprocess.Popen(
            [*argv, '-c', 'SET ROLE service_role; ' + second], text=True,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            env={**local.ENV, 'PGAPPNAME': 'soe_account_deletion_contender'})
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline:
            blocked = cluster.query(SOURCE, """
              SELECT EXISTS (
                SELECT 1 FROM pg_stat_activity
                WHERE application_name='soe_account_deletion_contender'
                  AND wait_event_type='Lock' AND datname=current_database()
              )
            """)
            if blocked == 't':
                break
            assert contender.poll() is None, 'The second request did not serialize'
            time.sleep(0.03)
        else:
            raise AssertionError('No concurrent PostgreSQL lock wait was observed')
        holder.stdin.write('COMMIT;\n\\q\n')
        holder.stdin.flush()
        _, error = holder.communicate(timeout=5)
        assert holder.returncode == 0, error
        out, error = contender.communicate(timeout=5)
        if replay:
            assert contender.returncode == 0 and out.strip() == expected, error
        else:
            assert contender.returncode != 0 and 'ERROR:  PT409:' in error
    finally:
        for process in (holder, contender):
            if process is not None and process.poll() is None:
                process.terminate()
                process.wait(timeout=5)


def main():
    results = []
    with TemporaryDirectory(prefix='soe-deletion-db-', dir='/private/tmp') as scratch:
        temp = Path(scratch)
        cluster = local.Cluster(temp / 'cluster', local.OWNER)
        for tool in local.TOOLS:
            local.digest((local.BIN / tool).resolve())
        try:
            cluster.start()
            cluster.query('postgres', 'CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;')
            cluster.query('postgres', f'CREATE DATABASE {SOURCE}')
            cluster.query(SOURCE, f"""
              CREATE TABLE members (id uuid PRIMARY KEY, supabase_auth_id uuid UNIQUE, wallet_address text);
              INSERT INTO members VALUES ('{MEMBER}', '{C}', '0x0000000000000000000000000000000000000001');
            """)
            cluster.file(SOURCE, SQL)
            overlap(cluster, submit('supabase', A, R1, FIRST), submit('supabase', A, R1, FIRST), R1, replay=True)
            results.append('Two concurrent exact retries for a provider-only account return the same receipt.')
            overlap(cluster, submit('supabase', B, R2, FIRST), submit('supabase', B, R3, SECOND), R2)
            results.append('Two different codes for the same provider-only account record one request.')
            overlap(cluster, submit('wallet', MEMBER, R4, FIRST), submit('supabase', C, R5, SECOND), R4)
            results.append('Linked wallet and Supabase submissions serialize and leave one shared request.')
            assert cluster.query(SOURCE, 'SELECT count(*) FROM soe_account_deletion_private.requests') == '3'
            archive = temp / 'synthetic-deletion.dump'
            cluster.dump(SOURCE, archive)
            cluster.restore(RESTORED, archive)
            for provider, actor, request in [('supabase', A, R1), ('supabase', B, R2), ('wallet', MEMBER, R4), ('supabase', C, R4)]:
                lookup = f"SELECT * FROM public.soe_account_deletion_owner_state('{provider}','{actor}')"
                received = as_role(cluster, RESTORED, lookup)
                assert received.startswith(request + '|') and received == as_role(cluster, SOURCE, lookup)
                assert as_role(cluster, RESTORED, f"SELECT * FROM public.soe_account_deletion_status('{request}','{FIRST}')") == received
                assert not as_role(cluster, RESTORED, f"SELECT id FROM public.soe_account_deletion_status('{request}','{SECOND}')")
            for role in ('anon', 'authenticated'):
                as_role(cluster, RESTORED, 'SELECT * FROM public.soe_account_deletion_status(NULL,NULL)', role, '42501')
            as_role(cluster, RESTORED, 'SELECT * FROM soe_account_deletion_private.requests', sqlstate='42501')
            assert cluster.query(RESTORED, 'SELECT count(*) FROM public.members') == '1'
            results.append('The archive preserves receipts and their access boundaries without creating members.')
        finally:
            cluster.stop()
    print(json.dumps({
        'status': 'PASS', 'checks': results, 'cleanup': 'cluster stopped and fixture removed',
        'sqlSha256': local.digest(SQL), 'scope': 'Local PostgreSQL 17, Unix socket only, synthetic data.',
    }, indent=2))


if __name__ == '__main__':
    main()
