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
import time


SCRIPT = Path(__file__).resolve()
ROOT = SCRIPT.parents[3]
CHECKER = SCRIPT.with_name('verify-privacy-restore.py')
CORE_REHEARSAL = SCRIPT.with_name('rehearse-native-core-restore.py')
REFERENCE = ROOT / 'docs/sql/privacy-restore-reference.sql'
PRACTICE = ROOT / 'docs/sql/practice-data-containment-apply.sql'
PRACTICE_SAVE = ROOT / 'docs/sql/practice-response-save-apply.sql'
LIVE_ROOMS = ROOT / 'docs/sql/live-room-containment-apply.sql'
ROOM_FIXTURE = ROOT / 'verification/web/tests/fixtures/live-room-synthetic.sql'
QUESTIONS = ROOT / 'supabase/migrations/20260414_daily_practice.sql'
REFLECTIONS = ROOT / 'supabase/migrations/20260418_practice_reflections.sql'
PRIVATE_TEXT = 'PRIVATE_SYNTHETIC_ANSWER'
PRIVATE_TRANSCRIPT = 'PRIVATE_TRANSCRIPT_FIXTURE'
AUTH_SUBJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
SECOND_AUTH_SUBJECT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
PASSWORD_MARKER = 'PRIVATE_SYNTHETIC_PASSWORD_HASH'
IDENTITY_MARKER = 'PRIVATE_SYNTHETIC_OAUTH_IDENTITY'


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
      INSERT INTO members(id, display_name) VALUES
        ('10000000-0000-4000-8000-000000000001', 'Fixture room host'),
        ('10000000-0000-4000-8000-000000000002', 'Fixture room guest');
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
    source.file(database, ROOM_FIXTURE)
    source.query(database, f"""
      CREATE ROLE supabase_auth_admin;
      ALTER SCHEMA auth OWNER TO supabase_auth_admin;
      CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, encrypted_password text);
      CREATE TABLE auth.identities (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES auth.users (id),
        provider text NOT NULL,
        provider_id text NOT NULL
      );
      ALTER TABLE auth.users OWNER TO supabase_auth_admin;
      ALTER TABLE auth.identities OWNER TO supabase_auth_admin;
      INSERT INTO auth.users VALUES
        ('{AUTH_SUBJECT}', 'first-account@fixture.invalid', '{PASSWORD_MARKER}'),
        ('{SECOND_AUTH_SUBJECT}', 'second-account@fixture.invalid', NULL);
      INSERT INTO auth.identities VALUES
        ('a1a1a1a1-1111-4111-8111-111111111111', '{AUTH_SUBJECT}', 'google', '{IDENTITY_MARKER}');
    """)


def verify(reference, target, fixture, *, core_practice_only=False, include_auth=False, **overrides):
    options = {
        'reference': reference, 'socket-dir': target.socket, 'port': fixture['PORT'],
        'database': fixture['RESTORED_DB'], 'user': fixture['OWNER'], 'psql': fixture['BIN'] / 'psql',
        **overrides,
    }
    argv = [sys.executable, '-B', str(CHECKER)]
    if core_practice_only:
        argv.append('--core-practice-only')
    if include_auth:
        argv.append('--include-auth')
    for key, value in options.items():
        argv.extend((f'--{key}', str(value)))
    result = subprocess.run(argv, capture_output=True, text=True, timeout=15, env={
        **fixture['ENV'], 'PGHOST': 'discard-me.invalid', 'PGPORT': '1', 'PGSERVICE': 'discard-me',
        'PGDATABASE': 'discard-me', 'PGOPTIONS': '-c default_transaction_read_only=off',
    })
    assert not result.stderr, 'The verifier exposed stderr'
    assert PRIVATE_TEXT not in result.stdout
    assert PRIVATE_TRANSCRIPT not in result.stdout
    assert 'https://soe-fixture.daily.co' not in result.stdout
    assert all(value not in result.stdout for value in
               (AUTH_SUBJECT, SECOND_AUTH_SUBJECT, PASSWORD_MARKER, IDENTITY_MARKER, '@fixture.invalid'))
    assert not re.search(r'[0-9a-f]{64}', result.stdout), 'The verifier exposed a fingerprint'
    report = json.loads(result.stdout)
    assert report['productionCleared'] is False
    assert result.returncode == (0 if report['status'] == 'MATCH' else 1)
    return report


