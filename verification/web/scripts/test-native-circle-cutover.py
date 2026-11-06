"""Restore the Circle release fixture and run competing PostgreSQL sessions."""

import argparse
from contextlib import contextmanager
from itertools import count
import json
import os
from pathlib import Path
import re
import runpy
import select
import shutil
import signal
import subprocess
from tempfile import mkdtemp
import time
from uuid import UUID

ROOT = Path(__file__).resolve().parents[3]
RESTORE_HELPER = ROOT / 'verification/web/scripts/rehearse-native-core-restore.py'
DATABASE = 'soe_before'
HOST = '11111111-1111-4111-8111-111111111111'
MEMBER = '22222222-2222-4222-8222-222222222222'
READER = '44444444-4444-4444-8444-444444444444'
OUTSIDER = '66666666-6666-4666-8666-666666666666'
MEETING = 'https://meet.offline.invalid/synthetic-circle'
ORIGINAL_TABLES = (
    'members', 'reading_progress', 'book_highlights', 'great_books_progress',
    'great_books_highlights', 'book_reflections', 'thinker_memory', 'artifacts',
    'exp_events', 'book_cohorts', 'book_cohort_members', 'seminar_messages',
)


def literal(value):
    if type(value) is int:
        return str(value)
    if isinstance(value, dict):
        value = json.dumps(value)
    return "'" + value.replace("'", "''") + "'"


def call(action, *args):
    return f"SELECT public.soe_circle_{action}({', '.join(map(literal, args))})"


@contextmanager
def owned_session(command, env, application, *args):
    with subprocess.Popen([*command, *args], env={**env, 'PGAPPNAME': application},
                          text=True, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE) as process:
        try:
            yield process
        finally:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)


def overlap(cluster, kit, held_sql, waiting_sql, *, refusal=None, rollback=False):
    command = [str(kit['BIN'] / 'psql'), *map(str, cluster.psql(DATABASE))]
    with owned_session(command, kit['ENV'], 'soe_circle_holder') as holder:
        holder.stdin.write("BEGIN; SET LOCAL ROLE service_role; "
                           "SET LOCAL idle_in_transaction_session_timeout='10s'; "
                           + held_sql + ';\n')
        holder.stdin.flush()
        assert select.select([holder.stdout], [], [], 5)[0], 'Holder returned no result'
        first = holder.stdout.readline()
        if not first:
            holder.wait(timeout=5)
            raise RuntimeError(holder.stderr.read().strip())
        with owned_session(command, kit['ENV'], 'soe_circle_waiter', '-c',
                           "SET statement_timeout='8s'; SET ROLE service_role; " + waiting_sql) as waiter:
            until = time.monotonic() + 3
            lock = ''
            while waiter.poll() is None and time.monotonic() < until:
                lock = cluster.query(DATABASE, """
                  SELECT waiter.wait_event FROM pg_stat_activity waiter
                  JOIN pg_stat_activity holder ON holder.pid=ANY(pg_blocking_pids(waiter.pid))
                  WHERE waiter.datname=current_database() AND holder.datname=current_database()
                    AND waiter.application_name='soe_circle_waiter'
                    AND holder.application_name='soe_circle_holder'
                    AND waiter.wait_event_type='Lock'
                """)
                if lock:
                    break
                time.sleep(0.03)
            assert lock, 'The waiting request did not block on the held transaction'
            holder.stdin.write('ROLLBACK;\n' if rollback else 'COMMIT;\n')
            holder.stdin.close()
            output, errors = waiter.communicate(timeout=8)
            assert holder.wait(timeout=5) == 0, holder.stderr.read()
            if refusal:
                assert waiter.returncode != 0 and f'ERROR:  {refusal}:' in errors, errors
            else:
                assert waiter.returncode == 0, errors
            return json.loads(first), None if refusal else json.loads(output), lock


