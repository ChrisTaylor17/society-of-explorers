"""Exercise the wallet challenge draft on a disposable socket-only PostgreSQL."""
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
DRAFT = ROOT / 'docs/sql/wallet-challenge-consumption-apply.sql'
DB = 'postgres'
RPC = 'public.soe_wallet_challenge_consume'
TABLE = 'soe_wallet_private.used_challenges'


def redeem(digest, expires_at):
    return f"SELECT {RPC}('{digest}', {expires_at});"


def race(cluster, hold, held_result, contender, finish, release_at=None):
    command = [str(PG['BIN'] / 'psql'), *cluster.psql(DB)]
    processes = []
    try:
        first = subprocess.Popen(command, env=PG['ENV'], stdin=subprocess.PIPE,
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        processes.append(first)
        print('BEGIN;', hold, sep='\n', file=first.stdin, flush=True)
        assert select.select([first.stdout], [], [], 2)[0], 'First connection did not reach the hold'
        assert first.stdout.readline().strip() == held_result

        second = subprocess.Popen([*command, '-c', contender],
                                  env={**PG['ENV'], 'PGAPPNAME': 'soe_wallet_contender'},
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        processes.append(second)
        stop = time.monotonic() + 1.5
        while time.monotonic() < stop:
            if cluster.query(DB, """SELECT EXISTS (
                SELECT 1 FROM pg_stat_activity WHERE application_name='soe_wallet_contender'
                AND cardinality(pg_blocking_pids(pid)) > 0
            )""") == 't':
                break
            time.sleep(0.015)
        else:
            raise AssertionError('The independent redemption never waited for the first transaction')

        if release_at is not None:
            time.sleep(max(0, release_at + 0.03 - time.time()))
        out, err = first.communicate(finish + ';\n', timeout=5)
        assert first.returncode == 0 and not out.strip(), err
        out, err = second.communicate(timeout=5)
        assert second.returncode == 0 and out.strip() == 'f', (out, err)
    finally:
        for process in processes:
            if process.poll() is None:
                process.kill()
            process.wait(timeout=5)


def verify(cluster):
    cluster.start()
    cluster.query(DB, 'CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;')
    cluster.query(DB, 'GRANT service_role TO anon;')
    cluster.file(DB, DRAFT, sqlstate='P0001')
    assert cluster.query(DB, "SELECT to_regnamespace('soe_wallet_private') IS NULL;") == 't'
    cluster.query(DB, 'REVOKE service_role FROM anon;')
    cluster.file(DB, DRAFT)
    cluster.file(DB, DRAFT, sqlstate='42P06')
    expires_at = int(time.time()) + 600

    for role in ('anon', 'authenticated'):
        cluster.query(DB, f"SET ROLE {role}; " + redeem('a' * 64, expires_at), sqlstate='42501')
    service = 'SET ROLE service_role; '
    for raw in (f'SELECT * FROM {TABLE};', f'DELETE FROM {TABLE};'):
        cluster.query(DB, service + raw, sqlstate='42501')
    for digest, deadline in (('invalid', expires_at), ('a' * 64, int(time.time()) - 1),
                             ('a' * 64, expires_at + 3600)):
        assert cluster.query(DB, service + redeem(digest, deadline)) == 'f'
    assert cluster.query(DB, f'SELECT count(*) FROM {TABLE};') == '0'

    challenge = redeem('a' * 64, expires_at)
    race(cluster, 'SET LOCAL ROLE service_role; ' + challenge, 't', service + challenge, 'COMMIT')
    assert cluster.query(DB, service + challenge) == 'f'

    expiring = int(time.time()) + 2
    digest = 'b' * 64
    held = f"INSERT INTO {TABLE} VALUES (decode('{digest}', 'hex'), {expiring}); SELECT 'held';"
    race(cluster, held, 'held', service + redeem(digest, expiring), 'ROLLBACK', release_at=expiring)

    cluster.query(DB, f"""INSERT INTO {TABLE}
        SELECT decode(lpad(to_hex(i), 64, '0'), 'hex'), {expires_at - 7200}
        FROM generate_series(1, 40) i;
    """)
    assert cluster.query(DB, service + redeem('c' * 64, expires_at)) == 't'
    assert cluster.query(DB, f'SELECT count(*) FROM {TABLE} WHERE expires_at={expires_at - 7200};') == '8'
    assert cluster.query(DB, service + challenge) == 'f'
    return cluster.query(DB, "SELECT current_setting('server_version');")


with TemporaryDirectory(prefix='soe-wallet-pg-', dir='/private/tmp') as directory:
    cluster = PG['Cluster'](Path(directory) / 'pg', 'soe_fixture_owner')
    try:
        version = verify(cluster)
    finally:
        cluster.stop()

print(json.dumps({
    'status': 'passed',
    'postgres': version,
    'walletDraftSha256': PG['digest'](DRAFT),
    'socketOnly': True,
    'independentLockWaits': 2,
    'oneRedemptionPerChallenge': True,
    'expiryRecheckedAfterLockWait': True,
    'invalidAndExpiredChallengesRefused': True,
    'browserRpcAndRawServiceAccessRefused': True,
    'unsafeRoleInheritanceRolledBack': True,
    'duplicateMigrationRefused': True,
    'pruneBatch': 32,
    'fixtureRemoved': True,
}, indent=2))
