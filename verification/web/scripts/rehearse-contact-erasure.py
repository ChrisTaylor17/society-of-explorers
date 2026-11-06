"""Verify the owner-reviewed profile, direct-message and legacy post removal."""
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
    'account-deletion-requests-apply.sql','account-erasure-access-apply.sql',
    'account-erasure-private-data-apply.sql','account-erasure-circle-posts-apply.sql',
    'account-erasure-profile-and-contact-apply.sql',
)]
SCHEMA = 'soe_account_deletion_private'
REQUEST = '73000000-0000-4000-8000-000000000001'
LEGACY = '73000000-0000-4000-8000-000000000002'
UNRELATED = '73000000-0000-4000-8000-000000000003'
SELF_MESSAGE = '73000000-0000-4000-8000-000000000004'
NO_SENDER = '73000000-0000-4000-8000-000000000005'
LEGACY_BASELINE_POST = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
DIGEST = hashlib.sha256(bytes([9]) * 32).hexdigest()
PROFILE = {
    'displayName': 'Published fixture name', 'bio': 'Published fixture biography',
    'discipline': 'Synthetic field', 'skills': ['Synthetic skill'], 'projectDescription': 'Private fixture project',
    'seeking': 'Synthetic request', 'philosophy': 'Published fixture philosophy', 'visibility': 'public',
}


