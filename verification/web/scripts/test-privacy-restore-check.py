"""Exercise the restore comparison and cutover against disposable PostgreSQL."""

from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import re
import runpy
import select
import shutil
import signal
import subprocess
import sys
from tempfile import mkdtemp


SCRIPT = Path(__file__).resolve()
ROOT = SCRIPT.parents[3]
CHECKER = SCRIPT.with_name('verify-privacy-restore.py')
CORE_REHEARSAL = SCRIPT.with_name('rehearse-native-core-restore.py')
REFERENCE = ROOT / 'docs/sql/privacy-restore-reference.sql'
PRACTICE = ROOT / 'docs/sql/practice-data-containment-apply.sql'
QUESTIONS = ROOT / 'supabase/migrations/20260414_daily_practice.sql'
REFLECTIONS = ROOT / 'supabase/migrations/20260418_practice_reflections.sql'
PRIVATE_TEXT = 'PRIVATE_SYNTHETIC_ANSWER'


def resident(path):
    info = path.lstat()
    if not path.is_file() or path.is_symlink() or not info.st_size or not info.st_blocks:
        raise ValueError(f'Unavailable fixture input: {path}')
    return path.read_bytes()


@contextmanager
def export_snapshot(source, fixture):
    command = [str(fixture['BIN'] / 'psql'), *map(str, source.psql(fixture['SOURCE_DB']))]
    with subprocess.Popen(command, env=fixture['ENV'], text=True,
                          stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL) as session:
        try:
            session.stdin.write('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT pg_export_snapshot();\n')
            session.stdin.flush()
            assert select.select([session.stdout], [], [], 5)[0], 'The local export snapshot did not open'
            name = session.stdout.readline().strip()
            assert re.fullmatch(r'[0-9a-fA-F-]{1,80}', name), 'Unexpected snapshot identifier'
            yield name
        finally:
            session.stdin.close()
            try:
                assert session.wait(timeout=5) == 0
            except subprocess.TimeoutExpired:
                session.kill()
                session.wait(timeout=5)
                raise


def seed(source, database):
    source.file(database, QUESTIONS)
    sql = resident(REFLECTIONS).decode()
    extension = 'CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;'
    assert sql.count(extension) == sql.count('vector(1536)') == 1
    source.query(database, sql.replace(extension, '').replace('vector(1536)', 'real[]'))
    source.query(database, f"""
      GRANT ALL ON daily_questions, matched_conversations, practice_reflections, question_responses
        TO anon, authenticated, service_role;
      GRANT SELECT(email) ON members TO anon WITH GRANT OPTION;
      GRANT SELECT(response_text) ON question_responses TO authenticated;
      INSERT INTO members(id, display_name) VALUES ('22222222-2222-4222-8222-222222222222', 'Second fixture member');
      INSERT INTO daily_questions(id, thinker_id, question_text, date)
        VALUES ('33333333-3333-4333-8333-333333333333', 'socrates', 'A synthetic prompt', '2026-11-05');
      INSERT INTO question_responses(id, member_id, question_id, response_text)
        VALUES ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111',
                '33333333-3333-4333-8333-333333333333', '{PRIVATE_TEXT}');
      INSERT INTO practice_reflections(response_id, question_id, thinker_id, reflection_text)
        VALUES ('44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333',
                'socrates', 'SYNTHETIC_REFLECTION');
      INSERT INTO matched_conversations(member_a, member_b, thinker_id)
        VALUES ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'socrates');
      INSERT INTO reading_progress(id, member_id, private_text)
        SELECT md5('synthetic restore row ' || n)::uuid, '11111111-1111-4111-8111-111111111111',
          'SYNTHETIC_READING' FROM generate_series(1, 4097) n;
    """)


def verify(reference, target, fixture, **overrides):
    options = {
        'reference': reference, 'socket-dir': target.socket, 'port': fixture['PORT'],
        'database': fixture['RESTORED_DB'], 'user': fixture['OWNER'], 'psql': fixture['BIN'] / 'psql',
        **overrides,
    }
    argv = [sys.executable, '-B', str(CHECKER)]
    for key, value in options.items():
        argv.extend((f'--{key}', str(value)))
    result = subprocess.run(argv, capture_output=True, text=True, timeout=15, env={
        **fixture['ENV'], 'PGHOST': 'discard-me.invalid', 'PGPORT': '1', 'PGSERVICE': 'discard-me',
        'PGDATABASE': 'discard-me', 'PGOPTIONS': '-c default_transaction_read_only=off',
    })
    assert not result.stderr, 'The verifier exposed stderr'
    assert PRIVATE_TEXT not in result.stdout
    assert not re.search(r'[0-9a-f]{64}', result.stdout), 'The verifier exposed a fingerprint'
    report = json.loads(result.stdout)
    assert report['productionCleared'] is False
    assert result.returncode == (0 if report['status'] == 'MATCH' else 1)
    return report


