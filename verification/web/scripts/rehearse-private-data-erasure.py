"""Exercise owner-reviewed private data erasure on an isolated release restore."""
import hashlib
import json
import os
from pathlib import Path
import runpy
import subprocess
from tempfile import TemporaryDirectory

SCRIPT = Path(__file__).resolve()
ROOT = SCRIPT.parents[3]
DRAFTS = [ROOT / 'docs/sql' / name for name in (
    'account-deletion-requests-apply.sql', 'account-erasure-access-apply.sql',
    'account-erasure-private-data-apply.sql',
)]
READING = ('reading_progress', 'book_highlights', 'great_books_progress',
           'great_books_highlights', 'book_reflections', 'thinker_memory')
REQUEST = '70000000-0000-4000-8000-000000000001'
NO_MEMBER_REQUEST = '70000000-0000-4000-8000-000000000002'
NO_MEMBER_SUBJECT = '70000000-0000-4000-8000-000000000003'
DIGEST = hashlib.sha256(bytes([7]) * 32).hexdigest()
EXTRA_QUESTION = '70000000-0000-4000-8000-000000000004'
EXTRA_ANSWER = '70000000-0000-4000-8000-000000000005'
READER_ANSWER = '70000000-0000-4000-8000-000000000006'
CROSS_REFLECTION = '70000000-0000-4000-8000-000000000007'
STALE_HIGHLIGHT = '70000000-0000-4000-8000-000000000008'
INBOUND_HIGHLIGHT = '70000000-0000-4000-8000-000000000009'
SCHEMA = 'soe_account_deletion_private'


def seed_records(execute, host, reader, circle, prompt):
    execute(f"""
      INSERT INTO public.reading_progress(member_id, book_id, section_id, paragraph_index) VALUES
        ('{host}', 'apology', 'legacy-section', 4), ('{reader}', 'apology', 'legacy-section', 3);
      INSERT INTO public.book_highlights(id,member_id,book_id,passage,thinker_id,annotation) VALUES
        ('{STALE_HIGHLIGHT}','{host}','apology','discarded draft highlight','socrates','private notes'),
        ('{INBOUND_HIGHLIGHT}','{host}','apology','selected highlight','socrates','private notes');
      INSERT INTO public.book_highlights(member_id,book_id,passage,thinker_id,annotation) VALUES
        ('{reader}','apology','reader highlight','socrates','reader notes');
      INSERT INTO public.book_reflections(id,cohort_id,member_id,private_text) VALUES
        (gen_random_uuid(),'{circle}','{host}','host reading reflection'),
        (gen_random_uuid(),'{circle}','{reader}','reader reflection');
      INSERT INTO public.daily_questions(id,thinker_id,question_text,date,engagement_score)
        VALUES ('{EXTRA_QUESTION}','socrates','Independent fixture prompt','2026-11-04',1);
      INSERT INTO public.question_responses(id,member_id,question_id,response_text) VALUES
        ('{EXTRA_ANSWER}','{host}','{EXTRA_QUESTION}','another private fixture answer'),
        ('{READER_ANSWER}','{reader}','{prompt}','keep the other reader answer');
      UPDATE public.daily_questions SET engagement_score=2 WHERE id='{prompt}';
      INSERT INTO public.practice_reflections(id,response_id,question_id,thinker_id,member_id,reflection_text) VALUES
        ('{CROSS_REFLECTION}','{EXTRA_ANSWER}','{EXTRA_QUESTION}','socrates','{reader}','other member owns this copy');
      INSERT INTO public.practice_reflections(response_id,question_id,thinker_id,member_id,reflection_text)
        VALUES ('{READER_ANSWER}','{prompt}','socrates','{reader}','keep the other reader reflection');
    """)
    for table in ('great_books_progress', 'great_books_highlights', 'thinker_memory'):
        execute(f"""INSERT INTO public.{table}(id,member_id,private_text) VALUES
          (gen_random_uuid(),'{host}','reviewed account fixture data'),
          (gen_random_uuid(),'{reader}','unrelated fixture data'),
          (gen_random_uuid(),NULL,'unattributed legacy fixture data')""")
    execute(f"SELECT public.soe_reading_progress_update('{host}',0,'republic','remove',NULL,NULL,NULL)",
            role='service_role')