def exercise(staged, original, database, owner, temp, release, harness, kit, report):
    checks = report['checks']
    host, reader, outsider = (release[name] for name in ('HOST','READER','OUTSIDER'))
    subject = harness['AUTH_SUBJECT']
    reviewed = f"'{REQUEST}','{host}','{subject}'"

    def run(sql, *, role='postgres', sqlstate=None):
        return staged.query(database, f'SET ROLE {role};\n' + sql, owner, sqlstate=sqlstate)

    def rpc(action, *args, **kwargs):
        return release['invoke'](staged, database, owner, action, *args, **kwargs)

    circle, thread_root, *_ = release['seed_circle'](run, rpc)
    original_thread = rpc('discussion_thread', reader, circle, thread_root)
    original_reply = original_thread['items'][0]['id']

    run(f"""
      INSERT INTO public.book_cohorts(id,book_id,thinker_id,title,created_by)
        VALUES ('{LEGACY}','apology','socrates','Fixture book salon','{reader}');
      INSERT INTO public.book_cohort_members(cohort_id,member_id) VALUES ('{LEGACY}','{host}'),('{LEGACY}','{reader}');
      INSERT INTO public.direct_messages(id,sender_id,recipient_id,content,read) VALUES
        ('{UNRELATED}','{reader}','{outsider}','Unrelated fixture conversation.',false),
        ('{SELF_MESSAGE}','{host}','{host}','Self-sent fixture note.',false),
        ('{NO_SENDER}',NULL,'{host}','Old fixture message without a sender.',false);
      UPDATE public.members SET email='fixture-profile@fixture.invalid' WHERE id='{host}';
    """)
    host_post = json.loads(run(f"SELECT public.soe_book_salon_messages_post('{host}','{LEGACY}','Old host comment.','Host')",
                               role='service_role'))['message']['id']
    reader_post = json.loads(run(f"SELECT public.soe_book_salon_messages_post('{reader}','{LEGACY}','Keep the reader comment.','Reader')",
                                 role='service_role'))['message']['id']
    profile = json.loads(run(f"SELECT public.soe_member_profile_update('{host}',0,'{json.dumps(PROFILE)}')", role='service_role'))
    assert profile['profile_visibility'] == 'public' and profile['profile_revision'] == 1
    assert run(f"SELECT count(*) FROM public.members WHERE id='{host}' AND profile_visibility='public'", role='service_role') == '1'
    assert run(f"SELECT member_id FROM public.seminar_messages WHERE id='{LEGACY_BASELINE_POST}'") == host

    for file in DRAFTS:
        kit['run']('psql', *staged.psql(database), '-c', 'SET ROLE postgres', '-f', file)
        report['orderedMigrationFiles'].append(str(file.relative_to(ROOT)))
    assert len(report['orderedMigrationFiles']) == 53
    assert run(f"SELECT id FROM public.soe_account_deletion_request('supabase','{subject}','{REQUEST}','{DIGEST}',4)",
               role='service_role') == REQUEST
    preview = f'SELECT {SCHEMA}.preview_contact_data({reviewed})'
    run(preview, sqlstate='PT409')

    lock_test = runpy.run_path(str(SCRIPT.with_name('rehearse-erasure-access.py')))
    race = lock_test['race']
    race.__globals__['SOURCE'] = database
    race(staged, f'SET LOCAL ROLE postgres; SELECT {SCHEMA}.start_erasure({reviewed});',
         f"SET ROLE service_role; INSERT INTO public.direct_messages(sender_id,recipient_id,content) "
         f"VALUES ('{reader}','{host}','Held fixture message');", 'PT403')
    run(f"""SELECT public.soe_member_profile_update('{host}',1,'{{"bio":"A held replacement profile"}}')""",
        role='service_role', sqlstate='PT403')
    run(f"UPDATE public.members SET display_name='Former member',email=NULL,bio=NULL,discipline=NULL,skills=NULL,"
        f"project_description=NULL,seeking=NULL,philosophy=NULL,profile_visibility='private' WHERE id='{host}'",
        sqlstate='PT403')
    run(f"UPDATE public.direct_messages SET recipient_id=NULL WHERE recipient_id='{host}' AND sender_id IS NOT NULL",
        role='service_role', sqlstate='PT403')
    checks.append('The database denies a message that was waiting at the processing boundary and rejects late profile edits and direct detaches.')

    def erase(scope, allow=True, **kwargs):
        approved = 'true' if allow else 'false'
        return run(f"SELECT {SCHEMA}.erase_contact_data({reviewed},'{json.dumps(scope)}',{approved})", **kwargs)

    scope = json.loads(run(preview))
    assert {k:v for k,v in scope.items() if k!='snapshot'} == {
        'profile':1,'legacyPosts':2,'eraseMessages':3,'detachMessages':2,
    }, scope
    assert len(scope['snapshot']) == 64 and 'Published fixture' not in json.dumps(scope)
    erase(scope, False, sqlstate='PT409')
    run(f"SELECT {SCHEMA}.preview_contact_data('{REQUEST}','{reader}','{subject}')", sqlstate='PT409')
    for role in ('anon','authenticated','service_role'):
        run(preview, role=role, sqlstate='42501')
        erase(scope, role=role, sqlstate='42501')
        run(f'SELECT * FROM {SCHEMA}.contact_receipts', role=role, sqlstate='42501')
        run(f"INSERT INTO {SCHEMA}.contact_context VALUES(pg_current_xact_id(),'{REQUEST}')", role=role, sqlstate='42501')
    checks.append('Only the owner can run the reviewed operation, and the two incoming sender copies require explicit detach approval.')

    def owner_rows():
        return run(f"""SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM public.direct_messages d
                      WHERE '{host}'::uuid IN (d.sender_id,d.recipient_id)""")

    original_messages = json.loads(owner_rows())
    kept = [dict(row,recipient_id=None) for row in original_messages
            if row['sender_id'] is not None and row['sender_id'] != host]
    original_unrelated = run(f"SELECT to_jsonb(d) FROM public.direct_messages d WHERE id='{UNRELATED}'")
    run(f"INSERT INTO public.circle_message_reports(cohort_id,message_id,reporter_member_id,reason,note) "
        f"VALUES ('{LEGACY}','{host_post}','{reader}','safety','Synthetic cross-system dependency.')")
    erase(scope, sqlstate='PT409')
    assert json.loads(owner_rows()) == original_messages
    run(f"DELETE FROM public.circle_message_reports WHERE message_id='{host_post}'")
    run('ALTER TABLE public.members DISABLE TRIGGER soe_guard_frozen_profile')
    erase(scope, sqlstate='PT409')
    run('ALTER TABLE public.members ENABLE TRIGGER soe_guard_frozen_profile')
    assert json.loads(run(preview)) == scope
    checks.append('An unexpected legacy moderation dependency or an inactive profile guard stops the phase before any change.')

    run(f'ALTER TABLE {SCHEMA}.contact_receipts ADD CONSTRAINT fixture_fail CHECK(false)')
    erase(scope, sqlstate='23514')
    assert json.loads(run(preview)) == scope
    assert json.loads(owner_rows()) == original_messages
    assert run(f"SELECT profile_visibility FROM public.members WHERE id='{host}'") == 'public'
    assert run(f'SELECT count(*) FROM {SCHEMA}.contact_context') == '0'
    run(f'ALTER TABLE {SCHEMA}.contact_receipts DROP CONSTRAINT fixture_fail')
    checks.append('A forced late receipt failure rolls back the profile, post deletion and every conversation change.')

    cleared = erase(scope)
    assert erase(scope) == cleared
    assert run(f"SELECT count(*) FROM public.members WHERE id='{host}' AND profile_visibility='public'", role='service_role') == '0'
    assert run(f"SELECT display_name,profile_revision,email IS NULL,supabase_auth_id FROM public.members WHERE id='{host}'") == f'Former member|2|t|{subject}'
    assert run(f"SELECT count(*) FROM public.direct_messages WHERE '{host}'::uuid IN (sender_id,recipient_id)") == '0'
    retained_ids = ','.join("'" + row['id'] + "'" for row in kept)
    assert json.loads(run(f"SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM public.direct_messages d WHERE id IN ({retained_ids})")) == kept
    assert run(f"SELECT to_jsonb(d) FROM public.direct_messages d WHERE id='{UNRELATED}'") == original_unrelated
    history = json.loads(run(f"SELECT public.soe_book_salon_messages_read('{reader}','{LEGACY}')", role='service_role'))
    assert [(item['id'],item['content']) for item in history['messages']] == [(reader_post,'Keep the reader comment.')]
    assert run(f"SELECT count(*) FROM public.seminar_messages WHERE id IN ('{LEGACY_BASELINE_POST}','{host_post}')") == '0'
    assert rpc('discussion_thread', reader, circle, thread_root) == original_thread
    assert run(f"SELECT count(*) FROM public.seminar_messages WHERE id='{original_reply}'") == '1'
    run(f"UPDATE public.direct_messages SET read=true WHERE id='{UNRELATED}'", role='service_role')
    assert run(f"SELECT read FROM public.direct_messages WHERE id='{UNRELATED}'") == 't'
    checks.append('The account disappears from the published profile and direct-message lookups, while exact other-author copies and Circle replies remain.')

    archive = temp / 'contact-erasure.dump'
    staged.dump(database, archive)
    restored = 'soe_contact_erasure_restored'
    original.restore(restored, archive)
    replay = original.query(restored, f"SET ROLE postgres; SELECT {SCHEMA}.erase_contact_data({reviewed},'{json.dumps(scope)}',true)")
    assert replay == cleared
    assert original.query(restored, f"SET ROLE service_role; SELECT id FROM public.soe_account_deletion_status('{REQUEST}','{DIGEST}')") == REQUEST
    assert original.query(restored, f"SELECT count(*) FROM public.direct_messages WHERE '{host}'::uuid IN (sender_id,recipient_id)") == '0'
    assert original.query(restored, f"SELECT count(*) FROM public.direct_messages WHERE recipient_id IS NULL AND id IN ({retained_ids})") == '2'
    checks.append('The isolated restore keeps both exact receipts, the cleared profile, and the two detached copies.')


