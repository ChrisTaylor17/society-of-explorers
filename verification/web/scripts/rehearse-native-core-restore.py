"""Rehearse the Stage 1 backup and restore with isolated PostgreSQL 17 fixtures."""
import argparse
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import signal
import stat
import subprocess
from tempfile import mkdtemp
import time

ROOT = Path(__file__).resolve().parents[3]
BIN = Path('/opt/homebrew/opt/postgresql@17/bin')
BASELINE = ROOT / 'verification/web/tests/fixtures/core-containment-synthetic.sql'
SQL = {name: ROOT / f'docs/sql/first-release-core-containment-{name}.sql'
       for name in ('preflight', 'apply', 'rollback')}
TOOLS = ('postgres', 'initdb', 'pg_ctl', 'psql', 'pg_dump', 'pg_dumpall', 'pg_restore')
TABLES = ('members', 'reading_progress', 'book_highlights', 'great_books_progress',
          'great_books_highlights', 'book_reflections', 'thinker_memory')
ENV = {'PATH': '/usr/bin:/bin', 'LC_ALL': 'C'}
OWNER = 'soe_fixture_owner'
RESTORE_ADMIN = 'soe_fixture_restore'
PORT = '55421'
SOURCE_DB = 'soe_source'
RESTORED_DB = 'soe_before'
CONTAINED_DB = 'soe_after'