def overlap_saves(target, database, fixture, first_sql, second_sql):
    command = [str(fixture['BIN'] / 'psql'), *map(str, target.psql(database, fixture['OWNER']))]
    env = fixture['ENV']
    with subprocess.Popen(command, env={**env, 'PGAPPNAME': 'soe_practice_first'}, text=True,
                          stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE) as first:
        try:
            first.stdin.write('BEGIN; SET LOCAL ROLE service_role; ' + first_sql + '\n')
            first.stdin.flush()
            assert select.select([first.stdout], [], [], 5)[0], 'The first Practice save did not return'
            first_result = json.loads(first.stdout.readline())
            with subprocess.Popen([*command, '-c', 'SET ROLE service_role; ' + second_sql],
                                  env={**env, 'PGAPPNAME': 'soe_practice_second'}, text=True,
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE) as second:
                try:
                    deadline = time.monotonic() + 1.5
                    while second.poll() is None and time.monotonic() < deadline:
                        blocked = target.query(database, """
                          SELECT EXISTS (
                            SELECT 1 FROM pg_stat_activity waiter JOIN pg_stat_activity holder
                              ON holder.pid = ANY(pg_blocking_pids(waiter.pid))
                            WHERE waiter.datname=current_database() AND holder.datname=current_database()
                              AND waiter.application_name='soe_practice_second'
                              AND holder.application_name='soe_practice_first'
                          )
                        """)
                        if blocked == 't':
                            break
                        time.sleep(0.03)
                    else:
                        raise AssertionError('The second save did not wait for the first transaction')
                    first.stdin.write('COMMIT;\n')
                    first.stdin.close()
                    output, errors = second.communicate(timeout=5)
                    assert second.returncode == 0, errors
                    assert first.wait(timeout=5) == 0, first.stderr.read()
                    return first_result, json.loads(output)
                finally:
                    if second.poll() is None:
                        second.kill()
                        second.wait(timeout=5)
        finally:
            if not first.stdin.closed:
                first.stdin.close()
            if first.poll() is None:
                first.kill()
                first.wait(timeout=5)


def exercise_practice_save(target, database, fixture, checks):
    owner = fixture['OWNER']
    function = "'public.soe_practice_response_save(uuid,uuid,text)'"
    missing = f'SELECT to_regprocedure({function}) IS NULL'
    target.query(database, 'ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO unrelated_reader', owner)
    target.file(database, PRACTICE_SAVE, owner, 'PT409')
    assert target.query(database, missing, owner) == 't'
    target.query(database, 'ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM unrelated_reader', owner)
    target.file(database, PRACTICE_SAVE, owner)
    question = '33333333-3333-4333-8333-333333333333'
    same, other, next_member, fails = (f'50000000-0000-4000-8000-00000000000{n}' for n in range(1, 5))
    target.query(database, f"""
      INSERT INTO members(id, display_name) VALUES ('{same}', 'First fixture author'),
        ('{other}', 'Second fixture author'), ('{next_member}', 'Third fixture author'), ('{fails}', 'Fault fixture author');
      UPDATE members SET current_streak=2,longest_streak=5,total_responses=7,
        last_practice_date=(statement_timestamp() AT TIME ZONE 'America/New_York')::date - 1 WHERE id='{same}';
    """, owner)

    def save(actor, answer):
        return f"SELECT public.soe_practice_response_save('{actor}', '{question}', '{answer}');"

    for role in ('anon', 'authenticated', 'unrelated_reader'):
        target.query(database, f'SET ROLE {role}; ' + save(same, 'DENIED'), owner, '42501')
    checks.append('The save draft refuses unexpected EXECUTE defaults. Browser and unrelated roles cannot execute it after installation.')

    first, second = overlap_saves(target, database, fixture, save(same, 'FIRST'), save(same, 'SECOND'))
    assert first['response']['id'] == second['response']['id']
    assert first['response']['created_at'] == second['response']['created_at']
    assert first['total'] == second['total'] == 8
    assert first['streak'] == second['streak'] == 3 and first['longest'] == second['longest'] == 5
    assert target.query(database, f"SELECT response_text FROM question_responses WHERE member_id='{same}'", owner) == 'SECOND'
    checks.append('Two independent sessions overlapping on one member preserve one answer ID and one counter increment.')

    first, second = overlap_saves(target, database, fixture, save(other, 'THIRD'), save(next_member, 'FOURTH'))
    assert first['response']['id'] != second['response']['id'] and first['total'] == second['total'] == 1
    assert target.query(database, f"SELECT engagement_score FROM daily_questions WHERE id='{question}'", owner) == '4'
    checks.append('Two independent authors sharing one prompt both save and the prompt count reflects all four answers.')

    target.query(database, 'ALTER TABLE daily_questions ADD CONSTRAINT synthetic_score_fault CHECK (engagement_score <= 4)', owner)
    target.query(database, 'SET ROLE service_role; ' + save(fails, 'ROLLED_BACK'), owner, '23514')
    assert target.query(database, f"SELECT count(*) FROM question_responses WHERE member_id='{fails}'", owner) == '0'
    assert target.query(database, f"SELECT total_responses=0 AND last_practice_date IS NULL FROM members WHERE id='{fails}'", owner) == 't'
    assert target.query(database, f"SELECT engagement_score FROM daily_questions WHERE id='{question}'", owner) == '4'
    checks.append('An error on the final prompt update rolls back the new answer and member streak in the same transaction.')


