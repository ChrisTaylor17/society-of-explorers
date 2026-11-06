"""Rehearse the coordinated release on a restored database, then verify its recovery."""

from hashlib import sha256
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
from time import time
from uuid import UUID


SCRIPT = Path(__file__).resolve()
ROOT = SCRIPT.parents[3]
RESTORE_TEST = SCRIPT.with_name('test-privacy-restore-check.py')
EXPORT_FIXTURE = ROOT / 'verification/web/tests/support/export-native-cutover-fixture.mjs'
NETWORK_GUARD = SCRIPT.with_name('deny-build-network.cjs')
EXTRA_MIGRATIONS = [ROOT / f'docs/sql/{name}-apply.sql' for name in (
    'practice-data-containment', 'practice-response-save', 'direct-message-containment',
    'live-room-containment', 'wallet-challenge-consumption', 'wallet-session-revocation',
    'circle-salon-presence',
)]
EDITIONS = ROOT / 'lib/circles/reading-program-editions.json'
PHILEMON = ROOT / 'content/root-kernel/philemon.web-classic.json'
HOST = '11111111-1111-4111-8111-111111111111'
REVIEWER = '22222222-2222-4222-8222-222222222222'
READER = '44444444-4444-4444-8444-444444444444'
OUTSIDER = '66666666-6666-4666-8666-666666666666'
MEETING = 'https://meeting.fixture.invalid/private-salon'
POST = 'PRIVATE_SYNTHETIC_POST_FOR_REVIEW'
POLICY = 'anthropic-message-review-v1'
PRESENCE = 'public.soe_circle_salon_presence(uuid,uuid,uuid,text)'
PRACTICE_SAVE = 'public.soe_practice_response_save(uuid,uuid,text)'
LIVE_JOIN = 'public.soe_join_live_council(uuid,uuid,text)'
PRACTICE_PROMPT = '33333333-3333-4333-8333-333333333333'
LIVE_ROOM = '30000000-0000-4000-8000-000000000001'
LIVE_LINK = 'https://soe-fixture.daily.co/live-fixture'
NEW_ANSWER = 'Synthetic answer saved after the coordinated cutover.'


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
    scripture = json.loads(PHILEMON.read_bytes())
    digest = sha256(json.dumps(scripture, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
    philemon_program = {'version': 1, 'bookId': 'philemon', 'editionId': 'web-classic-' + digest,
                        'sessions': [{'from': 0, 'to': 0}]}
    philemon = rpc('create', HOST, key(), {
        'title': 'Synthetic Philemon salon', 'description': None, 'format': 'online', 'city': None,
        'region': None, 'venueName': None, 'venueType': 'online', 'weekday': int(weekday), 'time': '19:00',
        'timezone': 'UTC', 'startDate': day, 'maxMembers': 8, 'onlineUrl': MEETING,
        'readingProgram': philemon_program,
    })['circleId']
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
    return circle, message, identity, revoked, attendance, decision, philemon, philemon_program


def copy_roles(source, destination, kit, path):
    owner = kit['OWNER']
    kit['run']('pg_dumpall', *source.connection(), '--roles-only', '--no-role-passwords',
               '--quote-all-identifiers', '-l', 'postgres', '-f', path)
    # Both clusters already have the same bootstrap role. Retain its ALTER ROLE
    # and every GRANTED BY entry so restored grants keep their original grantors.
    create_owner = f'CREATE ROLE "{owner}";'
    lines = path.read_text().splitlines()
    assert lines.count(create_owner) == 1
    path.write_text('\n'.join(line for line in lines if line != create_owner) + '\n')
    destination.file('postgres', path)


def projected_rows(cluster, database, columns):
    # This small projection checks fixture rows across ALTER TABLE additions.
    # The operator reference uses the bounded, chunked snapshot query.
    return {
        table: cluster.query(database, f'''
            SELECT md5(coalesce(jsonb_agg(to_jsonb(original) ORDER BY original.id)::text, '[]'))
            FROM (SELECT {', '.join(fields)} FROM {table}) original
        ''')
        for table, fields in columns.items()
    }


def stage_restored_release(original, staged, database, temp, harness, kit, checker, result):
    original.query('postgres', f'CREATE DATABASE {database}')
    original.file(database, temp / 'baseline.sql')

    def baseline(sql):
        return original.query(database, 'SET ROLE postgres;\n' + sql)

    harness['seed_practice_rooms_and_auth'](baseline)
    baseline("""
        CREATE TABLE public.unrelated_public_catalog(id integer PRIMARY KEY);
        INSERT INTO public.unrelated_public_catalog VALUES (1);
        GRANT SELECT ON public.unrelated_public_catalog TO anon, authenticated;
    """)
    baseline(harness['resident'](harness['DIRECT_FIXTURE']).decode())
    baseline(f"""
        UPDATE public.members SET supabase_auth_id = '{harness['AUTH_SUBJECT']}' WHERE id = '{HOST}';
        UPDATE public.members SET supabase_auth_id = '{harness['SECOND_AUTH_SUBJECT']}' WHERE id = '{READER}';
    """)
    tables = sorted(checker['TABLES'] | checker['AUTH_TABLES'] | checker['DIRECT_TABLES'] | checker['CIRCLE_TABLES'])
    names = [table if '.' in table else f'public.{table}' for table in tables]
    columns = {
        table: json.loads(original.query(database, f'''
            SELECT json_agg(quote_ident(attname) ORDER BY attnum) FROM pg_attribute
            WHERE attrelid={literal(table)}::regclass AND attnum>0 AND NOT attisdropped
        '''))
        for table in names
    }
    original_rows = projected_rows(original, database, columns)
    reference, archive = temp / 'before.json', temp / 'before.dump'
    with harness['export_snapshot'](original, kit, database=database) as snapshot:
        capture = (*original.psql(database), '-c', f"{checker['BEGIN']} SET TRANSACTION SNAPSHOT '{snapshot}';",
                   '-f', harness['REFERENCE'], '-c', 'ROLLBACK;')
        reference.write_text(kit['run']('psql', '-v', 'soe_restore_include_circles=on', *capture) + '\n')
        kit['run']('pg_dump', *original.connection(), '--format=custom', '--snapshot', snapshot,
                   '--file', archive, '-d', database)
    copy_roles(original, staged, kit, temp / 'roles.sql')
    staged.restore(database, archive)
    matched = harness['verify'](reference, staged, kit, database=database, include_circles=True)
    assert matched['status'] == 'MATCH' and matched['tablesCompared'] == len(tables) == 20, matched
    assert projected_rows(staged, database, columns) == original_rows
    result['beforeCutover'] = matched
    result['checks'].append('The pre-cutover archive and role export restore into a separate cluster and match all 20 tables.')
    for role in ('anon', 'authenticated'):
        assert staged.query(database, f'SET ROLE {role}; SELECT count(*)=4 FROM public.direct_messages') == 't'
        assert staged.query(database, f'SET ROLE {role}; SELECT count(*)=1 FROM public.question_responses') == 't'
        assert staged.query(database, f'SET ROLE {role}; SELECT count(*)=1 FROM public.room_transcripts') == 't'
    result['checks'].append('The restored pre-cutover fixture reproduces browser access to private answers, messages and transcripts.')

    applied = staged.file(database, temp / 'cutover.sql')
    order = [line.removeprefix('SOE_MIGRATION ') for line in applied.splitlines() if line.startswith('SOE_MIGRATION ')]
    assert order == result['fixture']['files']
    for path in EXTRA_MIGRATIONS:
        kit['run']('psql', *staged.psql(database), '-c', 'SET ROLE postgres', '-f', path)
        order.append(str(path.relative_to(ROOT)))
    assert projected_rows(staged, database, columns) == original_rows
    assert projected_rows(original, database, columns) == original_rows
    result['orderedMigrationFiles'] = order
    result['checks'].append('The complete ordered cutover runs on the restored copy and preserves every pre-cutover row in its original columns.')


def practice_sql(answer):
    return f"SELECT public.soe_practice_response_save('{READER}', '{PRACTICE_PROMPT}', {literal(answer)});"


def live_join_sql(link):
    return f"SELECT public.soe_join_live_council('{LIVE_ROOM}', '{READER}', {literal(link)});"


def seed_release_workflows(cluster, database, checks):
    service = 'SET ROLE service_role; '
    saved = json.loads(cluster.query(database, service + practice_sql(NEW_ANSWER)))
    assert saved['response']['response_text'] == NEW_ANSWER and saved['total'] == saved['streak'] == 1
    assert cluster.query(database, service + live_join_sql(LIVE_LINK + '-rotated')) == 'f'
    assert cluster.query(database, service + live_join_sql(LIVE_LINK)) == 't'
    now = int(time())
    challenge = f"SELECT public.soe_wallet_challenge_consume('{'3' * 64}', {now + 500});"
    revoke = f"SELECT public.soe_wallet_session_access('{'4' * 64}', {now + 3600}, true);"
    assert cluster.query(database, service + challenge) == 't'
    assert cluster.query(database, service + revoke) == 't'
    checks.append('Practice save, Live Council join, wallet challenge consumption and revocation write real release state.')
    return saved, challenge, revoke.replace(', true)', ', false)'), now + 500


def prove_adjacent_workflows(cluster, database, harness, checker, saved, challenge, access, deadline):
    assert time() < deadline, 'The fixture challenge expired before the replay check'
    service = 'SET ROLE service_role; '
    # Verify a real save through the restored routine, then roll the change
    # back so the archive comparison can still cover the exact original state.
    answer = 'Synthetic edit on the recovered database.'
    edited = json.loads(cluster.query(database, 'BEGIN; SET LOCAL ROLE service_role; ' + practice_sql(answer) + ' ROLLBACK;'))
    assert edited['response']['id'] == saved['response']['id']
    assert edited['response']['response_text'] == answer and edited['total'] == saved['total']
    assert cluster.query(database, service + live_join_sql(LIVE_LINK + '-rotated')) == 'f'
    assert cluster.query(database, service + live_join_sql(LIVE_LINK)) == 't'
    assert cluster.query(database, service + challenge) == 'f'
    assert cluster.query(database, service + access) == 'f'
    assert cluster.query(database, service + access.replace('4' * 64, '6' * 64)) == 't'
    assert cluster.query(database, service + f"SELECT content FROM public.direct_messages WHERE id='{harness['FIRST_MESSAGE']}';") == harness['DIRECT_TEXT']
    assert cluster.query(database, f'''
        SELECT count(*)=1 FROM public.members member JOIN auth.users account ON account.id=member.supabase_auth_id
        JOIN auth.identities identity ON identity.user_id=account.id WHERE member.id='{HOST}' AND identity.provider='google'
    ''') == 't'
    assert cluster.query(database, """
        SELECT array_agg(tablename::text ORDER BY tablename)::text
        FROM pg_publication_tables WHERE pubname='supabase_realtime'
    """) == '{unrelated_public_catalog}'
    for role in ('anon', 'authenticated'):
        for sql in (practice_sql('Denied'), live_join_sql(LIVE_LINK), challenge, access):
            cluster.query(database, f'SET ROLE {role}; ' + sql, sqlstate='42501')
        for table in sorted(checker['TABLES'] | checker['DIRECT_TABLES'] | checker['CIRCLE_TABLES']):
            assert cluster.query(database, f'''
                SELECT NOT has_table_privilege('{role}', 'public.{table}', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
                  AND NOT has_any_column_privilege('{role}', 'public.{table}', 'SELECT,INSERT,UPDATE,REFERENCES')
            ''') == 't', table


def exercise(temp, harness, kit, checker, result):
    owner, source_db, restored = (kit[key] for key in ('OWNER', 'SOURCE_DB', 'RESTORED_DB'))
    target, source = (kit['Cluster'](temp / name, owner) for name in ('original', 'staged'))
    omitted = 'soe_omitted_circle_state'
    tables = sorted(checker['CIRCLE_RELEASE_TABLES'])
    checks = result['checks']
    try:
        subprocess.run(['/opt/homebrew/bin/node', '--require', str(NETWORK_GUARD), str(EXPORT_FIXTURE), str(temp)],
                       env=kit['ENV'], cwd=ROOT, check=True, timeout=20)
        result['fixture'] = json.loads((temp / 'inputs.json').read_bytes())
        target.start()
        source.start()
        stage_restored_release(target, source, source_db, temp, harness, kit, checker, result)
        assert source.query(source_db, """
          SELECT string_agg(relname,',' ORDER BY relname) FROM pg_class
          WHERE relnamespace='public'::regnamespace AND relkind='r' AND relname ~ '^circle_'
        """).split(',') == tables

        def current(action, *args, **options):
            return invoke(source, source_db, owner, action, *args, **options)

        circle, message, identity, revoked, attendance, decision, philemon, philemon_program = seed_circle(
            lambda sql: source.query(source_db, sql), current)
        saved, challenge, access, deadline = seed_release_workflows(source, source_db, checks)
        assert all(source.query(source_db, f'SELECT count(*) > 0 FROM public.{name}') == 't' for name in tables)
        checks.append('The actual release SQL writes state into all 20 new Circle tables.')
        legacy_ref, circle_only_ref, release_ref, complete_dump, incomplete_dump = (temp / name for name in (
            'legacy-reference.json', 'circle-reference.json', 'release-reference.json', 'complete.dump', 'incomplete.dump',
        ))
        with harness['export_snapshot'](source, kit) as snapshot:
            capture = (*source.psql(source_db), '-c', f"{checker['BEGIN']} SET TRANSACTION SNAPSHOT '{snapshot}';",
                       '-f', harness['REFERENCE'], '-c', 'ROLLBACK;')
            legacy_ref.write_text(kit['run']('psql', '-v', 'soe_restore_include_circles=on',
                                            '-v', 'soe_restore_include_wallet_state=on', *capture) + '\n')
            circle_only_ref.write_text(kit['run']('psql', '-v', 'soe_restore_include_circle_release_state=on', *capture) + '\n')
            release_ref.write_text(kit['run']('psql', '-v', 'soe_restore_include_first_release_state=on', *capture) + '\n')
            # A later author action must not enter either archive or reference.
            latest = current('message_ai_consent_set', *identity, revoked['consentRevision'], revoked['contentHash'], POLICY, False)
            assert latest['consentRevision'] == 3
            dump = (*source.connection(), '--format=custom', '--snapshot', snapshot, '-d', source_db)
            kit['run']('pg_dump', *dump, '--file', complete_dump)
            kit['run']('pg_dump', *dump, '--file', incomplete_dump,
                       *(f'--exclude-table-data=public.{name}' for name in tables))

        target.restore(omitted, incomplete_dump)
        target.restore(restored, complete_dump)
        def verify(database=restored, reference=release_ref, legacy=False):
            return harness['verify'](reference, target, kit, database=database,
                                     include_circles=legacy, include_wallet=legacy, include_first_release=not legacy)

        previous = verify(omitted, legacy_ref, legacy=True)
        assert previous['status'] == 'MATCH' and previous['tablesCompared'] == 22
        checks.append('The existing 22-table check matches a restored archive that omitted all 20 new Circle row sets.')
        missing = verify(omitted)
        assert missing['status'] == 'MISMATCH' and missing['tablesCompared'] == 42, missing
        assert missing['rowsDiffer'] == tables and not missing['definitionsDiffer'], missing
        assert missing['walletRoutinesMatch'] and missing['circleRoutinesMatch'] and missing['releaseServiceRoutinesMatch']
        checks.append('The release scope detects every omitted row set with definitions and routines intact.')
        matched = verify()
        assert matched['status'] == 'MATCH' and matched['tablesCompared'] == 42, matched
        assert matched['walletRoutinesMatch'] and matched['circleRoutinesMatch'] and matched['releaseServiceRoutinesMatch']
        result['comparisons'] = {'oldScopeOmitted': previous, 'releaseScopeOmitted': missing, 'releaseScopeComplete': matched}
        checks.append('The complete archive matches the reference across 42 tables and all three routine groups.')

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
        detail = rpc('detail_profiles', HOST, philemon)
        assert detail['circle']['circle_reading_program'] == philemon_program and len(detail['meetings']) == 1
        checks.append('The restored Philemon Circle keeps its exact one-meeting Scripture assignment.')
        prove_adjacent_workflows(target, restored, harness, checker, saved, challenge, access, deadline)
        assert verify() == matched
        checks.append('The recovered database preserves Auth linkage and direct messages, accepts a Practice edit and current Live Council link, denies wallet replay and retains the browser and Realtime restrictions.')
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

        circle_scope = harness['verify'](circle_only_ref, target, kit, database=restored, include_circle_release=True)
        assert circle_scope['status'] == 'MATCH' and circle_scope['scope'] == checker['CIRCLE_RELEASE_FORMAT']
        assert verify(reference=circle_only_ref)['check'] == 'private_reference_invalid'
        for name, change, undo in (
            ('practiceGrant',
             f'GRANT EXECUTE ON FUNCTION {PRACTICE_SAVE} TO anon',
             f'REVOKE EXECUTE ON FUNCTION {PRACTICE_SAVE} FROM anon'),
            ('liveCouncilSecurity',
             f'ALTER FUNCTION {LIVE_JOIN} SECURITY DEFINER',
             f'ALTER FUNCTION {LIVE_JOIN} SECURITY INVOKER'),
        ):
            target.query(restored, change)
            earlier = harness['verify'](circle_only_ref, target, kit, database=restored, include_circle_release=True)
            assert earlier == circle_scope
            changed = verify()
            assert changed == {**matched, 'status': 'MISMATCH', 'releaseServiceRoutinesMatch': False}, changed
            result['comparisons'][name] = changed
            target.query(restored, undo)
            assert verify() == matched
        checks.append('The earlier Circle scope misses a Practice execution grant and a Live Council security change. The first-release scope flags both with all table data intact.')
        target.query(restored, f'ALTER FUNCTION {LIVE_JOIN} RENAME TO soe_join_live_council_missing')
        assert harness['verify'](circle_only_ref, target, kit, database=restored, include_circle_release=True) == circle_scope
        missing_routine = verify()
        assert missing_routine['status'] == 'UNAVAILABLE' and missing_routine['check'] == 'local_snapshot_unavailable'
        target.query(restored, 'ALTER FUNCTION public.soe_join_live_council_missing(uuid,uuid,text) RENAME TO soe_join_live_council')
        assert verify() == matched
        result['comparisons']['missingLiveCouncilRoutine'] = missing_routine
        checks.append('The first-release scope refuses a missing service routine and requires its own reference format.')

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
        assert drift['releaseServiceRoutinesMatch'] and drift['walletRoutinesMatch']
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
             harness['REFERENCE'], EDITIONS, PHILEMON, *EXTRA_MIGRATIONS,
             *(harness[name] for name in ('QUESTIONS', 'REFLECTIONS', 'ROOM_FIXTURE', 'DIRECT_FIXTURE'))]
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
