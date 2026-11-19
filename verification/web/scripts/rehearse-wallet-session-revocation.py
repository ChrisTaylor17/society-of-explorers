"""Exercise the revocation draft and a restore in disposable socket-only PostgreSQL."""
import json
from pathlib import Path
import runpy
import select
import subprocess
from tempfile import TemporaryDirectory
import time


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
PG = runpy.run_path(str(HERE / 'rehearse-native-core-restore.py'))
CHALLENGE = ROOT / 'docs/sql/wallet-challenge-consumption-apply.sql'
DRAFT = ROOT / 'docs/sql/wallet-session-revocation-apply.sql'
DB = 'postgres'
TABLE = 'soe_wallet_private.revoked_sessions'
SERVICE = 'SET ROLE service_role; '


def access(digest, expiry, revoke=False):
    return f"SELECT public.soe_wallet_session_access('{digest}', {expiry}, {str(revoke).lower()});"


def revoke_concurrently(cluster, statement):
    command = [str(PG['BIN'] / 'psql'), *cluster.psql(DB)]
    first = subprocess.Popen(command, env=PG['ENV'], stdin=subprocess.PIPE,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    second = None
    try:
        print('BEGIN;', 'SET LOCAL ROLE service_role;', statement, sep='\n', file=first.stdin, flush=True)
        assert select.select([first.stdout], [], [], 2)[0], 'First revocation did not reach the hold'
        assert first.stdout.readline().strip() == 't'
        second = subprocess.Popen([*command, '-c', SERVICE + statement],
                                  env={**PG['ENV'], 'PGAPPNAME': 'soe_revoke_contender'},
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        deadline = time.monotonic() + 1.5
        while time.monotonic() < deadline:
            if cluster.query(DB, """SELECT EXISTS (
                SELECT 1 FROM pg_stat_activity WHERE application_name = 'soe_revoke_contender'
                AND cardinality(pg_blocking_pids(pid)) > 0
            )""") == 't':
                break
            time.sleep(0.015)
        else:
            raise AssertionError('Concurrent revocation did not wait for the uncommitted row')
        _, err = first.communicate('COMMIT;\n', timeout=5)
        assert first.returncode == 0, err
        out, err = second.communicate(timeout=5)
        assert second.returncode == 0 and out.strip() == 't', (out, err)
    finally:
        for process in (first, second):
            if process is not None:
                if process.poll() is None:
                    process.kill()
                process.wait(timeout=5)


def verify(cluster, backup):
    cluster.start()
    cluster.query(DB, 'CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;')
    cluster.file(DB, DRAFT, sqlstate='P0001')
    cluster.file(DB, CHALLENGE)
    cluster.query(DB, 'GRANT service_role TO anon;')
    cluster.file(DB, DRAFT, sqlstate='P0001')
    assert cluster.query(DB, f"SELECT to_regclass('{TABLE}') IS NULL;") == 't'
    cluster.query(DB, 'REVOKE service_role FROM anon;')
    cluster.file(DB, DRAFT)

    now = int(time.time())
    expiry = now + 3600
    revoked, independent = 'a' * 64, 'b' * 64
    check = access(revoked, expiry)
    revoke = access(revoked, expiry, True)
    for role in ('anon', 'authenticated'):
        for query in (check, revoke):
            cluster.query(DB, f'SET ROLE {role}; ' + query, sqlstate='42501')
    for raw in (f'SELECT * FROM {TABLE};', f'DELETE FROM {TABLE};'):
        cluster.query(DB, SERVICE + raw, sqlstate='42501')
    for value, expires in (('invalid', expiry), (revoked, now - 1), (revoked, now + 90 * 86400 + 60)):
        for flag in (True, False):
            assert cluster.query(DB, SERVICE + access(value, expires, flag)) == 'f'
    assert cluster.query(DB, f'SELECT count(*) FROM {TABLE};') == '0'
    assert cluster.query(DB, SERVICE + check) == 't'
    revoke_concurrently(cluster, revoke)
    assert cluster.query(DB, f'SELECT count(*) FROM {TABLE};') == '1'
    assert cluster.query(DB, SERVICE + check) == 'f'
    assert cluster.query(DB, SERVICE + access(independent, expiry)) == 't'

    stale = now - 7200
    cluster.query(DB, f"""INSERT INTO {TABLE}
        SELECT decode(lpad(to_hex(i), 64, '0'), 'hex'), {stale} FROM generate_series(1, 40) i;
    """)
    assert cluster.query(DB, SERVICE + revoke) == 't'
    assert cluster.query(DB, f'SELECT count(*) FROM {TABLE} WHERE expires_at = {stale};') == '8'
    assert cluster.query(DB, SERVICE + access('0' * 63 + '1', stale)) == 'f'

    cluster.dump(DB, backup)
    restored = 'soe_wallet_restored'
    cluster.restore(restored, backup)
    assert cluster.query(restored, SERVICE + check) == 'f'
    assert cluster.query(restored, SERVICE + access(independent, expiry)) == 't'
    cluster.query(restored, 'SET ROLE anon; ' + revoke, sqlstate='42501')
    return cluster.query(DB, "SELECT current_setting('server_version');")


with TemporaryDirectory(prefix='soe-wallet-session-pg-', dir='/private/tmp') as directory:
    location = Path(directory)
    cluster = PG['Cluster'](location / 'pg', PG['OWNER'])
    try:
        version = verify(cluster, location / 'wallet.dump')
    finally:
        cluster.stop()

print(json.dumps({
    'status': 'passed',
    'postgres': version,
    'migrationSha256': PG['digest'](DRAFT),
    'socketOnly': True,
    'predecessorRequired': True,
    'unsafeRoleInheritanceRolledBack': True,
    'concurrentRevokesPersistOneRow': True,
    'otherWalletCredentialsStillWork': True,
    'browserRpcAndRawServiceAccessRefused': True,
    'invalidAndExpiredCredentialsRefused': True,
    'pruneBatch': 32,
    'restorePreservedRevocationAndPermissions': True,
    'fixtureRemoved': True,
}, indent=2))