def exercise_auth_restore(target, database, reference, app_reference, omitted_database, fixture, checks):
    owner = fixture['OWNER']
    restored = verify(reference, target, fixture, include_auth=True)
    assert restored['status'] == 'MATCH' and restored['tablesCompared'] == 16
    assert restored['roleAndSchemaAccessMatch']
    assert target.query(database, f"""
      SELECT count(*) FROM public.members m JOIN auth.users u ON u.id = m.supabase_auth_id
      JOIN auth.identities i ON i.user_id = u.id
      WHERE u.encrypted_password = '{PASSWORD_MARKER}' AND i.provider_id = '{IDENTITY_MARKER}';
    """, owner) == '1'
    checks.append('The account-inclusive restore matches 16 tables and preserves the linked member, password hash and provider identity from the shared snapshot.')

    omitted = verify(reference, target, fixture, include_auth=True, database=omitted_database)
    assert omitted['status'] == 'MISMATCH'
    assert omitted['rowsDiffer'] == ['auth.identities', 'auth.users'] and omitted['definitionsDiffer'] == []
    assert omitted['roleAndSchemaAccessMatch']
    checks.append('The account-inclusive comparison identifies both missing Auth row sets in the incomplete archive.')

    assert verify(reference, target, fixture)['check'] == 'private_reference_invalid'
    assert verify(app_reference, target, fixture, include_auth=True)['check'] == 'private_reference_invalid'
    parsed = json.loads(reference.read_text())
    parsed['tables'].pop('auth.identities')
    incomplete_reference = reference.with_name('partial-auth-reference.json')
    incomplete_reference.write_text(json.dumps(parsed))
    assert verify(incomplete_reference, target, fixture, include_auth=True)['check'] == 'private_reference_invalid'
    checks.append('The account-inclusive mode refuses mismatched formats and a reference missing either Auth table.')

    target.query(database, f"""
      UPDATE auth.users SET encrypted_password = 'CHANGED_SYNTHETIC_PASSWORD_HASH' WHERE id = '{AUTH_SUBJECT}';
      UPDATE auth.identities SET user_id = '{SECOND_AUTH_SUBJECT}' WHERE provider_id = '{IDENTITY_MARKER}';
    """, owner)
    drift = verify(reference, target, fixture, include_auth=True)
    assert drift['status'] == 'MISMATCH' and drift['rowsDiffer'] == ['auth.identities', 'auth.users']
    assert drift['definitionsDiffer'] == [] and drift['roleAndSchemaAccessMatch']
    target.query(database, f"""
      UPDATE auth.users SET encrypted_password = '{PASSWORD_MARKER}' WHERE id = '{AUTH_SUBJECT}';
      UPDATE auth.identities SET user_id = '{AUTH_SUBJECT}' WHERE provider_id = '{IDENTITY_MARKER}';
    """, owner)
    checks.append('Replacing a password hash and rebinding a provider identity are detected even when Auth row counts stay constant.')

    target.query(database, 'GRANT SELECT ON auth.users TO authenticated', owner)
    drift = verify(reference, target, fixture, include_auth=True)
    assert drift['status'] == 'MISMATCH' and drift['definitionsDiffer'] == ['auth.users']
    assert drift['rowsDiffer'] == [] and drift['roleAndSchemaAccessMatch']
    target.query(database, 'REVOKE SELECT ON auth.users FROM authenticated', owner)
    target.query(database, 'GRANT CREATE ON SCHEMA auth TO authenticated', owner)
    drift = verify(reference, target, fixture, include_auth=True)
    assert drift['status'] == 'MISMATCH' and not drift['roleAndSchemaAccessMatch']
    assert drift['rowsDiffer'] == [] and drift['definitionsDiffer'] == []
    target.query(database, 'REVOKE CREATE ON SCHEMA auth FROM authenticated', owner)
    target.query(database, 'ALTER ROLE supabase_auth_admin LOGIN', owner)
    drift = verify(reference, target, fixture, include_auth=True)
    assert drift['status'] == 'MISMATCH' and not drift['roleAndSchemaAccessMatch']
    assert drift['rowsDiffer'] == [] and drift['definitionsDiffer'] == []
    target.query(database, 'ALTER ROLE supabase_auth_admin NOLOGIN', owner)
    assert verify(reference, target, fixture, include_auth=True)['status'] == 'MATCH'
    checks.append('Independent changes to an Auth table grant, the Auth schema ACL and the Auth service role each fail the comparison.')

    target.query(database, 'ALTER TABLE auth.identities RENAME TO missing_identities', owner)
    assert verify(reference, target, fixture, include_auth=True)['check'] == 'local_snapshot_unavailable'
    target.query(database, 'ALTER TABLE auth.missing_identities RENAME TO identities', owner)
    assert verify(reference, target, fixture, include_auth=True)['status'] == 'MATCH'
    checks.append('A missing Auth relation fails closed without exposing raw database diagnostics.')