def check_circle(cluster, kit, checks):
    def query(sql, role=None, refusal=None):
        if role:
            sql = f'SET ROLE {role}; {sql}'
        return cluster.query(DATABASE, sql, sqlstate=refusal)

    def invoke(sql):
        return json.loads(query(sql, 'service_role'))

    def key():
        return str(UUID(int=next(keys), version=4))

    def note(name, lock=None):
        checks.append({'name': name, **({'waitEvent': lock} if lock else {})})

    keys = count(1)
    day, weekday = query("SELECT CURRENT_DATE+1, extract(dow FROM CURRENT_DATE+1)::integer").split('|')
    create = call('create', HOST, key(), {
        'title': 'Synthetic online Circle', 'description': 'Disposable cutover fixture.',
        'format': 'online', 'city': None, 'region': None, 'venueName': None, 'venueType': 'online',
        'weekday': int(weekday), 'time': '19:00', 'timezone': 'UTC', 'startDate': day,
        'maxMembers': 3, 'onlineUrl': MEETING,
    })
    created, replay, lock = overlap(cluster, kit, create, create)
    circle = str(UUID(created['circleId']))
    scope = f'cohort_id={literal(circle)}'
    assert replay == {**created, 'replayed': True}
    assert created['replayed'] is False
    assert MEETING not in json.dumps(replay)
    assert query("SELECT count(*) FROM public.book_cohorts WHERE book_id='soe-circles-path'") == '1'
    assert query(f'SELECT count(*) FROM public.circle_participation_receipts WHERE {scope}') == '1'
    note('Concurrent exact create commits one listing and replays one receipt', lock)

    def participation(action, actor, revision, *args):
        return call(action, actor, circle, revision, key(), *args)

    def detail():
        return call('detail_profiles', READER, circle)

    member = invoke(participation('join', MEMBER, created['state']['revision']))
    base = member['state']['revision']
    joined, _, lock = overlap(cluster, kit, participation('join', READER, base),
                              participation('join', OUTSIDER, base), refusal='PT409')
    assert joined['state']['revision'] == base + 1 and joined['state']['isMember'] is True
    query(participation('join', OUTSIDER, base + 1), 'service_role', 'PT409')
    roster = query(f'SELECT member_id FROM public.book_cohort_members WHERE {scope} ORDER BY member_id').splitlines()
    assert roster == [HOST, MEMBER, READER]
    assert query(f'SELECT count(*) FROM public.circle_participation_receipts WHERE {scope}') == '3'
    note('Competing last-seat joins preserve capacity and create one new receipt', lock)

    going = participation('rsvp', READER, joined['state']['revision'], day, 'going')
    base = invoke(going)['state']['revision']
    confirmed, _, lock = overlap(cluster, kit, participation('join', READER, base),
                                 participation('leave', READER, base), refusal='PT409')
    assert confirmed['state']['revision'] == base + 1
    assert query(f'SELECT status FROM public.circle_rsvps WHERE {scope}') == 'going'
    note('A new same-value join advances revision and blocks a stale leave', lock)

    base = confirmed['state']['revision']
    rolled_back, committed, lock = overlap(
        cluster, kit, participation('rsvp', READER, base, day, 'not_going'),
        participation('rsvp', READER, base, day, 'going'), rollback=True,
    )
    assert rolled_back['receipt']['status'] == 'not_going'
    assert committed['receipt']['status'] == 'going' and committed['state']['revision'] == base + 1
    assert query(f'SELECT status FROM public.circle_rsvps WHERE {scope}') == 'going'
    assert query(f'SELECT count(*) FROM public.circle_participation_receipts WHERE '
                 f"request_id={literal(rolled_back['requestId'])}") == '0'
    note('Rolled-back RSVP leaves the waiting response eligible and no orphan receipt', lock)

    assert invoke(detail())['online_url'] == MEETING
    left, read_after_leave, lock = overlap(
        cluster, kit, participation('leave', READER, committed['state']['revision']), detail(),
    )
    assert left['state']['isMember'] is False
    assert read_after_leave['online_url'] is None
    assert read_after_leave['meetings'][0]['my_status'] is None
    old_receipt = invoke(going)
    assert old_receipt['replayed'] and old_receipt['state']['isMember'] is False
    query(participation('rsvp', READER, left['state']['revision'], day, 'going'), 'service_role', 'PT403')
    assert query(f'SELECT count(*) FROM public.circle_rsvps WHERE {scope}') == '0'
    note('Detail waiting on leave returns without the private meeting URL or RSVP', lock)

    for role in ('anon', 'authenticated'):
        query('SELECT online_url FROM public.circle_private', role, '42501')
        query(detail(), role, '42501')
        query(going, role, '42501')
    query(f'DELETE FROM public.circle_rsvps WHERE {scope}', 'service_role', '42501')
    note('Browser roles cannot read private meetings or invoke attendance, and raw service RSVP writes stay blocked')


