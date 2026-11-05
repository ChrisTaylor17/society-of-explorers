"""Check the salon SQL on independent local PostgreSQL connections."""
import argparse
import importlib.util
import json
import signal
import subprocess
import tempfile
import time
from pathlib import Path

spec = importlib.util.spec_from_file_location('restore_fixture', Path(__file__).with_name('rehearse-native-core-restore.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
DB = 'postgres'
CIRCLE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
ALICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
BOB = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
ALICE_SEAT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
BOB_SEAT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
OTHER_SEAT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3'
SQL = fixture.ROOT / 'docs/sql/circle-salon-presence-apply.sql'


def call(actor, seat, action):
    return f"SELECT public.soe_circle_salon_presence('{actor}', '{CIRCLE}', '{seat}', '{action}');"


def run(cluster, results):
    def query(sql, state=None):
        return cluster.query(DB, sql, sqlstate=state)

    def service(actor, seat, action, state=None):
        raw = query('SET ROLE service_role; ' + call(actor, seat, action), state)
        return json.loads(raw) if not state else None

    query(f"""
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role BYPASSRLS;
      ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
      CREATE TABLE book_cohorts(id uuid PRIMARY KEY, book_id text, status text, circle_hidden boolean, circle_format text);
      CREATE TABLE book_cohort_members(id uuid DEFAULT gen_random_uuid() PRIMARY KEY, cohort_id uuid REFERENCES book_cohorts, member_id uuid, UNIQUE(cohort_id, member_id));
      REVOKE ALL ON book_cohorts, book_cohort_members FROM anon, authenticated, service_role;
      GRANT SELECT, UPDATE(id) ON book_cohorts, book_cohort_members TO service_role;
      INSERT INTO book_cohorts VALUES ('{CIRCLE}', 'soe-circles-path', 'forming', false, 'online');
      INSERT INTO book_cohort_members(cohort_id, member_id) VALUES ('{CIRCLE}', '{ALICE}'), ('{CIRCLE}', '{BOB}');
    """)
    cluster.file(DB, SQL)
    args = [str(fixture.BIN / 'psql'), *map(str, cluster.psql(DB))]

    def wait_for(condition):
        until = time.monotonic() + 1.5
        while time.monotonic() < until:
            if query(condition) == 't':
                return
            time.sleep(.025)
        raise AssertionError('Expected independent PostgreSQL connection state was absent')

    def overlap(hold, contender, error, independent=None):
        with subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                              env={**fixture.ENV, 'PGAPPNAME': 'soe_salon_holder'}) as holder:
            worker = None
            try:
                holder.stdin.write('BEGIN; ' + hold + '\n')
                holder.stdin.flush()
                wait_for("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='soe_salon_holder' AND state='idle in transaction')")
                if independent:
                    independent()
                worker = subprocess.Popen([*args, '-c', 'SET ROLE service_role; ' + contender],
                                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                          env={**fixture.ENV, 'PGAPPNAME': 'soe_salon_contender'})
                wait_for("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='soe_salon_contender' AND wait_event_type='Lock')")
                holder.stdin.write('COMMIT;\n')
                _, hold_error = holder.communicate(timeout=5)
                _, worker_error = worker.communicate(timeout=5)
                assert holder.returncode == 0, hold_error
                assert worker.returncode != 0 and f'ERROR:  {error}:' in worker_error, worker_error
            finally:
                for child in [holder, worker]:
                    if child and child.poll() is None:
                        child.kill()
                        child.wait(timeout=5)

    def separate_member_checks_in():
        assert service(BOB, BOB_SEAT, 'reserve') == {'state': 'reserved'}
        assert service(BOB, BOB_SEAT, 'sync') == {'state': 'present', 'count': 1}

    overlap('SET LOCAL ROLE service_role; ' + call(ALICE, ALICE_SEAT, 'reserve'),
            call(ALICE, OTHER_SEAT, 'reserve'), 'PT409', independent=separate_member_checks_in)
    assert service(ALICE, ALICE_SEAT, 'sync') == {'state': 'present', 'count': 2}
    results.append('Different members can check in concurrently, and a second session for one member receives a conflict')

    overlap('SET LOCAL ROLE service_role; ' + call(ALICE, ALICE_SEAT, 'leave'),
            call(ALICE, ALICE_SEAT, 'sync'), 'PT410')
    assert service(BOB, BOB_SEAT, 'sync') == {'state': 'present', 'count': 1}
    results.append('A check-in waiting behind a committed leave cannot recreate the seat')

    overlap(f"DELETE FROM book_cohort_members WHERE cohort_id='{CIRCLE}' AND member_id='{BOB}';",
            call(BOB, BOB_SEAT, 'sync'), 'PT404')
    assert query('SELECT count(*) FROM circle_salon_presence') == '0'
    results.append('A check-in waiting behind membership removal is refused and the seat is gone')


def interrupted(_signal, _frame):
    raise InterruptedError('Salon lock rehearsal interrupted')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--receipt', type=Path, required=True)
    args = parser.parse_args()
    signal.signal(signal.SIGTERM, interrupted)
    with args.receipt.open('x') as receipt:
        report = {'status': 'FAIL', 'checks': [], 'clusterStopped': False, 'sqlSHA256': fixture.digest(SQL)}
        try:
            with tempfile.TemporaryDirectory(prefix='soe-salon-', dir='/tmp') as tmp:
                cluster = fixture.Cluster(Path(tmp) / 'cluster', 'soe_salon_fixture')
                try:
                    cluster.start()
                    report['server'] = cluster.query(DB, 'SHOW server_version')
                    run(cluster, report['checks'])
                finally:
                    cluster.stop()
                    report['clusterStopped'] = True
            report['status'] = 'PASS'
        finally:
            receipt.write(json.dumps(report, indent=2) + '\n')
            print(json.dumps(report))
