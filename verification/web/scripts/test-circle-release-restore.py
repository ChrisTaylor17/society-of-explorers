"""Dump and restore used Circle state with the release's actual PostgreSQL routines."""

from itertools import count
import json
import os
from pathlib import Path
import runpy
import shutil
import signal
import stat
import subprocess
from tempfile import mkdtemp
from uuid import UUID


SCRIPT = Path(__file__).resolve()
ROOT = SCRIPT.parents[3]
RESTORE_TEST = SCRIPT.with_name('test-privacy-restore-check.py')
EXPORT_FIXTURE = ROOT / 'verification/web/tests/support/export-native-cutover-fixture.mjs'
NETWORK_GUARD = SCRIPT.with_name('deny-build-network.cjs')
EXTRA_MIGRATIONS = [ROOT / f'docs/sql/{name}-apply.sql' for name in (
    'wallet-challenge-consumption', 'wallet-session-revocation', 'circle-salon-presence',
)]
EDITIONS = ROOT / 'lib/circles/reading-program-editions.json'
HOST = '11111111-1111-4111-8111-111111111111'
REVIEWER = '22222222-2222-4222-8222-222222222222'
READER = '44444444-4444-4444-8444-444444444444'
OUTSIDER = '66666666-6666-4666-8666-666666666666'
MEETING = 'https://meeting.fixture.invalid/private-salon'
POST = 'PRIVATE_SYNTHETIC_POST_FOR_REVIEW'
POLICY = 'anthropic-message-review-v1'
PRESENCE = 'public.soe_circle_salon_presence(uuid,uuid,uuid,text)'


def literal(value):
    if value is None:
        return 'NULL'
    if type(value) is bool:
        return 'true' if value else 'false'
    if type(value) is int:
        return str(value)
    if isinstance(value, dict):
        value = json.dumps(value)
    return "'" + value.replace("'", "''") + "'"


def invoke(cluster, database, owner, action, *args, refusal=None):
    call = f"SELECT public.soe_circle_{action}({', '.join(map(literal, args))})"
    result = cluster.query(database, f'SET ROLE service_role; {call}', owner, sqlstate=refusal)
    return json.loads(result) if refusal is None else None


def seed_circle(query, rpc):
    keys = count(1)
    def key():
        return str(UUID(int=next(keys), version=4))

    day, weekday = query("SELECT CURRENT_DATE+1, extract(dow FROM CURRENT_DATE+1)::int").split('|')
    edition = next(row for row in json.loads(EDITIONS.read_text()) if row['bookId'] == 'apology')
    created = rpc('create', HOST, key(), {
        'title': 'Synthetic restore Circle', 'description': 'A disposable recovery rehearsal.',
        'format': 'online', 'city': None, 'region': None, 'venueName': None, 'venueType': 'online',
        'weekday': int(weekday), 'time': '19:00', 'timezone': 'UTC', 'startDate': day,
        'maxMembers': 8, 'onlineUrl': MEETING,
        'readingProgram': {'version': 1, 'bookId': edition['bookId'], 'editionId': edition['editionId'],
                           'sessions': [{'from': 0, 'to': 10}]},
    })
    circle = created['circleId']
    joined = rpc('join', READER, circle, created['state']['revision'], key())
    attendance = (READER, circle, joined['state']['revision'], key(), day, 'going')
    assert rpc('rsvp', *attendance)['replayed'] is False
    passage = {'version': 1, 'bookId': edition['bookId'], 'editionId': edition['editionId'],
               'blockIndex': 0, 'start': 0, 'end': 24}
    assert rpc('passage_post', READER, circle, key(), 'Synthetic reading comment.', passage, 'Reader')['message']['id']
    message = rpc('discussion_post', READER, circle, key(), POST, None, None, None, 'Reader')['message']['id']
    anchor = rpc('discussion_target', HOST, circle, message)['target']
    assert rpc('discussion_post', HOST, circle, key(), 'A synthetic reply.', message,
               anchor['revision'], anchor['contentHash'], 'Host')['message']['id']

    query(f"INSERT INTO public.circle_reviewer_grants(cohort_id,member_id) VALUES ('{circle}','{REVIEWER}')")
    assert rpc('report', OUTSIDER, None, circle, 'safety', 'Synthetic listing concern.', key())['received']
    listing = rpc('review_detail', REVIEWER, circle)
    assert rpc('review_decide', REVIEWER, circle, listing['revision'], key(), 'restore', 'no_violation',
               'Synthetic listing evidence reviewed.', None, None)['replayed'] is False

    identity = (READER, circle, message)
    initial = rpc('message_ai_consent_state', *identity)
    content_hash = initial['contentHash']
    rpc('message_action', HOST, circle, message, initial['messageRevision'], content_hash, key(),
        'report', 'safety', 'PRIVATE_SYNTHETIC_REVIEW_NOTE')
    allowed = rpc('message_ai_consent_set', *identity, initial['consentRevision'], content_hash, POLICY, True)
    snapshot = rpc('message_ai_snapshot', REVIEWER, circle, message)
    query("""
      UPDATE public.circle_message_ai_allowance SET enabled=true, starts_at=now()-interval '1 minute',
        ends_at=now()+interval '1 hour', global_limit=1, per_reviewer_limit=1 WHERE singleton=1
    """)
    attempt = key()
    assert rpc('message_ai_reserve', REVIEWER, circle, message, attempt, snapshot['revision'],
               content_hash, allowed['consentRevision'], POLICY)['attemptId'] == attempt
    query("UPDATE public.circle_message_ai_allowance SET enabled=false WHERE singleton=1")
    revoked = rpc('message_ai_consent_set', *identity, allowed['consentRevision'], content_hash, POLICY, False)
    assert revoked['allowed'] is False and revoked['consentRevision'] == 2

    report = rpc('message_review_detail', REVIEWER, circle, message)
    revision = report['revision']
    coverage = rpc('review_coverage_start', REVIEWER, circle, message, revision, content_hash)
    assert coverage['totalReports'] == 1
    assert rpc('review_coverage_ack', REVIEWER, circle, message, coverage['sessionId'], coverage['pageToken'])['complete']
    decision = (REVIEWER, circle, message, coverage['sessionId'], revision, content_hash, key(),
                'hide', 'safety', 'Synthetic reviewer considered the report.', None, POST)
    assert rpc('review_coverage_decide', *decision)['replayed'] is False
    lease = key()
    assert rpc('salon_presence', READER, circle, lease, 'reserve')['state'] == 'reserved'
    assert rpc('salon_presence', READER, circle, lease, 'sync')['count'] == 1
    return circle, message, identity, revoked, attendance, decision