def original_columns(cluster):
    columns = {}
    for table in ORIGINAL_TABLES:
        names = cluster.query('soe_source', f"""
          SELECT attname FROM pg_attribute WHERE attrelid='public.{table}'::regclass
            AND attnum>0 AND NOT attisdropped ORDER BY attnum
        """).splitlines()
        assert names and all(re.fullmatch(r'[a-z_]+', name) for name in names)
        columns[table] = ','.join(f'"{name}"' for name in names)
    return columns


def original_rows(cluster, database, columns):
    return {
        table: cluster.query(database, f"""
          SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM
            (SELECT {names} FROM public.{table}) t
        """)
        for table, names in columns.items()
    }


def rehearse(kit, receipt):
    temp = Path(mkdtemp(prefix='soe-circle-pg-', dir='/private/tmp'))
    cluster = kit['Cluster'](temp / 'local', kit['OWNER'])
    try:
        subprocess.run(['/opt/homebrew/bin/node', '--require',
                        str(ROOT / 'verification/web/scripts/deny-build-network.cjs'),
                        str(ROOT / 'verification/web/tests/support/export-native-cutover-fixture.mjs'),
                        str(temp)], cwd=ROOT, env=kit['ENV'], check=True, timeout=20)
        receipt['fixture'] = json.loads((temp / 'inputs.json').read_text())
        cluster.start()
        cluster.query('postgres', 'CREATE DATABASE soe_source')
        cluster.file('soe_source', temp / 'baseline.sql')
        columns = original_columns(cluster)
        baseline = original_rows(cluster, 'soe_source', columns)
        archive = temp / 'before.dump'
        cluster.dump('soe_source', archive)
        receipt['syntheticArchiveSHA256'] = kit['digest'](archive)
        cluster.restore(DATABASE, archive)
        assert original_rows(cluster, DATABASE, columns) == baseline
        receipt['checks'].append({'name': 'Synthetic dump and restore preserve original rows', 'tables': len(columns)})
        output = cluster.file(DATABASE, temp / 'cutover.sql')
        applied = [line.split(' ', 1)[1] for line in output.splitlines() if line.startswith('SOE_MIGRATION ')]
        assert applied == receipt['fixture']['files']
        assert original_rows(cluster, DATABASE, columns) == baseline
        receipt['checks'].append({'name': 'Ordered cutover preserves the original columns and rows', 'migrations': len(applied)})
        check_circle(cluster, kit, receipt['checks'])
    finally:
        cluster.stop()
        receipt['serverStopped'] = True
        shutil.rmtree(temp)
        receipt['temporaryDirectoryRemoved'] = not temp.exists()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('run')
    args = parser.parse_args()
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', args.run) or len(args.run) > 64:
        parser.error('Use a bounded evidence run name')
    os.umask(0o077)
    destination = ROOT / 'verification/web/evidence' / args.run
    destination.mkdir(mode=0o700, exist_ok=False)
    info = RESTORE_HELPER.lstat()
    assert RESTORE_HELPER.is_file() and not RESTORE_HELPER.is_symlink() and info.st_blocks
    kit = runpy.run_path(str(RESTORE_HELPER))
    inputs = [Path(__file__).resolve(), RESTORE_HELPER, *(kit['BIN'] / name for name in kit['TOOLS'])]
    hashes = {str(path.relative_to(ROOT) if path.is_relative_to(ROOT) else path): kit['digest'](path) for path in inputs}
    receipt = {'status': 'FAIL', 'checks': [], 'inputs': hashes, 'hostedDatabaseAccess': False,
               'scope': 'Disposable PostgreSQL 17 and restored synthetic data over private UNIX sockets.'}
    try:
        receipt['postgres'] = kit['run']('postgres', '--version')
        assert receipt['postgres'].startswith('postgres (PostgreSQL) 17.')
        rehearse(kit, receipt)
        assert [kit['digest'](path) for path in inputs] == list(hashes.values())
        receipt['status'] = 'PASS'
    except Exception as error:
        receipt['failure'] = str(error) or type(error).__name__
    finally:
        (destination / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
        print(json.dumps({key: receipt[key] for key in ('status', 'checks', 'serverStopped', 'failure') if key in receipt}))
    return 0 if receipt['status'] == 'PASS' else 1


if __name__ == '__main__':
    def interrupt(_signal, _frame):
        raise InterruptedError('Local cutover rehearsal interrupted')

    signal.signal(signal.SIGTERM, interrupt)
    raise SystemExit(main())