def test_private_data(staged, original, database, owner, temp, release, harness, kit, result):
    checks = result['checks']
    host, reader = release['HOST'], release['READER']
    prompt, subject = release['PRACTICE_PROMPT'], harness['AUTH_SUBJECT']

    def run(sql, *, role='postgres', sqlstate=None, db=database):
        return staged.query(db, f'SET ROLE {role};\n' + sql, owner, sqlstate=sqlstate)

    circle, *_ = release['seed_circle'](
        lambda sql: staged.query(database, sql),
        lambda action, *args, **kwargs: release['invoke'](staged, database, owner, action, *args, **kwargs))
    seed_records(run, host, reader, circle, prompt)
    staged.query(database, f"INSERT INTO auth.users(id,email) VALUES ('{NO_MEMBER_SUBJECT}','provider-only@fixture.invalid')")
    for draft in DRAFTS:
        kit['run']('psql', *staged.psql(database), '-c', 'SET ROLE postgres', '-f', draft)
        result['orderedMigrationFiles'].append(str(draft.relative_to(ROOT)))
    assert len(result['orderedMigrationFiles']) == 51

    def queue(request, auth):
        statement = f"SELECT id FROM public.soe_account_deletion_request('supabase','{auth}','{request}','{DIGEST}',4)"
        assert run(statement, role='service_role') == request

    queue(REQUEST, subject)
    reviewed = f"'{REQUEST}','{host}','{subject}'"
    preview = f'SELECT {SCHEMA}.preview_private_data({reviewed})'
    run(preview, sqlstate='PT409')
    lock_test = runpy.run_path(str(SCRIPT.with_name('rehearse-erasure-access.py')))
    race = lock_test['race']
    race.__globals__['SOURCE'] = database
    race(staged, f'SET LOCAL ROLE postgres; SELECT {SCHEMA}.start_erasure({reviewed});',
         f"SET ROLE service_role; INSERT INTO public.book_highlights(member_id,book_id,passage,thinker_id) "
         f"VALUES ('{host}','apology','late fixture highlight','socrates');", 'PT403')
    assert run(f'SELECT {SCHEMA}.start_erasure({reviewed})')
    checks.append('An independent saved-highlight write waits on the start transaction and refuses the frozen account after commit.')
    run(f"SELECT {SCHEMA}.preview_private_data('{REQUEST}','{reader}','{subject}')", sqlstate='PT409')
    run(preview, sqlstate='PT409')
    assert run(f"SELECT count(*) FROM public.practice_reflections WHERE id='{CROSS_REFLECTION}'") == '1'
    assert run(f"SELECT count(*) FROM public.question_responses WHERE id='{EXTRA_ANSWER}'") == '1'
    assert run(f'SELECT count(*) FROM {SCHEMA}.private_data_receipts') == '0'
    checks.append('A request must be started for the exact owner, and a cross-member Practice dependency stops the entire erasure phase.')

    # Remove only the deliberately conflicting synthetic fixture copy.
    run(f"DELETE FROM public.practice_reflections WHERE id='{CROSS_REFLECTION}'")
    expected = json.loads(run(preview))
    assert expected == {
        'public.reading_progress': 3, 'public.book_highlights': 3,
        'public.great_books_progress': 2, 'public.great_books_highlights': 2,
        'public.book_reflections': 2, 'public.thinker_memory': 2,
        'public.practice_reflections': 1, 'public.question_responses': 2,
    }, expected

    for role in ('anon', 'authenticated', 'service_role'):
        run(preview, role=role, sqlstate='42501')
        run(f'SELECT * FROM {SCHEMA}.private_data_receipts', role=role, sqlstate='42501')
        run(f"SELECT * FROM {SCHEMA}.erase_private_data({reviewed},'{{}}')", role=role, sqlstate='42501')
    run(f"UPDATE public.book_highlights SET member_id='{reader}' WHERE id='{INBOUND_HIGHLIGHT}'",
        role='service_role', sqlstate='PT403')
    run(f"""INSERT INTO public.practice_reflections(response_id,question_id,thinker_id,member_id,reflection_text)
      VALUES ('{EXTRA_ANSWER}','{EXTRA_QUESTION}','socrates',NULL,'late reflection')
    """, role='service_role', sqlstate='PT403')
    run(f"SELECT public.soe_practice_response_save('{host}','{prompt}','late answer')", role='service_role', sqlstate='PT403')
    run(f"SELECT public.soe_reading_progress_update('{host}',1,'republic','save','fixture-edition',0,false)",
        role='service_role', sqlstate='PT403')
    assert json.loads(run(preview)) == expected
    assert json.loads(run(f"SELECT public.soe_practice_response_save('{reader}','{prompt}','keep the other reader answer')",
                          role='service_role'))['response']['id'] == READER_ANSWER
    checks.append('Only the database owner can erase, and the write barriers refuse late updates and derived copies while another account can save.')

    def erase(counts, **kwargs):
        return run(f"SELECT row_to_json(result) FROM {SCHEMA}.erase_private_data({reviewed},'{json.dumps(counts)}') AS result", **kwargs)

    run(f"""CREATE TABLE public.fixture_erasure_inbound (
      id uuid PRIMARY KEY REFERENCES public.book_highlights(id) ON DELETE CASCADE
    );
    INSERT INTO public.fixture_erasure_inbound VALUES ('{INBOUND_HIGHLIGHT}')""")
    erase(expected, sqlstate='PT409')
    assert run('SELECT count(*) FROM public.fixture_erasure_inbound') == '1'
    run('DROP TABLE public.fixture_erasure_inbound')
    run('ALTER TABLE public.thinker_memory DISABLE TRIGGER soe_guard_private_data_erasure')
    erase(expected, sqlstate='PT409')
    run('ALTER TABLE public.thinker_memory ENABLE TRIGGER soe_guard_private_data_erasure')
    run(f"DELETE FROM public.book_highlights WHERE id='{STALE_HIGHLIGHT}'")
    erase(expected, sqlstate='PT409')
    corrected = json.loads(run(preview))
    assert corrected == {**expected, 'public.book_highlights': 2}
    checks.append('An unknown cascading relationship, an inactive write barrier or changed reviewed counts prevents erasure before deletion.')

    run(f'ALTER TABLE {SCHEMA}.private_data_receipts ADD CONSTRAINT fixture_fail CHECK (false)')
    erase(corrected, sqlstate='23514')
    assert json.loads(run(preview)) == corrected
    assert run(f"SELECT engagement_score FROM public.daily_questions WHERE id='{prompt}'") == '2'
    assert run(f'SELECT count(*) FROM {SCHEMA}.private_data_receipts') == '0'
    run(f'ALTER TABLE {SCHEMA}.private_data_receipts DROP CONSTRAINT fixture_fail')
    checks.append('A late receipt failure rolls back all data removal and the shared Practice totals.')

    def snapshot(db=database):
        return {
            table: run(f"""SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id)::text,'[]'))
                          FROM public.{table} t WHERE t.member_id IS DISTINCT FROM '{host}'""", db=db)
            for table in READING
        } | {
            table: run(f"""SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id)::text,'[]')) FROM {table} t""", db=db)
            for table in ('public.members', 'public.seminar_messages', 'public.direct_messages', 'auth.users')
        }

    unrelated = snapshot()
    cleared = json.loads(erase(corrected))
    assert cleared['removed_counts'] == corrected
    assert json.loads(erase(corrected)) == cleared
    erase(expected, sqlstate='PT409')
    assert all(value == 0 for value in json.loads(run(preview)).values())
    assert snapshot() == unrelated
    assert run(f"SELECT engagement_score FROM public.daily_questions WHERE id='{prompt}'") == '1'
    assert run(f"SELECT count(*) FROM public.practice_reflections WHERE response_id='{READER_ANSWER}'") == '1'
    assert run(f"SELECT count(*) FROM public.question_responses WHERE id='{READER_ANSWER}'") == '1'
    checks.append('Erasure clears all eight reviewed stores and their owned Practice copies, preserves other records, and returns one exact receipt on retry.')

    queue(NO_MEMBER_REQUEST, NO_MEMBER_SUBJECT)
    provider_only = f"'{NO_MEMBER_REQUEST}',NULL,'{NO_MEMBER_SUBJECT}'"
    assert run(f'SELECT {SCHEMA}.start_erasure({provider_only})')
    no_member = json.loads(run(f'SELECT {SCHEMA}.preview_private_data({provider_only})'))
    assert all(value == 0 for value in no_member.values())
    assert run(f"SELECT count(*) FROM {SCHEMA}.erase_private_data({provider_only},'{json.dumps(no_member)}')") == '1'
    assert snapshot() == unrelated
    checks.append('The provider-only request records an empty private data phase without creating a member.')

    # Copy the full resulting database to a separately started cluster.
    archive = temp / 'erasure-complete.dump'
    staged.dump(database, archive)
    restored = 'soe_private_data_restored'
    original.restore(restored, archive)
    assert original.query(restored, f'SELECT count(*) FROM {SCHEMA}.private_data_receipts') == '2'
    after = original.query(restored, 'SET ROLE postgres; ' + preview)
    assert all(value == 0 for value in json.loads(after).values())
    replay = original.query(restored, f"SET ROLE postgres; SELECT row_to_json(result) FROM "
                            f"{SCHEMA}.erase_private_data({reviewed},'{json.dumps(corrected)}') AS result")
    assert json.loads(replay) == cleared
    assert original.query(restored, f"SET ROLE service_role; SELECT id FROM public.soe_account_deletion_status('{REQUEST}','{DIGEST}')") == REQUEST
    assert original.query(restored, f"SET ROLE service_role; SELECT public.soe_account_erasure_access_allowed('supabase','{subject}')") == 'f'
    assert original.query(restored, f"SELECT count(*) FROM public.question_responses WHERE id='{READER_ANSWER}'") == '1'
    checks.append('The full archive restores the removal state and private receipt into a separate database, with the other reader answer intact.')