def exercise(temp, fixture, checker, result):
    source = fixture['Cluster'](temp / 'source', fixture['OWNER'])
    target = fixture['Cluster'](temp / 'target', fixture['RESTORE_ADMIN'])
    source_db, target_db, owner = (fixture[k] for k in ('SOURCE_DB', 'RESTORED_DB', 'OWNER'))
    reference, archive, roles = (temp / name for name in ('reference.json', 'source.pgcustom', 'roles.sql'))
    legacy_reference = temp / 'core-practice-reference.json'
    auth_reference = temp / 'with-auth-reference.json'
    omitted_archive = temp / 'without-auth-data.pgcustom'
    omitted_database = 'soe_without_auth_data'
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
            capture = (*source.psql(source_db), '-c', transaction, '-f', REFERENCE, '-c', 'ROLLBACK;')
            raw = fixture['run']('psql', *capture)
            parsed = checker['decode_reference'](raw.encode())
            assert parsed['tables']['reading_progress']['rows'] == 4098
            assert all(parsed['tables'][name]['rows'] > 0 for name in checker['ROOM_TABLES'])
            reference.write_text(raw + '\n')
            legacy = fixture['run']('psql', '-v', 'soe_restore_include_rooms=off', *capture)
            legacy_reference.write_text(legacy + '\n')
            auth = fixture['run']('psql', '-v', 'soe_restore_include_auth=on', *capture)
            auth_reference.write_text(auth + '\n')
            source.query(source_db, """
              UPDATE question_responses SET response_text = 'LATER_SOURCE_WRITE';
              UPDATE room_transcripts SET content = 'LATER_SOURCE_TRANSCRIPT';
              UPDATE auth.users SET encrypted_password = 'LATER_SOURCE_PASSWORD';
            """)
            fixture['run']('pg_dump', *source.connection(), '--format=custom', '--snapshot', snapshot,
                           '--file', archive, '-d', source_db)
            fixture['run']('pg_dump', *source.connection(), '--format=custom', '--snapshot', snapshot,
                           '--exclude-table-data=auth.users', '--exclude-table-data=auth.identities',
                           '--file', omitted_archive, '-d', source_db)
        fixture['run']('pg_dumpall', *source.connection(), '--roles-only', '--no-role-passwords',
                       '-l', 'postgres', '-f', roles)
        target.file('postgres', roles)
        target.restore(target_db, archive)
        target.restore(omitted_database, omitted_archive)
        assert target.query(omitted_database, 'SELECT count(*) FROM auth.users', owner) == '0'
        assert target.query(omitted_database, 'SELECT count(*) FROM auth.identities', owner) == '0'
        assert verify(reference, target, fixture, database=omitted_database)['status'] == 'MATCH'
        checks.append('The 14-table comparison passes on a restored archive with no Auth rows, proving the need for a separate account-inclusive check.')
        exercise_auth_restore(target, target_db, auth_reference, reference, omitted_database, fixture, checks)
        match = verify(reference, target, fixture)
        assert match['status'] == 'MATCH' and match['tablesCompared'] == 14 and match['roleAndSchemaAccessMatch']
        assert match['scope'] == checker['FORMAT']
        assert source.query(source_db, "SELECT count(*) FROM question_responses WHERE response_text = 'LATER_SOURCE_WRITE'") == '1'
        assert source.query(source_db, "SELECT count(*) FROM room_transcripts WHERE content = 'LATER_SOURCE_TRANSCRIPT'") == '1'
        assert target.query(target_db, f"SELECT count(*) FROM question_responses WHERE response_text = '{PRIVATE_TEXT}'") == '1'
        assert target.query(target_db, f"SELECT count(*) FROM room_transcripts WHERE content = '{PRIVATE_TRANSCRIPT}'") == '1'
        checks.append('All 14 restored tables match a reference from the same snapshot despite later source writes to answers and transcripts.')

        legacy_match = verify(legacy_reference, target, fixture, core_practice_only=True)
        assert legacy_match['status'] == 'MATCH' and legacy_match['tablesCompared'] == 11
        assert legacy_match['scope'] == checker['CORE_PRACTICE_FORMAT']
        assert verify(legacy_reference, target, fixture)['check'] == 'private_reference_invalid'
        assert verify(reference, target, fixture, core_practice_only=True)['check'] == 'private_reference_invalid'
        partial_reference = temp / 'incomplete-room-reference.json'
        partial_reference.write_text(json.dumps({**parsed, 'tables': {
            name: table for name, table in parsed['tables'].items() if name != 'room_transcripts'
        }}))
        assert verify(partial_reference, target, fixture)['check'] == 'private_reference_invalid'
        checks.append('The earlier 11-table reference remains usable in explicit Core and Practice mode. Both wrong-scope formats and a partial room reference are refused.')

        target.query(target_db, """
          UPDATE question_responses SET response_text = 'SYNTHETIC_DRIFT';
          UPDATE room_transcripts SET content = 'SYNTHETIC_TRANSCRIPT_DRIFT';
          UPDATE room_participants SET left_at = joined_at;
          UPDATE video_rooms SET daily_room_url = 'https://fixture.invalid/changed' WHERE room_name = 'past-fixture';
        """, owner)
        drift = verify(reference, target, fixture)
        assert drift['status'] == 'MISMATCH' and drift['rowsDiffer'] == [
            'question_responses', 'room_participants', 'room_transcripts', 'video_rooms',
        ]
        assert drift['definitionsDiffer'] == [] and drift['roleAndSchemaAccessMatch']
        target.query(target_db, f"""
          UPDATE question_responses SET response_text = '{PRIVATE_TEXT}';
          UPDATE room_transcripts SET content = '{PRIVATE_TRANSCRIPT}';
          UPDATE room_participants SET left_at = NULL;
          UPDATE video_rooms SET daily_room_url = 'https://soe-fixture.daily.co/past-fixture' WHERE room_name = 'past-fixture';
        """, owner)
        checks.append('Same-count changes to an answer, attendance, a transcript and a room link are detected. The receipt names the affected tables.')

        target.query(target_db, 'ALTER TABLE daily_questions DISABLE ROW LEVEL SECURITY', owner)
        target.query(target_db, 'REVOKE SELECT(email) ON members FROM anon', owner)
        target.query(target_db, 'ALTER TABLE room_participants ENABLE ROW LEVEL SECURITY', owner)
        target.query(target_db, 'REVOKE SELECT ON room_transcripts FROM authenticated', owner)
        target.query(target_db, 'GRANT unrelated_reader TO authenticated')
        drift = verify(reference, target, fixture)
        assert drift['status'] == 'MISMATCH' and drift['rowsDiffer'] == []
        assert drift['definitionsDiffer'] == ['daily_questions', 'members', 'room_participants', 'room_transcripts']
        assert not drift['roleAndSchemaAccessMatch']
        target.query(target_db, 'REVOKE unrelated_reader FROM authenticated')
        target.query(target_db, 'GRANT SELECT(email) ON members TO anon WITH GRANT OPTION', owner)
        target.query(target_db, 'ALTER TABLE daily_questions ENABLE ROW LEVEL SECURITY', owner)
        target.query(target_db, 'ALTER TABLE room_participants DISABLE ROW LEVEL SECURITY', owner)
        target.query(target_db, 'GRANT SELECT ON room_transcripts TO authenticated', owner)
        checks.append('With all rows intact, the comparison detects changes to RLS, table and column grants, and an inherited role.')

        target.query(target_db, 'ALTER TABLE room_transcripts RENAME TO missing_room_transcripts', owner)
        assert verify(reference, target, fixture)['check'] == 'local_snapshot_unavailable'
        assert verify(legacy_reference, target, fixture, core_practice_only=True)['status'] == 'MATCH'
        target.query(target_db, 'ALTER TABLE missing_room_transcripts RENAME TO room_transcripts', owner)
        reference.chmod(0o644)
        assert verify(reference, target, fixture)['check'] == 'private_reference_invalid'
        reference.chmod(0o600)
        socket_link = temp / 'socket-link'
        socket_link.symlink_to(target.socket)
        assert verify(reference, target, fixture, **{'socket-dir': socket_link})['check'] == 'private_socket_required'
        wrong_version = temp / 'wrong-major.json'
        wrong_version.write_text(json.dumps({**parsed, 'serverMajor': parsed['serverMajor'] + 1}))
        assert verify(wrong_version, target, fixture)['check'] == 'postgres_major'
        checks.append('A missing room table prevents a full comparison. A shared reference, linked socket and different PostgreSQL major also cause failure.')

        assert verify(reference, target, fixture)['status'] == 'MATCH'
        target.file(target_db, PRACTICE_SAVE, owner, 'PT409')
        assert target.query(target_db, "SELECT to_regprocedure('public.soe_practice_response_save(uuid,uuid,text)') IS NULL", owner) == 't'
        checks.append('The save draft refuses a database with the old browser grants and leaves no function behind.')
        target.file(target_db, fixture['SQL']['preflight'], owner)
        target.file(target_db, fixture['SQL']['apply'], owner)
        target.file(target_db, PRACTICE, owner)
        target.file(target_db, LIVE_ROOMS, owner)
        drift = verify(reference, target, fixture)
        assert drift['status'] == 'MISMATCH' and drift['rowsDiffer'] == []
        assert set(drift['definitionsDiffer']) == checker['TABLES'] and drift['roleAndSchemaAccessMatch']
        for table in sorted(checker['TABLES']):
            for role in ('anon', 'authenticated'):
                target.query(target_db, f'SET ROLE {role}; SELECT count(*) FROM public.{table}', owner, '42501')
            count = target.query(target_db, f'SET ROLE service_role; SELECT count(*) FROM public.{table}', owner)
            assert count == str(parsed['tables'][table]['rows'])
        checks.append('The Core, Daily Practice and Live Council changes preserve all restored rows. Both browser roles lose reads and service reads survive on all 14 tables.')
        assert target.query(target_db, """
          SET ROLE service_role;
          SELECT public.soe_join_live_council('30000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000002', 'https://soe-fixture.daily.co/live-fixture');
        """, owner) == 't'
        assert target.query(target_db, 'SELECT count(*) FROM room_participants', owner) == '2'
        checks.append('The installed service join records attendance on the same restored database after all three privacy drafts.')
        exercise_practice_save(target, target_db, fixture, checks)
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
    for path in (CHECKER, CORE_REHEARSAL, REFERENCE, PRACTICE, PRACTICE_SAVE, LIVE_ROOMS, ROOM_FIXTURE, QUESTIONS, REFLECTIONS):
        resident(path)
    fixture, checker = (runpy.run_path(str(path)) for path in (CORE_REHEARSAL, CHECKER))
    inputs = [SCRIPT, CHECKER, CORE_REHEARSAL, REFERENCE, PRACTICE, PRACTICE_SAVE, LIVE_ROOMS, ROOM_FIXTURE, QUESTIONS, REFLECTIONS,
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