def main():
    os.umask(0o077)
    release = runpy.run_path(str(SCRIPT.with_name('test-circle-release-restore.py')))
    harness = runpy.run_path(str(release['RESTORE_TEST']))
    kit, checker = (runpy.run_path(str(harness[name])) for name in ('CORE_REHEARSAL','CHECKER'))
    owner, database = kit['OWNER'], kit['SOURCE_DB']
    report = {'checks': [], 'productionRestoreVerified': False}
    with TemporaryDirectory(prefix='soe-contact-erasure-', dir='/private/tmp') as directory:
        temp = Path(directory)
        original, staged = [kit['Cluster'](temp / name, owner) for name in ('original','staged')]
        try:
            subprocess.run(['/opt/homebrew/bin/node','--require',str(release['NETWORK_GUARD']),
                            str(release['EXPORT_FIXTURE']),str(temp)], env=kit['ENV'],cwd=ROOT,
                           check=True, timeout=20, stdout=subprocess.DEVNULL)
            report['fixture'] = json.loads((temp / 'inputs.json').read_bytes())
            original.start()
            staged.start()
            release['stage_restored_release'](original, staged, database, temp, harness, kit, checker, report)
            exercise(staged, original, database, owner, temp, release, harness, kit, report)
        finally:
            try:
                staged.stop()
            finally:
                original.stop()
    report.update(status='PASS', clustersStopped=True, temporaryDirectoryRemoved=True, draftSha256=kit['digest'](DRAFTS[-1]))
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