def digest(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or (info.st_size and not info.st_blocks):
        raise ValueError(f'Unavailable resident input: {path}')
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(binary, *args, sqlstate=None, timeout=20):
    result = subprocess.run([str(BIN / binary), *map(str, args)], capture_output=True,
                            text=True, timeout=timeout, env=ENV)
    if sqlstate:
        if result.returncode == 0 or f'ERROR:  {sqlstate}:' not in result.stderr:
            raise RuntimeError(f'Expected PostgreSQL state {sqlstate}: {result.stderr[-700:]}')
    elif result.returncode:
        raise RuntimeError(f'{binary} returned {result.returncode}: {result.stderr[-700:]}')
    return result.stdout.strip()


class Cluster:
    def __init__(self, location, user):
        location.mkdir(mode=0o700)
        self.data = location / 'data'
        self.socket = location / 'socket'
        self.socket.mkdir(mode=0o700)
        self.user = user
        self.log = location / 'server.log'

    def start(self):
        run('initdb', '-D', self.data, '-U', self.user, '--auth-local=trust',
            '--auth-host=scram-sha-256', '--locale=C', '--encoding=UTF8', '--no-instructions')
        options = f"-p {PORT} -k {shlex.quote(str(self.socket))} -c listen_addresses='' -c unix_socket_permissions=0700"
        run('pg_ctl', '-D', self.data, '-l', self.log, '-o', options, '-w', '-t', '10', 'start')
        assert self.query('postgres', "SELECT inet_server_addr() IS NULL AND current_setting('listen_addresses') = ''") == 't'

    def stop(self):
        pid = self.data / 'postmaster.pid'
        if pid.exists():
            try:
                run('pg_ctl', '-D', self.data, '-m', 'fast', '-w', '-t', '10', 'stop')
            except (RuntimeError, subprocess.TimeoutExpired):
                if pid.exists():
                    run('pg_ctl', '-D', self.data, '-m', 'immediate', '-w', '-t', '10', 'stop')
        assert not pid.exists()
        assert not (self.socket / f'.s.PGSQL.{PORT}').exists()

    def connection(self, user=None):
        return ('-h', self.socket, '-p', PORT, '-U', user or self.user, '--no-password')

    def psql(self, database, user=None):
        return (*self.connection(user), '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
                '-v', 'VERBOSITY=verbose', '-d', database)

    def query(self, database, sql, user=None, sqlstate=None):
        return run('psql', *self.psql(database, user), '-c', sql, sqlstate=sqlstate)

    def file(self, database, path, user=None, sqlstate=None):
        return run('psql', *self.psql(database, user), '-f', path, sqlstate=sqlstate)

    def dump(self, database, file, user=None):
        run('pg_dump', *self.connection(user), '--format=custom', '--file', file, '-d', database)

    def restore(self, database, file):
        self.query('postgres', f'CREATE DATABASE {database} OWNER {OWNER}')
        run('pg_restore', *self.connection(OWNER), '--exit-on-error', '--single-transaction', '-d', database, file)


def row_fingerprint(cluster, database, user):
    parts = [cluster.query(database, f"SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.{table} t", user)
             for table in TABLES]
    assert all(isinstance((rows := json.loads(part)), list) and len(rows) == 1 for part in parts)
    return hashlib.sha256('\n'.join(parts).encode()).hexdigest()


def boundary_fingerprint(cluster, database, user):
    names = ','.join(f"'{name}'" for name in TABLES)
    def acl(expression):
        return f"""SELECT jsonb_agg(
          jsonb_build_array(a.grantor_name, a.grantee_name, a.privilege_type, a.is_grantable)
          ORDER BY a.grantor_name, a.grantee_name, a.privilege_type, a.is_grantable)
          FROM (
            SELECT pg_get_userbyid(grantor) AS grantor_name,
                   CASE WHEN grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee) END AS grantee_name,
                   privilege_type, is_grantable
            FROM aclexplode({expression})
          ) a"""

    table_grants = acl("COALESCE(c.relacl, acldefault('r', c.relowner))")
    column_grants = acl('column_info.attacl')
    state = cluster.query(database, f"""
      SELECT jsonb_agg(jsonb_build_object(
        'table', c.relname, 'owner', pg_get_userbyid(c.relowner),
        'rls', c.relrowsecurity, 'forceRls', c.relforcerowsecurity, 'acl', ({table_grants}),
        'columns', (SELECT jsonb_agg(jsonb_build_array(attname, ({column_grants})) ORDER BY attnum)
                    FROM pg_attribute column_info WHERE attrelid=c.oid AND attnum>0 AND NOT attisdropped),
        'policies', (SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p
                     WHERE schemaname='public' AND tablename=c.relname)
      ) ORDER BY c.relname)
      FROM pg_class c WHERE relnamespace='public'::regnamespace AND relname IN ({names})
    """, user)
    assert len(json.loads(state)) == len(TABLES)
    return hashlib.sha256(state.encode()).hexdigest()


def prove_contained(cluster, database, row_hash):
    for table in TABLES:
        for role in ('anon', 'authenticated'):
            cluster.query(database, f'SET ROLE {role}; SELECT count(*) FROM public.{table}', OWNER, '42501')
        assert cluster.query(database, f'SET ROLE service_role; SELECT count(*) FROM public.{table}', OWNER) == '1'
    assert row_fingerprint(cluster, database, OWNER) == row_hash


@contextmanager
def hold_access_share(cluster, database, relation):
    assert re.fullmatch(r'public\.[a-z_]+', relation), 'Use a literal fixture table'
    command = f'BEGIN; LOCK TABLE ONLY {relation} IN ACCESS SHARE MODE; SELECT pg_sleep(30); COMMIT;'
    with subprocess.Popen([str(BIN / 'psql'), *map(str, cluster.psql(database, OWNER)), '-c', command],
                          env={**ENV, 'PGAPPNAME': 'soe_fixture_lock_holder'},
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) as holder:
        backend = None
        try:
            until = time.monotonic() + 6
            while time.monotonic() < until and holder.poll() is None:
                candidate = cluster.query(database, f"""
                  SELECT a.pid FROM pg_stat_activity a JOIN pg_locks l USING (pid)
                  WHERE a.application_name='soe_fixture_lock_holder' AND a.datname=current_database()
                  AND l.relation='{relation}'::regclass AND l.mode='AccessShareLock' AND l.granted
                """, OWNER)
                if candidate.isdecimal():
                    backend = int(candidate)
                    break
                time.sleep(0.05)
            assert backend, 'Owned lock holder did not acquire the expected relation lock'
            yield
        finally:
            if backend:
                cluster.query(database, f'SELECT pg_terminate_backend({backend})', OWNER)
            elif holder.poll() is None:
                holder.terminate()
            holder.wait(timeout=5)


def prove_lock_abort(cluster, baseline):
    with hold_access_share(cluster, RESTORED_DB, 'public.members'):
        cluster.file(RESTORED_DB, SQL['apply'], OWNER, '55P03')
        assert boundary_fingerprint(cluster, RESTORED_DB, OWNER) == baseline
        assert cluster.query(RESTORED_DB, "SELECT to_regclass('public.soe_core_containment_v1_state') IS NULL", OWNER) == 't'


def rehearse(destination, result):
    temp = Path(mkdtemp(prefix='soe-core-restore-', dir='/private/tmp'))
    result['ownedTemporaryDirectory'] = str(temp)
    try:
        source = Cluster(temp / 'source', OWNER)
        target = Cluster(temp / 'target', RESTORE_ADMIN)
        try:
            source.start()
            target.start()
            source.query('postgres', f'CREATE DATABASE {SOURCE_DB}')
            source.file(SOURCE_DB, BASELINE)
            source.query(SOURCE_DB, 'GRANT SELECT(email) ON public.members TO anon WITH GRANT OPTION')
            rows = row_fingerprint(source, SOURCE_DB, OWNER)
            baseline = boundary_fingerprint(source, SOURCE_DB, OWNER)
            roles = destination / 'synthetic-roles.sql'
            before = destination / 'before-containment.pgcustom'
            after = destination / 'after-containment.pgcustom'
            run('pg_dumpall', *source.connection(), '--roles-only', '--no-role-passwords', '-l', 'postgres', '-f', roles)
            source.dump(SOURCE_DB, before)
            target.file('postgres', roles)
            target.restore(RESTORED_DB, before)
            assert boundary_fingerprint(target, RESTORED_DB, OWNER) == baseline
            assert row_fingerprint(target, RESTORED_DB, OWNER) == rows
            assert target.query(RESTORED_DB, 'SET ROLE anon; SELECT count(email) FROM members', OWNER) == '1'
            result['checks'].append('Pre-change archive restored the seven row sets, grants, policies and RLS flags.')
            target.file(RESTORED_DB, SQL['preflight'], OWNER)
            prove_lock_abort(target, baseline)
            result['checks'].append('A separate backend caused lock timeout and left no partial grant change or receipt.')
            target.file(RESTORED_DB, SQL['apply'], OWNER)
            prove_contained(target, RESTORED_DB, rows)
            target.query(RESTORED_DB, "BEGIN; SET LOCAL ROLE service_role; UPDATE members SET private_text='FIXTURE_WRITE'; ROLLBACK", OWNER)
            assert row_fingerprint(target, RESTORED_DB, OWNER) == rows
            contained = boundary_fingerprint(target, RESTORED_DB, OWNER)
            assert contained != baseline
            target.dump(RESTORED_DB, after, OWNER)
            target.restore(CONTAINED_DB, after)
            assert boundary_fingerprint(target, CONTAINED_DB, OWNER) == contained
            prove_contained(target, CONTAINED_DB, rows)
            result['checks'].append('The contained logical archive retained browser denial, service access and the original rows.')
            old_oid = target.query(RESTORED_DB, "SELECT 'public.members'::regclass::oid", OWNER)
            new_oid = target.query(CONTAINED_DB, "SELECT 'public.members'::regclass::oid", OWNER)
            assert old_oid != new_oid, 'Restored test table unexpectedly retained its original OID'
            target.file(CONTAINED_DB, SQL['rollback'], OWNER, 'PT409')
            assert boundary_fingerprint(target, CONTAINED_DB, OWNER) == contained, 'Refused restored rollback changed the boundary'
            target.file(RESTORED_DB, SQL['rollback'], OWNER)
            assert boundary_fingerprint(target, RESTORED_DB, OWNER) == baseline, 'In-place rollback failed to restore the semantic boundary'
            assert row_fingerprint(target, RESTORED_DB, OWNER) == rows, 'In-place rollback changed a synthetic row'
            result['checks'].append('The original receipt reverses in place and refuses the restored copy with new table identities.')
            result['archives'] = {path.name: digest(path) for path in (roles, before, after)}
        finally:
            cleanup = {}
            for label, cluster in (('source', source), ('target', target)):
                try:
                    cluster.stop()
                    cleanup[label] = 'stopped'
                except Exception as error:
                    cleanup[label] = str(error)
            result['cleanup'] = cleanup
            assert cleanup == {'source': 'stopped', 'target': 'stopped'}, 'An owned cluster failed to stop'
    finally:
        if result.get('cleanup') == {'source': 'stopped', 'target': 'stopped'}:
            shutil.rmtree(temp)
            result['temporaryDirectoryRemoved'] = not temp.exists()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('run')
    args = parser.parse_args()
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', args.run) or len(args.run) > 64:
        parser.error('Use a bounded evidence run name')
    os.umask(0o077)
    destination = ROOT / 'verification/web/evidence' / args.run
    destination.mkdir(exist_ok=False)
    paths = [Path(__file__).resolve(), BASELINE, *SQL.values(), *(BIN.joinpath(name).resolve() for name in TOOLS)]
    pinned = {str(path): digest(path) for path in paths}
    result = {'status': 'FAIL', 'scope': 'Synthetic fixture with two isolated PostgreSQL clusters using private UNIX sockets.',
              'checks': [], 'inputs': pinned, 'hostedDatabaseAccess': False}
    try:
        result['postgres'] = run('postgres', '--version')
        assert re.match(r'postgres \(PostgreSQL\) 17\.', result['postgres'])
        rehearse(destination, result)
        assert all(digest(Path(path)) == expected for path, expected in pinned.items())
        result['status'] = 'PASS'
    except Exception as error:
        result['failure'] = str(error) or type(error).__name__
    finally:
        (destination / 'receipt.json').write_text(json.dumps(result, indent=2) + '\n')
        print(json.dumps({key: result[key] for key in ('status', 'checks', 'cleanup', 'failure') if key in result}, indent=2))
    return 0 if result['status'] == 'PASS' else 1


if __name__ == '__main__':
    def interrupt(_signal, _frame):
        raise InterruptedError('Local restore rehearsal interrupted')

    signal.signal(signal.SIGTERM, interrupt)
    raise SystemExit(main())