def exercise(temp, fixture, checker, result):
    source = fixture['Cluster'](temp / 'source', fixture['OWNER'])
    target = fixture['Cluster'](temp / 'target', fixture['RESTORE_ADMIN'])
    source_db, target_db, owner = (fixture[k] for k in ('SOURCE_DB', 'RESTORED_DB', 'OWNER'))
    read_sql = resident(REFERENCE).decode()
    reference, archive, roles = (temp / name for name in ('reference.json', 'source.pgcustom', 'roles.sql'))
    checks = result['checks']
    try:
        source.start()
        target.start()
        source.query('postgres', f'CREATE DATABASE {source_db}')
        source.file(source_db, fixture['BASELINE'])
        seed(source, source_db)
        source.file(source_db, REFERENCE, sqlstate='P0001')
        checks.append('The reference query refuses to run outside a repeatable-read, read-only snapshot.')
        with export_snapshot(source, fixture) as snapshot:
            transaction = f"{checker['BEGIN']} SET TRANSACTION SNAPSHOT '{snapshot}';"
            raw = source.query(source_db, transaction + '\n' + read_sql + '\nROLLBACK;')
            parsed = checker['decode_reference'](raw.encode())
            assert parsed['tables']['reading_progress']['rows'] == 4098
            reference.write_text(raw + '\n')
            source.query(source_db, "UPDATE question_responses SET response_text = 'LATER_SOURCE_WRITE'")
            fixture['run']('pg_dump', *source.connection(), '--format=custom', '--snapshot', snapshot,
                           '--file', archive, '-d', source_db)
        fixture['run']('pg_dumpall', *source.connection(), '--roles-only', '--no-role-passwords',
                       '-l', 'postgres', '-f', roles)
        target.file('postgres', roles)
        target.restore(target_db, archive)
        match = verify(reference, target, fixture)
        assert match['status'] == 'MATCH' and match['tablesCompared'] == 11 and match['roleAndSchemaAccessMatch']
        assert source.query(source_db, "SELECT count(*) FROM question_responses WHERE response_text = 'LATER_SOURCE_WRITE'") == '1'
        assert target.query(target_db, f"SELECT count(*) FROM question_responses WHERE response_text = '{PRIVATE_TEXT}'") == '1'
        checks.append('A real dump and its private reference share an exported snapshot across a later source write. All 11 restored tables match.')

        target.query(target_db, "UPDATE question_responses SET response_text = 'SYNTHETIC_DRIFT'", owner)
        drift = verify(reference, target, fixture)
        assert drift['status'] == 'MISMATCH' and drift['rowsDiffer'] == ['question_responses']
        assert drift['definitionsDiffer'] == [] and drift['roleAndSchemaAccessMatch']
        target.query(target_db, f"UPDATE question_responses SET response_text = '{PRIVATE_TEXT}'", owner)
        checks.append('A replacement answer with the same row count is detected and the receipt names only the affected table.')

        target.query(target_db, 'ALTER TABLE daily_questions DISABLE ROW LEVEL SECURITY', owner)
        target.query(target_db, 'REVOKE SELECT(email) ON members FROM anon', owner)
        target.query(target_db, 'GRANT unrelated_reader TO authenticated')
        drift = verify(reference, target, fixture)
        assert drift['status'] == 'MISMATCH' and drift['rowsDiffer'] == []
        assert drift['definitionsDiffer'] == ['daily_questions', 'members'] and not drift['roleAndSchemaAccessMatch']
        target.query(target_db, 'REVOKE unrelated_reader FROM authenticated')
        target.query(target_db, 'GRANT SELECT(email) ON members TO anon WITH GRANT OPTION', owner)
        target.query(target_db, 'ALTER TABLE daily_questions ENABLE ROW LEVEL SECURITY', owner)
        checks.append('With all rows intact, the comparison detects changed RLS, a column grant and an inherited role grant.')

        target.query(target_db, 'ALTER TABLE question_responses RENAME TO missing_question_responses', owner)
        assert verify(reference, target, fixture)['check'] == 'local_snapshot_unavailable'
        target.query(target_db, 'ALTER TABLE missing_question_responses RENAME TO question_responses', owner)
        reference.chmod(0o644)
        assert verify(reference, target, fixture)['check'] == 'private_reference_invalid'
        reference.chmod(0o600)
        socket_link = temp / 'socket-link'
        socket_link.symlink_to(target.socket)
        assert verify(reference, target, fixture, **{'socket-dir': socket_link})['check'] == 'private_socket_required'
        wrong_version = temp / 'wrong-major.json'
        wrong_version.write_text(json.dumps({**parsed, 'serverMajor': parsed['serverMajor'] + 1}))
        assert verify(wrong_version, target, fixture)['check'] == 'postgres_major'
        checks.append('A missing table, shared reference, linked socket and different PostgreSQL major each refuse comparison.')

        assert verify(reference, target, fixture)['status'] == 'MATCH'
        target.file(target_db, fixture['SQL']['preflight'], owner)
        target.file(target_db, fixture['SQL']['apply'], owner)
        target.file(target_db, PRACTICE, owner)
        drift = verify(reference, target, fixture)
        assert drift['status'] == 'MISMATCH' and drift['rowsDiffer'] == []
        assert set(drift['definitionsDiffer']) == checker['TABLES'] and drift['roleAndSchemaAccessMatch']
        for table in sorted(checker['TABLES']):
            for role in ('anon', 'authenticated'):
                target.query(target_db, f'SET ROLE {role}; SELECT count(*) FROM public.{table}', owner, '42501')
            count = target.query(target_db, f'SET ROLE service_role; SELECT count(*) FROM public.{table}', owner)
            assert count == str(parsed['tables'][table]['rows'])
        checks.append('The exact Core and Practice changes preserve all restored rows. Both browser roles lose reads and service reads survive on all 11 tables.')
    finally:
        cleanup = {}
        for label, cluster in (('source', source), ('target', target)):
            try:
                cluster.stop()
                cleanup[label] = 'stopped'
            except Exception:
                cleanup[label] = 'unconfirmed'
        result['cleanup'] = cleanup
        assert cleanup == {'source': 'stopped', 'target': 'stopped'}