def main():
    os.umask(0o077)
    release = runpy.run_path(str(SCRIPT.with_name('test-circle-release-restore.py')))
    harness = runpy.run_path(str(release['RESTORE_TEST']))
    kit, checker = (runpy.run_path(str(harness[name])) for name in ('CORE_REHEARSAL', 'CHECKER'))
    owner, database = kit['OWNER'], kit['SOURCE_DB']
    result = {'checks': [], 'productionRestoreVerified': False}
    with TemporaryDirectory(prefix='soe-private-erasure-', dir='/private/tmp') as directory:
        temp = Path(directory)
        original, staged = [kit['Cluster'](temp / name, owner) for name in ('original', 'staged')]
        try:
            subprocess.run(['/opt/homebrew/bin/node', '--require', str(release['NETWORK_GUARD']),
                            str(release['EXPORT_FIXTURE']), str(temp)], env=kit['ENV'], cwd=ROOT,
                           check=True, timeout=20, stdout=subprocess.DEVNULL)
            result['fixture'] = json.loads((temp / 'inputs.json').read_bytes())
            original.start()
            staged.start()
            release['stage_restored_release'](original, staged, database, temp, harness, kit, checker, result)
            test_private_data(staged, original, database, owner, temp, release, harness, kit, result)
        finally:
            try:
                staged.stop()
            finally:
                original.stop()
    result.update(status='PASS', clustersStopped=True, temporaryDirectoryRemoved=True,
                  draftSha256=kit['digest'](DRAFTS[-1]), privateDataTables=8)
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