def exercise(temp, harness, kit, checker, result):
    owner, source_db, restored = (kit[key] for key in ('OWNER', 'SOURCE_DB', 'RESTORED_DB'))
    source, target = (kit['Cluster'](temp / name, owner) for name in ('source', 'target'))
    omitted = 'soe_omitted_circle_state'
    tables = sorted(checker['CIRCLE_RELEASE_TABLES'])
    checks = result['checks']
    try:
        subprocess.run(['/opt/homebrew/bin/node', '--require', str(NETWORK_GUARD), str(EXPORT_FIXTURE), str(temp)],
                       env=kit['ENV'], cwd=ROOT, check=True, timeout=20)
        result['fixture'] = json.loads((temp / 'inputs.json').read_bytes())
        source.start()
        target.start()
        source.query('postgres', f'CREATE DATABASE {source_db}')
        source.file(source_db, temp / 'baseline.sql')
        applied = source.file(source_db, temp / 'cutover.sql')
        assert [line.removeprefix('SOE_MIGRATION ') for line in applied.splitlines()
                if line.startswith('SOE_MIGRATION ')] == result['fixture']['files']
        for path in EXTRA_MIGRATIONS:
            source.file(source_db, path)

        # The older restore rehearsal covers the separate schemas' real fixtures.
        # Here they supply only unrelated prerequisites for the strict 42-table scope.
        source.query(source_db, """
          CREATE ROLE supabase_auth_admin;
          CREATE TABLE auth.users(id uuid PRIMARY KEY);
          CREATE TABLE auth.identities(id uuid PRIMARY KEY);
          ALTER TABLE auth.users OWNER TO supabase_auth_admin;
          ALTER TABLE auth.identities OWNER TO supabase_auth_admin;
        """)
        for name in ('daily_questions', 'matched_conversations', 'practice_reflections', 'question_responses',
                     'video_rooms', 'room_participants', 'room_transcripts', 'direct_messages'):
            source.query(source_db, f'CREATE TABLE public.{name}(id uuid PRIMARY KEY)')
        source.query(source_db, 'CREATE PUBLICATION supabase_realtime')
        assert source.query(source_db, """
          SELECT string_agg(relname,',' ORDER BY relname) FROM pg_class
          WHERE relnamespace='public'::regnamespace AND relkind='r' AND relname ~ '^circle_'
        """).split(',') == tables

        def current(action, *args, **options):
            return invoke(source, source_db, owner, action, *args, **options)

        circle, message, identity, revoked, attendance, decision = seed_circle(
            lambda sql: source.query(source_db, sql), current)
        assert all(source.query(source_db, f'SELECT count(*) > 0 FROM public.{name}') == 't' for name in tables)
        checks.append('The actual release SQL writes state into all 20 new Circle tables.')
        legacy_ref, release_ref, complete_dump, incomplete_dump, roles = (temp / name for name in (
            'legacy-reference.json', 'release-reference.json', 'complete.dump', 'incomplete.dump', 'roles.sql',
        ))
        with harness['export_snapshot'](source, kit) as snapshot:
            capture = (*source.psql(source_db), '-c', f"{checker['BEGIN']} SET TRANSACTION SNAPSHOT '{snapshot}';",
                       '-f', harness['REFERENCE'], '-c', 'ROLLBACK;')
            legacy_ref.write_text(kit['run']('psql', '-v', 'soe_restore_include_circles=on',
                                            '-v', 'soe_restore_include_wallet_state=on', *capture) + '\n')
            release_ref.write_text(kit['run']('psql', '-v', 'soe_restore_include_circle_release_state=on', *capture) + '\n')
            # A later author action must not enter either archive or reference.
            latest = current('message_ai_consent_set', *identity, revoked['consentRevision'], revoked['contentHash'], POLICY, False)
            assert latest['consentRevision'] == 3
            dump = (*source.connection(), '--format=custom', '--snapshot', snapshot, '-d', source_db)
            kit['run']('pg_dump', *dump, '--file', complete_dump)
            kit['run']('pg_dump', *dump, '--file', incomplete_dump,
                       *(f'--exclude-table-data=public.{name}' for name in tables))

        kit['run']('pg_dumpall', *source.connection(), '--roles-only', '--no-role-passwords', '--quote-all-identifiers',
                   '-l', 'postgres', '-f', roles)
        # Both clusters already have the same bootstrap role. Keep the ALTER
        # ROLE and every GRANTED BY entry so the restore preserves grantors.
        create_owner = f'CREATE ROLE "{owner}";'
        role_dump = roles.read_text().splitlines()
        assert role_dump.count(create_owner) == 1
        roles.write_text('\n'.join(line for line in role_dump if line != create_owner) + '\n')
        target.file('postgres', roles)
        target.restore(omitted, incomplete_dump)
        target.restore(restored, complete_dump)
        def verify(database=restored, reference=release_ref, legacy=False):
            return harness['verify'](reference, target, kit, database=database,
                                     include_circles=legacy, include_wallet=legacy, include_circle_release=not legacy)

        previous = verify(omitted, legacy_ref, legacy=True)
        assert previous['status'] == 'MATCH' and previous['tablesCompared'] == 22
        checks.append('The existing 22-table check matches a restored archive that omitted all 20 new Circle row sets.')
        missing = verify(omitted)
        assert missing['status'] == 'MISMATCH' and missing['tablesCompared'] == 42, missing
        assert missing['rowsDiffer'] == tables and not missing['definitionsDiffer'] and missing['circleRoutinesMatch'], missing
        checks.append('The release scope detects every omitted row set with definitions and routines intact.')
        matched = verify()
        assert matched['status'] == 'MATCH' and matched['tablesCompared'] == 42 and matched['circleRoutinesMatch'], matched
        result['comparisons'] = {'oldScopeOmitted': previous, 'releaseScopeOmitted': missing, 'releaseScopeComplete': matched}
        checks.append('The complete archive matches the reference across 42 tables and both routine groups.')

        def rpc(action, *args, **options):
            return invoke(target, restored, owner, action, *args, **options)

        assert rpc('detail_profiles', READER, circle)['online_url'] == MEETING
        assert rpc('detail_profiles', OUTSIDER, circle)['online_url'] is None
        assert rpc('rsvp', *attendance)['replayed'] and rpc('review_coverage_decide', *decision)['replayed']
        post = next(row for row in rpc('discussion_read_profiles', READER, circle, None, 25)['items'] if row['id'] == message)
        assert post['visibility'] == 'hidden' and post['content'] != POST
        assert rpc('message_ai_consent_state', *identity)['consentRevision'] == 2
        assert rpc('message_ai_consent_state', *identity)['allowed'] is False
        rpc('message_ai_consent_set', *identity, 1, revoked['contentHash'], POLICY, True, refusal='PT409')
        assert target.query(restored, "SELECT count(*)=1 FROM public.circle_message_ai_attempts", owner) == 't'
        assert target.query(restored, "SELECT NOT enabled FROM public.circle_message_ai_allowance WHERE singleton=1", owner) == 't'
        assert verify() == matched
        checks.append('Restored routes retain member-only meeting access, exact RSVP and review replay, hidden text, revoked consent and the spent AI attempt.')

        for role in ('anon', 'authenticated'):
            target.query(restored, f'SET ROLE {role}; SELECT allowed FROM public.circle_message_ai_consents', owner, sqlstate='42501')
            assert target.query(restored, f"""
              SELECT NOT EXISTS(SELECT FROM pg_class
              WHERE relnamespace='public'::regnamespace AND relkind='r' AND relname ~ '^circle_'
                AND (has_table_privilege('{role}',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
                  OR has_any_column_privilege('{role}',oid,'SELECT,INSERT,UPDATE,REFERENCES')))
              AND NOT EXISTS(SELECT FROM pg_proc
              WHERE pronamespace='public'::regnamespace AND proname ~ '^_?soe_circle_'
                AND has_function_privilege('{role}',oid,'EXECUTE'))
            """, owner) == 't'
        checks.append('Both browser roles remain denied raw Circle tables, columns and routines after restore.')

        target.query(restored, f"""
          GRANT SELECT(allowed) ON public.circle_message_ai_consents TO authenticated;
          ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.circle_salon_presence;
          COMMENT ON TABLE public.circle_message_ai_allowance IS 'Different fixture marker';
          ALTER TABLE public.circle_message_decisions DROP CONSTRAINT circle_message_decisions_report_count_check;
          ALTER TABLE public.circle_message_decisions ADD CONSTRAINT circle_message_decisions_report_count_check CHECK(report_count>=-1);
          GRANT EXECUTE ON FUNCTION {PRESENCE} TO anon;
        """, owner)
        drift = verify()
        assert drift['status'] == 'MISMATCH' and drift['rowsDiffer'] == [] and not drift['circleRoutinesMatch']
        assert drift['definitionsDiffer'] == [
            'circle_message_ai_allowance', 'circle_message_ai_consents', 'circle_message_decisions', 'circle_salon_presence',
        ], drift
        result['comparisons']['releaseScopeDefinitionDrift'] = drift
        assert verify(reference=legacy_ref, legacy=True)['status'] == 'MATCH'
        checks.append('A changed check constraint, a migration comment, a browser column grant, a Realtime publication and a routine grant are detected without row drift.')
        target.query(restored, 'ALTER TABLE public.circle_message_ai_attempts RENAME TO missing_attempts', owner)
        assert verify()['check'] == 'local_snapshot_unavailable'
        assert verify(reference=legacy_ref)['check'] == 'private_reference_invalid'
        checks.append('A missing table or an older reference cannot satisfy the release scope.')
    finally:
        try:
            source.stop()
        finally:
            target.stop()
        result['clustersStopped'] = True