def main():
    os.umask(0o077)
    result = {'status': 'FAIL', 'scope': 'Synthetic PostgreSQL fixture', 'checks': [],
              'productionRestoreVerified': False, 'fixtureEmbeddingType': 'real[]'}
    for path in (CHECKER, CORE_REHEARSAL, REFERENCE, PRACTICE, QUESTIONS, REFLECTIONS):
        resident(path)
    fixture, checker = (runpy.run_path(str(path)) for path in (CORE_REHEARSAL, CHECKER))
    inputs = [SCRIPT, CHECKER, CORE_REHEARSAL, REFERENCE, PRACTICE, QUESTIONS, REFLECTIONS,
              fixture['BASELINE'], fixture['SQL']['preflight'], fixture['SQL']['apply']]
    result['sourceHashes'] = {str(path.relative_to(ROOT)): hashlib.sha256(resident(path)).hexdigest() for path in inputs}
    result['postgres'] = fixture['run']('postgres', '--version')
    temp = Path(mkdtemp(prefix='soe-restore-proof-', dir='/private/tmp'))
    try:
        exercise(temp, fixture, checker, result)
        assert all(hashlib.sha256(resident(ROOT / name)).hexdigest() == digest
                   for name, digest in result['sourceHashes'].items())
        result['status'] = 'PASS'
    except Exception as error:
        result['failure'] = str(error) or type(error).__name__
    finally:
        if result.get('cleanup') == {'source': 'stopped', 'target': 'stopped'}:
            shutil.rmtree(temp)
        result['temporaryDirectoryRemoved'] = not temp.exists()
        print(json.dumps(result, indent=2))
    return 0 if result['status'] == 'PASS' and result['temporaryDirectoryRemoved'] else 1


if __name__ == '__main__':
    def interrupt(_signal, _frame):
        raise InterruptedError('Owned restore rehearsal interrupted')

    signal.signal(signal.SIGTERM, interrupt)
    raise SystemExit(main())