def main():
    os.umask(0o077)

    def load_helper(path):
        info = path.lstat()
        assert stat.S_ISREG(info.st_mode) and info.st_blocks, path
        return runpy.run_path(str(path))

    harness = load_helper(RESTORE_TEST)
    kit, checker = (load_helper(harness[name]) for name in ('CORE_REHEARSAL', 'CHECKER'))
    paths = [SCRIPT, RESTORE_TEST, EXPORT_FIXTURE, NETWORK_GUARD, harness['CORE_REHEARSAL'], harness['CHECKER'],
             harness['REFERENCE'], EDITIONS, *EXTRA_MIGRATIONS]
    inputs = {str(path.relative_to(ROOT)): kit['digest'](path) for path in paths}
    result = {'status': 'FAIL', 'checks': [], 'sourceHashes': inputs, 'productionRestoreVerified': False,
              'postgres': kit['run']('postgres', '--version')}
    temp = Path(mkdtemp(prefix='soe-circle-release-proof-', dir='/private/tmp'))
    try:
        exercise(temp, harness, kit, checker, result)
        assert all(kit['digest'](ROOT / path) == digest for path, digest in inputs.items())
        assert all(kit['digest'](ROOT / path) == digest for path, digest in result['fixture']['sourceHashes'].items())
        result['status'] = 'PASS'
    except Exception as error:
        result['failure'] = str(error) or type(error).__name__
    finally:
        if result.get('clustersStopped'):
            shutil.rmtree(temp)
        result['temporaryDirectoryRemoved'] = not temp.exists()
        print(json.dumps(result, indent=2))
    return 0 if result['status'] == 'PASS' and result['temporaryDirectoryRemoved'] else 1


if __name__ == '__main__':
    def interrupt(_signal, _frame):
        raise InterruptedError('Owned restore rehearsal interrupted')

    signal.signal(signal.SIGTERM, interrupt)
    raise SystemExit(main())
